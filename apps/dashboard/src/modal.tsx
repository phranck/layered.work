import { Button, Card } from "@layered/ui";
import { TrashIcon, XIcon } from "@layered/ui/icons";
import { type ReactNode, useEffect, useEffectEvent, useId, useRef } from "react";
import type { DashboardApiError } from "./api.js";
import type { DashboardStringKey } from "./dashboard-i18n.js";
import { ErrorNotice } from "./error-notice.js";
import { useDashboardLanguage } from "./language-context.js";

/**
 * A card shown as a modal dialog. Escape and a click beside the card close it,
 * and the focus goes back to whatever had it before the dialog opened.
 *
 * @param labelId - The id of the element that names the dialog, usually its title.
 * @param onClose - Called for Escape and for a click beside the card.
 */
export function CardDialog({
  children,
  labelId,
  onClose,
}: {
  children: ReactNode;
  labelId: string;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const returnFocusRef = useRef(
    document.activeElement instanceof HTMLElement ? document.activeElement : null,
  );
  const close = useEffectEvent(onClose);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    dialog.showModal();
    const closeFromBackdrop = (event: MouseEvent) => {
      if (event.target === dialog) close();
    };
    dialog.addEventListener("click", closeFromBackdrop);
    return () => {
      dialog.removeEventListener("click", closeFromBackdrop);
      dialog.close();
      returnFocusRef.current?.focus();
    };
  }, []);

  return (
    <dialog
      ref={dialogRef}
      className="card-overlay card-dialog"
      data-open
      aria-labelledby={labelId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <Card>{children}</Card>
    </dialog>
  );
}

/** Props for the question asked before something is deleted. */
interface ConfirmDialogProps {
  /** The question, naming what goes. */
  title: string;
  /** What the deletion does, and what the reader should know before it. */
  children: ReactNode;
  /**
   * The danger button's label, which names the action, or says it is running.
   * Defaults to the title, for a title that already names the action.
   */
  confirm?: string;
  /** Whether the action is running, which holds both buttons until it ends. */
  busy?: boolean;
  /** Whether the action cannot run at all, such as for something still in use. */
  blocked?: boolean;
  /** The failure of the last attempt, said under the text. Null where there is none. */
  error?: unknown;
  /** A more specific sentence for one of the API's codes, as `ErrorNotice` takes it. */
  errorKeyFor?: (error: DashboardApiError) => DashboardStringKey | undefined;
  onConfirm: () => void;
  onClose: () => void;
}

/**
 * The question before something is deleted: a title naming it, what deleting
 * does, Cancel, and a danger button naming the action.
 *
 * Cancel has the focus, so Return never deletes by accident. A failure stays in
 * the dialog beside the button that caused it, and the dialog stays open, so
 * the reader can try again or cancel.
 */
export function ConfirmDialog({
  title,
  children,
  confirm = title,
  busy = false,
  blocked = false,
  error = null,
  errorKeyFor,
  onConfirm,
  onClose,
}: ConfirmDialogProps) {
  const { text } = useDashboardLanguage();
  const titleId = useId();
  // Escape and a click beside the card are held with Cancel while the action runs.
  const dismiss = () => {
    if (!busy) onClose();
  };
  return (
    <CardDialog labelId={titleId} onClose={dismiss}>
      <Card.Header id={titleId} title={title} />
      <Card.Body className="settings-form">
        {children}
        {error !== null && <ErrorNotice error={error} keyFor={errorKeyFor} />}
      </Card.Body>
      <Card.Footer
        actions={
          <>
            <Button icon={<XIcon />} onClick={onClose} autoFocus disabled={busy}>
              {text("cancel")}
            </Button>
            <Button tone="danger" icon={<TrashIcon />} disabled={busy || blocked} onClick={onConfirm}>
              {confirm}
            </Button>
          </>
        }
      />
    </CardDialog>
  );
}
