import type { ComponentPropsWithoutRef, KeyboardEvent } from "react";

export type DivProps = ComponentPropsWithoutRef<"div">;
export type SpanProps = ComponentPropsWithoutRef<"span">;

export function join(...values: Array<string | false | undefined>): string {
  return values.filter(Boolean).join(" ");
}

export function moveValue(event: KeyboardEvent<HTMLButtonElement>): string | undefined {
  const group = event.currentTarget.closest('[role="radiogroup"], [role="group"], .segmented');
  const buttons = [
    ...(group?.querySelectorAll<HTMLButtonElement>("button[data-value]:not(:disabled)") ?? []),
  ];
  const current = Math.max(buttons.indexOf(event.currentTarget), 0);
  let next: HTMLButtonElement | undefined;
  if (event.key === "Home") next = buttons[0];
  if (event.key === "End") next = buttons.at(-1);
  if (event.key === "ArrowRight" || event.key === "ArrowDown") next = buttons[(current + 1) % buttons.length];
  if (event.key === "ArrowLeft" || event.key === "ArrowUp")
    next = buttons[(current - 1 + buttons.length) % buttons.length];
  next?.focus();
  return next?.dataset.value;
}
