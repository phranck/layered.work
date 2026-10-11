import type { IssuedToken, IssueTokenBody, TokenScope, TokenSummary } from "@layered/schemas";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useDashboardApi } from "./dashboard-context.js";
import type { DashboardStringKey } from "./dashboard-i18n.js";
import { queryKeys } from "./query-keys.js";
import type { Reactions } from "./reactions.js";

/**
 * The personal access tokens an agent writes with, as the owner's Settings
 * card holds them, and issuing and revoking one. The API refuses everybody but
 * the owner.
 */

/** What each permission is called in the catalogue. */
export const SCOPE_TEXT: Record<TokenScope, DashboardStringKey> = {
  "content:read": "tokenScopeRead",
  "content:write": "tokenScopeWrite",
  "content:publish": "tokenScopePublish",
  "media:write": "tokenScopeUpload",
};

/** Every token issued so far, revoked ones included. */
export function useAccessTokens() {
  const api = useDashboardApi();
  return useQuery({ queryKey: queryKeys.accessTokens, queryFn: api.fetchAccessTokens });
}

/**
 * The form's fields as the body that issues a token: the name trimmed, and the
 * expiry, typed as a local date and time, as an instant, or none.
 *
 * @param name - The name as typed.
 * @param scopes - The permissions switched on.
 * @param expiry - The `datetime-local` value, or empty for a token that never expires.
 */
export function issueBodyOf(name: string, scopes: TokenScope[], expiry: string): IssueTokenBody {
  return { name: name.trim(), scopes, expiresAt: expiry ? new Date(expiry).toISOString() : null };
}

/**
 * Issues a token. Its value is in the answer and nowhere else, so the card
 * shows it once.
 *
 * @param reactions - What the card does once it is issued or has failed.
 */
export function useIssueAccessToken(reactions: Reactions<IssuedToken, IssueTokenBody>) {
  const api = useDashboardApi();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (value: IssueTokenBody) => api.issueAccessToken(value),
    onError: (error) => reactions.onError?.(error),
    onSuccess: (issued, value) => {
      void client.invalidateQueries({ queryKey: queryKeys.accessTokens });
      reactions.onSuccess?.(issued, value);
    },
  });
}

/**
 * Revokes a token, which stays in the list as revoked.
 *
 * @param reactions - What the card does once it is revoked or has failed.
 * @returns The mutation, which takes the token's id.
 */
export function useRevokeAccessToken(reactions: Reactions<TokenSummary, string>) {
  const api = useDashboardApi();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.revokeAccessToken(id),
    onError: (error) => reactions.onError?.(error),
    onSuccess: (revoked, id) => {
      void client.invalidateQueries({ queryKey: queryKeys.accessTokens });
      reactions.onSuccess?.(revoked, id);
    },
  });
}
