import { useQuery } from "@tanstack/react-query";
import { useDashboardApi } from "./dashboard-context.js";

/**
 * The named values as the dashboard holds them, in one cache entry.
 *
 * The Values screen and the editor read the same entry, so a value added in one
 * is offered by the other's completion as soon as the list is fetched again.
 */

/** Where the list is cached. */
export const NAMED_VALUES_KEY = ["named-values"] as const;

/** Every named value, with where each one is used. */
export function useNamedValues() {
  const api = useDashboardApi();
  return useQuery({ queryKey: NAMED_VALUES_KEY, queryFn: api.fetchNamedValues });
}
