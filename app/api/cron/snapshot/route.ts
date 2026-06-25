import { NextResponse } from "next/server";
import { getAllSnapshots } from "@/lib/github";
import { buildOverview } from "@/lib/aggregate";
import {
  isHistoryEnabled,
  recordDailyMetric,
  recordFactoryMetric,
  type DailyMetric,
  type FactoryDailyMetric,
} from "@/lib/kv";
import { headlinePct } from "@/lib/utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Daily snapshot → Vercel KV (configured via vercel.json cron).
 *
 * Fully guarded:
 *  - If CRON_SECRET is set, requires `Authorization: Bearer <CRON_SECRET>`
 *    (Vercel sends this automatically for cron invocations).
 *  - If KV isn't configured, it's a no-op that returns 200 — never an error.
 */
function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  if (!isHistoryEnabled()) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: "Vercel KV is not configured — history is disabled.",
    });
  }

  const date = new Date().toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
  const snapshots = await getAllSnapshots();

  const results = await Promise.all(
    snapshots.map(async (s) => {
      const metric: DailyMetric = {
        date,
        prs: s.merged24h,
        pct: headlinePct(s),
        buildPct: s.progress.buildPct,
        submissionTotal: s.progress.submissionTotal,
        ciPassRate: s.ci.passRate,
      };
      const written = await recordDailyMetric(s.slug, metric);
      return { slug: s.slug, written, metric };
    }),
  );

  // Factory-wide KPIs for the trend charts.
  const overview = buildOverview(snapshots);
  const factoryMetric: FactoryDailyMetric = {
    date,
    prs: overview.totalMerged24h,
    yieldPct: overview.factory.firstPassYield,
    leadHours: overview.factory.leadTimeHours,
    reworkPct: overview.factory.reworkRate,
    progress: overview.avgProgress,
    wip: overview.factory.wipOpen,
  };
  const factoryWritten = await recordFactoryMetric(factoryMetric);

  return NextResponse.json({
    ok: true,
    date,
    recorded: results,
    factory: { written: factoryWritten, metric: factoryMetric },
  });
}
