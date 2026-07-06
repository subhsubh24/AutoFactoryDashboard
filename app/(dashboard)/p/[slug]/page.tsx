import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getProjectBySlug } from "@/config/projects";
import { routineLabel, routinesForSlug, ROUTINE_SCHEDULE_AS_OF } from "@/config/routines";
import { runsFor, soonestRun, workloadFor } from "@/lib/routine";
import { getProjectSnapshot } from "@/lib/github";
import {
  getActionPlan,
  getGrowthSummary,
  getLastRunSummary,
  getNarrative,
  getLaunchSummary,
  getProjectTagline,
  getScorecardSummary,
  getValuation,
} from "@/lib/narrative";
import { getHistory } from "@/lib/kv";
import { projectDelta } from "@/lib/aggregate";
import type { FeedEntry, ProjectSnapshot } from "@/lib/types";
import {
  cn,
  cleanProposalTitle,
  describeBlock,
  formatAge,
  formatShortDate,
  headlinePct,
  kindLabel,
  livenessMeta,
  milestoneTitle,
  nextMilestone,
  pluralize,
  toneClasses,
} from "@/lib/utils";
import { bucketThemes, extractThemes, themeSummary } from "@/lib/themes";
import { qualitySignals, formatCycle } from "@/lib/quality";
import { estimateCompletion, formatEtaDate, formatHorizon } from "@/lib/estimate";
import { SectionCard } from "@/components/Section";
import { ProgressRing } from "@/components/ProgressRing";
import { StatusBadge } from "@/components/StatusBadge";
import { TrackBars } from "@/components/TrackBars";
import { ThemeChips } from "@/components/ThemeChips";
import { ValuationView } from "@/components/ValuationView";
import { DemandConfidenceNote } from "@/components/DemandConfidenceNote";
import { ActivityFeed } from "@/components/ActivityFeed";
import { ActionItemsPanel } from "@/components/ActionItemsPanel";
import { ActionPlan } from "@/components/ActionPlan";
import { Chip } from "@/components/Chip";
import { Collapsible } from "@/components/Collapsible";
import { CollapsibleSection } from "@/components/CollapsibleSection";
import { CIHealth } from "@/components/CIHealth";
import { HistoryCharts } from "@/components/HistoryCharts";
import { RelativeTime } from "@/components/RelativeTime";
import { Delta24h } from "@/components/Delta";
import { GrowthPanel } from "@/components/GrowthPanel";
import { DemandSignalPanel } from "@/components/DemandSignalPanel";
import { ChannelApprovals } from "@/components/ChannelApprovals";
import { CostPanel } from "@/components/CostPanel";
import { RunCostPanel } from "@/components/RunCostPanel";
import { RoadmapSteers } from "@/components/RoadmapSteers";
import { GoLivePanel } from "@/components/GoLivePanel";
import { MarketingPanel } from "@/components/MarketingPanel";
import { LoopHealthPanel } from "@/components/LoopHealthPanel";
import { ValidatorPanel } from "@/components/ValidatorPanel";
import { RoutineSchedule } from "@/components/RoutineSchedule";
import { RoutineRuns, buildRoutineRunSummaries } from "@/components/RoutineRuns";
import { RunPulse } from "@/components/RunPulse";
import { PrMixDonut } from "@/components/PrMixDonut";
import { SelfValidationPanel } from "@/components/SelfValidationPanel";
import { QualityScorecardView, AuditorGaps } from "@/components/QualityScorecard";
import { LivenessDot } from "@/components/LivenessDot";
import { ReadinessGatesView } from "@/components/ReadinessGates";
import { ReadyEvidenceView } from "@/components/ReadyEvidence";
import {
  AlertIcon,
  ArrowLeftIcon,
  CheckIcon,
  ClockIcon,
  ExternalLinkIcon,
  GitCommitIcon,
  MergeIcon,
  PullRequestIcon,
  RocketIcon,
  ShieldIcon,
  SparkleIcon,
} from "@/components/icons";

// Render dynamically (like the Floor) so the AI digest + action plan show on
// the first load after a deploy instead of the build-time "Summary" placeholder.
// The GitHub + Gemini work stays memoised in unstable_cache, so a warm load is
// just cache reads. Unknown slugs still 404 via the notFound() check below.
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const project = getProjectBySlug(slug);
  return { title: project ? project.displayName : "Project" };
}

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const project = getProjectBySlug(slug);
  if (!project) notFound();

  const snapshot = await getProjectSnapshot(project);
  const [narrative, history, valuation, actionPlan, tagline, growthSummary] =
    await Promise.all([
      getNarrative(snapshot),
      getHistory(slug),
      getValuation(snapshot),
      getActionPlan(snapshot),
      getProjectTagline(snapshot),
      getGrowthSummary(snapshot),
    ]);
  // "What the factory built" — only meaningful once flagged ready to submit.
  const launch = snapshot.readyForSubmission
    ? await getLaunchSummary(snapshot)
    : null;
  // Per-routine "last run" digest — what each scheduled routine last did. The
  // auditor rows get a plain-language AI read of their (engineer-facing) gaps.
  const [qualityAuditSummary, gtmAuditSummary] = await Promise.all([
    getScorecardSummary(snapshot.qualityScorecard, "Quality audit"),
    getScorecardSummary(snapshot.gtmScorecard, "GTM audit"),
  ]);
  const routineRunSummaries = buildRoutineRunSummaries(
    snapshot,
    narrative,
    growthSummary,
    { quality: qualityAuditSummary, gtm: gtmAuditSummary },
  );

  const pct = headlinePct(snapshot);
  // Progress is positive by default; only a blocked project gets the clay ring.
  const ringTone = snapshot.status === "blocked" ? "clay" : "sage";
  const milestone = nextMilestone(snapshot);
  const blockReason = describeBlock(snapshot);
  const themes = extractThemes(snapshot.merged7dItems);
  const focus = themeSummary(themes);
  // Coarse work-type split of the last 7 days of PRs (the donut). Total is the
  // bucket sum so the slices add up to the number in the hole.
  const projectMix = bucketThemes(themes);
  const projectMixTotal = projectMix.reduce((n, b) => n + b.count, 0);
  const quality = qualitySignals(snapshot.merged7dItems, snapshot.ci);
  const eta = estimateCompletion(snapshot, history);
  const prog = snapshot.progress;
  const delta = projectDelta(snapshot, history);
  // Trajectories for the point-in-time blocks (from KV history; [] without it).
  const arrTrend = history?.map((h) => h.arr ?? null) ?? [];
  const retentionTrend = history?.map((h) => h.pmfRetentionD7 ?? null) ?? [];
  const loopSignalTrend = history?.map((h) => h.loopSignal ?? null) ?? [];
  // This product's own merged-PRs-per-day — the within-product activity trend
  // for the cost panel (lights up when KV history is wired; [] otherwise).
  const mergedTrend = history?.map((h) => h.prs ?? null) ?? [];
  // The project's autonomous routines + their next runs — from the authoritative
  // cron schedule (config/routines.ts), computed live in UTC (never cached).
  const routineRuns = runsFor(routinesForSlug(slug));
  // The project pulse: the most recent PR it shipped + the next routine to fire.
  const lastPr = snapshot.recentMerged[0] ?? null;
  const lastRunSummary = lastPr
    ? await getLastRunSummary(lastPr, snapshot)
    : null;
  const soonestRoutine = soonestRun(routineRuns);
  // Scheduled-run workload (the activity-as-cost proxy's backbone) — runs/week
  // per routine, computed live from the same authoritative cron schedule.
  const workload = workloadFor(routinesForSlug(slug));
  // Independent-auditor gap issues, split by auditor (product `quality:` vs `gtm-quality:`).
  const qualityGaps = snapshot.attentionIssues.filter((a) => a.kind === "quality");
  const gtmQualityGaps = snapshot.attentionIssues.filter((a) => a.kind === "gtm_quality");
  const hasScorecards =
    snapshot.qualityScorecard.available || snapshot.gtmScorecard.available;
  const fileHref = (path?: string): string | undefined =>
    path ? `${snapshot.repoUrl}/blob/${snapshot.workingBranch}/${path}` : undefined;
  const preflightUrl = snapshot.files.preflight.available
    ? fileHref("scripts/preflight.sh")
    : undefined;

  const projectFeed: FeedEntry[] = snapshot.merged7dItems.map((pr) => ({
    ...pr,
    projectSlug: snapshot.slug,
    projectName: snapshot.displayName,
    ci: snapshot.ci.status,
  }));
  const dayAgo = Date.now() - 24 * 3_600_000;
  const shipped24h = projectFeed.filter(
    (e) => e.mergedAt && Date.parse(e.mergedAt) >= dayAgo,
  );
  const shippedList = shipped24h.length > 0 ? shipped24h : projectFeed.slice(0, 6);

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="mb-6">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-clay"
        >
          <ArrowLeftIcon className="h-4 w-4" />
          Factory Floor
        </Link>
        <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="font-serif text-3xl font-medium tracking-tight text-ink">
                {snapshot.displayName}
              </h1>
              <StatusBadge status={snapshot.status} />
            </div>
            {tagline && (
              <p className="mt-1.5 max-w-xl text-[15px] leading-snug text-muted">
                {tagline}
              </p>
            )}
            {narrative.headline && (
              <p className="mt-1.5 font-serif text-lg italic text-muted">
                {narrative.headline}
              </p>
            )}
            <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
              <span>{kindLabel(snapshot.kind)}</span>
              <span aria-hidden>·</span>
              <a
                href={snapshot.branchUrl}
                target="_blank"
                rel="noreferrer"
                title={snapshot.workingBranch}
                className="max-w-[12rem] truncate font-mono transition-colors hover:text-clay"
              >
                {snapshot.workingBranch}
              </a>
              {/* The dashboard reads THIS branch, which for some projects isn't
                  the repo default — surface that so it's auditable (a factory
                  that repoints would otherwise silently read a stale branch). */}
              {snapshot.repoMeta.defaultBranch &&
                snapshot.workingBranch !== snapshot.repoMeta.defaultBranch && (
                  <span
                    className="text-muted"
                    title={`Reading a non-default branch — repo default is ${snapshot.repoMeta.defaultBranch}`}
                  >
                    (default:{" "}
                    <span className="font-mono">{snapshot.repoMeta.defaultBranch}</span>)
                  </span>
                )}
              {snapshot.repoMeta.visibility && (
                <>
                  <span aria-hidden>·</span>
                  <span className="capitalize">{snapshot.repoMeta.visibility}</span>
                </>
              )}
              <span aria-hidden>·</span>
              <a
                href={snapshot.repoUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 transition-colors hover:text-clay"
              >
                repo <ExternalLinkIcon className="h-3 w-3" />
              </a>
            </p>
          </div>
          <div className="text-right text-xs text-muted">
            <RelativeTime iso={snapshot.fetchedAt} prefix="Updated " />
          </div>
        </div>
      </div>

      {/* Ready-to-ship banner */}
      {snapshot.readyForSubmission && (
        <div className="mb-6 rounded-2xl border border-sage/30 bg-sage-soft/60 p-5">
          <div className="flex items-center gap-2 text-sage">
            <RocketIcon className="h-5 w-5" />
            <h2 className="font-serif text-lg font-medium">Ready for submission</h2>
          </div>
          <p className="mt-1 text-sm text-ink">
            The agent flagged this project ready to ship — it cleared the
            mechanical pre-flight and an adversarial readiness audit. The proof
            is below; the human-core checklist takes it over the line.
          </p>
          {snapshot.readyEvidence && (
            <ReadyEvidenceView
              evidence={snapshot.readyEvidence}
              issueUrl={snapshot.ready.url}
            />
          )}
          <div className="mt-4">
            {snapshot.ready.checklist.length > 0 ? (
              <ActionItemsPanel
                info={{ available: true, items: snapshot.ready.checklist }}
                storageKey={`afd-ready-${slug}`}
                accent="sage"
              />
            ) : (
              <a
                href={snapshot.ready.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-sage-strong hover:underline"
              >
                Open the submission issue <ExternalLinkIcon className="h-3.5 w-3.5" />
              </a>
            )}
          </div>
        </div>
      )}

      {/* What the factory built — completed-project summary */}
      {launch && (
        <div className="mb-6">
          <SectionCard
            elevated
            title="What the factory built"
            subtitle="Overview & shipped features"
            aside={
              <Chip tone={launch.source === "llm" ? "clay" : "muted"}>
                <SparkleIcon className="h-3 w-3" />
                {launch.source === "llm" ? "AI" : "Template"}
              </Chip>
            }
          >
            <p className="text-[15px] leading-relaxed text-ink">{launch.overview}</p>
            {launch.features.length > 0 && (
              <ul className="mt-4 grid gap-x-5 gap-y-2 sm:grid-cols-2">
                {launch.features.map((f, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-ink">
                    <CheckIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-sage" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        </div>
      )}

      {/* Hero */}
      <div className="mb-6 card flex flex-col items-center gap-6 p-6 shadow-card sm:flex-row sm:gap-8 sm:p-7">
        <ProgressRing
          value={pct}
          size={156}
          stroke={13}
          tone={ringTone}
          label="to submission-ready"
        />
        <div className="flex-1">
          {!prog.available ? (
            <p className="mb-3 text-sm text-muted">
              {prog.reason ?? "ROADMAP.md not found"}.
            </p>
          ) : (
            !prog.submissionAvailable && (
              <p className="mb-3 text-sm text-muted">
                No &ldquo;Definition of Done&rdquo; checkboxes found — submission
                readiness isn&apos;t measurable yet.
              </p>
            )
          )}
          <p className="text-xs font-medium uppercase tracking-wide text-muted">
            Next milestone
          </p>
          <p
            className="mt-1 font-serif text-2xl leading-snug text-ink"
            title={milestone ?? undefined}
          >
            {milestone
              ? milestoneTitle(milestone)
              : prog.tracks.length
                ? "All tracks complete"
                : "—"}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
            {prog.submissionAvailable && (
              <span className="inline-flex items-center gap-1 rounded-full bg-bg px-2.5 py-1 text-muted">
                Definition of Done {prog.submissionDone}/{prog.submissionTotal}
              </span>
            )}
            {eta && (
              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-medium",
                  eta.basis === "velocity"
                    ? "bg-bg text-muted"
                    : "bg-sage-soft text-sage-strong",
                )}
              >
                Est. launch {formatEtaDate(eta.date)} · {formatHorizon(eta.daysRemaining)}
                {eta.basis === "velocity" && " · rough"}
              </span>
            )}
          </div>
          {valuation.arrExpected > 0 && (
            <div className="mt-3">
              <ValuationView v={valuation} arrTrend={arrTrend} />
              {valuation.rationale && (
                <p className="mt-1 text-xs italic text-muted">{valuation.rationale}</p>
              )}
              <DemandConfidenceNote demand={snapshot.growth.demand} />
            </div>
          )}
          <p className="mt-3 border-t border-hairline pt-3 text-xs text-muted">
            Completeness, readiness, and value are three separate axes — not one score.
          </p>
          {blockReason && (
            <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-clay-soft px-2.5 py-1 text-xs font-medium text-clay-strong">
              {blockReason}
            </p>
          )}
        </div>
      </div>

      {/* Real-money GO signal + weekly PnL — only present for the quant project. */}
      {(snapshot.growth.goLive || snapshot.growth.metrics) && (
        <div className="mb-6">
          <GoLivePanel
            goLive={snapshot.growth.goLive}
            metrics={snapshot.growth.metrics}
            pnlHistory={history?.map((m) => m.pnlPaper ?? null) ?? []}
            sourceUrl={snapshot.growth.sourceUrl}
          />
        </div>
      )}

      {/* Autonomous marketing launch (§13) — opt-out gate; owner approves nothing. */}
      {snapshot.growth.marketing && (
        <div className="mb-6">
          <MarketingPanel
            marketing={snapshot.growth.marketing}
            sourceUrl={snapshot.growth.sourceUrl}
          />
        </div>
      )}

      {/* Body */}
      <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr] lg:items-start">
        {/* Main column */}
        <div className="space-y-6">
          <SectionCard
            title="Last 24 hours"
            subtitle="What the agent shipped"
            aside={
              <Chip
                tone={narrative.source === "llm" ? "clay" : "muted"}
                title={
                  narrative.source === "llm"
                    ? `Generated by ${narrative.model}`
                    : narrative.llmReason
                      ? `LLM fallback — ${narrative.llmReason}`
                      : "Templated — set GEMINI_API_KEY for AI digests"
                }
              >
                <SparkleIcon className="h-3 w-3" />
                {narrative.source === "llm" ? "AI" : "Template"}
                {narrative.source !== "llm" && narrative.llmReason && (
                  <span className="font-normal opacity-80">· {narrative.llmReason}</span>
                )}
              </Chip>
            }
          >
            <p className="text-[15px] leading-relaxed text-ink">
              {narrative.text}
            </p>
            <Delta24h
              className="mt-3"
              shipped={delta.shipped24h}
              dBuildPct={delta.dBuildPct}
              dReadinessPct={delta.dReadinessPct}
              newPendingOps={delta.newPendingOps}
              hasBaseline={delta.hasBaseline}
            />
            <div className="mt-5 border-t border-hairline pt-4">
              <Collapsible
                title={
                  shipped24h.length > 0
                    ? "Shipped · last 24h"
                    : "No merges in the last 24h · most recent"
                }
                count={shippedList.length}
                storageKey={`afd-shipped-${slug}`}
              >
                <ActivityFeed
                  entries={shippedList}
                  emptyText="No merged pull requests yet."
                />
              </Collapsible>
            </div>
          </SectionCard>

          {routineRunSummaries.length > 0 && (
            <SectionCard
              title="Routine runs"
              subtitle="What each scheduled routine last did — AI run summaries + auditor grades"
            >
              {/* The pulse first: what just shipped + what fires next. */}
              {(lastPr || soonestRoutine) && (
                <div className="mb-4 border-b border-hairline pb-4">
                  <RunPulse
                    last={
                      lastPr
                        ? {
                            summary: lastRunSummary?.text ?? lastPr.title,
                            href: lastPr.url,
                            when: lastPr.mergedAt ?? null,
                            source: lastRunSummary?.source ?? null,
                          }
                        : { summary: "Nothing shipped in the last 7 days", when: null }
                    }
                    next={
                      soonestRoutine
                        ? {
                            title: routineLabel(soonestRoutine.routine.type),
                            at: soonestRoutine.nextAt,
                            cron: soonestRoutine.routine.cron,
                          }
                        : { title: "—", at: null }
                    }
                  />
                </div>
              )}
              <RoutineRuns runs={routineRunSummaries} />
            </SectionCard>
          )}

          {themes.length > 0 && (
            <SectionCard
              title="What shipped · 7 days"
              subtitle="How the last 7 days of merged PRs split by work type"
            >
              {focus && (
                <p className="mb-4 text-sm leading-relaxed text-ink">{focus}</p>
              )}
              <PrMixDonut buckets={projectMix} total={projectMixTotal} />
              {themes.length > 1 && (
                <div className="mt-5 border-t border-hairline pt-4">
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted">
                    Detailed breakdown
                  </p>
                  <ThemeChips themes={themes} limit={10} />
                </div>
              )}
            </SectionCard>
          )}

          {actionPlan.available && (
            <SectionCard
              title="Action plan"
              subtitle="What needs you — organized from PENDING_OPS.md"
              aside={
                <Chip tone={actionPlan.source === "llm" ? "clay" : "muted"}>
                  <SparkleIcon className="h-3 w-3" />
                  {actionPlan.source === "llm" ? "AI" : "Template"}
                </Chip>
              }
            >
              <ActionPlan
                plan={actionPlan}
                storageKey={`afd-actions-${slug}`}
                sourceUrl={
                  snapshot.files.pendingOps.available
                    ? fileHref(snapshot.files.pendingOps.path)
                    : undefined
                }
              />
            </SectionCard>
          )}

          <SectionCard title="Today (live)" subtitle="Right now on the working branch">
            <div className="grid gap-x-5 gap-y-3.5 rounded-xl bg-bg px-4 py-4 sm:grid-cols-2">
              <LiveStat
                icon={<MergeIcon className="h-4 w-4" />}
                label="Merged today"
                value={snapshot.mergedToday}
              />
              <LiveStat
                icon={<MergeIcon className="h-4 w-4" />}
                label="Merged 7d"
                value={snapshot.merged7d}
              />
              <LiveStat
                icon={<GitCommitIcon className="h-4 w-4" />}
                label="Commits (25h)"
                value={snapshot.commitsToday ?? "—"}
              />
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-sm text-muted">
                  <span className="text-muted">CI</span>
                </span>
                <CIHealth ci={snapshot.ci} />
              </div>
              <LiveStat
                icon={<PullRequestIcon className="h-4 w-4" />}
                label="Open PRs"
                value={snapshot.openPRs.length}
                accent={snapshot.stuckPRs > 0 ? "clay" : undefined}
                // Avoid the confusing "1 1 stuck": when every open PR is stuck,
                // the count already says it — qualify with just "stuck". When
                // only some are, separate the two numbers with a middot.
                sub={
                  snapshot.stuckPRs === 0
                    ? undefined
                    : snapshot.stuckPRs === snapshot.openPRs.length
                      ? "stuck"
                      : `· ${snapshot.stuckPRs} stuck`
                }
              />
            </div>

            {snapshot.openPRs.length > 0 && (
              <div className="mt-4 border-t border-hairline pt-4">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
                  Open pull requests
                </p>
                <ul className="space-y-1.5">
                  {snapshot.openPRs.slice(0, 8).map((pr) => (
                    <li
                      key={pr.number}
                      className="flex items-center justify-between gap-3"
                    >
                      <a
                        href={pr.url}
                        target="_blank"
                        rel="noreferrer"
                        className="group flex min-w-0 items-center gap-2 text-sm text-ink transition-colors hover:text-clay"
                      >
                        <span className="shrink-0 text-xs tabular text-muted">
                          #{pr.number}
                        </span>
                        <span className="truncate">{pr.title}</span>
                        {pr.draft && (
                          <span className="shrink-0 rounded bg-bg px-1.5 py-0.5 text-[10px] text-muted">
                            draft
                          </span>
                        )}
                      </a>
                      <span
                        className={cn(
                          "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium tabular",
                          pr.stuck
                            ? "bg-clay-soft text-clay-strong"
                            : "bg-bg text-muted",
                        )}
                      >
                        {pr.stuck ? "stuck " : ""}
                        {formatAge(pr.ageHours)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {snapshot.lastActivityAt && (
              <p className="mt-4 text-xs text-muted">
                Last activity{" "}
                <RelativeTime iso={snapshot.lastActivityAt} className="text-ink" />
                .
              </p>
            )}
          </SectionCard>

          <SectionCard
            title="Growth & marketing"
            subtitle="From the Growth Agent (docs/growth/GROWTH_STATUS.md)"
          >
            <GrowthPanel
              growth={snapshot.growth}
              summary={growthSummary}
              waitlistDelta={delta.dWaitlist}
              mrrDelta={delta.dMrr}
              retentionTrend={retentionTrend}
            />
            {snapshot.growth.demand && (
              <div className="mt-4">
                <DemandSignalPanel demand={snapshot.growth.demand} />
              </div>
            )}
          </SectionCard>

          {(snapshot.pendingApprovals.length > 0 ||
            snapshot.approvedChannels.length > 0) && (
            <SectionCard
              title="GTM channel approvals"
              subtitle="Proposals awaiting your call + approved channels — your decision, recorded in PENDING_OPS.md"
            >
              <ChannelApprovals
                pending={snapshot.pendingApprovals}
                approved={snapshot.approvedChannels}
                actions={snapshot.actionItems.items}
                pendingOpsUrl={
                  snapshot.files.pendingOps.available
                    ? fileHref(snapshot.files.pendingOps.path)
                    : undefined
                }
              />
            </SectionCard>
          )}

          <CollapsibleSection
            title="Cost & compute"
            subtitle="Per-routine factory run cost (self-reported tokens × price table) + product inference spend"
            storageKey={`afd-cost-${slug}`}
          >
            <RunCostPanel runCost={snapshot.runCost} />
            <div className="mt-4">
              <CostPanel
                cost={snapshot.productCost}
                workload={workload}
                merged7d={snapshot.merged7d}
                loop={snapshot.loopHealth}
                mergedTrend={mergedTrend}
              />
            </div>
          </CollapsibleSection>

          {snapshot.roadmapSteers.length > 0 && (
            <CollapsibleSection
              title="Roadmap steers"
              subtitle="Recent ROADMAP / VISION changes — what the data is steering"
              storageKey={`afd-steers-${slug}`}
              aside={
                <span className="text-[11px] tabular text-muted">
                  {snapshot.roadmapSteers.length}
                </span>
              }
            >
              <RoadmapSteers steers={snapshot.roadmapSteers} />
            </CollapsibleSection>
          )}

          <CollapsibleSection
            title="Build progress"
            storageKey={`afd-build-${slug}`}
            subtitle={
              prog.buildAvailable
                ? `${prog.buildPct}% of track checkboxes done (${prog.buildDone}/${prog.buildTotal}) — distinct from submission readiness`
                : "Per-track checkboxes from the ROADMAP Track sections"
            }
          >
            {prog.buildAvailable && prog.tracks.length > 0 ? (
              <TrackBars tracks={prog.tracks} />
            ) : (
              <p className="text-sm text-muted">
                The ROADMAP Track sections have no checkboxes — build completeness
                isn&apos;t measurable. (Readiness is tracked separately, from the
                Definition of Done section.)
              </p>
            )}
            <p className="mt-4 border-t border-hairline pt-3 text-xs text-muted">
              Build completeness is distinct from submission readiness (
              {prog.submissionAvailable ? `${pct}%` : "unmeasured"}) — the
              Definition-of-Done gate.
            </p>
          </CollapsibleSection>

          <CollapsibleSection
            title="Quality signals"
            storageKey={`afd-quality-${slug}`}
            subtitle="Speed and rework, not just volume"
          >
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <QualityStat
                label="CI pass rate"
                value={quality.ciPassRate === null ? "—" : `${quality.ciPassRate}%`}
                tone={
                  quality.ciStatus === "failing"
                    ? "clay"
                    : quality.ciStatus === "passing"
                      ? "sage"
                      : "muted"
                }
              />
              <QualityStat
                label="Median merge time"
                value={formatCycle(quality.medianCycleHours)}
              />
              <QualityStat
                label="Fix rate"
                value={quality.fixRate === null ? "—" : `${quality.fixRate}%`}
                tone={quality.fixRate !== null && quality.fixRate > 40 ? "clay" : "muted"}
              />
              <QualityStat label="Reverts (7d)" value={String(quality.revertCount)} />
            </div>
            <p className="mt-3 text-xs text-muted">
              From {quality.sampleSize} merged {pluralize(quality.sampleSize, "PR")} in
              the last 7 days.
            </p>
          </CollapsibleSection>

          {hasScorecards && (
            <CollapsibleSection
              title="Quality scorecards"
              subtitle="Independent A+→F grades — product + GTM auditors (maker ≠ checker)"
              storageKey={`afd-scorecards-${slug}`}
            >
              <div className="grid gap-x-8 gap-y-6 lg:grid-cols-2">
                <div>
                  <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted">
                    Product quality
                  </p>
                  {snapshot.qualityScorecard.available ? (
                    <>
                      <QualityScorecardView
                        scorecard={snapshot.qualityScorecard}
                        fileLabel="QUALITY_SCORECARD.md"
                      />
                      <AuditorGaps issues={qualityGaps} label="Open quality-gap issues" />
                    </>
                  ) : (
                    <p className="text-sm text-muted">
                      Not graded yet — the Quality Auditor hasn&apos;t run here.
                    </p>
                  )}
                </div>
                <div className="lg:border-l lg:border-hairline lg:pl-8">
                  <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted">
                    GTM quality
                  </p>
                  {snapshot.gtmScorecard.available ? (
                    <>
                      <QualityScorecardView
                        scorecard={snapshot.gtmScorecard}
                        fileLabel="GTM_SCORECARD.md"
                      />
                      <AuditorGaps issues={gtmQualityGaps} label="Open GTM-quality-gap issues" />
                    </>
                  ) : (
                    <p className="text-sm text-muted">
                      Not graded yet — the GTM Auditor hasn&apos;t run here.
                    </p>
                  )}
                </div>
              </div>
            </CollapsibleSection>
          )}

          {history && history.length > 0 && (
            <CollapsibleSection
              title="Trends"
              subtitle="Daily history from Vercel KV"
              storageKey={`afd-trends-${slug}`}
            >
              <HistoryCharts metrics={history} />
            </CollapsibleSection>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {!snapshot.readyForSubmission && (
            <SectionCard
              title="Readiness gates"
              subtitle="What stands between here and &ldquo;ready&rdquo;"
            >
              <ReadinessGatesView
                gates={snapshot.readinessGates}
                preflightUrl={preflightUrl}
              />
              <p className="mt-4 border-t border-hairline pt-3 text-xs leading-relaxed text-muted">
                The &ldquo;ready for submission&rdquo; issue opens only when{" "}
                <code className="font-mono text-[11px]">scripts/preflight.sh</code>{" "}
                exits 0 AND ≥3 adversarial auditors find no gap. Gates the loop
                hasn&apos;t built yet read &ldquo;not yet built/run&rdquo; — not a failure.
              </p>
            </SectionCard>
          )}
          {snapshot.validator.available && (
            <SectionCard
              title="Live validation"
              subtitle="Computer-use agent drove the deployed app like a human — real flows, real findings"
            >
              <ValidatorPanel validator={snapshot.validator} />
            </SectionCard>
          )}
          <SectionCard
            title="Loop health"
            subtitle="The loop's self-report + attention signals"
          >
            {snapshot.loopHealth.available && (
              <div className="mb-4 border-b border-hairline pb-4">
                <LoopHealthPanel
                  loop={snapshot.loopHealth}
                  signalTrend={loopSignalTrend}
                />
              </div>
            )}
            <LoopHealth snapshot={snapshot} />
          </SectionCard>

          {routineRuns.length > 0 && (
            <SectionCard
              title="Run schedule"
              subtitle="When this project's autonomous routines next fire · your local time"
            >
              <RoutineSchedule runs={routineRuns} />
              <p className="mt-4 border-t border-hairline pt-3 text-[11px] leading-relaxed text-muted">
                Scheduled cloud agents. Times are shown in your local timezone (the
                schedule itself is fixed in UTC) and a run can lag its slot by a
                couple of minutes. Whether the loop is keeping pace is the liveness
                signal above. This schedule is a hand-kept mirror, reconciled{" "}
                {formatShortDate(ROUTINE_SCHEDULE_AS_OF, true)}.
              </p>
            </SectionCard>
          )}

          <SectionCard
            title="Self-validation"
            subtitle="CI gates the auditors enforce — validate-capabilities + validate-gtm"
          >
            <SelfValidationPanel sv={snapshot.selfValidation} gtm={snapshot.gtmScorecard} />
          </SectionCard>

          <CollapsibleSection
            title="Data sources"
            subtitle="What the dashboard found"
            storageKey={`afd-sources-${slug}`}
          >
            <ul className="space-y-2 text-sm">
              <FileRow
                label="ROADMAP.md"
                present={snapshot.files.roadmap.available}
                href={
                  snapshot.files.roadmap.available
                    ? fileHref(snapshot.files.roadmap.path)
                    : undefined
                }
              />
              <FileRow
                label="docs/BUSINESS_CASE.md"
                present={snapshot.files.businessCase.available}
                href={
                  snapshot.files.businessCase.available
                    ? fileHref(snapshot.files.businessCase.path)
                    : undefined
                }
              />
              <FileRow
                label="scripts/preflight.sh"
                present={snapshot.files.preflight.available}
                href={preflightUrl}
              />
              <FileRow
                label="PENDING_OPS.md"
                present={snapshot.files.pendingOps.available}
                href={
                  snapshot.files.pendingOps.available
                    ? fileHref(snapshot.files.pendingOps.path)
                    : undefined
                }
              />
              <FileRow
                label="IMPROVEMENT_LOG.md"
                present={snapshot.files.improvementLog.available}
                href={
                  snapshot.files.improvementLog.available
                    ? fileHref(snapshot.files.improvementLog.path)
                    : undefined
                }
              />
              <FileRow
                label="loop-memory"
                present={snapshot.files.loopMemory.available}
                href={
                  snapshot.files.loopMemory.available
                    ? fileHref(snapshot.files.loopMemory.path)
                    : undefined
                }
              />
            </ul>
            {snapshot.repoMeta.pushedAt && (
              <p className="mt-3 border-t border-hairline pt-3 text-xs text-muted">
                Repo last pushed{" "}
                <RelativeTime
                  iso={snapshot.repoMeta.pushedAt}
                  className="text-ink"
                />
                .
              </p>
            )}
          </CollapsibleSection>
        </div>
      </div>
    </div>
  );
}

function QualityStat({
  label,
  value,
  tone = "muted",
}: {
  label: string;
  value: string;
  tone?: "sage" | "clay" | "muted";
}) {
  const color =
    tone === "clay" ? "text-clay-strong" : tone === "sage" ? "text-sage-strong" : "text-ink";
  return (
    <div>
      <p className={cn("text-xl font-semibold tabular", color)}>{value}</p>
      <p className="mt-0.5 text-xs text-muted">{label}</p>
    </div>
  );
}

function LiveStat({
  icon,
  label,
  value,
  sub,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  sub?: string;
  accent?: "clay";
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="flex items-center gap-2 text-sm text-muted">
        <span className="text-muted">{icon}</span>
        {label}
      </span>
      <span className="text-right">
        <span
          className={cn(
            "text-lg font-semibold tabular",
            accent === "clay" ? "text-clay" : "text-ink",
          )}
        >
          {value}
        </span>
        {sub && <span className="ml-1 text-xs text-clay">{sub}</span>}
      </span>
    </div>
  );
}

function LoopHealth({ snapshot }: { snapshot: ProjectSnapshot }) {
  const live = livenessMeta(snapshot.liveness);
  const lm = snapshot.loopMemoryHealth;

  return (
    <div className="space-y-3">
      {/* Liveness — "is it still running?" at a glance. */}
      <div className="flex items-center justify-between gap-2 rounded-xl border border-hairline bg-bg px-3 py-2.5">
        <span className="flex items-center gap-2 text-sm">
          <LivenessDot liveness={snapshot.liveness} />
          <span className={cn("font-medium", toneClasses(live.tone).text)}>
            {live.label}
          </span>
        </span>
        {snapshot.liveness.stalled && (
          <span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-clay-strong">
            <AlertIcon className="h-3.5 w-3.5" /> may be stalled
          </span>
        )}
      </div>

      {/* loop-memory: the loop auditing itself. */}
      {lm.available && lm.hasAudit && (
        <div className="rounded-xl border border-hairline bg-bg px-3 py-2.5">
          <p className="flex flex-wrap items-center gap-x-1.5 text-xs font-medium text-muted">
            <ShieldIcon className="h-3.5 w-3.5" />
            Latest deep audit
            {lm.lastAuditDate && (
              <span className="tabular text-ink">· {lm.lastAuditDate}</span>
            )}
          </p>
          {lm.note && (
            <p className="mt-1 text-xs leading-snug text-muted">{lm.note}</p>
          )}
        </div>
      )}
      {lm.available && !lm.hasAudit && (
        <p className="flex items-center gap-1.5 text-xs text-muted">
          <ClockIcon className="h-3.5 w-3.5" /> No deep audit recorded in loop-memory yet.
        </p>
      )}

      {snapshot.attentionIssues.length === 0 ? (
        <p className="text-sm text-muted">
          No open harness proposals, FYIs, or blockers.
        </p>
      ) : (
        <ul className="space-y-2">
          {snapshot.attentionIssues.map((issue) => {
            const tone =
              issue.kind === "blocker"
                ? toneClasses("clay")
                : issue.kind === "harness_proposal"
                  ? toneClasses("amber")
                  : toneClasses("muted");
            const label =
              issue.kind === "harness_proposal"
                ? "Proposal"
                : issue.kind === "blocker"
                  ? "Blocker"
                  : "FYI";
            return (
              <li key={issue.number} className="flex items-start gap-2">
                <span
                  className={cn(
                    "mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium",
                    tone.badge,
                  )}
                >
                  {label}
                </span>
                <a
                  href={issue.url}
                  target="_blank"
                  rel="noreferrer"
                  className="min-w-0 text-sm text-ink transition-colors hover:text-clay"
                >
                  <span className="line-clamp-2">{cleanProposalTitle(issue.title)}</span>
                </a>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function FileRow({
  label,
  present,
  href,
}: {
  label: string;
  present: boolean;
  href?: string;
}) {
  return (
    <li className="flex items-center justify-between gap-2">
      <span className="flex items-center gap-2">
        <span
          className={cn(
            "h-2 w-2 rounded-full",
            present ? "bg-sage" : "bg-[var(--ring-track)]",
          )}
        />
        <span className={present ? "font-mono text-ink" : "font-mono text-muted"}>
          {label}
        </span>
      </span>
      {present ? (
        href ? (
          <a
            href={href}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-muted transition-colors hover:text-clay"
          >
            view
          </a>
        ) : (
          <span className="text-xs text-sage-strong">found</span>
        )
      ) : (
        <span className="text-xs text-muted">absent</span>
      )}
    </li>
  );
}
