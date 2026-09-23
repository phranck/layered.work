import { z } from "zod";

/**
 * Every kind of block the home page can be built from.
 *
 * One list, read by the database enum that constrains what may be stored and by
 * the snapshot schema the website parses. They were written out separately once
 * and four of the five names had already drifted apart, which nothing could see:
 * the website renders a block it does not recognise as nothing at all, so the
 * page simply arrives shorter than it should.
 *
 * Adding a type here is half the work. The website has to render it, and
 * `unknownHomeBlocks` is what says so when it does not.
 */
export const homeBlockTypes = ["hero", "featured_entry", "project_grid", "post_grid", "topic_bar"] as const;

/** One kind of home page block, as a type. */
export type HomeBlockType = (typeof homeBlockTypes)[number];

/**
 * One block of the home page, as the snapshot carries it.
 *
 * `type` stays a plain string rather than an enum, because a snapshot written by
 * a newer dashboard may name a block this build has never heard of. Refusing the
 * whole snapshot over one unknown block would take the site down to keep one
 * section off it, so the unknown ones are separated out and reported instead.
 *
 * @property enabled - A block the dashboard has switched off, kept so its settings survive.
 * @property sortOrder - Ascending, and the order the page is assembled in.
 * @property settings - Whatever the block's type declares it can be set to.
 */
export const homeBlockSchema = z.object({
  type: z.string(),
  enabled: z.boolean().default(true),
  sortOrder: z.number().int(),
  settings: z
    .object({
      title: z.string().optional(),
      description: z.string().optional(),
      limit: z.number().int().min(1).max(24).optional(),
    })
    .default({}),
});

/** One block of the home page, whether or not this build can render it. */
export type HomeBlock = z.infer<typeof homeBlockSchema>;

/**
 * Whether a block names a type this build knows how to render.
 *
 * @param block - Any block from the snapshot.
 */
export function isKnownHomeBlock(block: HomeBlock): boolean {
  return (homeBlockTypes as readonly string[]).includes(block.type);
}

/**
 * The type names among the given blocks that this build cannot render, each once.
 *
 * Returned rather than logged, so the caller decides what to do with them: the
 * website writes them to its log, and a dashboard that lets somebody order these
 * blocks can say which of them will not appear.
 *
 * @param blocks - The blocks from the snapshot, enabled or not.
 * @returns The unknown type names, sorted, with no duplicates.
 */
export function unknownHomeBlocks(blocks: readonly HomeBlock[]): string[] {
  return [...new Set(blocks.filter((block) => !isKnownHomeBlock(block)).map((block) => block.type))].sort();
}
