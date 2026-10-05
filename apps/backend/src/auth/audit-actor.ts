/** Exactly one actor column is set on each audit row. */
export function auditActor(
  userId: string,
  tokenId?: string,
): { actorUserId: string | null; actorTokenId: string | null } {
  return tokenId ? { actorUserId: null, actorTokenId: tokenId } : { actorUserId: userId, actorTokenId: null };
}
