export const MAX_ANON_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export type ExpiresValue = "1h" | "24h" | "1run" | "never" | "7d-web-default";

export type ParsedExpires = {
  /** Absolute ms timestamp; null when there is no expiry (authed `never`). */
  expiresAt: number | null;
  singleUse: boolean;
};

export type ParseOpts = {
  authed: boolean;
  nowMs: number;
};

const VALID: ReadonlySet<string> = new Set([
  "1h", "24h", "1run", "never", "7d-web-default",
]);

export function parseExpires(value: string | undefined, opts: ParseOpts): ParsedExpires {
  const v = value ?? "24h";
  if (!VALID.has(v)) {
    throw new Error(`invalid expires value: ${v}`);
  }
  const max = opts.authed ? Number.POSITIVE_INFINITY : MAX_ANON_TTL_MS;
  const clamp = (ms: number) => Math.min(ms, max);
  switch (v) {
    case "1h": return { expiresAt: opts.nowMs + clamp(HOUR_MS), singleUse: false };
    case "24h": return { expiresAt: opts.nowMs + clamp(DAY_MS), singleUse: false };
    case "1run": return { expiresAt: opts.nowMs + clamp(MAX_ANON_TTL_MS), singleUse: true };
    case "never":
      // Authed: store NULL (truly never). Anonymous: clamp to 7d (existing behavior).
      return {
        expiresAt: opts.authed ? null : opts.nowMs + MAX_ANON_TTL_MS,
        singleUse: false,
      };
    case "7d-web-default":
      return { expiresAt: opts.nowMs + clamp(MAX_ANON_TTL_MS), singleUse: false };
    default: throw new Error(`unreachable: ${v}`);
  }
}
