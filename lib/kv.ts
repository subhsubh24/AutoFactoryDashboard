/**
 * Optional history via Vercel KV. Everything here is a guarded no-op when KV
 * isn't configured (no KV_REST_API_URL / KV_REST_API_TOKEN), so the dashboard
 * runs identically with or without it — the UI simply hides trend charts.
 */

export interface DailyMetric {
  /** YYYY-MM-DD (UTC). */
  date: string;
  prs: number;
  pct: number | null;
  ciPassRate: number | null;
}

const MAX_DAYS = 60;
const key = (slug: string) => `afd:hist:${slug}`;

/**
 * Resolve KV REST credentials, accepting either the `@vercel/kv` names or the
 * `UPSTASH_REDIS_REST_*` names that the Upstash marketplace integration injects.
 * Returns null when neither pair is present.
 */
function kvCreds(): { url: string; token: string } | null {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token =
    process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { url, token } : null;
}

/** True when KV credentials are present (under either naming scheme). */
export function isHistoryEnabled(): boolean {
  return kvCreds() !== null;
}

// Imported lazily so @vercel/kv never initializes unless KV is configured.
async function getKv() {
  const creds = kvCreds();
  if (!creds) throw new Error("KV is not configured");
  const { createClient } = await import("@vercel/kv");
  return createClient(creds);
}

/** Read a project's daily history (ascending by date). Null when disabled. */
export async function getHistory(slug: string): Promise<DailyMetric[] | null> {
  if (!isHistoryEnabled()) return null;
  try {
    const kv = await getKv();
    const data = await kv.get<DailyMetric[]>(key(slug));
    if (!Array.isArray(data)) return [];
    return [...data].sort((a, b) => a.date.localeCompare(b.date));
  } catch (e) {
    console.error("KV getHistory failed:", e);
    return null;
  }
}

/** Upsert today's metric for a project. Returns false when disabled/failed. */
export async function recordDailyMetric(
  slug: string,
  metric: DailyMetric,
): Promise<boolean> {
  if (!isHistoryEnabled()) return false;
  try {
    const kv = await getKv();
    const existing = (await kv.get<DailyMetric[]>(key(slug))) ?? [];
    const byDate = new Map(existing.map((m) => [m.date, m]));
    byDate.set(metric.date, metric);
    const merged = [...byDate.values()]
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-MAX_DAYS);
    await kv.set(key(slug), merged);
    return true;
  } catch (e) {
    console.error("KV recordDailyMetric failed:", e);
    return false;
  }
}
