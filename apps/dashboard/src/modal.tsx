import { Card } from "@layered/ui";
import { type ReactNode, useEffect, useEffectEvent, useId, useRef } from "react";
import { type Action, ActionButton } from "./action-button.js";
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

/** Props for a question asked before something is done that cannot be taken back. */
interface ConfirmDialogProps {
  /** The question, naming what goes. */
  title: string;
  /** What the action does, and what the reader should know before it. */
  children: ReactNode;
  /**
   * The confirming button's label, which names the action, or says it is
   * running. Defaults to the title, for a title that already names the action.
   */
  confirm?: string;
  /** The action the confirming button carries, whose icon and tone it takes. Deleting, by default. */
  action?: Action;
  /** The button that answers no, which has the focus. Cancel, by default. */
  cancel?: { label: string; action: Action };
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
 * The question before something is done that cannot be taken back, such as a
 * deletion or leaving with unsaved changes: a title naming it, what it does,
 * the button that answers no, and the button that names the action.
 *
 * The answer no has the focus, so Return never deletes by accident. A failure
 * stays in the dialog beside the button that caused it, and the dialog stays
 * open, so the reader can try again or cancel.
 */
export function ConfirmDialog({
  title,
  children,
  confirm = title,
  action = "delete",
  cancel,
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
      <Card.Stack>
        {children}
        {error !== null && <ErrorNotice error={error} keyFor={errorKeyFor} />}
      </Card.Stack>
      <Card.Footer
        actions={
          <>
            <ActionButton action={cancel?.action ?? "cancel"} onClick={onClose} autoFocus disabled={busy}>
              {cancel?.label ?? text("cancel")}
            </ActionButton>
            <ActionButton action={action} disabled={busy || blocked} onClick={onConfirm}>
              {confirm}
            </ActionButton>
          </>
        }
      />
    </CardDialog>
  );
}

/** Props for a form standing in a dialog. */
export interface DialogFormProps {
  /** What the dialog is about, which names it. */
  title: string;
  /** Controls at the end of the header, such as the language switch of a dialog holding bilingual texts. */
  headerActions?: ReactNode;
  /** The fields, in a stack. */
  children: ReactNode;
  /** Called when the form is submitted, by its button or by Return in a field. */
  onSubmit: () => void;
  /** Closes the dialog without saving. */
  onClose: () => void;
  /** Whether the submit is running, which holds the submit button. */
  busy?: boolean;
  /** Whether the submit cannot run yet. */
  blocked?: boolean;
  /** The sentence of a check that stopped the submit before anything was sent, or nothing. */
  problem?: string | null;
  /** The failure of the last submit, or null. */
  error?: unknown;
  /** The action the submit button carries and its label. Saving, by default. */
  submit?: { label: string; action: Action };
  /** A destructive action, set apart at the footer's left, such as deleting what the form edits. */
  destructive?: ReactNode;
}

/**
 * A form in a dialog: its header, the fields in a stack with whatever stopped
 * the last submit beneath them, and a footer with Cancel and the submit.
 *
 * The part of `FormDialog` that sits inside the card, for a dialog that has to
 * stand before its form can, such as one that loads what it edits first.
 *
 * @param titleId - The id the header's title takes, which the dialog around it
 *   names itself by.
 */
export function DialogForm({
  titleId,
  title,
  headerActions,
  children,
  onSubmit,
  onClose,
  busy = false,
  blocked = false,
  problem = null,
  error = null,
  submit,
  destructive,
}: DialogFormProps & { titleId: string }) {
  const { text } = useDashboardLanguage();
  const formId = useId();
  return (
    <>
      <Card.Header id={titleId} title={title} actions={headerActions} />
      <form
        id={formId}
        className="dialog-form"
        aria-labelledby={titleId}
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
      >
        <Card.Stack>
          {children}
          {problem && <ErrorNotice message={problem} />}
          {error !== null && <ErrorNotice error={error} />}
        </Card.Stack>
      </form>
      <Card.Footer
        actions={
          <>
            {destructive && <span className="actions__aside">{destructive}</span>}
            <ActionButton action="cancel" onClick={onClose}>
              {text("cancel")}
            </ActionButton>
            <ActionButton
              action={submit?.action ?? "save"}
              tone="primary"
              type="submit"
              form={formId}
              disabled={busy || blocked}
            >
              {submit?.label ?? (busy ? text("savePending") : text("save"))}
            </ActionButton>
          </>
        }
      />
    </>
  );
}

/**
 * A form shown as a modal dialog, which is how every record of the dashboard
 * that is not a page of its own is added and changed.
 */
export function FormDialog(props: DialogFormProps) {
  const titleId = useId();
  return (
    <CardDialog labelId={titleId} onClose={props.onClose}>
      <DialogForm titleId={titleId} {...props} />
    </CardDialog>
  );
}
