import { FieldHint } from "@layered/ui";
import { DashboardApiError } from "./api.js";
import type { DashboardStringKey } from "./dashboard-i18n.js";
import { useDashboardLanguage } from "./language-context.js";

/**
 * Which sentence a failure is said with, and the API failure behind it where
 * there is one. Shared by the notice below and by the bar's notifications, so a
 * failure reads the same wherever it is shown.
 *
 * @param error - Whatever was thrown.
 * @param fallback - What to say for a failure the dashboard cannot name.
 * @param keyFor - A more specific sentence for one of the API's codes.
 */
export function errorKey(
  error: unknown,
  fallback: DashboardStringKey = "dataLoadError",
  keyFor?: (error: DashboardApiError) => DashboardStringKey | undefined,
): { key: DashboardStringKey; known: DashboardApiError | null } {
  const known = error instanceof DashboardApiError ? error : null;
  return { key: known ? (keyFor?.(known) ?? known.key) : fallback, known };
}

/**
 * What a failure notice says: a failure the API or the network produced, or the
 * sentences of a check the dashboard made itself before sending anything.
 *
 * @property error - Whatever was thrown. Only a `DashboardApiError` says what
 *   went wrong; anything else shows the fallback.
 * @property fallback - What to say for a failure the dashboard cannot name.
 * @property keyFor - Lets a screen say something more specific for one of the
 *   API's codes, such as a taken email address in the account.
 * @property message - A check's sentence, or several, already in the interface
 *   language. Several are listed.
 */
export type ErrorNoticeProps =
  | {
      error: unknown;
      fallback?: DashboardStringKey;
      keyFor?: (error: DashboardApiError) => DashboardStringKey | undefined;
    }
  | { message: string | readonly string[] };

/**
 * A failure, said in the interface language, in the one shape every failure in
 * the dashboard takes, whether the API refused something or a check in the
 * browser stopped it from being sent. Beneath an API failure stands its request
 * id where the API returned one, because that id is what finds the log line.
 */
export function ErrorNotice(props: ErrorNoticeProps) {
  const { text } = useDashboardLanguage();
  if ("message" in props) {
    const messages = typeof props.message === "string" ? [props.message] : props.message;
    return messages.length > 1 ? (
      <ul className="dashboard-error dashboard-error--list" role="alert">
        {messages.map((message) => (
          <li key={message}>{message}</li>
        ))}
      </ul>
    ) : (
      <p className="dashboard-error" role="alert">
        {messages[0]}
      </p>
    );
  }
  const { key, known } = errorKey(props.error, props.fallback, props.keyFor);
  return (
    <p className="dashboard-error" role="alert">
      {text(key)}
      {known?.id && (
        <>
          <br />
          <FieldHint>
            {text("errorId")}: {known.id}
          </FieldHint>
        </>
      )}
    </p>
  );
}
