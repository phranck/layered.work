import { isProcessing, type MediaProcessingState } from "@layered/schemas";
import type { DashboardStringKey } from "./dashboard-i18n.js";

/**
 * How the dashboard shows a file's processing and waits for it to finish, the
 * same in the library's grid and in a file's detail.
 */

/** What each state of a file's processing is called in the catalogue. */
export const PROCESSING_TEXT: Record<MediaProcessingState, DashboardStringKey> = {
  queued: "mediaQueued",
  processing: "mediaProcessing",
  ready: "mediaReady",
  failed: "mediaFailed",
};

/** How often a view that shows a file still being processed asks for it again, in milliseconds. */
const PROCESSING_POLL_MS = 2_000;

/**
 * The interval a query asks again at while any file it shows is still being
 * processed, so its state and its variants appear without a reload.
 *
 * @param states - The processing state of every file the query shows.
 * @returns The interval in milliseconds, or false once every file has finished.
 */
export function pollWhileProcessing(states: readonly MediaProcessingState[]): number | false {
  return states.some(isProcessing) ? PROCESSING_POLL_MS : false;
}
