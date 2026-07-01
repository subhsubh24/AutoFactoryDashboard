import { routineShortLabel } from "@/config/routines";
import type { ProductInferenceCost } from "@/lib/cost";
import type { LoopHealth } from "@/lib/loophealth";
import type { Workload } from "@/lib/routine";
import { cn, formatShortDate, formatUsd } from "@/lib/utils";
import { ExternalLinkIcon, PulseIcon } from "@/components/icons";
import { Sparkline } from "@/components/Sparkline";

const fmtInt = (n: number | null): string =>
  n === null ? "—" : n.toLocaleString("en-US");

/** A thin proportional bar (track-coloured remainder) for a 0..max value. */
function Bar({ value, max, tone }: { value: number; max: number; tone: "clay" | "muted" }) {
  const pct = max > 0 ? Math.max(2, Math.round((value / max) * 100)) : 0;
  return (
    <span className="block h-1.5 w-full overflow-hidden rounded-full bg-[var(--ring-track)]">
      <span
        className={cn("block h-full rounded-full", tone === "clay" ? "bg-clay" : "bg-muted")}
        style={{ width: `${pct}%` }}
      />
    </span>
  );
}

function ProxyStat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-muted">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular text-ink">{value}</p>
      {sub && <p className="mt-0.5 text-[11px] text-muted">{sub}</p>}
    </div>
  );
}

/**
 * Section 1 — the app's own metered inference spend. Only a repo that PUBLISHES a
 * `cost` block lights this up; absent is the expected pre-launch steady state
 * (the live figure is owner-only behind the metrics API), so we explain where it
 * lives rather than flag a gap.
 */
function InferenceCostBlock({ cost }: { cost: ProductInferenceCost }) {
  if (!cost.available) {
    return (
      <div className="rounded-xl border border-hairline bg-bg px-4 py-3.5">
        <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-muted">
          Product inference cost
        </p>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          No spend to report — the expected pre-launch state. Each app meters its
          own runtime LLM spend in code (a cost-meter / cost ledger), but the live
          figure sits behind an owner-only metrics API. The agents can&apos;t
          publish it (no metrics token — secrets never live in agents); it
          surfaces here once the owner wires a token-holding job post-launch to
          write a <span className="font-mono text-[12px]">cost</span> block into{" "}
          <span className="font-mono text-[12px]">GROWTH_STATUS</span>.
        </p>
        {cost.sourceUrl && (
          <a
            href={cost.sourceUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-2 inline-flex items-center gap-1.5 text-xs text-muted transition-colors hover:text-clay"
          >
            GROWTH_STATUS.md <ExternalLinkIcon className="h-3 w-3" />
          </a>
        )}
      </div>
    );
  }

  const allLines = [...cost.byModel, ...cost.byStage];
  const maxLine = allLines.reduce((m, l) => Math.max(m, l.usd), 0);

  return (
    <div className="rounded-xl border border-hairline bg-bg px-4 py-3.5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-muted">
          Product inference cost
        </p>
        {formatShortDate(cost.asOf, true) && (
          <span className="text-[11px] text-muted">as of {formatShortDate(cost.asOf, true)}</span>
        )}
      </div>
      <p className="mt-1.5 flex items-baseline gap-2">
        <span className="text-2xl font-semibold tabular text-ink">
          {formatUsd(cost.totalUsd, cost.currency)}
        </span>
        {cost.windowDays !== null && (
          <span className="text-xs text-muted">metered LLM spend · last {cost.windowDays}d</span>
        )}
      </p>

      {cost.byModel.length > 0 && (
        <CostLines title="By model" lines={cost.byModel} max={maxLine} currency={cost.currency} />
      )}
      {cost.byStage.length > 0 && (
        <CostLines title="By pipeline stage" lines={cost.byStage} max={maxLine} currency={cost.currency} />
      )}

      {cost.source && (
        <p className="mt-3 text-[11px] leading-relaxed text-muted">{cost.source}</p>
      )}
      {cost.sourceUrl && (
        <a
          href={cost.sourceUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-2 inline-flex items-center gap-1.5 text-xs text-muted transition-colors hover:text-clay"
        >
          GROWTH_STATUS.md <ExternalLinkIcon className="h-3 w-3" />
        </a>
      )}
    </div>
  );
}

function CostLines({
  title,
  lines,
  max,
  currency,
}: {
  title: string;
  lines: { label: string; usd: number }[];
  max: number;
  currency: string;
}) {
  return (
    <div className="mt-3">
      <p className="mb-1.5 text-[10px] font-medium uppercase tracking-[0.12em] text-muted">
        {title}
      </p>
      <ul className="space-y-1.5">
        {lines.map((l) => (
          <li key={l.label} className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1">
            <span className="truncate font-mono text-[12px] text-ink" title={l.label}>
              {l.label}
            </span>
            <span className="tabular text-xs font-medium text-ink">{formatUsd(l.usd, currency)}</span>
            <span className="col-span-2">
              <Bar value={l.usd} max={max} tone="clay" />
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Section 2 — the activity-as-cost proxy, read WITHIN this product (never ranked
 * against other product types). Reverts (rework / wasted compute) lead as the
 * quality signal; scheduled runs/week and this product's own merged output and
 * trend give context; the by-routine split shows which of ITS routines runs
 * hardest. Merge volume isn't comparable across products — noted inline.
 */
function ActivityProxyBlock({
  workload,
  merged7d,
  loop,
  mergedTrend = [],
}: {
  workload: Workload;
  merged7d: number;
  loop: LoopHealth;
  /** This product's merged-PRs-per-day from KV history (oldest→newest). */
  mergedTrend?: Array<number | null>;
}) {
  const maxRoutine = workload.byRoutine.reduce((m, r) => Math.max(m, r.runsPerWeek), 0);
  const reverts = loop.available ? loop.rolling7d.reverts : null;
  const shipped = loop.available ? loop.thisRun.changesShipped : null;
  const abandoned = loop.available ? loop.thisRun.changesAbandoned : null;
  const hasThisRun = shipped !== null || abandoned !== null;
  const clean = reverts === 0;
  const hasTrend = mergedTrend.filter((v) => v !== null).length >= 2;

  return (
    <div className="rounded-xl border border-hairline bg-bg px-4 py-3.5">
      <p className="inline-flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.12em] text-muted">
        <PulseIcon className="h-3.5 w-3.5" />
        Activity · cost proxy
      </p>

      {/* Reverts lead — the quality signal that IS comparable (0 is good for any
          product kind), weighted over raw merge volume. */}
      <div
        className={cn(
          "mt-2.5 flex items-baseline justify-between gap-2 rounded-lg px-3 py-2",
          reverts !== null && reverts > 0 ? "bg-clay-soft" : "bg-card",
        )}
      >
        <span className="text-[11px] font-medium uppercase tracking-wide text-muted">
          Rework · reverts 7d
        </span>
        <span
          className={cn(
            "text-sm font-semibold tabular",
            reverts === null ? "text-muted" : reverts > 0 ? "text-clay-strong" : "text-sage-strong",
          )}
        >
          {reverts === null ? "—" : clean ? "0 · clean" : fmtInt(reverts)}
        </span>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3">
        <ProxyStat label="Runs / wk" value={fmtInt(workload.runsPerWeek)} sub="scheduled compute" />
        <ProxyStat label="Merged 7d" value={fmtInt(merged7d)} sub="this product's output" />
      </div>

      {hasTrend && (
        <div className="mt-3 border-t border-hairline pt-3">
          <Sparkline
            values={mergedTrend}
            tone="muted"
            width={260}
            height={32}
            fillOpacity={0.1}
            className="w-full"
          />
          <p className="mt-0.5 text-[10px] text-muted">
            Merged / day · this product&apos;s own trend, last {mergedTrend.length} polls
          </p>
        </div>
      )}

      {workload.byRoutine.length > 0 && (
        <div className="mt-3.5 border-t border-hairline pt-3">
          <p className="mb-2 text-[10px] font-medium uppercase tracking-[0.12em] text-muted">
            Scheduled runs / week, by routine
          </p>
          <ul className="space-y-2">
            {workload.byRoutine.map((r) => (
              <li
                key={`${r.type}-${r.cron}`}
                className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1"
              >
                <span className="truncate text-[13px] capitalize text-ink">
                  {routineShortLabel(r.type)}
                </span>
                <span className="tabular text-xs font-medium text-ink">{r.runsPerWeek}/wk</span>
                <span className="col-span-2">
                  <Bar value={r.runsPerWeek} max={maxRoutine} tone="muted" />
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {hasThisRun && (
        <p className="mt-3 border-t border-hairline pt-3 text-[11px] text-muted">
          Last run:{" "}
          <span className="font-medium tabular text-ink">{fmtInt(shipped)}</span> shipped
          {abandoned !== null && (
            <>
              {" · "}
              <span className="font-medium tabular text-ink">{fmtInt(abandoned)}</span> abandoned
            </>
          )}{" "}
          <span className="opacity-80">· from LOOP_HEALTH</span>
        </p>
      )}

      <p className="mt-3 border-t border-hairline pt-3 text-[11px] leading-relaxed text-muted">
        This product&apos;s own activity. Merge volume isn&apos;t comparable across
        products — a feature app ships many small PRs, a quant research bot fewer,
        denser ones — so reverts (rework) are the quality signal, not raw counts.
      </p>
    </div>
  );
}

/**
 * Cost visibility — honest signals, never a fabricated token bill.
 *
 * 1. Product inference cost — the app's OWN metered runtime LLM spend, shown only
 *    when a repo publishes a `cost` block (else: where it actually lives).
 * 2. Activity-as-cost proxy — within-product: reverts (quality) first, then
 *    scheduled runs/week, this product's merged output + trend, and the routine
 *    split. Never a cross-product volume ranking.
 * Plus a footnote on the gap no repo can close.
 */
export function CostPanel({
  cost,
  workload,
  merged7d,
  loop,
  mergedTrend = [],
}: {
  cost: ProductInferenceCost;
  workload: Workload;
  merged7d: number;
  loop: LoopHealth;
  mergedTrend?: Array<number | null>;
}) {
  return (
    <div className="space-y-4">
      <InferenceCostBlock cost={cost} />
      <ActivityProxyBlock
        workload={workload}
        merged7d={merged7d}
        loop={loop}
        mergedTrend={mergedTrend}
      />
      <p className="border-t border-hairline pt-3 text-[11px] leading-relaxed text-muted">
        What this isn&apos;t: a per-agent token bill. True Claude usage (tokens ×
        price per routine run) is owner-only platform billing on the{" "}
        <span className="font-medium text-ink">claude.ai</span> usage page — it
        lives in no repo, so the dashboard can&apos;t show it. Above is the
        product&apos;s own metered inference cost (when published) plus
        within-product activity.
      </p>
    </div>
  );
}
