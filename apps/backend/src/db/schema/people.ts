import { sql } from "drizzle-orm";
import { index, jsonb, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { language, tokenScope, userRole } from "./enums.js";

/**
 * Who may sign in, what is currently signed in, and what an agent may do
 * without a browser.
 *
 * **Nothing here stores a credential.** A session cookie and an access token are
 * both random values that exist in exactly one place, which is the holder's; the
 * rows below carry their SHA-256 hashes. Somebody who reads the whole table
 * learns nothing they can present, which is the difference between a leak and a
 * break-in.
 *
 * **How the two identifier spaces are sized.** Both are 32 bytes from the
 * system's random source, written as 43 base64url characters. That is 2^256
 * distinct values. Guessing one that exists takes 2^255 attempts on average,
 * and with the few thousand tokens this site will ever issue the chance that
 * any two collide is about (10^4)^2 / 2^257, which is a number with seventy
 * zeros after the point. Neither bound is the thing to worry about.
 *
 * **SHA-256 rather than a slow hash.** A slow hash exists to make guessing a
 * low-entropy secret expensive, and a password is exactly that. A 256-bit
 * random token is not: there is nothing to guess, so the work would be spent on
 * every request for nothing. The password column below is the one that needs a
 * slow hash, and it gets one from the code that writes it.
 */

/** The generator, the same one the entry tables use. */
const identifier = () => uuid().primaryKey().default(sql`uuidv7()`);

/**
 * An account.
 *
 * There is one today. The table is shaped for more because a second author
 * should be a row rather than a migration, and because the audit log has to
 * name somebody either way.
 */
export const users = pgTable("users", {
  id: identifier(),

  /** Lower-cased before it is written, so two spellings are not two accounts. */
  email: text().notNull().unique(),

  /**
   * A slow hash, not this table's business which one. It is the only value here
   * that protects something a person chose, and therefore the only one that has
   * to be expensive to attack.
   */
  passwordHash: text("password_hash").notNull(),

  displayName: text("display_name").notNull(),

  /**
   * The picture beside the name. No foreign key yet, because the media table
   * arrives with its own issue; the constraint lands in that migration.
   */
  avatarMediaId: uuid("avatar_media_id"),

  /** Which language the dashboard speaks to this person in. */
  interfaceLanguage: language("interface_language").notNull().default("en"),

  role: userRole().notNull().default("editor"),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * A signed-in browser.
 *
 * The cookie carries the value; this carries its hash and the things worth
 * knowing when deciding whether to keep trusting it.
 */
export const sessions = pgTable(
  "sessions",
  {
    id: identifier(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    /** SHA-256 of the value in the cookie, hex. Unique, so a hash names one session. */
    tokenHash: text("token_hash").notNull().unique(),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),

    /** Moved forward as the session is used, which is what an idle timeout reads. */
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),

    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),

    /**
     * What the browser called itself. Kept so a list of sessions is readable by
     * the person deciding which to end, and for nothing else.
     */
    userAgent: text("user_agent"),
  },
  (table) => [index("sessions_by_user").on(table.userId)],
);

/**
 * What an agent presents instead of signing in.
 *
 * Revoking is a timestamp rather than a deletion, so a token that was used can
 * still be named in the audit log after it stops working.
 */
export const accessTokens = pgTable(
  "access_tokens",
  {
    id: identifier(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    /** What it is for, in the owner's words. Shown in the list; carries no authority. */
    name: text().notNull(),

    /** SHA-256 of the value that was handed over once, hex. */
    tokenHash: text("token_hash").notNull().unique(),

    /** Everything this token may do. An empty array is a token that may do nothing. */
    scopes: tokenScope().array().notNull().default(sql`'{}'`),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),

    /** Null means it does not expire on its own. */
    expiresAt: timestamp("expires_at", { withTimezone: true }),

    /** Set when it is withdrawn. A token with this set is refused from that moment. */
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (table) => [
    unique("access_tokens_name_per_user").on(table.userId, table.name),
    index("access_tokens_by_user").on(table.userId),
  ],
);

/**
 * Who did what, to which record, and when.
 *
 * Written for anything that changes what a reader can see or that issues a way
 * in. It answers the question asked after the fact, which is never "what is the
 * state now" but "how did it come to be this".
 *
 * Both actors are nullable and at most one is set: a person acting through the
 * dashboard, or a token acting on somebody's behalf. Both point at rows that may
 * be deleted, and the reference is set to null rather than cascading, because an
 * audit record that disappears when the account does is not an audit record.
 */
export const auditLog = pgTable(
  "audit_log",
  {
    id: identifier(),

    actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    actorTokenId: uuid("actor_token_id").references(() => accessTokens.id, { onDelete: "set null" }),

    /**
     * What happened, as `subject.verb`: `entry.published`, `token.issued`.
     *
     * Text rather than an enumeration, which is the one place in this schema
     * that is true. Every feature adds actions, and an enumeration would mean a
     * migration for each; an action nobody recognises later is still a useful
     * record, whilst a migration that was skipped is a gap.
     */
    action: text().notNull(),

    /** Which table the record is in, and which row. */
    subjectType: text("subject_type").notNull(),
    subjectId: uuid("subject_id"),

    /** Whatever else is worth keeping about this one act. */
    detail: jsonb(),

    at: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("audit_log_by_subject").on(table.subjectType, table.subjectId),
    index("audit_log_by_time").on(table.at),
  ],
);
