import {
  type CreateNamedValueBody,
  createNamedValueBody,
  type NamedValue,
  updateNamedValueBody,
} from "@layered/schemas";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useDashboardApi } from "./dashboard-context.js";

/**
 * The named values as the dashboard holds them, in one cache entry, and every
 * change made to them.
 *
 * The Values screen and the editor read the same entry, so a value added in one
 * is offered by the other's completion as soon as the list is fetched again.
 * What the screen asks of the API, and the check before it asks, are here, so
 * the screen only draws.
 */

/** Where the list is cached. */
export const NAMED_VALUES_KEY = ["named-values"] as const;

/** Every named value, with where each one is used. */
export function useNamedValues() {
  const api = useDashboardApi();
  return useQuery({ queryKey: NAMED_VALUES_KEY, queryFn: api.fetchNamedValues });
}

/**
 * A draft as the body a save sends, or null where the schema the API checks
 * with refuses it.
 *
 * A new value is checked whole. An existing one is checked by its text alone,
 * because its name is fixed once content can refer to it.
 *
 * @param existing - The value being changed, or null for a new one.
 * @param draft - The name and the text as typed.
 */
export function checkedValueDraft(
  existing: NamedValue | null,
  draft: CreateNamedValueBody,
): CreateNamedValueBody | null {
  if (existing) {
    const parsed = updateNamedValueBody.safeParse({ value: draft.value });
    return parsed.success ? { name: existing.name, value: parsed.data.value } : null;
  }
  const parsed = createNamedValueBody.safeParse(draft);
  return parsed.success ? parsed.data : null;
}

/** Fetches the list and the sidebar's count again after a value changed. */
function useRefreshAfterChange() {
  const client = useQueryClient();
  return () => {
    void client.invalidateQueries({ queryKey: NAMED_VALUES_KEY });
    void client.invalidateQueries({ queryKey: ["dashboard-counts"] });
  };
}

/**
 * Saves a value: a new one is created, an existing one takes its new text.
 *
 * @param existing - The value being changed, or null for a new one.
 * @param onSaved - Runs once the API has stored it.
 * @returns The mutation, which takes a body `checkedValueDraft` has passed.
 */
export function useSaveNamedValue(existing: NamedValue | null, onSaved: () => void) {
  const api = useDashboardApi();
  const refresh = useRefreshAfterChange();
  return useMutation({
    mutationFn: (body: CreateNamedValueBody) =>
      existing ? api.updateNamedValue(existing.id, { value: body.value }) : api.createNamedValue(body),
    onSuccess: () => {
      refresh();
      onSaved();
    },
  });
}

/**
 * Deletes a value. The API refuses one that content still refers to, which
 * the screen says before it offers the deletion.
 *
 * @param value - The value to delete.
 * @param onDeleted - Runs once the API has deleted it.
 */
export function useDeleteNamedValue(value: NamedValue, onDeleted: () => void) {
  const api = useDashboardApi();
  const refresh = useRefreshAfterChange();
  return useMutation({
    mutationFn: () => api.deleteNamedValue(value.id),
    onSuccess: () => {
      refresh();
      onDeleted();
    },
  });
}
