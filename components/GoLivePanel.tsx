import type { GrowthGoLive, GrowthMetrics } from "@/lib/growth";
import { cn } from "@/lib/utils";
import { Sparkline } from "@/components/Sparkline";
import {
  CheckIcon,
  ExternalLinkIcon,
  LockIcon,
  RocketIcon,
  XIcon,
} from "@/components/icons";

/**
 * The real-money GO signal + weekly PnL tracker — LLM-Quant only.
 *
 * Everything here is rendered straight from docs/growth/GROWTH_STATUS.md: the
 * values are data, never instructions, and we show the real number or an em
 * dash — never a fabricated one. `eligible` can't be faked: the repo's own
 * preflight.sh fails CI if it flips on without every criterion true, the
 * weekly profit floor met, and all Definition-of-Done boxes checked. Even at
 * `eligible`, moving real money stays the owner's call.
 */

/** Exact USD with sign — losses show as -$500, not rounded to $k. */
function fmtUsd(n: number | null): string {
  if (n === null) return "—";
  const sign = n < 0 ? "−" : "";
  return `${sign}$${Math.abs(n).toLocaleString("en-US")}`;
}

/** A rate that may be a 0–1 fraction or an already-percent number. */
function fmtRate(r: number | null): string {
  if (r === null) return "—";
  return r <= 1 ? `${(r * 100).toFixed(0)}%` : `${r}%`;
}

const fmtNum = (n: number | null, dp = 2): string => (n === null ? "—" : n.toFixed(dp));
const fmtInt = (n: number | null): string => (n === null ? "—" : n.toLocaleString("en-US"));

// Humanize a snake_case criterion key for display, fixing a few domain tokens.
const TOKEN: Record<string, string> = { pnl: "PnL", ge: "≥", ci: "CI", dod: "DoD" };
function humanize(key: string): string {
  const words = key.split("_").map((w) => TOKEN[w.toLowerCase()] ?? w);
  const s = words.join(" ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function QStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-hairline bg-card px-3 py-2">
      <p className="text-[10px] font-medium uppercase tracking-[0.1em] text-muted">{label}</p>
      <p className="mt-0.5 text-base font-semibold tabular text-ink">{value}</p>
    </div>
  );
}

export function GoLivePanel({
  goLive,
  metrics,
  pnlHistory = [],
  sourceUrl,
  className,
}: {
  goLive?: GrowthGoLive;
  metrics?: GrowthMetrics;
  /** weekly paper PnL over KV history (oldest→newest); nulls are gaps. */
  pnlHistory?: Array<number | null>;
  sourceUrl?: string;
  className?: string;
}) {
  // Nothing to show unless the quant block carried at least one of these.
  if (!goLive && !metrics) return null;

  const status = goLive?.status ?? null;
  const eligible = status === "eligible";
  const criteria = goLive?.criteria ?? [];
  const metCount = criteria.filter((c) => c.met).length;

  const floor = metrics?.weeklyPnlTargetUsd ?? null;
  const pnl = metrics?.weeklyPnlPaper ?? null;
  // Pre-edge the agent reports null/0 — that's "no validated edge", not a result.
  const hasPnl = pnl !== null && pnl !== 0;
  const pnlPoints = pnlHistory.filter((v): v is number => v !== null && v !== undefined);
  const meetsFloor = hasPnl && floor !== null && pnl >= floor;
  const pnlTone = !hasPnl
    ? "text-muted"
    : meetsFloor
      ? "text-sage-strong"
      : pnl > 0
        ? "text-amber-strong"
        : "text-clay-strong";

  return (
    <section
      className={cn(
        "overflow-hidden rounded-2xl border bg-card shadow-card",
        eligible ? "border-sage/40" : "border-hairline",
        className,
      )}
    >
      {/* Header — the verdict, loud and unambiguous. */}
      <div
        className={cn(
          "flex flex-wrap items-center gap-x-4 gap-y-3 border-b px-5 py-4 sm:px-6",
          eligible ? "border-sage/30 bg-sage-soft/50" : "border-hairline bg-bg",
        )}
      >
        <div className="flex items-center gap-2.5">
          <span
            className={cn(
              "grid h-9 w-9 place-items-center rounded-xl",
              eligible ? "bg-sage text-white" : "bg-ink/85 text-white",
            )}
          >
            {eligible ? <RocketIcon className="h-5 w-5" /> : <LockIcon className="h-[18px] w-[18px]" />}
          </span>
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted">
              Real-money go signal
            </p>
            <p
              className={cn(
                "font-serif text-2xl font-medium leading-tight",
                eligible ? "text-sage-strong" : "text-ink",
              )}
            >
              {status === null ? "Status unknown" : eligible ? "GO-eligible" : "Not ready"}
            </p>
          </div>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          {goLive?.confidence && (
            <span
              className={cn(
                "rounded-full px-2.5 py-1 text-[11px] font-medium",
                goLive.confidence === "high"
                  ? "bg-sage-soft text-sage-strong"
                  : goLive.confidence === "building"
                    ? "bg-amber-soft text-amber-strong"
                    : "bg-bg text-muted",
              )}
            >
              confidence: {goLive.confidence}
            </span>
          )}
          {criteria.length > 0 && (
            <span className="rounded-full bg-bg px-2.5 py-1 text-[11px] font-medium tabular text-muted">
              {metCount}/{criteria.length} criteria met
            </span>
          )}
        </div>
      </div>

      <div className="grid gap-6 px-5 py-5 sm:px-6 lg:grid-cols-[1fr_1.1fr]">
        {/* Left — weekly PnL vs the profit floor + trend. */}
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">
            Weekly PnL · paper
          </p>
          <div className="mt-1 flex items-baseline gap-2">
            <span className={cn("font-serif text-3xl font-medium tabular", pnlTone)}>
              {hasPnl ? fmtUsd(pnl) : "—"}
            </span>
            {floor !== null && (
              <span className="text-sm text-muted">
                vs {fmtUsd(floor)}/wk floor
              </span>
            )}
          </div>

          {hasPnl && pnlPoints.length >= 2 ? (
            <div className="mt-3">
              <Sparkline
                values={pnlHistory}
                width={260}
                height={52}
                tone={meetsFloor ? "sage" : pnl > 0 ? "amber" : "clay"}
                className="w-full"
              />
            </div>
          ) : (
            <p className="mt-2 text-sm leading-snug text-muted">
              No validated PnL yet — the agent reports no out-of-sample edge until
              the leakage-free, cost-realistic backtest and calibration eval pass.
            </p>
          )}

          {/* Trading metrics — real numbers or an em dash, never a guess. */}
          <div className="mt-4 grid grid-cols-3 gap-2">
            <QStat label="Hit rate" value={fmtRate(metrics?.hitRate ?? null)} />
            <QStat label="Sharpe" value={fmtNum(metrics?.sharpe ?? null)} />
            <QStat
              label="Max DD"
              value={metrics?.maxDrawdownPct == null ? "—" : `${metrics.maxDrawdownPct}%`}
            />
            <QStat label="Brier" value={fmtNum(metrics?.brierCalibration ?? null)} />
            <QStat label="Trades" value={fmtInt(metrics?.totalTrades ?? null)} />
            <QStat
              label="Weeks ≥ floor"
              value={fmtInt(metrics?.weeksValidatedAboveFloor ?? null)}
            />
          </div>
        </div>

        {/* Right — the 10-point readiness checklist (published order). */}
        {criteria.length > 0 && (
          <div className="lg:border-l lg:border-hairline lg:pl-6">
            <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">
              Go-live criteria
            </p>
            <ul className="mt-2 grid gap-x-5 gap-y-1.5 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
              {criteria.map((c) => (
                <li key={c.key} className="flex items-start gap-2 text-sm">
                  {c.met ? (
                    <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-sage" />
                  ) : (
                    <XIcon className="mt-0.5 h-4 w-4 shrink-0 text-muted/60" />
                  )}
                  <span className={c.met ? "text-ink" : "text-muted"}>{humanize(c.key)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Blocking reasons + the can't-be-faked trust note. */}
      <div className="space-y-3 border-t border-hairline bg-bg px-5 py-4 sm:px-6">
        {goLive && goLive.blocking.length > 0 && (
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">
              What&apos;s blocking go
            </p>
            <ul className="mt-1.5 space-y-1 text-sm text-ink">
              {goLive.blocking.map((b, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span aria-hidden className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-clay" />
                  <span>{b}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <p className="flex items-start gap-2 text-xs leading-relaxed text-muted">
          <LockIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            Can&apos;t be faked — the repo&apos;s own{" "}
            <code className="font-mono text-[11px] text-ink">preflight.sh</code> fails CI if
            this flips to <span className="font-medium text-ink">go-eligible</span> without
            every criterion true, the weekly profit floor met, and all Definition-of-Done
            boxes checked.
            {goLive?.ownerDecisionRequired !== false && (
              <> Moving real money stays the owner&apos;s decision — never automatic.</>
            )}
          </span>
        </p>

        {sourceUrl && (
          <a
            href={sourceUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-xs text-muted transition-colors hover:text-clay"
          >
            GROWTH_STATUS.md <ExternalLinkIcon className="h-3 w-3" />
          </a>
        )}
      </div>
    </section>
  );
}
