import { signInBody } from "@layered/schemas";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { DashboardApiError } from "./api.js";
import { safeReturnTo } from "./auth-routing.js";
import { useDashboardApi } from "./dashboard-context.js";
import { queryKeys } from "./query-keys.js";

/**
 * Who is signed in, and their account, as every screen asks for them, and
 * signing in and out.
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

/** A name that stands for an address in an isolated local preview, never a way past signing in. */
export interface LoginAlias {
  username: string;
  email: string;
}

/**
 * Signing in with what the sign-in form holds, and going on to where the
 * reader was sent from.
 *
 * The address and the password are checked against the schema the API reads
 * before anything is sent. A refusal of the credentials is said in the words
 * the form uses for its first field, which names a user rather than an address
 * where an alias stands in. Anything else the API says is kept as it came. A
 * second submit while one runs does nothing; the guard is a ref because the
 * mutation reports itself pending only in the render after the press.
 *
 * @param loginAlias - The alias of a local preview, if one is given.
 * @returns `signIn`, which takes the typed identifier and password; the
 *   failure to show, or null; and whether a sign-in is running.
 */
export function useSignIn(loginAlias?: LoginAlias) {
  const api = useDashboardApi();
  const client = useQueryClient();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [error, setError] = useState<DashboardApiError | null>(null);
  const running = useRef(false);
  const mutation = useMutation({
    mutationFn: api.signIn,
    onSuccess: (session) => client.setQueryData(queryKeys.session, session),
  });

  const signIn = async (identifier: string, password: string) => {
    if (running.current) return;
    running.current = true;
    setError(null);
    try {
      const parsed = signInBody.safeParse({
        email: loginAlias && identifier === loginAlias.username ? loginAlias.email : identifier,
        password,
      });
      if (!parsed.success) {
        setError(new DashboardApiError(loginAlias ? "signInCheckUsername" : "signInCheckEmail"));
        return;
      }
      await mutation.mutateAsync(parsed.data);
      await navigate(safeReturnTo(searchParams.get("returnTo")), { replace: true });
    } catch (cause) {
      const apiError = cause instanceof DashboardApiError ? cause : new DashboardApiError("serverUnexpected");
      setError(
        apiError.code === "unauthenticated"
          ? new DashboardApiError(loginAlias ? "signInRefusedUsername" : "signInRefusedEmail")
          : apiError,
      );
    } finally {
      running.current = false;
    }
  };

  return { signIn, error, pending: mutation.isPending };
}
