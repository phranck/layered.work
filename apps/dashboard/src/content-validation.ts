import type { Validation } from "@layered/content";
export type CheckedContent = { source: string; validation: Validation };
/** Stale diagnostics never authorize a publication after the next edit. */
export function contentIsPublishable(source: string, checked: CheckedContent): boolean {
  return source === checked.source && checked.validation.publishable;
}
