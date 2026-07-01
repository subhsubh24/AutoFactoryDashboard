import { NextResponse } from "next/server";
import { getAllSnapshots } from "@/lib/github";
import {
  isHistoryEnabled,
  recordDailyMetric,
  type DailyMetric,
} from "@/lib/kv";
import { headlinePct } from "@/lib/utils";
import { getValuation } from "@/lib/narrative";

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
      // Business-case ARR is deterministic + cached when the file exists; only
      // the authoritative business-case number is trended (not the heuristic).
      const valuation = await getValuation(s);
      const metric: DailyMetric = {
        date,
        prs: s.merged24h,
        pct: headlinePct(s),
        buildPct: s.progress.buildPct,
        submissionTotal: s.progress.submissionTotal,
        ciPassRate: s.ci.passRate,
        pendingOps: s.actionItems.items.length,
        // Growth trends — only persisted when the block reports a real number.
        waitlist: s.growth.available
          ? s.growth.funnel.waitlistSignupsTotal ?? undefined
          : undefined,
        mrr: s.growth.available ? s.growth.funnel.mrrUsd ?? undefined : undefined,
        // Quant-only: weekly paper PnL trend (null pre-edge → not persisted).
        pnlPaper: s.growth.available
          ? s.growth.metrics?.weeklyPnlPaper ?? undefined
          : undefined,
        // Point-in-time blocks → trajectory. Null/absent values are skipped, so
        // a trend only forms once a real number/state is reported.
        arr:
          valuation.source === "business_case" && valuation.arrExpected > 0
            ? valuation.arrExpected
            : undefined,
        pmfRetentionD7: s.growth.available
          ? s.growth.pmf?.retentionD7 ?? undefined
          : undefined,
        pmfActivation: s.growth.available
          ? s.growth.pmf?.activationRate ?? undefined
          : undefined,
        loopSignal: s.loopHealth.available ? s.loopHealth.signal ?? undefined : undefined,
      };
      const written = await recordDailyMetric(s.slug, metric);
      return { slug: s.slug, written, metric };
    }),
  );

  return NextResponse.json({
    ok: true,
    date,
    recorded: results,
  });
}
