import { BASE62 } from "./slug";

export function generateDeleteToken(): string {
  const buf = new Uint8Array(32);
  crypto.getRandomValues(buf);
  let out = "";
  for (let i = 0; i < 32; i++) out += BASE62[buf[i]! % 62];
  return out;
}

export async function hashToken(token: string): Promise<string> {
  const data = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function verifyToken(
  token: string,
  expectedHash: string
): Promise<boolean> {
  const actual = await hashToken(token);
  if (actual.length !== expectedHash.length) return false;
  let diff = 0;
  for (let i = 0; i < actual.length; i++) {
    diff |= actual.charCodeAt(i) ^ expectedHash.charCodeAt(i);
  }
  return diff === 0;
}
