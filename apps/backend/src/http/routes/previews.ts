import { previewTokenParam, publicSnapshot } from "@layered/schemas";
import { Hono } from "hono";
import { database } from "../../db/connect.js";
import { readPreview } from "../../entries/preview.js";
import { responds } from "../api-metadata.js";
import { validate } from "../validate.js";

/**
 * What the site reads to render a preview.
 *
 * **Unauthenticated, and authorised by the token alone.** The preview link is
 * opened in whatever browser the author likes, often one with no dashboard
 * session, so the token's signature, purpose and expiry are the whole of the
 * check. A token naming another preview, or none, cannot be produced without
 * the signing key.
 *
 * The answer has the snapshot's shape, so the site renders it with the same
 * repository and the same components as a published page. It is never cached:
 * it shows unpublished writing, and the token in its address is a credential.
 *
 * A forged token is refused by its signature before anything is read, so a
 * flood of guesses costs a hash each and no query, which is why this route
 * needs no limit of its own.
 */
export const previewsRoutes = new Hono();

previewsRoutes.get(
  "/:token",
  validate("param", previewTokenParam),
  responds(publicSnapshot, { envelope: false }),
  async (c) => {
    const snapshot = await readPreview(database(), c.req.valid("param").token);
    c.header("Cache-Control", "no-store");
    c.header("X-Robots-Tag", "noindex, nofollow");
    return c.json(snapshot);
  },
);
