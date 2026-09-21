import type { PropsOf } from "@layered/content";
import { contentSpacing } from "./content-shared.js";
/** A fixed spacing step, or flexible room in its parent stack. */
export function Spacer({ size }: PropsOf<"Spacer">) {
  return (
    <div
      className="content-spacer"
      aria-hidden="true"
      data-fixed={size !== undefined || undefined}
      style={contentSpacing(size)}
    />
  );
}
