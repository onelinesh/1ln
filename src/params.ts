/**
 * Pure parser + shell-preamble builder for URL-based script parameters.
 *
 * Threat model: a value can contain ANY byte sequence (URL-decoded). Shell
 * injection is prevented by wrapping the value in single quotes — POSIX
 * single-quoted strings are fully literal (no $, no `, no globs, no escapes
 * other than the close-quote terminator). The only character we have to escape
 * is the single quote itself, via the standard idiom: '\''.
 */

const KEY_RE = /^[a-zA-Z][a-zA-Z0-9_]{0,31}$/;
const RESERVED_KEYS = new Set(["view", "meta"]);
const MAX_PARAMS = 16;
const MAX_VALUE_BYTES = 1024;
const MAX_TOTAL_VALUE_BYTES = 4096;

const encoder = new TextEncoder();

/**
 * Parse and validate URL query parameters into a normalized {KEY_UPPERCASE: value}
 * map. Invalid keys and over-cap values are silently dropped — a typo in a
 * parameter should not break the consumer's curl pipeline. Reserved keys (view,
 * meta, _*) are dropped to keep the namespace clean for future system flags.
 *
 * Caps are enforced in iteration order: we walk URLSearchParams.entries() and
 * stop adding once a cap would be exceeded.
 */
export function parseParams(url: URL): Record<string, string> {
  const out: Record<string, string> = {};
  let totalBytes = 0;
  let count = 0;

  for (const [rawKey, value] of url.searchParams.entries()) {
    if (count >= MAX_PARAMS) break;
    if (rawKey.length === 0) continue;
    // _* is reserved for future system flags — drop even though KEY_RE would also reject.
    if (rawKey.startsWith("_")) continue;
    if (RESERVED_KEYS.has(rawKey)) continue;
    if (!KEY_RE.test(rawKey)) continue;

    const valueBytes = encoder.encode(value).length;
    if (valueBytes > MAX_VALUE_BYTES) continue;
    // Drop null bytes — they truncate variable values in most shells and serving
    // them in text/plain is unusual. Strict drop rather than strip keeps the
    // behavior predictable.
    if (value.indexOf("\0") !== -1) continue;

    // The output key replaces a previous entry on duplicates, so we should
    // refund the old value's bytes before charging the new one.
    const upperKey = rawKey.toUpperCase();
    const prev = out[upperKey];
    if (prev !== undefined) {
      totalBytes -= encoder.encode(prev).length;
    } else {
      count += 1;
    }

    if (totalBytes + valueBytes > MAX_TOTAL_VALUE_BYTES) {
      // Refund the count bump if we just registered a new key but can't keep it.
      if (prev === undefined) count -= 1;
      else totalBytes += encoder.encode(prev).length; // restore the refund
      continue;
    }

    out[upperKey] = value;
    totalBytes += valueBytes;
  }

  return out;
}

/**
 * POSIX-safe single-quote wrapping. The only metacharacter inside a
 * single-quoted string in POSIX shells is the single quote itself, which closes
 * the literal. The standard idiom to embed one is: close the literal, emit an
 * escaped quote, reopen the literal. Hence: `'` → `'\''`.
 *
 * This works for ALL byte sequences (including newlines, tabs, $, `, *, and
 * arbitrary unicode) because nothing else is special inside single quotes.
 */
function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

/**
 * Build the shell preamble that gets prepended to the served script body.
 * Returns "" when there are no params (keeps the no-param hot path byte-for-byte
 * identical to today's behavior).
 *
 * Exports are emitted sorted by key for determinism (helps tests and debugging).
 */
export function buildPreamble(params: Record<string, string>): string {
  const entries = Object.entries(params).sort(([a], [b]) => a.localeCompare(b));
  if (entries.length === 0) return "";
  const lines = ["# 1ln.sh runtime parameters"];
  for (const [k, v] of entries) {
    lines.push(`export ENV_1LN_${k}=${shellQuote(v)}`);
  }
  // Trailing blank line so the user script body starts on its own line.
  return lines.join("\n") + "\n\n";
}
