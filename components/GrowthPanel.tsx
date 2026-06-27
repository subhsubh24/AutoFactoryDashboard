import type { Growth, GrowthPhase } from "@/lib/growth";
import { growthStale, latestDecidedExperiment } from "@/lib/growth";
import { cn, formatMoney, type Tone } from "@/lib/utils";
import { ExternalLinkIcon } from "@/components/icons";

const PHASE_META: Record<GrowthPhase, { label: string; tone: Tone }> = {
  pre_launch: { label: "Pre-launch", tone: "muted" },
  launching: { label: "Launching", tone: "amber" },
  post_launch: { label: "Post-launch", tone: "sage" },
};

const CHIP: Record<Tone, string> = {
  sage: "bg-sage-soft text-sage-strong",
  amber: "bg-amber-soft text-amber-strong",
  clay: "bg-clay-soft text-clay-strong",
  muted: "bg-bg text-muted",
};

function shortDate(iso?: string): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

const fmtInt = (n: number | null): string => (n === null ? "—" : n.toLocaleString("en-US"));

/** Format a rate that may be a 0–1 fraction or an already-percent number. */
function fmtRate(r: number | null): string {
  if (r === null) return "—";
  return r <= 1 ? `${(r * 100).toFixed(1)}%` : `${r}%`;
}

function GStat({
  label,
  value,
  sub,
  tone = "ink",
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "ink" | "sage" | "clay";
}) {
  const color =
    tone === "sage" ? "text-sage-strong" : tone === "clay" ? "text-clay-strong" : "text-ink";
  return (
    <div>
      <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-muted">{label}</p>
      <p className={cn("mt-1 text-xl font-semibold tabular", color)}>{value}</p>
      {sub && <p className="mt-0.5 text-[11px] text-sage-strong">{sub}</p>}
    </div>
  );
}

/**
 * Growth & marketing status from docs/growth/GROWTH_STATUS.md — mirrors how the
 * business case is shown. Pre-launch leads with waitlist; post-launch with
 * trials / paid / MRR / churn. Unavailable → a "see file" link, never a guess.
 */
export function GrowthPanel({
  growth,
  waitlistDelta = null,
  mrrDelta = null,
  className,
}: {
  growth: Growth;
  /** Day-over-day waitlist delta (from ProjectDelta), shown when positive. */
  waitlistDelta?: number | null;
  /** Day-over-day MRR delta (from ProjectDelta), shown when positive. */
  mrrDelta?: number | null;
  className?: string;
}) {
  if (!growth.available) {
    return (
      <div className={cn("flex flex-wrap items-center gap-x-2 gap-y-1 text-sm", className)}>
        <span className="rounded-full bg-bg px-2 py-0.5 text-[10px] font-medium text-muted">
          growth status
        </span>
        <span className="text-muted">{growth.reason ?? "unavailable — see file"}</span>
        {growth.sourceUrl && (
          <a
            href={growth.sourceUrl}
            target="_blank"
            rel="noreferrer"
            aria-label="Open the growth status file"
            className="text-muted transition-colors hover:text-clay"
          >
            <ExternalLinkIcon className="h-3.5 w-3.5" />
          </a>
        )}
      </div>
    );
  }

  const f = growth.funnel;
  const a = growth.acquisition;
  const post = growth.phase === "post_launch";
  const phase = growth.phase ? PHASE_META[growth.phase] : null;
  const stale = growthStale(growth);
  const asOf = shortDate(growth.asOf);
  const exp = latestDecidedExperiment(growth);
  const hasAcq = a.cacUsd !== null || a.ltvUsd !== null || a.ltvCacRatio !== null;
  const sourceUrl = growth.sourceUrl ?? growth.links.ownerDoc ?? undefined;

  // Prefer the precise day-over-day delta; fall back to the agent's 7d trend.
  const waitlistSub =
    waitlistDelta !== null && waitlistDelta > 0
      ? `+${waitlistDelta.toLocaleString("en-US")} since yesterday`
      : f.waitlistSignups7d !== null && f.waitlistSignups7d > 0
        ? `+${f.waitlistSignups7d.toLocaleString("en-US")} this week`
        : undefined;
  const mrrSub =
    mrrDelta !== null && mrrDelta > 0 ? `+${formatMoney(mrrDelta)} since yesterday` : undefined;

  return (
    <div className={cn("space-y-4", className)}>
      {/* Phase + engine/connect state + as-of (stale flag in amber). */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {phase && (
          <span className={cn("rounded-full px-2 py-0.5 font-medium", CHIP[phase.tone])}>
            {phase.label}
          </span>
        )}
        <span
          className={cn(
            "rounded-full px-2 py-0.5 font-medium",
            growth.engineBuilt ? CHIP.sage : CHIP.muted,
          )}
        >
          {growth.engineBuilt ? "engine built" : "engine not built"}
        </span>
        {growth.awaitingConnect && (
          <span className={cn("rounded-full px-2 py-0.5 font-medium", CHIP.amber)}>
            awaiting connect
          </span>
        )}
        {asOf && (
          <span className={stale ? "font-medium text-amber-strong" : "text-muted"}>
            as of {asOf}
            {stale && " · stale — agent may be stuck"}
          </span>
        )}
      </div>

      {/* Funnel headline — waitlist pre-launch, trials/paid/MRR/churn post-launch. */}
      <div className="grid grid-cols-2 gap-x-5 gap-y-4 rounded-xl bg-bg px-4 py-4 sm:grid-cols-4">
        {post ? (
          <>
            <GStat label="Trials" value={fmtInt(f.trialStartsTotal)} />
            <GStat label="Paid" value={fmtInt(f.paidConversionsTotal)} tone="sage" />
            <GStat
              label="MRR"
              value={f.mrrUsd !== null ? `${formatMoney(f.mrrUsd)}/mo` : "—"}
              sub={mrrSub}
              tone="sage"
            />
            <GStat
              label="Churn 30d"
              value={fmtRate(f.churnRate30d)}
              tone={f.churnRate30d !== null && f.churnRate30d > 7 ? "clay" : "ink"}
            />
          </>
        ) : (
          <>
            <GStat
              label="Waitlist"
              value={fmtInt(f.waitlistSignupsTotal)}
              sub={waitlistSub}
              tone="sage"
            />
            <GStat label="Visitors 7d" value={fmtInt(f.visitors7d)} />
            <GStat label="Signup rate" value={fmtRate(f.visitorToWaitlistRate)} />
            <GStat label="Email list" value={fmtInt(growth.email.listSize)} />
          </>
        )}
      </div>

      {/* Channels connected (or the honest "awaiting connect" state). */}
      <p className="text-xs text-muted">
        {growth.channelsConnected.length > 0 ? (
          <>
            Channels:{" "}
            <span className="text-ink">{growth.channelsConnected.join(", ")}</span>
          </>
        ) : (
          "No channels connected yet — the agent prepares creative but takes no external action."
        )}
      </p>

      {/* Unit economics, only when the agent has real CAC/LTV. */}
      {hasAcq && (
        <div className="flex flex-wrap gap-x-6 gap-y-2 border-t border-hairline pt-3 text-xs">
          {a.cacUsd !== null && (
            <span className="text-muted">
              CAC <span className="font-medium tabular text-ink">{formatMoney(a.cacUsd)}</span>
            </span>
          )}
          {a.ltvUsd !== null && (
            <span className="text-muted">
              LTV <span className="font-medium tabular text-ink">{formatMoney(a.ltvUsd)}</span>
            </span>
          )}
          {a.ltvCacRatio !== null && (
            <span className="text-muted">
              LTV:CAC{" "}
              <span
                className={cn(
                  "font-medium tabular",
                  a.ltvCacRatio >= 3 ? "text-sage-strong" : "text-clay-strong",
                )}
              >
                {a.ltvCacRatio}×
              </span>
            </span>
          )}
          {a.topChannel && (
            <span className="text-muted">
              top channel <span className="text-ink">{a.topChannel}</span>
            </span>
          )}
        </div>
      )}

      {/* Latest decided experiment (where post-launch compounding shows up). */}
      {exp && (
        <div className="border-t border-hairline pt-3">
          <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-muted">
            Latest experiment
          </p>
          <p className="mt-1 text-sm leading-snug text-ink">
            {exp.hypothesis || exp.id}
            {exp.result && (
              <>
                {" — "}
                <span className="font-medium text-sage-strong">{exp.result}</span>
              </>
            )}
            {exp.liftPct !== null && (
              <span className="text-muted">
                {" "}
                ({exp.liftPct > 0 ? "+" : ""}
                {exp.liftPct}%)
              </span>
            )}
          </p>
        </div>
      )}

      {/* Top learnings (richest post-launch). */}
      {growth.learnings.length > 0 && (
        <div className="border-t border-hairline pt-3">
          <p className="mb-1.5 text-[10px] font-medium uppercase tracking-[0.12em] text-muted">
            What&apos;s working
          </p>
          <ul className="space-y-1 text-sm text-ink">
            {growth.learnings.slice(0, 3).map((l, i) => (
              <li key={i} className="flex items-start gap-2">
                <span aria-hidden className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-sage" />
                <span>{l}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

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
  );
}

/** One compact growth line for the Floor tile — the single most relevant number. */
export function GrowthLine({ growth }: { growth: Growth }) {
  if (!growth.available) return null;
  const f = growth.funnel;
  const post = growth.phase === "post_launch";

  let stat: string | null = null;
  if (post && f.mrrUsd !== null && f.mrrUsd > 0) {
    stat = `${formatMoney(f.mrrUsd)}/mo MRR`;
  } else if (f.waitlistSignupsTotal !== null && f.waitlistSignupsTotal > 0) {
    stat = `${fmtInt(f.waitlistSignupsTotal)} waitlist`;
  } else if (growth.awaitingConnect) {
    stat = "growth: awaiting connect";
  }
  if (!stat) return null;

  const stale = growthStale(growth);
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted">
      <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-sage/70" />
      {stat}
      {stale && <span className="text-amber-strong">· stale</span>}
    </span>
  );
}
