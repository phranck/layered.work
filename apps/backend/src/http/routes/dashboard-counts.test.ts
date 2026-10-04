import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it, vi } from "vitest";
import { readDashboardCounts } from "./dashboard-counts.js";

describe("readDashboardCounts", () => {
  it("maps database aggregates without replacing unavailable counts with zero", async () => {
    const execute = vi.fn().mockResolvedValue([
      {
        posts: 2,
        pages: 1,
        projects: 9,
        tags: 3,
        forms: 10,
        submissions: 4,
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
      projects: 9,
      tags: 3,
      media: 4,
      blocks: 5,
      mainNav: 6,
      footerNav: 7,
      social: 8,
      forms: 10,
      submissions: 4,
      mailTemplates: null,
    });
    expect(execute).toHaveBeenCalledOnce();

    const statement = new PgDialect().sqlToQuery(execute.mock.calls[0]?.[0]).sql.replace(/\s+/g, " ");
    expect(statement).toContain('from "entries" where "entries"."kind" = \'post\'');
    expect(statement).toContain('from "entries" where "entries"."kind" = \'page\'');
    expect(statement).toContain('from "entries" where "entries"."kind" = \'project\'');
    expect(statement).toContain(
      'from "navigation_items" inner join "navigations" on "navigations"."id" = "navigation_items"."navigation_id"',
    );
    expect(statement).toContain('where "navigations"."placement" = \'main\'');
    expect(statement).toContain('from "navigations" where "navigations"."placement" = \'footer\'');
    // Entries are counted, not their translations, and only while one of their
    // languages is outside the trash.
    expect(statement).not.toContain('count(*)::int from "entry_translations"');
    expect(statement).toContain('"entry_translations"."trashed_at" is null');
    expect(statement).not.toContain("enabled");
    expect(statement).toContain('from "form_submissions" where "form_submissions"."status" = \'unread\'');
  });
});
