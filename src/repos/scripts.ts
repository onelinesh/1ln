import { generatePublicSlug, generatePrivateSlug } from "../slug";
import { computeContentHmac } from "../integrity";

export type ScriptRow = {
  slug: string;
  kind: "hosted" | "github_proxy";
  content: string | null;
  source_url: string | null;
  pinned_ref: string | null;
  visibility: "public" | "private";
  owner_id: string | null;
  delete_token_hash: string | null;
  name: string | null;
  expires_at: number | null;
  consumed_at: number | null;
  single_use: number;
  content_hmac: string | null;
  created_at: number;
  updated_at: number;
};

export type CreateHostedInput = {
  content: string;
  visibility: "public" | "private";
  deleteTokenHash: string | null;
  /**
   * Worker-only secret used to HMAC the stored content for tamper detection.
   * Required for `createHostedScript` so new rows always have content_hmac set.
   */
  hmacSecret: string;
  ownerId?: string | null;
  expiresAt?: number | null;
  singleUse?: boolean;
  name?: string | null;
};

const MAX_SLUG_RETRIES = 8;

export async function createHostedScript(
  db: D1Database,
  input: CreateHostedInput
): Promise<ScriptRow> {
  const now = Date.now();
  for (let attempt = 0; attempt < MAX_SLUG_RETRIES; attempt++) {
    const slug =
      input.visibility === "public"
        ? generatePublicSlug()
        : generatePrivateSlug();
    // Bind hmac to the exact slug we're about to persist; if INSERT fails on
    // UNIQUE collision we'll regenerate slug AND hmac on the next attempt.
    const contentHmac = await computeContentHmac(
      input.hmacSecret,
      slug,
      input.content
    );
    try {
      await db
        .prepare(
          `INSERT INTO scripts (slug, kind, content, visibility, owner_id, delete_token_hash, name, expires_at, single_use, content_hmac, created_at, updated_at)
           VALUES (?, 'hosted', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          slug,
          input.content,
          input.visibility,
          input.ownerId ?? null,
          input.deleteTokenHash,
          input.name ?? null,
          input.expiresAt ?? null,
          input.singleUse ? 1 : 0,
          contentHmac,
          now,
          now
        )
        .run();
      return (await getScriptBySlug(db, slug))!;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      // `slug` is the only UNIQUE column in this table, so any UNIQUE violation = slug collision.
      if (!msg.includes("UNIQUE")) throw e;
      // else retry on slug collision
    }
  }
  throw new Error("slug collision retry budget exhausted");
}

export async function getScriptBySlug(
  db: D1Database,
  slug: string
): Promise<ScriptRow | null> {
  const row = await db
    .prepare("SELECT * FROM scripts WHERE slug = ?")
    .bind(slug)
    .first<ScriptRow>();
  return row ?? null;
}

/** Silent no-op when the slug does not exist. Callers must verify existence if they need a 404. */
export async function deleteScript(db: D1Database, slug: string): Promise<void> {
  await db.prepare("DELETE FROM scripts WHERE slug = ?").bind(slug).run();
}

/**
 * Atomically marks a single-use script as consumed. Returns true if we won the race
 * (this caller is the one read), false if it was already consumed.
 */
export async function markConsumed(db: D1Database, slug: string): Promise<boolean> {
  const now = Date.now();
  const result = await db
    .prepare(
      `UPDATE scripts SET consumed_at = ?, updated_at = ?
       WHERE slug = ? AND single_use = 1 AND consumed_at IS NULL`
    )
    .bind(now, now, slug)
    .run();
  return (result.meta.changes ?? 0) > 0;
}

export type OwnedListItem = {
  slug: string;
  visibility: "public" | "private";
  name: string | null;
  size: number;
  expires_at: number | null;
  created_at: number;
  updated_at: number;
};

export async function listByOwner(
  db: D1Database,
  ownerId: string
): Promise<OwnedListItem[]> {
  const result = await db
    .prepare(
      `SELECT slug, visibility, name, length(content) AS size, expires_at, created_at, updated_at
       FROM scripts
       WHERE owner_id = ? AND kind = 'hosted'
       ORDER BY created_at DESC`
    )
    .bind(ownerId)
    .all<OwnedListItem>();
  return result.results;
}
