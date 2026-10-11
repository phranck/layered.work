import {
  type SaveSocialAccountBody,
  SOCIAL_PLATFORM_NAMES,
  SOCIAL_PLATFORMS,
  type SocialAccount,
  saveSocialAccountBody,
} from "@layered/schemas";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useDashboardApi } from "./dashboard-context.js";
import { refreshCounts } from "./dashboard-counts.js";
import type { Position } from "./list-order.js";
import { queryKeys } from "./query-keys.js";
import type { Reactions } from "./reactions.js";

/**
 * The site's social accounts as the dashboard holds them, and every change
 * made to one. Each change fetches the list and the sidebar's count again.
 */

/** Every platform, by its own name, as the editor's select offers them. */
export const PLATFORM_OPTIONS = SOCIAL_PLATFORMS.map((value) => ({
  value,
  label: SOCIAL_PLATFORM_NAMES[value],
}));

/**
 * An account as the editor opens it, or a new one at the end of the list.
 *
 * @param account - The account as it is stored, or null for a new one.
 * @param sortOrder - The place a new account takes.
 */
export function accountDraftOf(account: SocialAccount | null, sortOrder: number): SaveSocialAccountBody {
  if (!account) return { platform: "mastodon", handle: "", href: "", enabled: true, sortOrder };
  const { platform, handle, href, enabled } = account;
  return { platform, handle, href, enabled, sortOrder: account.sortOrder };
}

/**
 * An account's draft as the body a save sends, or null where the schema the
 * API validates with refuses it.
 *
 * @param draft - The account as the editor holds it.
 */
export function checkedAccount(draft: SaveSocialAccountBody): SaveSocialAccountBody | null {
  const parsed = saveSocialAccountBody.safeParse(draft);
  return parsed.success ? parsed.data : null;
}

/** Every social account, in the order the site shows them. */
export function useSocialAccounts() {
  const api = useDashboardApi();
  return useQuery({ queryKey: queryKeys.socialAccounts, queryFn: api.fetchSocialAccounts });
}

/** Fetches the accounts and the sidebar's count again after one was added, changed, moved or deleted. */
function useRefreshAccounts() {
  const client = useQueryClient();
  return () => {
    void client.invalidateQueries({ queryKey: queryKeys.socialAccounts });
    void refreshCounts(client);
  };
}

/** What one save is given: the account, or null for a new one, and the body to store. */
export interface AccountSave {
  id: string | null;
  value: SaveSocialAccountBody;
}

/**
 * Creates an account or stores an existing one.
 *
 * @param reactions - What the screen does once it is stored or has failed.
 */
export function useSaveSocialAccount(reactions: Reactions<SocialAccount, AccountSave>) {
  const api = useDashboardApi();
  const refresh = useRefreshAccounts();
  return useMutation({
    mutationFn: ({ id, value }: AccountSave) => api.saveSocialAccount(id, value),
    onError: (error) => reactions.onError?.(error),
    onSuccess: (saved, save) => {
      refresh();
      reactions.onSuccess?.(saved, save);
    },
  });
}

/**
 * Stores the order of the accounts.
 *
 * @param reactions - What the screen does once it is stored or has failed.
 * @returns The mutation, which takes every account's new place.
 */
export function useReorderSocialAccounts(reactions: Reactions<SocialAccount[], Position[]>) {
  const api = useDashboardApi();
  const refresh = useRefreshAccounts();
  return useMutation({
    mutationFn: api.reorderSocialAccounts,
    onError: (error) => reactions.onError?.(error),
    onSuccess: (accounts, positions) => {
      refresh();
      reactions.onSuccess?.(accounts, positions);
    },
  });
}

/**
 * Deletes an account.
 *
 * @param account - The account to delete.
 * @param reactions - What the dialog does once it is gone or has failed.
 */
export function useDeleteSocialAccount(account: SocialAccount, reactions: Reactions<void>) {
  const api = useDashboardApi();
  const refresh = useRefreshAccounts();
  return useMutation({
    mutationFn: () => api.deleteSocialAccount(account.id),
    onError: (error) => reactions.onError?.(error),
    onSuccess: () => {
      refresh();
      reactions.onSuccess?.();
    },
  });
}
