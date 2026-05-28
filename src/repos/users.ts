import { randomBase62 } from "../slug";

export type UserRow = {
  id: string;
  github_id: string;
  created_at: number;
};

/**
 * Atomic upsert keyed on `github_id`. On first call we INSERT a new random id;
 * on a UNIQUE collision (existing github_id) we SELECT the existing row.
 * We do NOT use SQLite ON CONFLICT DO NOTHING + RETURNING so the code stays
 * portable to anything D1 supports today.
 */
export async function upsertByGithubId(
  db: D1Database,
  githubId: string
): Promise<UserRow> {
  const existing = await db
    .prepare("SELECT * FROM users WHERE github_id = ?")
    .bind(githubId)
    .first<UserRow>();
  if (existing) return existing;

  const id = randomBase62(22);
  const now = Date.now();
  try {
    await db
      .prepare("INSERT INTO users (id, github_id, created_at) VALUES (?, ?, ?)")
      .bind(id, githubId, now)
      .run();
    return { id, github_id: githubId, created_at: now };
  } catch (e: unknown) {
    // Race: someone else inserted the same github_id between SELECT and INSERT.
    const msg = e instanceof Error ? e.message : String(e);
    if (!msg.includes("UNIQUE")) throw e;
    const winner = await db
      .prepare("SELECT * FROM users WHERE github_id = ?")
      .bind(githubId)
      .first<UserRow>();
    if (!winner) throw new Error("upsert race lost but row not found");
    return winner;
  }
}

export async function getUserById(
  db: D1Database,
  id: string
): Promise<UserRow | null> {
  const row = await db
    .prepare("SELECT * FROM users WHERE id = ?")
    .bind(id)
    .first<UserRow>();
  return row ?? null;
}
