import { ErrorCode, type FocalPoint, focalPoint } from "@layered/schemas";
import { and, eq } from "drizzle-orm";
import { auditActor } from "../auth/audit-actor.js";
import type { database } from "../db/connect.js";
import { auditLog, media } from "../db/schema/index.js";
import { HttpError } from "../http/response.js";

/** Store one validated point; all public and private readers use this row. */
export async function saveMediaFocalPoint(
  db: ReturnType<typeof database>,
  id: string,
  input: FocalPoint,
  actor?: { userId: string; tokenId?: string },
): Promise<FocalPoint> {
  const point = focalPoint.parse(input);
  return db.transaction(async (tx) => {
    const [saved] = await tx
      .update(media)
      .set({ focalX: point.x, focalY: point.y })
      .where(and(eq(media.id, id), eq(media.kind, "image")))
      .returning({ x: media.focalX, y: media.focalY });
    if (!saved) throw new HttpError(ErrorCode.NotFound, "That image is not in the media library.");
    if (actor)
      await tx.insert(auditLog).values({
        ...auditActor(actor.userId, actor.tokenId),
        action: "media.focal_updated",
        subjectType: "media",
        subjectId: id,
      });
    return saved;
  });
}
