import { QueryClient, type QueryKey } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { queryKeys } from "./query-keys.js";

/**
 * Which cached answers a refresh by a prefix reaches.
 *
 * Asked of a real query cache, because the prefix only works where the cache
 * reads the keys built on it as starting with it.
 */

/** The keys a refresh by `prefix` marks stale, out of every key given. */
async function reached(prefix: QueryKey, keys: readonly QueryKey[]): Promise<QueryKey[]> {
  const client = new QueryClient();
  for (const key of keys) client.setQueryData(key, "cached");
  await client.invalidateQueries({ queryKey: prefix, refetchType: "none" });
  return keys.filter((key) => client.getQueryState(key)?.isInvalidated);
}

describe("a refresh by a prefix", () => {
  it("reaches every entry list and leaves the opened translations alone", async () => {
    const keys = [queryKeys.entryList("post"), queryKeys.entryList("project"), queryKeys.entryDetail("one")];
    expect(await reached(queryKeys.everyEntryList, keys)).toEqual(keys.slice(0, 2));
  });

  it("reaches every opened translation and leaves the lists alone", async () => {
    const keys = [queryKeys.entryDetail("one"), queryKeys.entryDetail("two"), queryKeys.entryList("page")];
    expect(await reached(queryKeys.everyEntryDetail, keys)).toEqual(keys.slice(0, 2));
  });

  it("reaches every page and every file of the library, and nothing from Unsplash", async () => {
    const keys = [
      queryKeys.mediaPage("", "all", 1, false),
      queryKeys.mediaDetail("file"),
      queryKeys.unsplash("forest", 1),
    ];
    expect(await reached(queryKeys.everyMediaQuery, keys)).toEqual(keys.slice(0, 2));
  });

  it("reaches the sidebar's counts of whichever account asked for them", async () => {
    const keys = [queryKeys.dashboardCounts("one"), queryKeys.dashboardCounts(undefined), queryKeys.session];
    expect(await reached(queryKeys.everyDashboardCount, keys)).toEqual(keys.slice(0, 2));
  });
});
