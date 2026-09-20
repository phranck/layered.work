import { type ComponentPropsWithoutRef, useEffect, useState } from "react";
import { join } from "./shared.js";

/** Platform label displayed by a shortcut. */
export type ShortcutPlatform = "apple" | "control" | "auto";
/** Props for a keyboard shortcut cap. */
export interface ShortcutProps extends ComponentPropsWithoutRef<"kbd"> {
  shortcutKey: string;
  platform?: ShortcutPlatform;
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
    if (platform === "auto")
      setResolvedPlatform(
        /Mac|iPhone|iPad/.test(navigator.platform ?? navigator.userAgent) ? "apple" : "control",
      );
  }, [platform]);
  const displayedPlatform = platform === "auto" ? resolvedPlatform : platform;
  return (
    <kbd className={join("shortcut", className)} {...props}>
      {children ?? (displayedPlatform === "apple" ? `⌘${shortcutKey}` : `Strg ${shortcutKey}`)}
    </kbd>
  );
}
