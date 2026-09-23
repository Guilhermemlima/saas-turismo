import type { Metadata } from "next";

import { InboxView } from "@/modules/inbox/inbox-view";

export const metadata: Metadata = { title: "Atendimentos" };

export default async function ConversationPage(props: PageProps<"/inbox/[conversationId]">) {
  const { conversationId } = await props.params;
  return <InboxView conversationId={conversationId} searchParams={await props.searchParams} />;
}
