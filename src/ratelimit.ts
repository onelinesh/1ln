const ANON_DAILY_LIMIT = 5;
const DAY_SECONDS = 86400;

function todayKey(ip: string): string {
  const day = Math.floor(Date.now() / 1000 / DAY_SECONDS);
  return `rl:anon:${day}:${ip}`;
}

export async function checkAnonymousLimit(
  kv: KVNamespace,
  ip: string
): Promise<boolean> {
  const key = todayKey(ip);
  const current = parseInt((await kv.get(key)) ?? "0", 10);
  if (current >= ANON_DAILY_LIMIT) return false;
  await kv.put(key, String(current + 1), { expirationTtl: DAY_SECONDS });
  return true;
}
