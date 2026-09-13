import { z } from "zod";
import { body, MaxLength } from "./request.js";

/**
 * What signing in accepts, read by the endpoint and by the form.
 *
 * One declaration, so the dashboard cannot offer a field the API refuses or
 * accept something it will reject a moment later.
 */

/**
 * How long a password may be.
 *
 * A bound rather than a policy. scrypt reads the whole thing, so an unbounded
 * password is an unbounded amount of work handed to whoever sends one, and this
 * is the number that stops that. There is deliberately no minimum and no
 * required-character rule here: those push people towards shorter, more
 * memorable and worse passwords, and the length of the stored hash is fixed
 * whatever went in.
 */
export const MAX_PASSWORD_LENGTH = 512;

/** What the sign-in form sends. */
export const signInBody = body({
  email: z.email().max(MaxLength.Line),
  password: z.string().min(1).max(MAX_PASSWORD_LENGTH),
});

/** What the sign-in form sends, as a type. */
export type SignInBody = z.infer<typeof signInBody>;

/**
 * Who is signed in, as the dashboard is told.
 *
 * The identifier of the session is not here. The browser cannot use it for
 * anything, and a value that appears in an interface eventually appears in a
 * screenshot.
 */
export const signedInAs = z.object({
  id: z.uuid(),
  email: z.email(),
  displayName: z.string(),
  role: z.enum(["owner", "editor"]),
});

/** Who is signed in. */
export type SignedInAs = z.infer<typeof signedInAs>;
