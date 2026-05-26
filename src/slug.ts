export const BASE62 =
  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

export function randomBase62(len: number): string {
  const buf = new Uint8Array(len);
  crypto.getRandomValues(buf);
  let out = "";
  for (let i = 0; i < len; i++) out += BASE62[buf[i]! % 62];
  return out;
}

export function generatePublicSlug(): string {
  // 4 chars of base62 = ~14.7M slug space; widen to 5/6 if we ever saturate.
  return randomBase62(4);
}

export function generatePrivateSlug(): string {
  return randomBase62(22);
}
