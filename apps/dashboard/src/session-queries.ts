import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { useDashboardApi } from "./dashboard-context.js";
import { queryKeys } from "./query-keys.js";

/**
 * Who is signed in, and their account, as every screen asks for them.
 *
 * One definition of each query, so every caller shares one cache entry under
 * one key. Both are read once and kept: the session changes only by signing in
 * or out, which clears the cache, and the account only by saving it, which
 * writes the cache directly.
 */

/** The signed-in identity, or null when nobody is signed in. */
export function useSession() {
  const api = useDashboardApi();
  return useQuery({
    queryKey: queryKeys.session,
    queryFn: api.fetchSession,
    retry: false,
    staleTime: Infinity,
  });
}

/** The signed-in author's account, once the session says who that is. */
export function useAccount() {
  const api = useDashboardApi();
  const session = useSession();
  return useQuery({
    queryKey: queryKeys.account(session.data?.id),
    queryFn: api.fetchAccount,
    enabled: Boolean(session.data),
    retry: false,
    staleTime: Infinity,
  });
}

/**
 * Signing out, wherever it is offered.
 *
 * One action for the sidebar's button and the account dialog's, so both end the
 * same way: the session is gone on the server, the client has dropped the
 * cache (which `api.signOut` does), and the reader is on the sign-in screen. A
 * failure is kept on the mutation for the caller to show, and the reader stays
 * where they are.
 */
export function useSignOut() {
  const api = useDashboardApi();
  const navigate = useNavigate();
  return useMutation({
    mutationFn: api.signOut,
    onSuccess: () => navigate("/login", { replace: true }),
  });
}
