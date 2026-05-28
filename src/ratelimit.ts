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

const AUTHED_DAILY_LIMIT = 100;

function authedTodayKey(userId: string): string {
  const day = Math.floor(Date.now() / 1000 / DAY_SECONDS);
  return `rl:user:${day}:${userId}`;
}

export async function checkAuthedLimit(
  kv: KVNamespace,
  userId: string
): Promise<boolean> {
  const key = authedTodayKey(userId);
  const current = parseInt((await kv.get(key)) ?? "0", 10);
  if (current >= AUTHED_DAILY_LIMIT) return false;
  await kv.put(key, String(current + 1), { expirationTtl: DAY_SECONDS });
  return true;
}
