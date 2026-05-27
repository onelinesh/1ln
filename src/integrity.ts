/**
 * Tamper-detection HMACs for stored script content.
 *
 * Threat model: an attacker with write access to D1 (but not the Worker source
 * or secrets) could silently swap the `content` of an existing row. By keeping
 * an HMAC-SHA256 of `slug + "\n" + content` keyed by a Worker-only secret, we
 * can detect such tampering on every read. The slug is bound into the HMAC so
 * an attacker cannot copy a valid hmac from one row to another.
 *
 * Algorithm: HMAC-SHA256 via Web Crypto (`crypto.subtle`), hex-encoded.
 */

const encoder = new TextEncoder();

async function importKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

function toHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Returns the hex-encoded HMAC-SHA256 of `slug + "\n" + content` keyed by `secret`. */
export async function computeContentHmac(
  secret: string,
  slug: string,
  content: string
): Promise<string> {
  const key = await importKey(secret);
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(`${slug}\n${content}`)
  );
  return toHex(sig);
}

/**
 * Constant-time-ish comparison of expected vs recomputed HMAC.
 * Uses `crypto.subtle.verify` against the raw signature so timing leakage is
 * minimal. Returns false on any decoding or length mismatch.
 */
export async function verifyContentHmac(
  secret: string,
  slug: string,
  content: string,
  expectedHex: string
): Promise<boolean> {
  // Decode the expected hex; bail on any malformed input.
  if (typeof expectedHex !== "string" || expectedHex.length % 2 !== 0) {
    return false;
  }
  const sig = new Uint8Array(expectedHex.length / 2);
  for (let i = 0; i < sig.length; i++) {
    const byte = parseInt(expectedHex.slice(i * 2, i * 2 + 2), 16);
    if (Number.isNaN(byte)) return false;
    sig[i] = byte;
  }
  const key = await importKey(secret);
  return crypto.subtle.verify(
    "HMAC",
    key,
    sig,
    encoder.encode(`${slug}\n${content}`)
  );
}
