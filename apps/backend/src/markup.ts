/** The characters that mean something in HTML and XML text and in quoted attribute values, and how each is written instead. */
const ENTITIES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/**
 * Text made safe to place in HTML or XML, as element content or as a quoted
 * attribute value of either quote.
 *
 * One function for the mail templates and the social cards, so the two cannot
 * escape differently. The apostrophe is written as a numeric reference because
 * that one name is understood by HTML and XML alike.
 *
 * @param value - Untrusted text.
 */
export function escapeMarkup(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ENTITIES[character] ?? character);
}
