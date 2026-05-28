import { randomBase62 } from "../slug";
import { hashToken } from "../tokens";

export type ApiTokenRow = {
  id: string;
  user_id: string;
  token_hash: string;
  name: string | null;
  created_at: number;
  last_used_at: number | null;
};

export type CreateApiTokenResult = {
  id: string;
  /** Raw token — shown to caller exactly once. Never stored in plaintext. */
  token: string;
};

/** Mints a new bearer token for `userId` and persists its SHA-256 hash. */
export async function createApiToken(
  db: D1Database,
  userId: string,
  name: string | null
): Promise<CreateApiTokenResult> {
  const token = randomBase62(32);
  const id = randomBase62(22);
  const hash = await hashToken(token);
  const now = Date.now();
  await db
    .prepare(
      "INSERT INTO api_tokens (id, user_id, token_hash, name, created_at) VALUES (?, ?, ?, ?, ?)"
    )
    .bind(id, userId, hash, name, now)
    .run();
  return { id, token };
}

/**
 * Looks up a bearer token by hashing it and consulting the UNIQUE index on
 * `token_hash`. Returns the row or null. Does NOT update last_used_at — call
 * `touchApiTokenLastUsed` separately so the middleware can update it without
 * blocking the response (waitUntil).
 */
export async function lookupApiToken(
  db: D1Database,
  token: string
): Promise<ApiTokenRow | null> {
  if (typeof token !== "string" || token.length === 0) return null;
  const hash = await hashToken(token);
  const row = await db
    .prepare("SELECT * FROM api_tokens WHERE token_hash = ?")
    .bind(hash)
    .first<ApiTokenRow>();
  return row ?? null;
}

export async function touchApiTokenLastUsed(
  db: D1Database,
  id: string
): Promise<void> {
  await db
    .prepare("UPDATE api_tokens SET last_used_at = ? WHERE id = ?")
    .bind(Date.now(), id)
    .run();
}

/** Returns true if a row was deleted, false if the id was unknown. */
export async function revokeApiToken(
  db: D1Database,
  id: string
): Promise<boolean> {
  const r = await db
    .prepare("DELETE FROM api_tokens WHERE id = ?")
    .bind(id)
    .run();
  return (r.meta.changes ?? 0) > 0;
}
