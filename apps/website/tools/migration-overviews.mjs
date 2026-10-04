/** Former pages whose text the import now stores as listing introductions. */
export function migratedOverviewPages(entries, legacy, listingPaths) {
  const entryPaths = new Set(entries.map((entry) => entry.path));
  return Object.values(listingPaths).flatMap(({ en: path }) => {
    const slug = path.split("/").filter(Boolean).at(-1);
    return slug && legacy.has(slug) && !entryPaths.has(path) ? [{ slug, path, visibility: "public" }] : [];
  });
}
