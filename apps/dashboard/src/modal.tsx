import { Card } from "@layered/ui";
import { type ReactNode, useEffect, useEffectEvent, useRef } from "react";

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
      className="card-overlay account-dialog"
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
