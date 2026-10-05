import type { FocalPoint } from "@layered/schemas";
import { Button, Card, imagePosition } from "@layered/ui";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type KeyboardEvent, type PointerEvent, useId, useState } from "react";
import { useDashboardApi } from "./dashboard-context.js";
import { ErrorNotice } from "./error-notice.js";
import { useDashboardLanguage } from "./language-context.js";
import { CardDialog } from "./modal.js";
import "./focal-point.css";

type EditorProps = { src: string; point: FocalPoint; onChange: (point: FocalPoint) => void };
const clamp = (value: number) => Math.min(1, Math.max(0, value));
const CROPS = [
  { ratio: "16 / 10", label: "mediaCropCard" },
  { ratio: "21 / 9", label: "mediaCropBanner" },
  { ratio: "4 / 3", label: "mediaCropMobile" },
] as const;

function FocalRoot({ src, point, onChange, hintId }: EditorProps & { hintId: string }) {
  const { text } = useDashboardLanguage();
  function move(event: PointerEvent<HTMLButtonElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    onChange({
      x: clamp((event.clientX - rect.left) / rect.width),
      y: clamp((event.clientY - rect.top) / rect.height),
    });
  }
  function key(event: KeyboardEvent<HTMLButtonElement>) {
    const delta = event.shiftKey ? 0.1 : 0.01;
    const direction = {
      ArrowLeft: [-delta, 0],
      ArrowRight: [delta, 0],
      ArrowUp: [0, -delta],
      ArrowDown: [0, delta],
    }[event.key];
    if (!direction) return;
    event.preventDefault();
    onChange({
      x: clamp(Number((point.x + (direction[0] ?? 0)).toFixed(2))),
      y: clamp(Number((point.y + (direction[1] ?? 0)).toFixed(2))),
    });
  }
  function release(event: PointerEvent<HTMLButtonElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
  }
  return (
    <button
      type="button"
      className="focal-point__surface"
      aria-label={text("mediaFocalMove")}
      aria-describedby={hintId}
      onKeyDown={key}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        move(event);
      }}
      onPointerMove={(event) => {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) move(event);
      }}
      onPointerUp={release}
      onPointerCancel={release}
    >
      <img src={src} alt="" draggable={false} />
      <span
        className="focal-point__marker-plane"
        style={{ transform: `translate(${point.x * 100}%, ${point.y * 100}%)` }}
        aria-hidden="true"
      >
        <span className="focal-point__marker" />
      </span>
    </button>
  );
}
function FocalPreviews({ src, point }: Pick<EditorProps, "src" | "point">) {
  const { text } = useDashboardLanguage();
  return (
    <div className="focal-point__previews">
      {CROPS.map((crop) => (
        <figure key={crop.label}>
          <img
            src={src}
            alt={text(crop.label)}
            style={{ aspectRatio: crop.ratio, objectPosition: imagePosition({ focalPoint: point }) }}
          />
          <figcaption>{text(crop.label)}</figcaption>
        </figure>
      ))}
    </div>
  );
}
function FocalContent(props: EditorProps) {
  const { text } = useDashboardLanguage();
  const hintId = useId();
  return (
    <div className="focal-point">
      <p id={hintId}>{text("mediaFocalHint")}</p>
      <FocalRoot {...props} hintId={hintId} />
      <output aria-live="polite">
        {Math.round(props.point.x * 100)}%, {Math.round(props.point.y * 100)}%
      </output>
      <FocalPreviews {...props} />
    </div>
  );
}
/** Shared coordinate editor with composable source and ratio previews. */
export const FocalPointEditor = Object.assign(FocalContent, { Root: FocalRoot, Previews: FocalPreviews });

export function FocalPointDialog({
  id,
  src,
  initial,
  onClose,
}: {
  id: string;
  src: string;
  initial?: FocalPoint;
  onClose: () => void;
}) {
  const [point, setPoint] = useState(initial ?? { x: 0.5, y: 0.5 });
  const { text } = useDashboardLanguage();
  const api = useDashboardApi();
  const client = useQueryClient();
  const save = useMutation({
    mutationFn: () => api.saveMediaFocalPoint(id, point),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ["account-media"] });
      await client.invalidateQueries({ queryKey: ["media"] });
      onClose();
    },
  });
  const titleId = useId();
  const formId = useId();
  return (
    <CardDialog labelId={titleId} onClose={onClose}>
      <Card.Header id={titleId} title={text("mediaFocal")} />
      <Card.Body>
        <form
          id={formId}
          onSubmit={(event) => {
            event.preventDefault();
            save.mutate();
          }}
        >
          <FocalPointEditor src={src} point={point} onChange={setPoint} />
        </form>
        {save.isError && <ErrorNotice error={save.error} />}
      </Card.Body>
      <Card.Footer
        actions={
          <>
            <Button onClick={onClose}>{text("cancel")}</Button>
            <Button type="submit" form={formId} tone="primary" disabled={save.isPending}>
              {text(save.isPending ? "savePending" : "save")}
            </Button>
          </>
        }
      />
    </CardDialog>
  );
}
