import { isProcessing, type MediaDetail } from "@layered/schemas";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useDashboardApi } from "./dashboard-context.js";
import { refreshCounts } from "./dashboard-counts.js";
import { useDashboardLanguage } from "./language-context.js";
import { ConfirmDialog } from "./modal.js";
import { useNotify } from "./notifications.js";
import { queryKeys } from "./query-keys.js";
import { entryPath, settingsGroupArea } from "./routes.js";

/** One place a file is used, as the API lists it. */
type MediaUse = MediaDetail["uses"][number];

/**
 * A file used by the site's settings, linked to the screen that changes it: an
 * overview's introduction on the list of the kind it lists, and the site's own
 * picture on the Settings screen, so the link leads to where the file can be
 * replaced.
 *
 * @param use - The use, which the API marks with the settings group it is in.
 */
function SettingsUse({ use }: { use: MediaUse }) {
  const { text } = useDashboardLanguage();
  const area = settingsGroupArea(use.settingsGroup ?? "site");
  return (
    <a href={`/${area.path}`}>
      {area.entryKind
        ? `${text("mediaListingIntroduction", text(area.labelKey))} (${use.language.toUpperCase()})`
        : text("socialImage")}
    </a>
  );
}

export function MediaUses({ uses }: { uses: MediaDetail["uses"] }) {
  const { text } = useDashboardLanguage();
  return (
    <section>
      <h3>{text("mediaUses")}</h3>
      {!uses.length && <p>{text("mediaUnused")}</p>}
      <ul>
        {uses.map((use) => (
          <li key={`${use.kind}-${use.id}-${use.language}-${use.settingsGroup ?? ""}`}>
            {use.kind === "account" ? (
              `${use.title} (${text("account")})`
            ) : use.kind === "settings" ? (
              <SettingsUse use={use} />
            ) : (
              <a href={entryPath(use.kind, use.id)}>
                {use.title} ({use.language.toUpperCase()})
              </a>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
export function MediaDeleteDialog({
  detail,
  onClose,
  onDeleted,
}: {
  detail: MediaDetail;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const api = useDashboardApi();
  const client = useQueryClient();
  const { text } = useDashboardLanguage();
  const { notify } = useNotify();
  const processing = isProcessing(detail.processing.state);
  const remove = useMutation({
    mutationFn: () => api.deleteMedia(detail.id),
    onError: () => client.invalidateQueries({ queryKey: queryKeys.mediaDetail(detail.id) }),
    onSuccess: async (result) => {
      await Promise.all([
        client.invalidateQueries({ queryKey: queryKeys.everyMediaQuery }),
        refreshCounts(client),
      ]);
      notify({
        tone: result.cleanupState === "ready" ? "success" : "warning",
        message:
          result.cleanupState === "ready"
            ? text("mediaDeleted", result.removedObjects)
            : text("mediaCleanupPending"),
        detail: result.errorId ? `${text("errorId")}: ${result.errorId}` : undefined,
      });
      onDeleted();
    },
  });
  return (
    <ConfirmDialog
      title={text("mediaDeleteTitle", detail.slug)}
      confirm={text(remove.isPending ? "mediaDeletePending" : "mediaDelete")}
      busy={remove.isPending}
      blocked={detail.uses.length > 0 || processing}
      error={remove.error}
      errorKeyFor={(error) => (error.code === "conflict" ? "mediaDeleteConflict" : undefined)}
      onConfirm={() => remove.mutate()}
      onClose={onClose}
    >
      <p>
        {text(
          detail.uses.length
            ? "mediaDeleteBlocked"
            : processing
              ? "mediaDeleteProcessing"
              : "mediaDeleteBody",
        )}
      </p>
      <MediaUses uses={detail.uses} />
    </ConfirmDialog>
  );
}
