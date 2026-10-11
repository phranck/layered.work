/**
 * A draft checked against the schema the API validates it with, before
 * anything is sent, so a screen can say what is wrong rather than pass on the
 * API's refusal.
 */

/** Anything that checks a draft and says which fields failed and why. */
export interface DraftSchema<Value> {
  safeParse(
    value: unknown,
  ):
    | { success: true; data: Value }
    | { success: false; error: { issues: { path: PropertyKey[]; message: string }[] } };
}

/** The first thing a schema refused: the field's path, dotted, and the schema's own sentence. */
export interface DraftIssue {
  path: string;
  message: string;
}

/**
 * A draft as the body a save sends, or the first issue that stops it.
 *
 * @param schema - The schema the API validates the body with.
 * @param draft - The draft as the screen holds it.
 */
export function checkedDraft<Value>(
  schema: DraftSchema<Value>,
  draft: unknown,
): { value: Value } | { issue: DraftIssue } {
  const parsed = schema.safeParse(draft);
  if (parsed.success) return { value: parsed.data };
  const first = parsed.error.issues[0];
  return { issue: { path: first?.path.map(String).join(".") ?? "", message: first?.message ?? "" } };
}

/**
 * The line a screen shows for an issue: its own sentence, then the field and
 * what the schema said about it.
 *
 * @param lead - The screen's sentence, in the interface language.
 * @param issue - What the schema refused.
 */
export function issueLine(lead: string, issue: DraftIssue): string {
  return `${lead} ${issue.path}: ${issue.message}`;
}
