import { z } from "zod";

/** Counts shown beside dashboard areas that already have persisted domains. */
const storedCount = z.number().int().nonnegative();

/**
 * The totals shown in the dashboard sidebar.
 *
 * A null count means the domain has no storage yet. That is different from a
 * stored domain with no rows, whose count is zero.
 */
export const dashboardCounts = z
  .object({
    posts: storedCount,
    pages: storedCount,
    tags: storedCount,
    media: storedCount,
    blocks: storedCount,
    mainNav: storedCount,
    footerNav: storedCount,
    social: storedCount,
    forms: z.null(),
    submissions: z.null(),
    mailTemplates: z.null(),
  })
  .strict();

/** Totals shown in the dashboard sidebar. */
export type DashboardCounts = z.infer<typeof dashboardCounts>;
