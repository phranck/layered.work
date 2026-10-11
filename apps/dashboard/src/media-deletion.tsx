import { isProcessing, type MediaDetail } from "@layered/schemas";
import { useDashboardLanguage } from "./language-context.js";
import { useDeleteMedia } from "./media-query.js";
import { ConfirmDialog } from "./modal.js";
import { useNotify } from "./notifications.js";
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

/**
 * Every place a file is used, each linked to where it can be changed, or a line
 * saying nothing uses it.
 *
 * @param uses - The uses, as the API lists them.
 */

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

/**
 * The question before a file is deleted. A file still in use, or still being
 * processed, cannot be deleted, and the dialog says why instead of offering it.
 *
 * @param detail - The file.
 * @param onClose - Closes the question without deleting.
 * @param onDeleted - Runs once the file is gone, after the notification.
 */

export function MediaDeleteDialog({
  detail,
  onClose,
  onDeleted,
}: {
  detail: MediaDetail;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const { text } = useDashboardLanguage();
  const { notify } = useNotify();
  const processing = isProcessing(detail.processing.state);
  const remove = useDeleteMedia(detail, {
    onSuccess: (result) => {
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
