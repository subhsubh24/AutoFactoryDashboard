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

/** True when Vercel KV credentials are present. */
export function isHistoryEnabled(): boolean {
  return Boolean(
    process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN,
  );
}

// Imported lazily so @vercel/kv never initializes unless KV is configured.
async function getKv() {
  const { kv } = await import("@vercel/kv");
  return kv;
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
