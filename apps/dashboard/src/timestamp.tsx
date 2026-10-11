import { formatInstant } from "./format.js";
import { useDashboardLanguage } from "./language-context.js";

/** Props for a moment the API recorded. */
interface TimestampProps {
  /** The instant, as the API sends it. */
  at: string;
  /** The day alone, as a list's date column shows it, or the day and the time of day. */
  show?: "date" | "dateTime";
}

/**
 * A moment the API recorded, written as `formatInstant` writes it and marked
 * up as the instant it is, so the dashboard writes a date one way wherever one
 * stands.
 */
export function Timestamp({ at, show = "date" }: TimestampProps) {
  const { language } = useDashboardLanguage();
  return <time dateTime={at}>{formatInstant(language, at, show)}</time>;
}
