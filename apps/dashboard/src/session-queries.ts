import { useQuery } from "@tanstack/react-query";
import { useDashboardApi } from "./dashboard-context.js";

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
  return useQuery({ queryKey: ["session"], queryFn: api.fetchSession, retry: false, staleTime: Infinity });
}

/** The signed-in author's account, once the session says who that is. */
export function useAccount() {
  const api = useDashboardApi();
  const session = useSession();
  return useQuery({
    queryKey: ["account", session.data?.id],
    queryFn: api.fetchAccount,
    enabled: Boolean(session.data),
    retry: false,
    staleTime: Infinity,
  });
}
