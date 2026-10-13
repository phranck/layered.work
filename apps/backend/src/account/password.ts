import { hashPassword, verifyPassword } from "@layered/passwords";
import { type ChangePasswordBody, ErrorCode } from "@layered/schemas";
import { and, eq, ne } from "drizzle-orm";
import type { Database } from "../db/connect.js";
import { auditLog, sessions, users } from "../db/schema/index.js";
import { HttpError } from "../http/response.js";

/**
 * Changes the signed-in author's password.
 *
 * **The password in use is asked for again.** A session is proof that somebody
 * signed in, not that the person at the keyboard now is the one who did, so a
 * browser left open is not enough to lock its owner out. It is verified in
 * constant time, through the same function signing in uses.
 *
 * **Every other session of the account ends.** A changed password is most often
 * a response to somebody else knowing the old one, and a session they opened
 * with it would otherwise survive the change for its whole lifetime. The session
 * making the change is kept, so the author is not signed out by their own act.
 * Personal access tokens are left alone: they are separate credentials, revoked
 * in their own screen.
 *
 * Nothing about either password reaches the audit log, only that it changed and
 * how many sessions ended with it.
 *
 * @param db - An open connection.
 * @param userId - The signed-in account, from its session, never from the request.
 * @param sessionId - The session making the change, which stays open.
 * @param change - The password in use and the new one.
 * @returns How many other sessions were ended.
 * @throws HttpError `forbidden` when the password in use is not the account's.
 *   Not `unauthenticated`, because the session itself is valid, and the
 *   dashboard reads that code as a session that has ended.
 */
export async function changeAccountPassword(
  db: Database,
  userId: string,
  sessionId: string,
  change: ChangePasswordBody,
): Promise<{ otherSessionsEnded: number }> {
  const [account] = await db
    .select({ passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!account) throw new HttpError(ErrorCode.NotFound, "This account no longer exists.");

  if (!(await verifyPassword(change.currentPassword, account.passwordHash))) {
    throw new HttpError(ErrorCode.Forbidden, "The current password is not correct.");
  }

  // Hashed before the transaction, because scrypt takes long enough that holding
  // the row and the sessions locked through it would only make others wait.
  const passwordHash = await hashPassword(change.newPassword);

  return db.transaction(async (tx) => {
    await tx.update(users).set({ passwordHash }).where(eq(users.id, userId));
    const ended = await tx
      .delete(sessions)
      .where(and(eq(sessions.userId, userId), ne(sessions.id, sessionId)))
      .returning({ id: sessions.id });
    await tx.insert(auditLog).values({
      actorUserId: userId,
      action: "account.password_changed",
      subjectType: "users",
      subjectId: userId,
      detail: { otherSessionsEnded: ended.length },
    });
    return { otherSessionsEnded: ended.length };
  });
}
