import type { SettingsGroup, SettingsValues, SettingsView } from "@layered/schemas";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { DraftSchema } from "./checked-draft.js";
import { useDashboardApi } from "./dashboard-context.js";
import type { DashboardStringKey } from "./dashboard-i18n.js";
import { queryKeys } from "./query-keys.js";
import type { Reactions } from "./reactions.js";

/**
 * The site's settings as the dashboard holds them, in one cache entry every
 * settings card shares, and the checks a group's draft passes before it is
 * sent.
 */

/** The site's settings, and whether a mail key is configured. */
export function useSettings() {
  const api = useDashboardApi();
  return useQuery({ queryKey: queryKeys.settings, queryFn: api.fetchSettings });
}

/**
 * A group's draft as the body a save sends, or the sentences that say which
 * fields failed.
 *
 * The draft is checked against the same schema the API validates with, so the
 * reader learns which field is wrong and why before anything is sent. A field
 * the reasons do not name is said as a refused request. Each sentence is said
 * once, however many issues lead to it.
 *
 * @param schema - The group's schema.
 * @param draft - The group as the card holds it.
 * @param reasons - The sentence for a failing field, by the first segment of its path.
 */
export function checkedSettings<Value>(
  schema: DraftSchema<Value>,
  draft: Value,
  reasons: Partial<Record<string, DashboardStringKey>>,
): { value: Value } | { problems: DashboardStringKey[] } {
  const parsed = schema.safeParse(draft);
  if (parsed.success) return { value: parsed.data };
  const keys = parsed.error.issues.map((issue) => reasons[String(issue.path[0])] ?? "errorInvalidRequest");
  return { problems: [...new Set(keys)] };
}

/**
 * Stores one group of settings and keeps the answer, which holds every group,
 * as the cached settings.
 *
 * @param group - Which group.
 * @param reactions - What the card does once it is stored or has failed.
 * @returns The mutation, which takes a value `checkedSettings` has passed.
 */
export function useSaveSettings<Group extends SettingsGroup>(
  group: Group,
  reactions: Reactions<SettingsView, SettingsValues[Group]>,
) {
  const api = useDashboardApi();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (value: SettingsValues[Group]) => api.saveSettings(group, value),
    onError: (error) => reactions.onError?.(error),
    onSuccess: (view, value) => {
      client.setQueryData(queryKeys.settings, view);
      reactions.onSuccess?.(view, value);
    },
  });
}

/** Sends a test message to the signed-in owner and keeps what SMTP2GO answered. */
export function useSendTestMail() {
  const api = useDashboardApi();
  return useMutation({ mutationFn: api.sendTestMail });
}

/**
 * Why a test message cannot be sent yet, or nothing where it can: a key has to
 * be configured, the stored settings are what it sends with, so a change has
 * to be saved first, and it needs a sender.
 *
 * @param keyConfigured - Whether the API holds a mail key.
 * @param dirty - Whether the card holds unsaved changes.
 * @param senderAddress - The stored sender address.
 */
export function testMailBlocker(
  keyConfigured: boolean,
  dirty: boolean,
  senderAddress: string | null,
): DashboardStringKey | undefined {
  if (!keyConfigured) return "testMailNeedsKey";
  if (dirty) return "testMailNeedsSave";
  if (!senderAddress) return "testMailNeedsSender";
  return undefined;
}
