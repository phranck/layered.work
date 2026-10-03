import table from "./legacy-redirects.json" with { type: "json" };

/**
 * Addresses the old site answered that its last generated output no longer contains.
 *
 * The Publii export inventories what the site published on its final day, and
 * `render-preview.mjs --legacy-output` checks every one of those against this
 * site. It cannot know an address that stopped being generated earlier, and
 * those addresses are still written down elsewhere: in somebody's bookmark, in
 * a post that links here, in a search result. The Internet Archive holds the
 * record of them, and `legacy-redirects.json` is what that record produced.
 *
 * The table lives in JSON because the preview renderer reads it too, as a plain
 * Node script that never sees this module. Each entry names where the address
 * was observed, so a later reader can check it rather than trust it. Anything
 * the snapshot can answer itself, such as the German entries or the `/tags/`
 * prefix, belongs to the migration or to the route and is deliberately absent.
 */
export interface LegacyRedirect {
  /** The address as the old site served it, always with its trailing slash. */
  readonly source: string;
  /** Where a visitor arriving at it lands now. */
  readonly target: string;
  /** Why this target, and where the source was observed. */
  readonly reason: string;
}

export const LEGACY_REDIRECTS: readonly LegacyRedirect[] = table;

/** The table as a lookup, built once because every request reads it. */
export const LEGACY_REDIRECT_TARGETS: ReadonlyMap<string, string> = new Map(
  LEGACY_REDIRECTS.map((redirect) => [redirect.source, redirect.target]),
);

/**
 * How many posts each numbered page of the old home page listed.
 *
 * Read off the final Publii output: eight post cards on `/` and one on
 * `/page/2/`.
 */
const LEGACY_POSTS_PER_PAGE = 8;

/**
 * The page of the posts listing that holds what an old numbered page showed.
 *
 * Publii paginated the home page at `/page/<n>/`. This site lists more posts on
 * a page, so the same number would point past the end of the listing and answer
 * 404. The first post the old page showed decides where it lands.
 *
 * @param oldPage - The number in the old address, from 1.
 * @param pageSize - How many posts a page of the listing shows now, as its settings say.
 * @returns The listing page, from 1.
 */
export function legacyPostsPage(oldPage: number, pageSize: number): number {
  return Math.floor(((oldPage - 1) * LEGACY_POSTS_PER_PAGE) / pageSize) + 1;
}
