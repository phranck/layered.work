import type { ComponentPropsWithoutRef } from "react";
import { join } from "./shared.js";

/**
 * The tones a badge takes. Each status tone is bound once in `tone.css`, and
 * `neutral` takes none, so it stays in the muted ink.
 */
export type BadgeTone = "success" | "warning" | "info" | "accent" | "danger" | "neutral";

/** Props for a badge. */
export interface BadgeProps extends ComponentPropsWithoutRef<"span"> {
  /** What the state means, which decides its color. */
  tone: BadgeTone;
}

/**
 * A state as a dot and a word in a tone, never in color alone, so the meaning
 * survives a reader who cannot tell two greens apart. The tone says what the
 * state means rather than what it is called, so a publication state, a token's
 * state and a configured key all draw from the same few colors.
 */
export function Badge({ tone, className, ...props }: BadgeProps) {
  return (
    <span className={join("badge", className)} data-tone={tone === "neutral" ? undefined : tone} {...props} />
  );
}
