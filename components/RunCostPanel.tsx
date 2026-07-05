import type { RunCost } from "@/lib/runcost";
import { cn, formatUsd } from "@/lib/utils";
import { Sparkline } from "@/components/Sparkline";
import { ExternalLinkIcon, PulseIcon } from "@/components/icons";

/**
 * Per-routine factory run cost (FACTORY_STANDARD §33). Each routine self-reports
 * its own token usage by model into docs/autonomous-loop/COST_LEDGER.jsonl; we
 * price it here (config/model-prices.ts) into real per-routine, per-model
 * dollars. It's an ESTIMATE — self-reported tokens × list price — labelled as
 * such, never billing-grade, and never a fabricated number (absent until the
 * routines start reporting).
 */

/** Humanize a role slug (product-factory → Product factory). */
function humanizeRole(role: string): string {
  const s = role.replace(/[-_]+/g, " ").trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Compact token count: 1_240_000 → "1.2M", 34_500 → "34.5k". */
function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 100_000 ? 0 : 1)}k`;
  return `${n}`;
}

function CostBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.max(2, Math.round((value / max) * 100)) : 0;
  return (
    <span className="block h-1.5 w-full overflow-hidden rounded-full bg-[var(--ring-track)]">
      <span className="block h-full rounded-full bg-clay" style={{ width: `${pct}%` }} />
    </span>
  );
}

function Lines({
  title,
  lines,
  max,
  mono,
}: {
  title: string;
  lines: { label: string; usd: number }[];
  max: number;
  mono?: boolean;
}) {
  if (lines.length === 0) return null;
  return (
    <div className="mt-3">
      <p className="mb-1.5 text-[10px] font-medium uppercase tracking-[0.12em] text-muted">{title}</p>
      <ul className="space-y-1.5">
        {lines.map((l) => (
          <li key={l.label} className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1">
            <span
              className={cn("truncate text-[12px] text-ink", mono && "font-mono")}
              title={l.label}
            >
              {mono ? l.label : humanizeRole(l.label)}
            </span>
            <span className="tabular text-xs font-medium text-ink">{formatUsd(l.usd)}</span>
            <span className="col-span-2">
              <CostBar value={l.usd} max={max} />
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function RunCostPanel({ runCost }: { runCost: RunCost }) {
  if (!runCost.available) {
    return (
      <div className="rounded-xl border border-hairline bg-bg px-4 py-3.5">
        <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-muted">
          Factory run cost
        </p>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          No run cost yet — each routine self-reports its own token usage by model into{" "}
          <span className="font-mono text-[12px]">COST_LEDGER.jsonl</span> during bookkeeping
          (FACTORY_STANDARD §33); the dashboard prices it into real per-routine, per-model dollars.
          The empty state is expected until the routines run under the new rule.
        </p>
        {runCost.sourceUrl && (
          <a
            href={runCost.sourceUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-2 inline-flex items-center gap-1.5 text-xs text-muted transition-colors hover:text-clay"
          >
            COST_LEDGER.jsonl <ExternalLinkIcon className="h-3 w-3" />
          </a>
        )}
      </div>
    );
  }

  const maxModel = runCost.byModel.reduce((m, l) => Math.max(m, l.usd), 0);
  const maxRole = runCost.byRole.reduce((m, l) => Math.max(m, l.usd), 0);
  const hasTrend = runCost.daily.some((d) => d > 0);

  // Token usage detail (fills the Cost & compute section beyond the cost lines).
  const mix = runCost.tokenMix;
  const mixLines = [
    { label: "Input", n: mix.input },
    { label: "Output", n: mix.output },
    { label: "Cache read", n: mix.cacheRead },
    { label: "Cache write", n: mix.cacheWrite },
  ].filter((l) => l.n > 0);
  const maxMix = mixLines.reduce((m, l) => Math.max(m, l.n), 0);
  const cacheableInput = mix.input + mix.cacheRead + mix.cacheWrite;
  const cacheHitRate = cacheableInput > 0 ? mix.cacheRead / cacheableInput : null;
  const hasTokenTrend = runCost.dailyTokens.some((t) => t > 0);

  return (
    <div className="rounded-xl border border-hairline bg-bg px-4 py-3.5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-muted">
          Factory run cost
        </p>
        <span className="text-[11px] text-muted">
          {runCost.runsInWindow} run{runCost.runsInWindow === 1 ? "" : "s"} · last {runCost.windowDays}d
        </span>
      </div>

      <p className="mt-1.5 flex items-baseline gap-2">
        <span className="text-2xl font-semibold tabular text-ink">{formatUsd(runCost.windowUsd)}</span>
        <span className="text-xs text-muted">estimated agent spend</span>
      </p>

      {/* The one token metric worth a glance — how heavy each factory run is. */}
      {runCost.runsInWindow > 0 && (
        <p className="mt-1 text-xs text-muted">
          <span className="tabular font-medium text-ink">
            {fmtTokens(Math.round(runCost.tokensInWindow / runCost.runsInWindow))}
          </span>{" "}
          tokens / run avg
        </p>
      )}

      {hasTrend && (
        <div className="mt-2 flex items-center gap-2">
          <PulseIcon className="h-3.5 w-3.5 text-muted" />
          <Sparkline values={runCost.daily} />
          <span className="text-[10px] text-muted">daily</span>
        </div>
      )}

      <Lines title="By routine" lines={runCost.byRole} max={maxRole} />
      <Lines title="By model" lines={runCost.byModel} max={maxModel} mono />

      {/* Token usage detail — the "compute" half of the section. */}
      {runCost.tokensInWindow > 0 && (
        <div className="mt-4 border-t border-hairline pt-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-muted">
              Token usage
            </p>
            <span className="text-[11px] tabular text-muted">
              {fmtTokens(runCost.tokensInWindow)} total
              {cacheHitRate !== null && ` · ${Math.round(cacheHitRate * 100)}% from cache`}
            </span>
          </div>

          {hasTokenTrend && (
            <div className="mt-2 flex items-center gap-2">
              <PulseIcon className="h-3.5 w-3.5 text-muted" />
              <Sparkline values={runCost.dailyTokens} />
              <span className="text-[10px] text-muted">tokens / day</span>
            </div>
          )}

          {mixLines.length > 0 && (
            <ul className="mt-3 space-y-1.5">
              {mixLines.map((l) => (
                <li key={l.label} className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1">
                  <span className="truncate text-[12px] text-ink">{l.label}</span>
                  <span className="tabular text-xs font-medium text-ink">{fmtTokens(l.n)}</span>
                  <span className="col-span-2">
                    <CostBar value={l.n} max={maxMix} />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <p className="mt-3 text-[11px] leading-relaxed text-muted">
        Estimate: each routine sums its own session-transcript tokens by model (§33) × list price
        (as of {runCost.pricesAsOf}).
        {runCost.hasUnknownModel && " Includes a model with no known price (approximated)."}
        {runCost.totalUsd > runCost.windowUsd &&
          ` All-time in ledger: ${formatUsd(runCost.totalUsd)}.`}
      </p>
      {runCost.sourceUrl && (
        <a
          href={runCost.sourceUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-2 inline-flex items-center gap-1.5 text-xs text-muted transition-colors hover:text-clay"
        >
          COST_LEDGER.jsonl <ExternalLinkIcon className="h-3 w-3" />
        </a>
      )}
    </div>
  );
}
