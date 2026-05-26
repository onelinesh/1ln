import { generatePublicSlug, generatePrivateSlug } from "../slug";

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
  created_at: number;
  updated_at: number;
};

export type CreateHostedInput = {
  content: string;
  visibility: "public" | "private";
  deleteTokenHash: string | null;
  ownerId?: string | null;
  expiresAt?: number | null;
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
    try {
      await db
        .prepare(
          `INSERT INTO scripts (slug, kind, content, visibility, owner_id, delete_token_hash, name, expires_at, created_at, updated_at)
           VALUES (?, 'hosted', ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          slug,
          input.content,
          input.visibility,
          input.ownerId ?? null,
          input.deleteTokenHash,
          input.name ?? null,
          input.expiresAt ?? null,
          now,
          now
        )
        .run();
      return (await getScriptBySlug(db, slug))!;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
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

export async function deleteScript(db: D1Database, slug: string): Promise<void> {
  await db.prepare("DELETE FROM scripts WHERE slug = ?").bind(slug).run();
}
