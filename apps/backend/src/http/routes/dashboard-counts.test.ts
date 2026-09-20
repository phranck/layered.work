import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it, vi } from "vitest";
import { readDashboardCounts } from "./dashboard-counts.js";

describe("readDashboardCounts", () => {
  it("maps database aggregates without replacing unavailable counts with zero", async () => {
    const execute = vi.fn().mockResolvedValue([
      {
        posts: 2,
        pages: 1,
        tags: 3,
        media: 4,
        blocks: 5,
        mainNav: 6,
        footerNav: 7,
        social: 8,
      },
    ]);

    await expect(readDashboardCounts({ execute } as never)).resolves.toEqual({
      posts: 2,
      pages: 1,
      tags: 3,
      media: 4,
      blocks: 5,
      mainNav: 6,
      footerNav: 7,
      social: 8,
      forms: null,
      submissions: null,
      mailTemplates: null,
    });
    expect(execute).toHaveBeenCalledOnce();

    const statement = new PgDialect().sqlToQuery(execute.mock.calls[0]?.[0]).sql.replace(/\s+/g, " ");
    expect(statement).toContain('from "entries" where "entries"."kind" = \'post\'');
    expect(statement).toContain('from "entries" where "entries"."kind" = \'page\'');
    expect(statement).toContain(
      'from "navigation_items" inner join "navigations" on "navigations"."id" = "navigation_items"."navigation_id"',
    );
    expect(statement).toContain('where "navigations"."placement" = \'main\'');
    expect(statement).toContain('from "navigations" where "navigations"."placement" = \'footer\'');
    expect(statement).not.toContain("entry_translations");
    expect(statement).not.toContain("enabled");
  });
});
