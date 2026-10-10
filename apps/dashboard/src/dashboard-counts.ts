import { type QueryClient, useQuery } from "@tanstack/react-query";
import { useDashboardApi } from "./dashboard-context.js";
import { queryKeys } from "./query-keys.js";
import { useSession } from "./session-queries.js";

/**
 * The figures beside the sidebar's areas, cached once per signed-in account.
 *
 * Whatever adds or removes something an area counts refreshes them through
 * `refreshCounts`, so the figure beside the area follows the list.
 */

/** The counts of the signed-in account, asked for only while one is signed in. */
export function useDashboardCounts() {
  const api = useDashboardApi();
  const session = useSession();
  return useQuery({
    queryKey: queryKeys.dashboardCounts(session.data?.id),
    queryFn: api.fetchDashboardCounts,
    enabled: Boolean(session.data),
    retry: false,
  });
}

/**
 * Fetches the counts again, after something an area counts was added or
 * removed.
 *
 * @param client - The dashboard's query client.
 * @returns The refresh, for a caller that waits for it.
 */
export function refreshCounts(client: QueryClient) {
  return client.invalidateQueries({ queryKey: queryKeys.everyDashboardCount });
}
