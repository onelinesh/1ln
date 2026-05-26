export async function cleanupExpired(db: D1Database): Promise<number> {
  const now = Date.now();
  const result = await db
    .prepare("DELETE FROM scripts WHERE expires_at IS NOT NULL AND expires_at < ?")
    .bind(now)
    .run();
  return result.meta.changes ?? 0;
}
