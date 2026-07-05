import { Fragment } from "react";
import type {
  Growth,
  GrowthOutreach,
  GrowthPhase,
  GrowthPmf,
  GrowthSignal,
  GrowthSource,
  LaunchReadiness,
  LaunchPhase,
  LaunchRecommendation,
} from "@/lib/growth";
import { floorPmfSignal, growthStale, latestDecidedExperiment } from "@/lib/growth";
import { cn, formatMoney, formatShortDate, type Tone } from "@/lib/utils";
import {
  AlertIcon,
  ArrowRightIcon,
  CheckIcon,
  ExternalLinkIcon,
  MailIcon,
  ShieldIcon,
} from "@/components/icons";
import { Sparkline } from "@/components/Sparkline";
import { Collapsible } from "@/components/Collapsible";

/** Owner's Gmail drafts — where the outreach draft bodies actually live. */
const GMAIL_DRAFTS_URL = "https://mail.google.com/mail/u/0/#drafts";

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

const shortDate = (iso?: string): string | null => formatShortDate(iso, false);

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

// ── PMF + outreach signals ──────────────────────────────────────────────────

const SIGNAL_META: Record<GrowthSignal, { label: string; tone: Tone; bars: number }> = {
  none: { label: "No signal yet", tone: "muted", bars: 0 },
  weak: { label: "Weak signal", tone: "amber", bars: 1 },
  emerging: { label: "Emerging signal", tone: "amber", bars: 2 },
  strong: { label: "Strong signal", tone: "sage", bars: 3 },
};

/** Resolve a signal to its display meta; null → "no signal yet" (never an error). */
function signalMeta(signal: GrowthSignal | null) {
  return SIGNAL_META[signal ?? "none"];
}

/** A 3-segment strength meter — empty (track-coloured) when there's no signal. */
function SignalBars({ bars, tone }: { bars: number; tone: Tone }) {
  const fill = tone === "sage" ? "bg-sage" : tone === "amber" ? "bg-amber" : "bg-muted";
  const heights = ["h-1.5", "h-2.5", "h-3.5"];
  return (
    <span className="inline-flex items-end gap-[2px]" aria-hidden>
      {heights.map((h, i) => (
        <span
          key={i}
          className={cn("w-1 rounded-sm", h, i < bars ? fill : "bg-[var(--ring-track)]")}
        />
      ))}
    </span>
  );
}

function SignalChip({ signal }: { signal: GrowthSignal | null }) {
  const meta = signalMeta(signal);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium",
        CHIP[meta.tone],
      )}
    >
      <SignalBars bars={meta.bars} tone={meta.tone} />
      {meta.label}
    </span>
  );
}

/**
 * Product-market fit — the leading indicator. Signal + the day-cohort retention
 * curve (D1 → D7 → D30) + activation & organic-share. Pre-launch every value is
 * null/none, so it renders a calm "no signal yet", never an error.
 */
function PmfTile({
  pmf,
  retentionTrend = [],
}: {
  pmf: GrowthPmf;
  /** D7 retention recorded on each recent poll (oldest→newest). */
  retentionTrend?: Array<number | null>;
}) {
  const hasTrend = retentionTrend.filter((v) => v !== null).length >= 2;
  const curve: Array<{ k: string; v: number | null }> = [
    { k: "D1", v: pmf.retentionD1 },
    { k: "D7", v: pmf.retentionD7 },
    { k: "D30", v: pmf.retentionD30 },
  ];
  const hasCurve = curve.some((p) => p.v !== null);
  return (
    <div className="rounded-xl border border-hairline bg-bg px-4 py-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-muted">
          Product-market fit
        </p>
        <SignalChip signal={pmf.signal} />
      </div>

      <div className="mt-3 flex items-stretch gap-1.5">
        {curve.map((p, i) => (
          <Fragment key={p.k}>
            {i > 0 && (
              <span className="flex items-center">
                <ArrowRightIcon className="h-3 w-3 shrink-0 text-muted/60" />
              </span>
            )}
            <div className="flex flex-1 flex-col items-center rounded-lg bg-card px-2 py-1.5 text-center">
              <span className="text-[10px] uppercase tracking-wide text-muted">{p.k}</span>
              <span className="mt-0.5 text-sm font-semibold tabular text-ink">{fmtRate(p.v)}</span>
            </div>
          </Fragment>
        ))}
      </div>
      <p className="mt-1.5 text-[10px] text-muted">
        {hasCurve
          ? "Retention curve — a flattening curve is the PMF signal"
          : "Retention — no cohort data reported yet"}
      </p>

      {(pmf.retentionW1 !== null || pmf.retentionW4 !== null) && (
        <p className="mt-1.5 text-[11px] text-muted">
          Weekly cohort:{" "}
          <span className="font-medium tabular text-ink">W1 {fmtRate(pmf.retentionW1)}</span>{" "}
          <ArrowRightIcon className="inline h-3 w-3 text-muted/60" />{" "}
          <span className="font-medium tabular text-ink">W4 {fmtRate(pmf.retentionW4)}</span>
          {pmf.retentionCurveFlattening === true && (
            <span className="text-sage-strong"> · curve flattening — PMF signal</span>
          )}
        </p>
      )}

      {hasTrend && (
        <div className="mt-2">
          <Sparkline
            values={retentionTrend}
            tone="sage"
            width={240}
            height={32}
            fillOpacity={0.1}
            className="w-full"
          />
          <p className="mt-0.5 text-[10px] text-muted">
            D7 retention · last {retentionTrend.length} polls
          </p>
        </div>
      )}

      <div className="mt-2.5 flex flex-wrap gap-x-6 gap-y-1 border-t border-hairline pt-2.5 text-xs">
        <span className="text-muted">
          Activation{" "}
          <span className="font-medium tabular text-ink">{fmtRate(pmf.activationRate)}</span>
        </span>
        <span className="text-muted">
          Organic share{" "}
          <span className="font-medium tabular text-ink">{fmtRate(pmf.organicShareRate)}</span>
        </span>
      </div>
    </div>
  );
}

function FunnelStep({ n, label, tone }: { n: string; label: string; tone?: "sage" }) {
  return (
    <span className="inline-flex items-baseline gap-1">
      <span
        className={cn(
          "text-base font-semibold tabular",
          tone === "sage" ? "text-sage-strong" : "text-ink",
        )}
      >
        {n}
      </span>
      <span className="text-[11px] text-muted">{label}</span>
    </span>
  );
}

/**
 * Strategic outreach — a drafted → sent → replied funnel. The draft bodies live
 * in the owner's Gmail (never the repo); we surface only the counts and link to
 * Gmail when there are drafts to review. 0/null reads as "none yet", never error.
 */
function OutreachTile({ outreach }: { outreach: GrowthOutreach }) {
  const { drafted7d: drafted, ownerSent7d: sent, replies7d: replies } = outreach;
  const fmt = (n: number | null) => (n === null ? "—" : n.toLocaleString("en-US"));
  const quiet = (drafted ?? 0) === 0 && (sent ?? 0) === 0 && (replies ?? 0) === 0;
  const toReview = drafted !== null && drafted > 0;
  return (
    <div className="rounded-xl border border-hairline bg-bg px-4 py-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="inline-flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.12em] text-muted">
          <MailIcon className="h-3.5 w-3.5" />
          Outreach · to-send queue
        </p>
        <SignalChip signal={outreach.signal} />
      </div>

      <div className="mt-2.5 flex items-center gap-2">
        <FunnelStep n={fmt(drafted)} label="drafted" />
        <ArrowRightIcon className="h-3.5 w-3.5 shrink-0 text-muted/60" />
        <FunnelStep n={fmt(sent)} label="sent" />
        <ArrowRightIcon className="h-3.5 w-3.5 shrink-0 text-muted/60" />
        <FunnelStep n={fmt(replies)} label="replied" tone={(replies ?? 0) > 0 ? "sage" : undefined} />
      </div>

      <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted">
        <span>
          {toReview ? (
            <span className="font-medium text-clay-strong">
              {drafted} Gmail draft{drafted === 1 ? "" : "s"} awaiting your review + send
            </span>
          ) : (
            <>1:1 drafts the agent prepares — you review &amp; send{quiet ? " · none queued yet" : ""}</>
          )}
          .
        </span>
        {toReview && (
          <a
            href={GMAIL_DRAFTS_URL}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 font-medium text-clay transition-colors hover:underline"
          >
            Open drafts <ExternalLinkIcon className="h-3 w-3" />
          </a>
        )}
      </p>
    </div>
  );
}

/**
 * GTM self-validation — which data sources the growth agent can actually pull
 * from (waitlist / analytics / billing / email). Unavailable sources mean the
 * agent can't validate that part of the funnel (and the funnel reads 0); each is
 * unblocked by an owner action (gtm-connect-* / connect-channels). REAL status.
 */
function GtmSourcesPanel({ sources }: { sources: GrowthSource[] }) {
  if (sources.length === 0) return null;
  const connected = sources.filter((s) => s.connected);
  const unavailable = sources.filter((s) => !s.connected);
  return (
    <div className="rounded-xl border border-hairline bg-bg px-4 py-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="inline-flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.12em] text-muted">
          <ShieldIcon className="h-3.5 w-3.5" />
          GTM data sources
        </p>
        <span
          className={cn(
            "text-xs font-medium tabular",
            unavailable.length > 0 ? "text-amber-strong" : "text-sage-strong",
          )}
        >
          {connected.length}/{sources.length} connected
        </span>
      </div>
      <div className="mt-2.5 flex flex-wrap gap-1.5">
        {sources.map((s) => (
          <span
            key={s.name}
            title={s.status}
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
              s.connected ? CHIP.sage : CHIP.amber,
            )}
          >
            {s.connected ? (
              <CheckIcon className="h-3 w-3" />
            ) : (
              <AlertIcon className="h-3 w-3" />
            )}
            {s.name}
          </span>
        ))}
      </div>
      {unavailable.length > 0 && (
        <p className="mt-2 text-[11px] leading-relaxed text-muted">
          {unavailable.map((s) => s.name).join(", ")} not connected — the GTM agent
          can&apos;t validate {unavailable.length > 1 ? "these sources" : "this source"} until
          you wire {unavailable.length > 1 ? "them" : "it"} (an urgent{" "}
          <span className="font-mono">gtm-connect-*</span> owner action).
        </p>
      )}
    </div>
  );
}

/** Launch-timing phase → human label. */
const LAUNCH_PHASE_LABEL: Record<LaunchPhase, string> = {
  build: "Build",
  assess_demand: "Assess demand",
  launch: "Launch",
  post_launch: "Post-launch",
};

/** Recommendation → chip label + tone. Escalates muted → amber → sage. */
const LAUNCH_REC_META: Record<LaunchRecommendation, { label: string; tone: Tone }> = {
  NOT_YET: { label: "Not yet", tone: "muted" },
  START_MARKETING: { label: "Start marketing", tone: "amber" },
  LAUNCH_WINDOW_OPEN: { label: "Launch window open", tone: "sage" },
};

/**
 * Launch readiness — the growth agent's launch-timing call: the phase, the
 * color-coded recommendation, the reasoning, and the single next owner action.
 * REAL state only; absent block renders nothing (guarded by the caller).
 */
function LaunchReadinessTile({ lr }: { lr: LaunchReadiness }) {
  const rec = lr.recommendation ? LAUNCH_REC_META[lr.recommendation] : null;
  const phaseLabel = lr.phase ? LAUNCH_PHASE_LABEL[lr.phase] : null;
  return (
    <div className="rounded-xl border border-hairline bg-bg px-4 py-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="inline-flex items-center gap-2 text-[10px] font-medium uppercase tracking-[0.12em] text-muted">
          Launch readiness
          {phaseLabel && (
            <span className="rounded-full bg-card px-2 py-0.5 text-[10px] font-medium normal-case tracking-normal text-ink">
              {phaseLabel}
            </span>
          )}
        </p>
        {rec && (
          <span
            className={cn(
              "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium",
              CHIP[rec.tone],
            )}
          >
            {rec.label}
          </span>
        )}
      </div>
      {(lr.demandSignal || lr.productReady !== null) && (
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted">
          {lr.productReady !== null && (
            <span>
              Product{" "}
              <span
                className={cn(
                  "font-medium",
                  lr.productReady ? "text-sage-strong" : "text-ink",
                )}
              >
                {lr.productReady ? "ready" : "not ready"}
              </span>
            </span>
          )}
          {lr.demandSignal && (
            <span>
              Demand <span className="font-medium text-ink">{lr.demandSignal}</span>
            </span>
          )}
        </div>
      )}
      {lr.reason && <p className="mt-2 text-sm leading-snug text-ink">{lr.reason}</p>}
      {lr.nextOwnerAction && (
        <p className="mt-2 flex items-start gap-1.5 text-[11px] leading-relaxed text-muted">
          <ArrowRightIcon className="mt-0.5 h-3 w-3 shrink-0 text-muted/60" />
          <span>
            <span className="font-medium text-ink">Next:</span> {lr.nextOwnerAction}
          </span>
        </p>
      )}
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
  retentionTrend = [],
  className,
}: {
  growth: Growth;
  /** Day-over-day waitlist delta (from ProjectDelta), shown when positive. */
  waitlistDelta?: number | null;
  /** Day-over-day MRR delta (from ProjectDelta), shown when positive. */
  mrrDelta?: number | null;
  /** D7 retention recorded per poll (from KV history) — PMF trajectory. */
  retentionTrend?: Array<number | null>;
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

      {/* Launch readiness — the agent's launch-timing call (only when emitted). */}
      {growth.launchReadiness && <LaunchReadinessTile lr={growth.launchReadiness} />}

      {/* GTM data sources — what the agent can validate (an unconnected source
          is why a funnel reads 0; each is an owner action to wire). */}
      {growth.sources.length > 0 && <GtmSourcesPanel sources={growth.sources} />}

      {/* PMF — the leading indicator, surfaced first (only when the repo has it). */}
      {growth.pmf && <PmfTile pmf={growth.pmf} retentionTrend={retentionTrend} />}

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

      {/* Strategic outreach funnel (only when the repo has an outreach block). */}
      {growth.outreach && <OutreachTile outreach={growth.outreach} />}

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

      {/* Top learnings — often long paragraphs; collapsed so the panel stays
          scannable and the status summary up top carries the gist. */}
      {growth.learnings.length > 0 && (
        <div className="border-t border-hairline pt-3">
          <Collapsible
            title="What's working"
            count={Math.min(3, growth.learnings.length)}
            defaultOpen={false}
            storageKey="afd-growth-learnings"
          >
            <ul className="space-y-1 text-sm text-ink">
              {growth.learnings.slice(0, 3).map((l, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span aria-hidden className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-sage" />
                  <span>{l}</span>
                </li>
              ))}
            </ul>
          </Collapsible>
        </div>
      )}

      {/* The GTM agent's own next_actions — verbose; collapsed. */}
      {growth.nextActions.length > 0 && (
        <div className="border-t border-hairline pt-3">
          <Collapsible
            title="Next actions · GTM agent"
            count={Math.min(4, growth.nextActions.length)}
            defaultOpen={false}
            storageKey="afd-growth-nextactions"
          >
            <ul className="space-y-1.5 text-sm text-ink">
              {growth.nextActions.slice(0, 4).map((a, i) => (
                <li key={i} className="flex items-start gap-2 leading-snug">
                  <ArrowRightIcon className="mt-1 h-3 w-3 shrink-0 text-muted/60" />
                  <span>{a}</span>
                </li>
              ))}
            </ul>
          </Collapsible>
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
  const pmfSignal = floorPmfSignal(growth);
  const toSend = growth.outreach?.drafted7d ?? 0; // Gmail drafts awaiting owner send

  let stat: string | null = null;
  if (post && f.mrrUsd !== null && f.mrrUsd > 0) {
    stat = `${formatMoney(f.mrrUsd)}/mo MRR`;
  } else if (f.waitlistSignupsTotal !== null && f.waitlistSignupsTotal > 0) {
    stat = `${fmtInt(f.waitlistSignupsTotal)} waitlist`;
  } else if (growth.awaitingConnect) {
    stat = "growth: awaiting connect";
  }
  // Nothing worth showing — keep the (mostly pre-launch) tile calm.
  if (!stat && !pmfSignal && toSend === 0) return null;

  const stale = growthStale(growth);
  return (
    <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
      {pmfSignal && (
        <span
          className={cn(
            "inline-flex items-center rounded-full px-1.5 py-0.5 font-medium capitalize",
            pmfSignal === "strong"
              ? "bg-sage-soft text-sage-strong"
              : "bg-amber-soft text-amber-strong",
          )}
        >
          PMF: {pmfSignal}
        </span>
      )}
      {stat && (
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-sage/70" />
          {stat}
        </span>
      )}
      {toSend > 0 && (
        <span className="inline-flex items-center gap-1 font-medium text-clay-strong">
          <MailIcon className="h-3 w-3" /> {toSend} to send
        </span>
      )}
      {stale && <span className="text-amber-strong">· stale</span>}
    </span>
  );
}
