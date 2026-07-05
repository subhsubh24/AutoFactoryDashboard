import Link from "next/link";
import { getAllSnapshots } from "@/lib/github";
import {
  buildOverview,
  factoryDelta,
  humanAsksFor,
  projectDelta,
  type NeedEntry,
  type NeedGroup,
  type ProjectDelta,
} from "@/lib/aggregate";
import {
  getNarrative,
  getFactoryBriefing,
  getNeedsPlan,
  getProjectTagline,
  getValuation,
  type Narrative,
  type Valuation,
} from "@/lib/narrative";
import { getHistory } from "@/lib/kv";
import { estimateCompletion, formatEtaDate, formatHorizon, type Estimate } from "@/lib/estimate";
import { formatCycle } from "@/lib/quality";
import { floorLoopSignal } from "@/lib/loophealth";
import { runsFor, soonestRun } from "@/lib/routine";
import { getProjectBySlug } from "@/config/projects";
import {
  crossProjectRoutines,
  routineShortLabel,
  routinesForSlug,
  ROUTINE_SCHEDULE_AS_OF,
} from "@/config/routines";
import type { ProjectSnapshot } from "@/lib/types";
import {
  cn,
  ciMeta,
  cleanProposalTitle,
  formatMoney,
  formatShortDate,
  headlinePct,
  kindLabel,
  leadSentences,
  livenessMeta,
  pluralize,
  statusMeta,
  toneClasses,
} from "@/lib/utils";
import { ActivityFeed } from "@/components/ActivityFeed";
import { Delta24h, DeltaPill } from "@/components/Delta";
import { GrowthLine } from "@/components/GrowthPanel";
import { Chip } from "@/components/Chip";
import { LoopSignalChip } from "@/components/LoopHealthPanel";
import { NextRun } from "@/components/NextRun";
import { RoutineSchedule } from "@/components/RoutineSchedule";
import { SelfValidationLine } from "@/components/SelfValidationPanel";
import { LivenessDot } from "@/components/LivenessDot";
import { WeekBars } from "@/components/WeekBars";
import { ProgressTrend, type ProjectTrend } from "@/components/ProgressTrend";
import { ValuationView } from "@/components/ValuationView";
import { RelativeTime } from "@/components/RelativeTime";
import { CalmCoda, Greeting, TimeOfDay } from "@/components/TimeAware";
import {
  AlertIcon,
  ArrowRightIcon,
  CheckIcon,
  ExternalLinkIcon,
  RefreshIcon,
  RocketIcon,
  SparkleIcon,
} from "@/components/icons";

// This is a live ops view, so render it dynamically: the AI digests then show
// on the first load after a deploy, instead of serving the build-time "Summary"
// placeholder until ISR catches up an hour later. The expensive work (GitHub +
// Gemini) is memoised in unstable_cache, so this does NOT re-hit the APIs per
// request — a warm load is just cache reads.
export const dynamic = "force-dynamic";

export default async function OverviewPage() {
  const snapshots = await getAllSnapshots();
  const overview = buildOverview(snapshots);
  const tokenMissing = !process.env.GITHUB_TOKEN;
  const authError =
    !tokenMissing &&
    snapshots.length > 0 &&
    snapshots.every((s) => !s.repoMeta.available) &&
    snapshots.some((s) => s.errors.some((e) => /HTTP 40[13]/.test(e)));

  const shipped = overview.totalMerged24h;
  const asks = overview.needs;
  const overnightCount = overview.overnightFeed.length;

  // KV history (per project) → progress trend + completion estimates.
  const HISTORY_DAYS = 21;
  const histories = await Promise.all(snapshots.map((s) => getHistory(s.slug)));
  const hasHistory = histories.some((h) => h !== null && h.length > 0);
  const maxHistoryLen = Math.max(0, ...histories.map((h) => h?.length ?? 0));
  const trends: ProjectTrend[] = snapshots.map((s, i) => {
    const recent = histories[i]?.slice(-HISTORY_DAYS) ?? [];
    return {
      slug: s.slug,
      name: s.displayName,
      current: headlinePct(s),
      values: recent.map((m) => m.pct),
      totals: recent.map((m) => m.submissionTotal),
    };
  });
  const etas = new Map<string, Estimate | null>(
    snapshots.map((s, i) => [s.slug, estimateCompletion(s, histories[i])]),
  );

  // 24h deltas (the digest's real value) — per project + factory-wide.
  const deltas = new Map<string, ProjectDelta>(
    snapshots.map((s, i) => [s.slug, projectDelta(s, histories[i])]),
  );
  const fDelta = factoryDelta([...deltas.values()]);

  // Rank tiles by readiness so "closest to launch" sits first (ready → 100).
  const ranked = [...snapshots].sort((a, b) => {
    const pa = a.readyForSubmission ? 101 : headlinePct(a) ?? -1;
    const pb = b.readyForSubmission ? 101 : headlinePct(b) ?? -1;
    if (pb !== pa) return pb - pa;
    return (b.progress.buildPct ?? -1) - (a.progress.buildPct ?? -1);
  });

  // Loop health at a glance: stalled loops + open harness-improvement proposals.
  const stalledLoops = snapshots.filter((s) => s.liveness.stalled);
  const proposals = snapshots.flatMap((s) =>
    s.attentionIssues
      .filter((a) => a.kind === "harness_proposal")
      .map((a) => ({ ...a, projectName: s.displayName })),
  );
  // The loop's own "I'm stuck/churning" signal (LOOP_HEALTH) — distinct from the
  // cadence-based "stalled" flag; surfaces the recurring wall it can't clear.
  const churningLoops = snapshots.filter(
    (s) =>
      s.loopHealth.available &&
      (s.loopHealth.signal === "stuck" || s.loopHealth.signal === "churning"),
  );

  // LLM where it's worth it: factory briefing + per-project digest + valuation,
  // and clustering the cross-project "Needs you" list (same task → one card).
  // Group the "Needs you" asks first, so the briefing's "N items need you" count
  // is the SAME number the Floor lists + badges (one card per clustered task).
  const askGroups = await getNeedsPlan(asks);
  const [briefing, narrativeEntries, valuationEntries, taglineEntries] =
    await Promise.all([
      getFactoryBriefing(snapshots, askGroups.length),
      Promise.all(snapshots.map(async (s) => [s.slug, await getNarrative(s)] as const)),
      Promise.all(snapshots.map(async (s) => [s.slug, await getValuation(s)] as const)),
      Promise.all(snapshots.map(async (s) => [s.slug, await getProjectTagline(s)] as const)),
    ]);
  const narratives = new Map<string, Narrative>(narrativeEntries);
  const valuations = new Map<string, Valuation>(valuationEntries);
  const taglines = new Map<string, string | null>(taglineEntries);

  // Factory value rollups — keep business-case and heuristic subtotals separate.
  const bcVals = valuationEntries.filter(([, v]) => v.source === "business_case");
  const heurVals = valuationEntries.filter(([, v]) => v.source !== "business_case");
  const bcArr = bcVals.reduce((n, [, v]) => n + v.arrExpected, 0);
  const heurArr = heurVals.reduce((n, [, v]) => n + v.arrExpected, 0);
  const factoryArr = bcArr + heurArr;

  // Cool extras: how many of the last 7 days shipped, and the busiest day.
  const activeDays = overview.velocity.filter((d) => d.count > 0).length;
  const readyToShip = snapshots.filter((s) => s.readyForSubmission).length;
  // Self-validation rollup: how many repos enforce the capabilities gate, and how
  // many capabilities are owner-blocked (the loop can't validate without a secret).
  const validationGates = snapshots.filter(
    (s) => s.selfValidation.enforcedInCi === true,
  ).length;
  const ownerBlocked = snapshots.reduce(
    (n, s) => n + (s.selfValidation.available ? s.selfValidation.unmet.length : 0),
    0,
  );

  return (
    <div className="animate-fade-in mx-auto max-w-3xl">
      <Header fetchedAt={overview.oldestFetchedAt} />

      {tokenMissing && (
        <div className="mb-6 rounded-xl border border-clay/30 bg-clay-soft px-4 py-3 text-sm text-clay-strong">
          <strong className="font-semibold">No GITHUB_TOKEN set.</strong> Add a
          read-only GitHub token to{" "}
          <code className="font-mono text-xs">.env.local</code> (see the README)
          to load live data.
        </div>
      )}
      {authError && (
        <div className="mb-6 rounded-xl border border-amber/30 bg-amber-soft px-4 py-3 text-sm text-amber-strong">
          <strong className="font-semibold">GitHub rejected every request.</strong>{" "}
          Your <code className="font-mono text-xs">GITHUB_TOKEN</code> looks
          invalid or lacks read access to these repos.
        </div>
      )}

      {/* 1 — The one-glance state: what shipped + a factory briefing + verdict. */}
      <section className="mb-5 rounded-2xl border border-hairline bg-card p-6 shadow-card sm:p-8">
        <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.18em] text-muted">
          <RocketIcon className="h-3.5 w-3.5 text-sage" />
          Shipped · last 24 hours
        </div>
        {shipped > 0 ? (
          <p className="mt-2 font-serif text-3xl font-medium leading-tight tracking-tight text-ink sm:text-4xl">
            {shipped} {pluralize(shipped, "PR")} shipped
            <span className="text-muted">
              {" "}
              across {overview.projectsShippedOvernight}{" "}
              {pluralize(overview.projectsShippedOvernight, "project")}
            </span>
          </p>
        ) : (
          <p className="mt-2 font-serif text-3xl font-medium leading-tight tracking-tight text-ink sm:text-4xl">
            Quiet
            <span className="text-muted"> — nothing shipped in the last 24h</span>
          </p>
        )}

        <p className="mt-3 text-sm leading-relaxed text-ink/90">{briefing.text}</p>

        <Verdict count={askGroups.length} />

        {/* At-a-glance state + the since-yesterday delta (the old digest, folded
            into the hero so there's one masthead, not two stacked boxes). */}
        <div className="mt-4 space-y-1.5 border-t border-hairline pt-3 text-xs">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="text-muted">
              CI{" "}
              <span
                className={cn(
                  "tabular font-medium",
                  overview.ci.total === 0
                    ? "text-muted"
                    : overview.ci.anyFailing
                      ? "text-clay-strong"
                      : "text-sage-strong",
                )}
              >
                {overview.ci.passing}/{overview.ci.total}
              </span>{" "}
              green
            </span>
            {overview.closestToLaunch && (
              <>
                <span aria-hidden className="text-muted/60">·</span>
                <span className="text-muted">
                  closest to launch{" "}
                  <Link
                    href={`/p/${overview.closestToLaunch.slug}`}
                    className="font-medium text-ink transition-colors hover:text-clay"
                  >
                    {overview.closestToLaunch.name}
                  </Link>{" "}
                  <span className="tabular text-sage-strong">
                    {overview.closestToLaunch.pct}%
                  </span>
                </span>
              </>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="font-medium uppercase tracking-wide text-muted">
              Since yesterday
            </span>
            {fDelta.hasBaseline ? (
              <>
                <DeltaPill value={fDelta.dReadinessPct} label="readiness" unit="pts" />
                <DeltaPill value={fDelta.dBuildPct} label="build" unit="pts" />
                <DeltaPill
                  value={fDelta.newPendingOps}
                  label="pending ops"
                  higherIsBetter={false}
                />
                {fDelta.dReadinessPct === null &&
                  fDelta.dBuildPct === null &&
                  fDelta.newPendingOps === null && (
                    <span className="text-muted/70">no change recorded</span>
                  )}
              </>
            ) : (
              <span className="text-muted/70">
                fills in once the daily snapshot records history (Vercel KV)
              </span>
            )}
          </div>
        </div>

        {/* Loud loop-health flags: a stalled or churning loop, or a proposal. */}
        {(stalledLoops.length > 0 ||
          churningLoops.length > 0 ||
          proposals.length > 0) && (
          <div className="mt-3 space-y-1.5">
            <p className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.14em] text-muted">
              <RefreshIcon className="h-3 w-3" />
              The loop needs you
            </p>
            {stalledLoops.map((s) => (
              <p
                key={s.slug}
                className="flex items-center gap-1.5 text-xs font-medium text-clay-strong"
              >
                <AlertIcon className="h-3.5 w-3.5 shrink-0" />
                {s.displayName} loop may be stalled — {livenessMeta(s.liveness).label}.
              </p>
            ))}
            {churningLoops.map((s) => {
              const wall = s.loopHealth.rolling7d.recurringFailures[0];
              return (
                <p
                  key={`churn-${s.slug}`}
                  className="flex items-start gap-1.5 text-xs text-clay-strong"
                >
                  <AlertIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span className="font-medium">
                    {s.displayName} loop is {s.loopHealth.signal}
                    {wall && (
                      <span className="font-normal text-muted"> — {wall}</span>
                    )}
                  </span>
                </p>
              );
            })}
            {proposals.map((p) => (
              <a
                key={`${p.projectName}-${p.number}`}
                href={p.url}
                target="_blank"
                rel="noreferrer"
                className="flex items-start gap-1.5 text-xs text-muted transition-colors hover:text-clay"
              >
                <SparkleIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber" />
                <span className="line-clamp-2">
                  <span className="font-medium text-ink">{p.projectName}</span>{" "}
                  harness proposal: {cleanProposalTitle(p.title)}
                </span>
              </a>
            ))}
          </div>
        )}
      </section>

      {/* 2 — Only the things that genuinely need you — kept prominent, up top.
          Gate + count on the GROUPED cards so the masthead number matches what's
          actually listed (a same-task-across-N-projects ask is one card). */}
      {askGroups.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-3 px-1 text-sm font-semibold tracking-tight text-ink">
            Needs you
          </h2>
          <ul className="space-y-2">
            {askGroups.map((group) => (
              <AskRow key={group.id} group={group} />
            ))}
          </ul>
        </section>
      )}

      {/* 1b — Factory performance: lead with the three that matter; the rest are
          fine print, not nine equal-weight cells. */}
      <section className="mb-6 rounded-2xl border border-hairline bg-card p-5 sm:p-6">
        <div className="mb-5 flex items-end justify-between">
          <h2 className="text-sm font-semibold tracking-tight text-ink">
            Factory performance
          </h2>
          <span className="text-xs text-muted">
            {overview.factory.activeProjects}/{overview.factory.totalProjects} lines
            active · 7-day
          </span>
        </div>

        {/* The headline trio — momentum, readiness, value — at real scale. */}
        <div className="grid grid-cols-3 gap-4">
          <PrimaryStat
            label="Throughput"
            value={String(overview.factory.throughputPerDay)}
            unit="PRs / day · 7-day avg"
          />
          <PrimaryStat
            label="Readiness"
            value={overview.avgReady === null ? "—" : `${overview.avgReady}%`}
            unit="avg to submission"
            tone="sage"
          />
          <PrimaryStat
            label="Est. value"
            value={formatMoney(factoryArr)}
            unit="annual · see note"
            tone={bcVals.length > 0 ? "sage" : "muted"}
          />
        </div>

        {/* Shipping this week — the daily breakdown of that 7-day-avg throughput,
            folded in so throughput lives in ONE place (number + its daily bars). */}
        <div className="mt-6 border-t border-hairline pt-4">
          <div className="flex items-end justify-between">
            <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">
              Shipping this week
            </p>
            <span className="text-xs text-muted">
              {overview.velocityTotal} {pluralize(overview.velocityTotal, "PR")} ·{" "}
              {activeDays}/7 active days
            </span>
          </div>
          {overview.velocityTotal > 0 ? (
            <div className="mt-5">
              <WeekBars days={overview.velocity} />
            </div>
          ) : (
            <p className="py-4 text-sm text-muted">
              Nothing merged in the last 7 days yet.
            </p>
          )}
        </div>

        {/* Operational metrics — the diagnostics behind the trio. Deliberately
            NOT headline tiles (that would flatten the hierarchy into ten equal
            numbers); kept quiet and subordinate. But an aligned grid, not a
            comma-wrap line, so each metric has a fixed slot and a red exception
            actually draws the eye instead of getting buried mid-wrap. */}
        <div className="mt-5 border-t border-hairline pt-4">
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">
            Operational metrics
          </p>
          <div className="grid grid-cols-2 gap-x-6 gap-y-3.5 sm:grid-cols-3">
            <OpStat
              label="Lead time"
              value={formatCycle(overview.factory.leadTimeHours)}
              hint="median PR, open→merge"
            />
            <OpStat
              label="First-pass yield"
              value={
                overview.factory.firstPassYield === null
                  ? "—"
                  : `${overview.factory.firstPassYield}%`
              }
              hint="avg CI pass rate"
              tone={
                overview.factory.firstPassYield !== null &&
                overview.factory.firstPassYield < 80
                  ? "clay"
                  : undefined
              }
            />
            <OpStat
              label="Rework"
              value={
                overview.factory.reworkRate === null
                  ? "—"
                  : `${overview.factory.reworkRate}%`
              }
              hint="fix ÷ merged PRs, 7d"
              tone={
                overview.factory.reworkRate !== null && overview.factory.reworkRate > 40
                  ? "clay"
                  : undefined
              }
            />
            <OpStat
              label="WIP"
              value={
                overview.factory.wipStuck === 0
                  ? String(overview.factory.wipOpen)
                  : overview.factory.wipStuck === overview.factory.wipOpen
                    ? `${overview.factory.wipOpen} stuck`
                    : `${overview.factory.wipOpen} · ${overview.factory.wipStuck} stuck`
              }
              hint="open PRs · stuck >12h"
              tone={overview.factory.wipStuck > 0 ? "clay" : undefined}
            />
            <OpStat
              label="Build"
              value={overview.avgProgress === null ? "—" : `${overview.avgProgress}%`}
              hint={`avg across ${overview.factory.totalProjects} lines`}
            />
            <OpStat
              label="Ready to ship"
              value={`${readyToShip}/${overview.factory.totalProjects}`}
              hint="lines past submission gate"
              tone={readyToShip > 0 ? "sage" : undefined}
            />
            <OpStat
              label="Self-validation"
              value={
                `${validationGates}/${overview.factory.totalProjects} gates` +
                (ownerBlocked > 0 ? ` · ${ownerBlocked} blocked` : "")
              }
              hint="lines enforcing in CI"
              tone={ownerBlocked > 0 ? "clay" : undefined}
            />
          </div>
        </div>

        <p className="mt-4 text-[11px] leading-relaxed text-muted">
          Estimated annual value {formatMoney(factoryArr)} ={" "}
          <span className="text-sage-strong">{formatMoney(bcArr)}</span> from{" "}
          {bcVals.length} business {pluralize(bcVals.length, "case")} +{" "}
          <span className="text-amber-strong">{formatMoney(heurArr)}</span> rough
          heuristic ({heurVals.length}). Pre-launch estimate — the two aren&apos;t
          equivalent and this isn&apos;t a valuation.
        </p>
      </section>

      {/* 1c — Progress to launch (bars from the live %, trend layered in via KV). */}
      <section className="mb-6 rounded-2xl border border-hairline bg-card p-5">
        <div className="mb-4 flex items-end justify-between">
          <h2 className="text-sm font-semibold tracking-tight text-ink">
            Progress to launch
          </h2>
          <span className="text-xs text-muted">
            % to submission-ready{hasHistory ? " · over time" : ""}
          </span>
        </div>
        <ProgressTrend trends={trends} />
        {!hasHistory && (
          <p className="mt-4 text-xs leading-relaxed text-muted">
            No trend lines yet — daily history is off (not broken). The snapshot
            cron runs 07:00&nbsp;UTC daily but is a no-op until a Vercel KV /
            Upstash Redis store is connected to <span className="text-ink">this
            dashboard</span> (see README) — set up once, it then trends all
            projects automatically; nothing per project.
          </p>
        )}
        {hasHistory && maxHistoryLen < 2 && (
          <p className="mt-4 text-xs text-muted">
            First snapshot recorded — trend lines fill in as the daily snapshot runs.
          </p>
        )}
      </section>

      {/* 3 — A briefing tile per project (ranked closest-to-launch first): name
          opens the live app; a did/now/next summary; progress + ETA; Dashboard. */}
      <section className="mb-6">
        <div className="mb-3 flex items-end justify-between px-1">
          <h2 className="text-sm font-semibold tracking-tight text-ink">Projects</h2>
          <span className="text-xs text-muted">closest to launch first</span>
        </div>
        <div className="space-y-4">
          {ranked.map((s) => (
            <ProjectTile
              key={s.slug}
              snapshot={s}
              narrative={narratives.get(s.slug)}
              tagline={taglines.get(s.slug) ?? null}
              eta={etas.get(s.slug) ?? null}
              valuation={valuations.get(s.slug) ?? null}
              delta={deltas.get(s.slug) ?? null}
            />
          ))}
        </div>
      </section>

      {/* The full routine schedule — every project's routines + the cross-project
          digest — folded away by default. Next-run computed live (uncached) and
          shown in the viewer's local timezone. */}
      <details className="group mb-6 rounded-2xl border border-hairline bg-card">
        <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-3.5 text-sm font-medium text-ink">
          <span className="flex items-center gap-2">
            <RefreshIcon className="h-3.5 w-3.5 text-muted" />
            Routine schedule{" "}
            <span className="text-muted">· when each loop next runs</span>
          </span>
          <ArrowRightIcon className="h-4 w-4 text-muted transition-transform group-open:rotate-90" />
        </summary>
        <div className="space-y-4 border-t border-hairline px-5 py-4">
          {ranked.map((s) => (
            <div key={s.slug}>
              <Link
                href={`/p/${s.slug}`}
                className="text-[11px] font-semibold uppercase tracking-wide text-muted transition-colors hover:text-clay"
              >
                {s.displayName}
              </Link>
              <div className="mt-1.5">
                <RoutineSchedule runs={runsFor(routinesForSlug(s.slug))} />
              </div>
            </div>
          ))}
          <div className="border-t border-hairline pt-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
              Cross-project
            </p>
            <div className="mt-1.5">
              <RoutineSchedule runs={runsFor(crossProjectRoutines())} />
            </div>
          </div>
          <p className="border-t border-hairline pt-3 text-[11px] leading-relaxed text-muted">
            Scheduled cloud agents. Times are shown in your local timezone (the
            schedule itself is fixed in UTC). Product factories run every 6h
            (staggered); GTM factories &amp; quality auditors every 2 days;
            research daily; GTM auditors weekly — a run can lag its slot by a
            couple of minutes. This schedule is a hand-kept mirror, reconciled{" "}
            {formatShortDate(ROUTINE_SCHEDULE_AS_OF, true)}.
          </p>
        </div>
      </details>

      {/* The detail, kept out of the way until you want it. */}
      {overnightCount > 0 && (
        <details className="group rounded-2xl border border-hairline bg-card">
          <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-3.5 text-sm font-medium text-ink">
            <span>
              What shipped · last 24h{" "}
              <span className="text-muted">({overnightCount})</span>
            </span>
            <ArrowRightIcon className="h-4 w-4 text-muted transition-transform group-open:rotate-90" />
          </summary>
          <div className="border-t border-hairline px-5 py-2">
            <ActivityFeed entries={overview.overnightFeed} showProject limit={30} />
          </div>
        </details>
      )}
    </div>
  );
}

/** A headline factory KPI — larger, for the primary trio. */
function PrimaryStat({
  label,
  value,
  unit,
  tone = "ink",
}: {
  label: string;
  value: string;
  unit: string;
  tone?: "ink" | "sage" | "muted";
}) {
  const color =
    tone === "sage" ? "text-sage-strong" : tone === "muted" ? "text-muted" : "text-ink";
  return (
    <div>
      <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-muted">
        {label}
      </p>
      <p
        className={cn(
          "mt-1 font-serif text-[26px] font-medium leading-none tabular sm:text-3xl",
          color,
        )}
      >
        {value}
      </p>
      <p className="mt-1.5 text-[11px] leading-tight text-muted">{unit}</p>
    </div>
  );
}

/**
 * A quiet operational metric — a small label-over-value cell in the ops grid.
 * Subordinate to the headline trio (small type, no serif), but aligned so a
 * clay (exception) or sage (win) value stands out of the grid at a glance.
 */
function OpStat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  /** The unit + scope, so the number is unambiguous (avg? median? of what?). */
  hint: string;
  tone?: "sage" | "clay";
}) {
  const color =
    tone === "clay" ? "text-clay-strong" : tone === "sage" ? "text-sage-strong" : "text-ink";
  return (
    <div>
      <p className="text-[10px] font-medium uppercase tracking-[0.1em] text-muted">
        {label}
      </p>
      <p className={cn("mt-0.5 text-sm font-semibold leading-none tabular", color)}>
        {value}
      </p>
      <p className="mt-1 text-[10px] leading-tight text-muted">{hint}</p>
    </div>
  );
}

/** The single verdict line under the hero — time-aware. */
function Verdict({ count }: { count: number }) {
  if (count === 0) {
    return (
      <div className="mt-4 flex items-center gap-2 rounded-xl bg-sage-soft/60 px-3.5 py-2.5 text-sm font-medium text-sage-strong">
        <CheckIcon className="h-4 w-4 shrink-0" />
        <CalmCoda />
      </div>
    );
  }
  return (
    <div className="mt-4 flex items-center gap-2 rounded-xl bg-clay-soft/70 px-3.5 py-2.5 text-sm font-medium text-clay-strong">
      <span className="grid h-5 min-w-5 place-items-center rounded-full bg-clay px-1 text-xs font-semibold text-on-accent">
        {count}
      </span>
      <span>
        {count === 1 ? "thing needs" : "things need"} your attention <TimeOfDay />.
      </span>
    </div>
  );
}

/** One true human ask, phrased plainly. */
function AskRow({ group }: { group: NeedGroup }) {
  const isReady = group.kind === "ready";
  // Render one chip per DISTINCT project — a group can carry several members of
  // the same project (clustered same-task asks); they must not repeat or inflate
  // the "N projects" count.
  const projects = Array.from(
    new Map(group.members.map((m) => [m.projectSlug, m])).values(),
  );
  const multi = projects.length > 1;
  const single = projects[0];
  return (
    <li
      className={cn(
        "flex items-start gap-3 rounded-xl border p-3.5",
        isReady ? "border-sage/30 bg-sage-soft/50" : "border-clay/20 bg-card",
      )}
    >
      <span
        className={cn(
          "mt-1.5 h-2 w-2 shrink-0 rounded-full",
          isReady ? "bg-sage" : "bg-clay",
        )}
      />
      <div className="min-w-0 flex-1">
        {multi ? (
          // Same task across several projects — one card, a chip per project.
          <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
            {projects.map((m) => (
              <Link
                key={m.projectSlug}
                href={`/p/${m.projectSlug}`}
                className="rounded-full bg-bg px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted transition-colors hover:text-clay"
              >
                {m.projectName}
              </Link>
            ))}
            <span className="text-[10px] font-medium tabular text-muted">
              {projects.length} projects
            </span>
          </div>
        ) : (
          <Link
            href={`/p/${single.projectSlug}`}
            className="text-[11px] font-semibold uppercase tracking-wide text-muted transition-colors hover:text-clay"
          >
            {single.projectName}
          </Link>
        )}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <p className="text-sm leading-snug text-ink">{group.text}</p>
          {group.tag && (
            <span className="rounded-full bg-bg px-1.5 py-0.5 text-[10px] font-medium text-muted">
              {group.tag}
            </span>
          )}
        </div>
        {group.howTo && (
          <p className="mt-0.5 text-xs text-muted">{group.howTo}</p>
        )}
        {multi && (
          <p className="mt-1 text-[11px] text-muted">
            Same task on each — do it once per project.
          </p>
        )}
      </div>
      {!multi && single.url && (
        <a
          href={single.url}
          target="_blank"
          rel="noreferrer"
          aria-label="Open on GitHub"
          className="mt-0.5 shrink-0 text-muted transition-colors hover:text-clay"
        >
          <ExternalLinkIcon className="h-4 w-4" />
        </a>
      )}
    </li>
  );
}

/**
 * A project briefing tile: name → live app, a did/now/next summary, a progress
 * bar + completion estimate, and a Dashboard link.
 */
/**
 * A short "why" line for a tile's attention corner — the genuine human asks
 * (priority order) with stuck PRs folded in. Capped at two phrases + a "+N" so
 * it stays glanceable; the full list lives in "Needs you" and the project page.
 */
function attentionReason(asks: NeedEntry[], stuck: number): string | null {
  const parts: string[] = [];
  if (asks.some((a) => a.kind === "ready")) parts.push("ready to ship");
  if (asks.some((a) => a.kind === "urgent_action")) parts.push("owner action");
  const blockers = asks.filter((a) => a.kind === "blocker").length;
  if (blockers > 0) parts.push(blockers > 1 ? `${blockers} blockers` : "blocker");
  if (asks.some((a) => a.kind === "ci")) parts.push("CI failing");
  if (stuck > 0) parts.push(`${stuck} stuck`);
  if (parts.length === 0) return null;
  if (parts.length <= 2) return parts.join(" · ");
  return `${parts[0]} · ${parts[1]} · +${parts.length - 2}`;
}

function ProjectTile({
  snapshot: s,
  narrative,
  tagline,
  eta,
  valuation,
  delta,
}: {
  snapshot: ProjectSnapshot;
  narrative?: Narrative;
  tagline?: string | null;
  eta: Estimate | null;
  valuation: Valuation | null;
  delta: ProjectDelta | null;
}) {
  const status = statusMeta(s.status);
  const ci = ciMeta(s.ci.status);
  // Attention: genuine human asks (drive the "needs you" badge + the top count)
  // and stuck PRs (a softer, separate signal). One corner block summarizes both.
  const asks = humanAsksFor(s);
  const stuck = s.stuckPRs;
  const reason = attentionReason(asks, stuck);
  const appUrl = getProjectBySlug(s.slug)?.appUrl;
  const pct = headlinePct(s); // submission readiness (headline)
  const build = s.progress.buildPct; // build completeness (secondary)
  const loopSignal = floorLoopSignal(s.loopHealth); // null while bootstrapping
  // The soonest routine to fire (usually the 6h factory) — from the authoritative
  // cron schedule, computed live in UTC.
  const soonest = soonestRun(runsFor(routinesForSlug(s.slug)));

  return (
    <div className="card flex flex-col gap-3 p-5 shadow-card transition-shadow hover:shadow-lift">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2.5">
          <span
            className={cn(
              "mt-2 h-2.5 w-2.5 shrink-0 rounded-full",
              toneClasses(status.tone).dot,
            )}
            aria-hidden
          />
          <div className="min-w-0">
            {appUrl ? (
              <a
                href={appUrl}
                target="_blank"
                rel="noreferrer"
                className="group inline-flex max-w-full items-center gap-1.5 text-ink transition-colors hover:text-clay"
              >
                <span className="truncate font-serif text-lg font-medium leading-tight">
                  {s.displayName}
                </span>
                <ExternalLinkIcon className="h-3.5 w-3.5 shrink-0 text-muted transition-colors group-hover:text-clay" />
              </a>
            ) : (
              <Link
                href={`/p/${s.slug}`}
                className="truncate font-serif text-lg font-medium leading-tight text-ink transition-colors hover:text-clay"
              >
                {s.displayName}
              </Link>
            )}
            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted">
              <span>{kindLabel(s.kind)}</span>
              <span aria-hidden>·</span>
              <LivenessDot liveness={s.liveness} showLabel />
              {soonest?.nextAt && (
                <>
                  <span aria-hidden>·</span>
                  <span title={`Next ${routineShortLabel(soonest.routine.type)} run`}>
                    next {routineShortLabel(soonest.routine.type)}{" "}
                    <NextRun at={soonest.nextAt} cron={soonest.routine.cron} />
                  </span>
                </>
              )}
              {loopSignal && <LoopSignalChip signal={loopSignal} />}
            </div>
          </div>
        </div>
        {/* One attention chip: the loud word + why, together. "needs you" is the
            curated human ask (matches the top count); a stuck-only tile gets its
            own softer chip so it never inflates that count. The reason wraps to a
            second line on a narrow tile rather than crowding the name. */}
        <div className="flex max-w-[45%] flex-col items-end">
          {asks.length > 0 ? (
            <span className="inline-flex max-w-full flex-wrap items-baseline justify-end gap-x-1.5 rounded-2xl bg-clay-soft px-2.5 py-1 text-[11px] leading-snug text-clay-strong">
              <span className="font-semibold">needs you</span>
              {reason && <span className="font-normal text-clay-strong/85">{reason}</span>}
            </span>
          ) : stuck > 0 ? (
            <Chip
              tone="clay"
              title={`${stuck} open pull request${
                stuck === 1 ? " has" : "s have"
              } been open past 12h — review, merge, or close it to unblock the loop.`}
            >
              {stuck} stuck
            </Chip>
          ) : (
            <span
              className={cn(
                "flex items-center gap-1.5 text-xs",
                toneClasses(ci.tone).text,
              )}
            >
              <span className={cn("h-1.5 w-1.5 rounded-full", toneClasses(ci.tone).dot)} />
              CI {ci.label.toLowerCase()}
            </span>
          )}
        </div>
      </div>

      {tagline && (
        // What the product IS (stable identity) — calm, above the status story.
        <p className="-mt-1 text-[13.5px] italic leading-snug text-muted">
          {tagline}
        </p>
      )}

      {narrative && (
        <div className="space-y-1">
          <p className="text-[15px] font-semibold leading-snug text-ink">
            {narrative.headline}
          </p>
          <p className="text-sm leading-relaxed text-muted">
            {leadSentences(narrative.text)}
          </p>
        </div>
      )}

      {/* Facts: readiness (headline) · build · shipped · estimate */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs">
        {pct !== null ? (
          <span
            className="flex items-center gap-2"
            title={`Ship-readiness: ${s.progress.submissionDone}/${s.progress.submissionTotal} Definition-of-Done gates met. This is the final submission checklist — separate from build progress, and it stays near 0 until the very end.`}
          >
            <span className="h-1.5 w-20 overflow-hidden rounded-full bg-hairline">
              <span
                className="block h-full rounded-full bg-sage"
                style={{ width: `${pct}%` }}
              />
            </span>
            <span className="tabular font-semibold text-ink">{pct}%</span>
            <span className="text-muted">to submission</span>
          </span>
        ) : (
          <span className="text-muted">readiness unmeasured</span>
        )}
        {build !== null && (
          <span
            className="text-muted"
            title="Build completeness — feature-track checkboxes done. Separate axis from ship-readiness: a project can be mostly built yet 0% ship-ready."
          >
            · build {build}%
          </span>
        )}
        {eta && (
          <span className="text-muted">
            · est. launch{" "}
            <span className="font-medium text-ink">{formatEtaDate(eta.date)}</span>{" "}
            <span className="opacity-70">
              ({formatHorizon(eta.daysRemaining)}
              {eta.basis === "velocity" ? ", rough" : ""})
            </span>
          </span>
        )}
      </div>

      {delta && (
        <Delta24h
          shipped={delta.shipped24h}
          dBuildPct={delta.dBuildPct}
          dReadinessPct={delta.dReadinessPct}
          newPendingOps={delta.newPendingOps}
          hasBaseline={delta.hasBaseline}
        />
      )}

      <GrowthLine growth={s.growth} />

      <SelfValidationLine sv={s.selfValidation} />

      {valuation && <ValuationView v={valuation} />}

      <div className="mt-auto flex items-center justify-between gap-3 border-t border-hairline pt-3">
        <span
          className="flex min-w-0 items-center gap-1 text-[11px] text-muted"
          title={narrative?.llmReason ? `LLM fallback — ${narrative.llmReason}` : undefined}
        >
          <SparkleIcon className="h-3 w-3 shrink-0" />
          {narrative?.source === "llm" ? "AI" : "Template"}
          {narrative?.source !== "llm" && narrative?.llmReason && (
            <span className="truncate text-muted/70">· {narrative.llmReason}</span>
          )}
        </span>
        <Link
          href={`/p/${s.slug}`}
          className="group flex shrink-0 items-center gap-1 text-xs font-medium text-muted transition-colors hover:text-clay"
        >
          Dashboard
          <ArrowRightIcon className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
        </Link>
      </div>
    </div>
  );
}

function Header({ fetchedAt }: { fetchedAt: string | null }) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-3">
      <div>
        <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted">
          Autonomous product factory
        </p>
        <h1 className="mt-1 font-serif text-3xl font-medium tracking-tight text-ink sm:text-4xl">
          <Greeting />
        </h1>
      </div>
      <p className="text-xs text-muted">
        <RelativeTime iso={fetchedAt} prefix="Updated " /> · refreshes hourly
      </p>
    </div>
  );
}
