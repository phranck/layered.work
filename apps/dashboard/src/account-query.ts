import type { AccountProfile, UpdateAccountBody } from "@layered/schemas";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef } from "react";
import { useDashboardApi } from "./dashboard-context.js";
import { queryKeys } from "./query-keys.js";
import type { Reactions } from "./reactions.js";
import { useSignOut } from "./session-queries.js";

/**
 * The signed-in author's own account: saving it, and the rule the account
 * dialog's two actions share.
 */

/**
 * Stores the account and writes the answer into the cache, so every screen
 * that shows the account shows it at once.
 *
 * @param reactions - What the dialog does once it is stored or has failed.
 * @returns The mutation, which takes the account as the dialog holds it.
 */
export function useSaveAccount(reactions: Reactions<AccountProfile, UpdateAccountBody> = {}) {
  const api = useDashboardApi();
  const client = useQueryClient();
  return useMutation({
    mutationFn: api.updateAccount,
    onError: (error) => reactions.onError?.(error),
    onSuccess: (profile, body) => {
      client.setQueryData(queryKeys.account(profile.id), profile);
      reactions.onSuccess?.(profile, body);
    },
  });
}

/**
 * Saving the account and signing out, each started once at most and never both
 * at the same time.
 *
 * A second press while either runs does nothing. The guard is a ref rather than
 * the mutations' pending state, because a mutation reports itself pending only
 * in the render after the press, and a second press can arrive before that.
 * A failure stays on its mutation, where the dialog shows it.
 *
 * @returns Both mutations, for their state and their errors; `saveDraft` and
 *   `signOutOnce`, which resolve to whether the action ran and succeeded; and
 *   `running`, which says whether either is under way.
 */
export function useAccountActions() {
  const save = useSaveAccount();
  const signOut = useSignOut();
  const running = useRef(false);
  const once = async (action: () => Promise<unknown>): Promise<boolean> => {
    if (running.current) return false;
    running.current = true;
    try {
      await action();
      return true;
    } catch {
      return false;
    } finally {
      running.current = false;
    }
  };
  return {
    save,
    signOut,
    running: () => running.current,
    saveDraft: (draft: UpdateAccountBody) => once(() => save.mutateAsync(draft)),
    signOutOnce: () => once(() => signOut.mutateAsync()),
  };
}
