import "server-only";

import type { SupabaseServiceClient } from "@/server/db/service-client";

/**
 * Notifies assignees once about open tasks past their due date. Runs across all agencies with
 * the service role, so every write carries the task's own agency_id.
 */
export async function scanOverdueTasks(db: SupabaseServiceClient): Promise<{ notified: number }> {
  const { data: tasks, error } = await db
    .from("tasks")
    .select("id, agency_id, title, assigned_member_id")
    .eq("status", "open")
    .lt("due_at", new Date().toISOString())
    .is("overdue_notified_at", null)
    .not("assigned_member_id", "is", null)
    .limit(200);
  if (error) throw new Error(error.message);
  if (!tasks?.length) return { notified: 0 };

  const memberIds = [...new Set(tasks.map((t) => t.assigned_member_id as string))];
  const { data: members, error: membersError } = await db
    .from("agency_members")
    .select("id, agency_id, user_id, status")
    .in("id", memberIds);
  if (membersError) throw new Error(membersError.message);
  const byId = new Map((members ?? []).map((m) => [m.id, m]));

  let notified = 0;
  for (const task of tasks) {
    const member = byId.get(task.assigned_member_id as string);
    // Mark first: a crash after this point loses at most one alert, never sends it twice.
    const { data: claimed } = await db
      .from("tasks")
      .update({ overdue_notified_at: new Date().toISOString() })
      .eq("id", task.id)
      .eq("agency_id", task.agency_id)
      .is("overdue_notified_at", null)
      .select("id")
      .maybeSingle();
    if (!claimed || !member || member.status !== "active" || member.agency_id !== task.agency_id) continue;

    const { error: insertError } = await db.from("notifications").insert({
      agency_id: task.agency_id,
      user_id: member.user_id,
      type: "followup_overdue",
      title: `⚠️ Tarefa atrasada: ${task.title}`.slice(0, 160),
      entity_type: "task",
      entity_id: task.id,
    });
    if (insertError) throw new Error(insertError.message);
    notified++;
  }
  return { notified };
}
