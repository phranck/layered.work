import type { MediaDetail } from "@layered/schemas";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useDashboardApi } from "./dashboard-context.js";
import { refreshCounts } from "./dashboard-counts.js";
import { useDashboardLanguage } from "./language-context.js";
import { ConfirmDialog } from "./modal.js";
import { useNotify } from "./notifications.js";

const ENTRY_AREA = { post: "posts", page: "pages", project: "projects" } as const;
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
              <a
                href={
                  use.settingsGroup === "postListing"
                    ? "/posts"
                    : use.settingsGroup === "projectListing"
                      ? "/projects"
                      : "/settings"
                }
              >
                {use.settingsGroup === "postListing" || use.settingsGroup === "projectListing"
                  ? `${text("mediaListingIntroduction", text(use.settingsGroup === "postListing" ? "posts" : "projects"))} (${use.language.toUpperCase()})`
                  : text("socialImage")}
              </a>
            ) : (
              <a href={`/${ENTRY_AREA[use.kind]}/${use.id}`}>
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
  const processing = detail.processing.state === "queued" || detail.processing.state === "processing";
  const remove = useMutation({
    mutationFn: () => api.deleteMedia(detail.id),
    onError: () => client.invalidateQueries({ queryKey: ["media", "detail", detail.id] }),
    onSuccess: async (result) => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ["media"] }),
        client.invalidateQueries({ queryKey: ["account-media"] }),
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
