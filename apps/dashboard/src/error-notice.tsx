import { DashboardApiError } from "./api.js";
import { useDashboardLanguage } from "./language-context.js";

export function ErrorNotice({ error, fallback }: { error: unknown; fallback?: string }) {
  const { text } = useDashboardLanguage();
  const known = error instanceof DashboardApiError ? error : null;
  return (
    <p className="dashboard-error" role="alert">
      {known?.message ?? fallback ?? text("dataLoadError")}
      {known?.id && (
        <span className="dashboard-error__id">
          {text("errorId")}: {known.id}
        </span>
      )}
    </p>
  );
}
