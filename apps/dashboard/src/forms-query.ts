import { type CreateFormBody, createFormBody, type FormDetail } from "@layered/schemas";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { checkedDraft } from "./checked-draft.js";
import { useDashboardApi } from "./dashboard-context.js";
import { refreshCounts } from "./dashboard-counts.js";
import { queryKeys } from "./query-keys.js";
import type { Reactions } from "./reactions.js";

/**
 * The forms as the dashboard holds them, and every change made to one. The
 * forms list, the submissions inbox and the form editor share one cache entry
 * for the list.
 */

/** Every form. */
export function useForms() {
  const api = useDashboardApi();
  return useQuery({ queryKey: queryKeys.forms, queryFn: api.fetchForms });
}

/**
 * One form, as the editor opens it.
 *
 * @param id - The form's id, or nothing for a form not created yet, which asks nothing.
 */
export function useForm(id: string | undefined) {
  const api = useDashboardApi();
  return useQuery({
    queryKey: queryKeys.form(id),
    queryFn: () => api.fetchForm(id ?? ""),
    enabled: Boolean(id),
  });
}

/**
 * A form's draft as the body a save sends, or the first issue the schema the
 * API validates with refuses.
 *
 * @param draft - The form as the editor holds it.
 */
export function checkedForm(draft: CreateFormBody) {
  return checkedDraft(createFormBody, draft);
}

/**
 * Creates a form or stores an existing one, and keeps the answer as the opened
 * form. The list and the sidebar's count are fetched again.
 *
 * @param id - The form's id, or nothing for a new one, which a save creates.
 * @param reactions - What the editor does once it is stored or has failed.
 * @returns The mutation, which takes a body `checkedForm` has passed.
 */
export function useSaveForm(id: string | undefined, reactions: Reactions<FormDetail, CreateFormBody>) {
  const api = useDashboardApi();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (value: CreateFormBody) => (id ? api.saveForm(id, value) : api.createForm(value)),
    onError: (error) => reactions.onError?.(error),
    onSuccess: (saved, value) => {
      client.setQueryData(queryKeys.form(saved.id), saved);
      void client.invalidateQueries({ queryKey: queryKeys.forms });
      void refreshCounts(client);
      reactions.onSuccess?.(saved, value);
    },
  });
}
