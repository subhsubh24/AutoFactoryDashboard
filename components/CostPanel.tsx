import Link from "next/link";
import { routineShortLabel } from "@/config/routines";
import type { ProductInferenceCost } from "@/lib/cost";
import type { LoopHealth } from "@/lib/loophealth";
import type { Workload } from "@/lib/routine";
import { cn } from "@/lib/utils";
import { ExternalLinkIcon, PulseIcon } from "@/components/icons";

/**
 * USD with sensible precision: cents under $100 (LLM spend is often pennies),
 * whole dollars to $1k, then $Nk. Never fabricates — null reads "—".
 */
function usd(n: number | null): string {
  if (n === null || !Number.isFinite(n)) return "—";
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}k`;
  if (n >= 100) return `$${Math.round(n)}`;
  return `$${n.toFixed(2)}`;
}

const fmtInt = (n: number | null): string =>
  n === null ? "—" : n.toLocaleString("en-US");

/** A thin proportional bar (track-coloured remainder) for a 0..max value. */
function Bar({ value, max, tone }: { value: number; max: number; tone: "clay" | "muted" }) {
  const pct = max > 0 ? Math.max(2, Math.round((value / max) * 100)) : 0;
  return (
    <span className="block h-1.5 w-full overflow-hidden rounded-full bg-[var(--ring-track)]">
      <span
        className={cn("block h-full rounded-full", tone === "clay" ? "bg-clay/80" : "bg-muted")}
        style={{ width: `${pct}%` }}
      />
    </span>
  );
}

function ProxyStat({
  label,
  value,
  sub,
  tone = "ink",
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "ink" | "clay";
}) {
  return (
    <div>
      <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-muted">{label}</p>
      <p
        className={cn(
          "mt-1 text-xl font-semibold tabular",
          tone === "clay" ? "text-clay-strong" : "text-ink",
        )}
      >
        {value}
      </p>
      {sub && <p className="mt-0.5 text-[11px] text-muted">{sub}</p>}
    </div>
  );
}

/** Section 1 — the app's own metered inference spend (only if a repo publishes it). */
function InferenceCostBlock({ cost }: { cost: ProductInferenceCost }) {
  if (!cost.available) {
    return (
      <div className="rounded-xl border border-hairline bg-bg px-4 py-3.5">
        <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-muted">
          Product inference cost
        </p>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Not published here. Each app meters its own runtime LLM spend in code
          (a cost-meter / cost ledger), but that figure lives in runtime
          telemetry behind the owner-only metrics API — it appears here only if a
          repo writes it into <span className="font-mono text-[12px]">GROWTH_STATUS</span> as a{" "}
          <span className="font-mono text-[12px]">cost</span> block.
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
        {cost.asOf && <span className="text-[11px] text-muted">as of {cost.asOf}</span>}
      </div>
      <p className="mt-1.5 flex items-baseline gap-2">
        <span className="text-2xl font-semibold tabular text-ink">{usd(cost.totalUsd)}</span>
        {cost.windowDays !== null && (
          <span className="text-xs text-muted">metered LLM spend · last {cost.windowDays}d</span>
        )}
      </p>

      {cost.byModel.length > 0 && (
        <CostLines title="By model" lines={cost.byModel} max={maxLine} />
      )}
      {cost.byStage.length > 0 && (
        <CostLines title="By pipeline stage" lines={cost.byStage} max={maxLine} />
      )}

      {cost.sourceUrl && (
        <a
          href={cost.sourceUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-3 inline-flex items-center gap-1.5 text-xs text-muted transition-colors hover:text-clay"
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
}: {
  title: string;
  lines: { label: string; usd: number }[];
  max: number;
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
            <span className="tabular text-xs font-medium text-ink">{usd(l.usd)}</span>
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
 * Section 2 — the activity-as-cost proxy. Repo-readable stand-in for relative
 * compute: scheduled runs/week (each run ≈ one agent invocation) split by
 * routine, against productive output (merged) and waste (reverts / abandoned).
 */
function ActivityProxyBlock({
  workload,
  merged7d,
  loop,
}: {
  workload: Workload;
  merged7d: number;
  loop: LoopHealth;
}) {
  const maxRoutine = workload.byRoutine.reduce((m, r) => Math.max(m, r.runsPerWeek), 0);
  const reverts = loop.available ? loop.rolling7d.reverts : null;
  const shipped = loop.available ? loop.thisRun.changesShipped : null;
  const abandoned = loop.available ? loop.thisRun.changesAbandoned : null;
  const hasThisRun = shipped !== null || abandoned !== null;

  return (
    <div className="rounded-xl border border-hairline bg-bg px-4 py-3.5">
      <p className="inline-flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.12em] text-muted">
        <PulseIcon className="h-3.5 w-3.5" />
        Activity · cost proxy
      </p>

      <div className="mt-2.5 grid grid-cols-3 gap-x-4 gap-y-3">
        <ProxyStat label="Runs / wk" value={fmtInt(workload.runsPerWeek)} sub="scheduled" />
        <ProxyStat label="Merged 7d" value={fmtInt(merged7d)} sub="output" />
        <ProxyStat
          label="Reverts 7d"
          value={fmtInt(reverts)}
          sub="rework"
          tone={(reverts ?? 0) > 0 ? "clay" : "ink"}
        />
      </div>

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
    </div>
  );
}

/**
 * Cost visibility — two honest signals, never a fabricated token bill.
 *
 * 1. Product inference cost — the app's OWN metered runtime LLM spend, shown
 *    only when a repo publishes a `cost` block (else: where it actually lives).
 * 2. Activity-as-cost proxy — scheduled runs/week × merged × reverts, a
 *    repo-readable "which routines work hardest" stand-in for relative compute.
 * Plus a footnote on the gap we can't close from repos.
 */
export function CostPanel({
  cost,
  workload,
  merged7d,
  loop,
}: {
  cost: ProductInferenceCost;
  workload: Workload;
  merged7d: number;
  loop: LoopHealth;
}) {
  return (
    <div className="space-y-4">
      <InferenceCostBlock cost={cost} />
      <ActivityProxyBlock workload={workload} merged7d={merged7d} loop={loop} />
      <p className="border-t border-hairline pt-3 text-[11px] leading-relaxed text-muted">
        What this isn&apos;t: a per-agent token bill. True Claude usage (tokens ×
        price per routine run) is owner-only platform billing on the{" "}
        <span className="font-medium text-ink">claude.ai</span> usage page — it
        lives in no repo, so the dashboard can&apos;t show it. What&apos;s above is
        the product&apos;s own metered inference cost (when published) plus
        activity proxies for relative compute.
      </p>
    </div>
  );
}

/** One product's compute-vs-output line for the cross-project comparison. */
export interface WorkloadRow {
  slug: string;
  name: string;
  /** Scheduled agent runs in the next 7 days (the compute proxy). */
  runsPerWeek: number;
  /** PRs merged in the last 7 days (the output). */
  merged7d: number;
  /** Reverts in the last 7 days (rework / wasted compute); null when unreported. */
  reverts: number | null;
}

/**
 * Cross-project workload — scheduled compute in (runs/week) against output
 * (merged) and rework (reverts), per product. Scheduled compute is roughly even
 * across lines by design, so this reads as an efficiency lens: comparable
 * compute, differing yield. A repo-readable proxy, never a token bill.
 */
export function FactoryWorkload({ rows }: { rows: WorkloadRow[] }) {
  if (rows.length === 0) return null;
  const maxRuns = rows.reduce((m, r) => Math.max(m, r.runsPerWeek), 0);
  return (
    <div>
      <ul className="space-y-3">
        {rows.map((r) => (
          <li key={r.slug} className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1.5">
            <Link
              href={`/p/${r.slug}`}
              className="min-w-0 truncate text-sm font-medium text-ink transition-colors hover:text-clay"
            >
              {r.name}
            </Link>
            <span className="flex items-baseline gap-2 text-xs tabular text-muted">
              <span className="font-medium text-ink">{r.runsPerWeek}</span>
              <span>runs/wk</span>
              <span aria-hidden className="text-muted/50">·</span>
              <span className="font-medium text-ink">{r.merged7d}</span>
              <span>merged</span>
              {r.reverts !== null && r.reverts > 0 && (
                <span className="font-medium text-clay-strong">· {r.reverts} revert{r.reverts === 1 ? "" : "s"}</span>
              )}
            </span>
            <span className="col-span-2">
              <Bar value={r.runsPerWeek} max={maxRuns} tone="muted" />
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-3.5 border-t border-hairline pt-3 text-[11px] leading-relaxed text-muted">
        Each scheduled run ≈ one autonomous agent invocation — a repo-readable
        stand-in for relative compute, not a token bill. Compute is scheduled
        roughly evenly across lines; merged PRs &amp; reverts are where they
        differ. Per-line detail is in each project&apos;s{" "}
        <span className="text-ink">Cost &amp; compute</span>.
      </p>
    </div>
  );
}
