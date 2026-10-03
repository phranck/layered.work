import { type ComponentPropsWithoutRef, useEffect, useState } from "react";
import { join } from "./shared.js";

/** Platform label displayed by a shortcut. */
export type ShortcutPlatform = "apple" | "control" | "auto";
/** Props for a keyboard shortcut cap. */
export interface ShortcutProps extends ComponentPropsWithoutRef<"kbd"> {
  shortcutKey: string;
  platform?: ShortcutPlatform;
}
/**
 * Whether this browser runs on an Apple platform, where the shortcut modifier
 * is Command rather than Control.
 *
 * One answer for the key cap and for whatever listens for the keystroke, so the
 * cap never shows a key the listener does not accept.
 */
export function isApplePlatform(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
}

/** A server-safe keyboard shortcut cap. */
export function Shortcut({
  children,
  className,
  platform = "control",
  shortcutKey,
  ...props
}: ShortcutProps) {
  const [resolvedPlatform, setResolvedPlatform] = useState(platform === "auto" ? "control" : platform);
  useEffect(() => {
    if (platform === "auto") setResolvedPlatform(isApplePlatform() ? "apple" : "control");
  }, [platform]);
  const displayedPlatform = platform === "auto" ? resolvedPlatform : platform;
  return (
    <kbd className={join("shortcut", className)} {...props}>
      {children ?? (displayedPlatform === "apple" ? `⌘${shortcutKey}` : `Strg ${shortcutKey}`)}
    </kbd>
  );
}
