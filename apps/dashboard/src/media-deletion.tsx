import type { MediaDetail } from "@layered/schemas";
import { Button, Card } from "@layered/ui";
import { TrashIcon, XIcon } from "@layered/ui/icons";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useId } from "react";
import { useDashboardApi } from "./dashboard-context.js";
import { ErrorNotice } from "./error-notice.js";
import { useDashboardLanguage } from "./language-context.js";
import { CardDialog } from "./modal.js";
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
          <li key={`${use.kind}-${use.id}`}>
            {use.kind === "account" ? (
              `${use.title} (${text("account")})`
            ) : use.kind === "settings" ? (
              <a href="/settings">{text("socialImage")}</a>
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
  const titleId = useId();
  const processing = detail.processing.state === "queued" || detail.processing.state === "processing";
  const remove = useMutation({
    mutationFn: () => api.deleteMedia(detail.id),
    onError: () => client.invalidateQueries({ queryKey: ["media", "detail", detail.id] }),
    onSuccess: async (result) => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ["media"] }),
        client.invalidateQueries({ queryKey: ["account-media"] }),
        client.invalidateQueries({ queryKey: ["dashboard-counts"] }),
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
    <CardDialog labelId={titleId} onClose={onClose}>
      <Card.Header id={titleId} title={text("mediaDeleteTitle", detail.slug)} />
      <Card.Body>
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
        {remove.isError && (
          <ErrorNotice
            error={remove.error}
            keyFor={(error) => (error.code === "conflict" ? "mediaDeleteConflict" : undefined)}
          />
        )}
      </Card.Body>
      <Card.Footer
        actions={
          <>
            <Button icon={<XIcon />} onClick={onClose} autoFocus disabled={remove.isPending}>
              {text("cancel")}
            </Button>
            <Button
              tone="danger"
              icon={<TrashIcon />}
              disabled={remove.isPending || detail.uses.length > 0 || processing}
              onClick={() => remove.mutate()}
            >
              {text(remove.isPending ? "mediaDeletePending" : "mediaDelete")}
            </Button>
          </>
        }
      />
    </CardDialog>
  );
}
