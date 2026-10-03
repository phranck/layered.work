import { DashboardApiError } from "./api.js";
import type { DashboardStringKey } from "./dashboard-i18n.js";
import { useDashboardLanguage } from "./language-context.js";

/**
 * A failure, said in the interface language, with the request id beneath it
 * where the API returned one, because that id is what finds the log line.
 *
 * @param error - Whatever was thrown. Only a `DashboardApiError` says what went
 *   wrong; anything else shows the fallback.
 * @param fallback - What to say for a failure the dashboard cannot name.
 * @param keyFor - Lets a screen say something more specific for one of the API's
 *   codes, such as a taken email address in the account.
 */
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

export function ErrorNotice({
  error,
  fallback = "dataLoadError",
  keyFor,
}: {
  error: unknown;
  fallback?: DashboardStringKey;
  keyFor?: (error: DashboardApiError) => DashboardStringKey | undefined;
}) {
  const { text } = useDashboardLanguage();
  const { key, known } = errorKey(error, fallback, keyFor);
  return (
    <p className="dashboard-error" role="alert">
      {text(key)}
      {known?.id && (
        <span className="dashboard-error__id">
          {text("errorId")}: {known.id}
        </span>
      )}
    </p>
  );
}
