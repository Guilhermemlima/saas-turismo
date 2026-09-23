import type { z } from "zod";

export type FieldErrors = Partial<Record<string, string[]>>;

export type ActionState = {
  status: "idle" | "success" | "error";
  message?: string;
  fieldErrors?: FieldErrors;
  /** Echo of submitted values so forms keep user input after a validation error. */
  values?: Record<string, string>;
  /** Extra data returned to the client, e.g. a one-time invitation link. */
  payload?: Record<string, string>;
};

export const initialActionState: ActionState = { status: "idle" };

export function formValues(formData: FormData): Record<string, string> {
  const values: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("$ACTION") && typeof value === "string") values[key] = value;
  }
  return values;
}

export function validationError(error: z.ZodError, values?: Record<string, string>): ActionState {
  const fieldErrors: FieldErrors = {};
  for (const issue of error.issues) {
    const key = issue.path.length > 0 ? String(issue.path[0]) : "_form";
    (fieldErrors[key] ??= []).push(issue.message);
  }
  return { status: "error", message: "Revise os campos destacados.", fieldErrors, values };
}
