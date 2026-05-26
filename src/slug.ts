export const BASE62 =
  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

function randomBase62(len: number): string {
  const buf = new Uint8Array(len);
  crypto.getRandomValues(buf);
  let out = "";
  for (let i = 0; i < len; i++) out += BASE62[buf[i]! % 62];
  return out;
}

export function generatePublicSlug(): string {
  return randomBase62(4);
}

export function generatePrivateSlug(): string {
  return randomBase62(22);
}
