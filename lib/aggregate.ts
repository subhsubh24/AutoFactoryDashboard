import type { FeedEntry, ProjectSnapshot } from "@/lib/types";
import type { DailyMetric } from "@/lib/kv";
import { pluralize, type Tone } from "@/lib/utils";
import { extractThemes, type ThemeCount } from "@/lib/themes";

export type NeedKind =
  | "ready"
  | "urgent_action"
  | "ci"
  | "stuck"
  | "blocker"
  | "proposal"
  | "approval"
  | "fyi"
  | "action";

export interface NeedEntry {
  id: string;
  projectSlug: string;
  projectName: string;
  text: string;
  howTo?: string;
  url?: string;
  kind: NeedKind;
  /** Lower sorts first. */
  priority: number;
  /** When a single entry collapses several sub-items (e.g. a ready checklist). */
  count?: number;
}

/** One or more owner actions sharing the same task (grouped across projects). */
export interface NeedGroup {
  id: string;
  /** Canonical action text (the shortest member's). */
  text: string;
  howTo?: string;
  /** Only meaningful for a single-member group. */
  url?: string;
  kind: NeedKind;
  priority: number;
  /** One-word category, e.g. billing / deploy / store — shared with the Action plan. */
  tag?: string;
  /** 1+ members; >1 means the same task spans several projects. */
  members: NeedEntry[];
}

/** One-word category for an owner action — same vocabulary as the Action plan. */
export function inferNeedTag(text: string): string {
  const t = text.toLowerCase();
  if (/\b(app ?store|play ?store|eas|testflight|submit|signing)\b/.test(t)) return "store";
  if (/\b(bill|spend|cost|budget|quota|cap)\b/.test(t)) return "billing";
  if (/\b(secret|api[- ]?key|token|\bauth\b|security|expose|credential)\b/.test(t)) return "security";
  if (/\b(deploy|vercel|prod|domain|\benv\b|database_url|connection)\b/.test(t)) return "deploy";
  if (/\b(ci|workflow|pipeline|e2e|lint)\b/.test(t)) return "ci";
  if (/\b(migrat|database|postgres|schema|\bdb\b)\b/.test(t)) return "data";
  if (/\b(waitlist|launch|market|email|seo|growth)\b/.test(t)) return "growth";
  return "ops";
}

export interface CIHealthSummary {
  passing: number;
  total: number;
  anyFailing: boolean;
  failingNames: string[];
  tone: Tone;
}

export interface Overview {
  totalMergedToday: number;
  totalMerged24h: number;
  /** Number of distinct projects that shipped at least one PR in the last 24h. */
  projectsShippedOvernight: number;
  /** Only the things that genuinely require the human (see HUMAN_ASK_KINDS). */
  needs: NeedEntry[];
  ci: CIHealthSummary;
  /** All merged PRs in the last 7 days, newest first. */
  feed: FeedEntry[];
  /** Merged PRs in the last ~24h, newest first — the "what shipped overnight" view. */
  overnightFeed: FeedEntry[];
  /** PRs merged per calendar day over the last 7 days (oldest → newest). */
  velocity: VelocityDay[];
  /** Total PRs merged across the velocity window. */
  velocityTotal: number;
  /** What this week's merged PRs focused on, across the whole factory. */
  themes: ThemeCount[];
  /** Mean build completeness across projects that report it, or null. */
  avgProgress: number | null;
  /** Mean submission readiness (Definition of Done) across projects, or null. */
  avgReady: number | null;
  /** Manufacturing-style performance KPIs across the whole factory. */
  factory: FactoryMetrics;
  /** The project nearest submission — highest readiness % (ready = 100). */
  closestToLaunch: { slug: string; name: string; pct: number } | null;
  /** Oldest "fetchedAt" across snapshots — drives the "updated x ago" stamp. */
  oldestFetchedAt: string | null;
  anyPartial: boolean;
}

/**
 * The day-over-day delta — the digest's real value. Compares the live snapshot
 * to the most recent KV metric from BEFORE today (the ~24h-ago baseline).
 */
export interface ProjectDelta {
  /** Whether a pre-today baseline exists (else deltas are null). */
  hasBaseline: boolean;
  baselineDate: string | null;
  shipped24h: number;
  /** current − baseline, in points; null when either side is unmeasured. */
  dBuildPct: number | null;
  dReadinessPct: number | null;
  /** current − baseline open PENDING_OPS items; null without history. */
  newPendingOps: number | null;
  /** current − baseline waitlist signups (growth); null without a baseline. */
  dWaitlist: number | null;
  /** current − baseline MRR (growth, post-launch); null without a baseline. */
  dMrr: number | null;
}

export interface FactoryDelta {
  hasBaseline: boolean;
  shipped24h: number;
  dBuildPct: number | null;
  dReadinessPct: number | null;
  newPendingOps: number | null;
}

/** Most recent recorded metric from a day before today (UTC) — the baseline. */
function baselineMetric(history: DailyMetric[] | null): DailyMetric | null {
  if (!history || history.length === 0) return null;
  const today = new Date().toISOString().slice(0, 10);
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].date < today) return history[i];
  }
  return null;
}

/** Day-over-day delta for one project (live snapshot vs ~24h-ago KV baseline). */
export function projectDelta(
  s: ProjectSnapshot,
  history: DailyMetric[] | null,
): ProjectDelta {
  const base = baselineMetric(history);
  const sub = (cur: number | null, prev: number | null | undefined): number | null =>
    cur === null || prev === null || prev === undefined ? null : cur - prev;
  const waitlistNow = s.growth.available ? s.growth.funnel.waitlistSignupsTotal : null;
  const mrrNow = s.growth.available ? s.growth.funnel.mrrUsd : null;
  return {
    hasBaseline: base !== null,
    baselineDate: base?.date ?? null,
    shipped24h: s.merged24h,
    dBuildPct: base ? sub(s.progress.buildPct, base.buildPct ?? null) : null,
    dReadinessPct: base ? sub(s.progress.percentToSubmission, base.pct) : null,
    newPendingOps:
      base && base.pendingOps !== undefined
        ? s.actionItems.items.length - base.pendingOps
        : null,
    dWaitlist: base ? sub(waitlistNow, base.waitlist ?? null) : null,
    dMrr: base ? sub(mrrNow, base.mrr ?? null) : null,
  };
}

/** Aggregate per-project deltas into a factory-wide delta. */
export function factoryDelta(deltas: ProjectDelta[]): FactoryDelta {
  const avg = (xs: (number | null)[]): number | null => {
    const v = xs.filter((n): n is number => n !== null);
    return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null;
  };
  const pendings = deltas
    .map((d) => d.newPendingOps)
    .filter((n): n is number => n !== null);
  return {
    hasBaseline: deltas.some((d) => d.hasBaseline),
    shipped24h: deltas.reduce((n, d) => n + d.shipped24h, 0),
    dBuildPct: avg(deltas.map((d) => d.dBuildPct)),
    dReadinessPct: avg(deltas.map((d) => d.dReadinessPct)),
    newPendingOps: pendings.length ? pendings.reduce((a, b) => a + b, 0) : null,
  };
}

/** The project nearest submission (highest readiness %, ready = 100). */
function closestToLaunch(
  snapshots: ProjectSnapshot[],
): Overview["closestToLaunch"] {
  let best: Overview["closestToLaunch"] = null;
  for (const s of snapshots) {
    const pct = s.readyForSubmission ? 100 : s.progress.percentToSubmission;
    if (pct === null) continue;
    if (!best || pct > best.pct) best = { slug: s.slug, name: s.displayName, pct };
  }
  return best;
}

/**
 * Manufacturing-style factory KPIs, mapped to a software factory:
 *  - throughput  → PRs merged per day (units/day off the line)
 *  - lead time   → median open→merge hours (cycle time per unit)
 *  - first-pass yield → CI pass rate (units that pass QA first time)
 *  - rework rate → share of merges that are fixes (scrap/rework)
 *  - WIP         → open PRs in flight (and how many are stalled)
 */
export interface FactoryMetrics {
  throughputPerDay: number;
  leadTimeHours: number | null;
  firstPassYield: number | null;
  reworkRate: number | null;
  wipOpen: number;
  wipStuck: number;
  activeProjects: number;
  totalProjects: number;
  /** Cumulative merged PRs across every line since the factory's first ship;
   *  null when no line could resolve its all-time count. */
  allTimePRs: number | null;
  /** How many lines contributed to `allTimePRs` (so an incomplete sum — some
   *  lines rate-limited — can be flagged rather than shown as a false total). */
  allTimePRLines: number;
  /** Earliest first-merged-PR date across the fleet — the "since" for the count. */
  firstShipAt: string | null;
}

function median(nums: number[]): number | null {
  if (nums.length === 0) return null;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

const KIND_PRIORITY: Record<NeedKind, number> = {
  ready: 0,
  urgent_action: 1,
  blocker: 2,
  ci: 3,
  stuck: 4,
  proposal: 5,
  approval: 6,
  action: 7,
  fyi: 8,
};

/**
 * The kinds that genuinely require a human: sign-off to ship, a hard blocker,
 * or red CI. Everything else (the agent's own queued ops, harness proposals,
 * FYIs, routine stuck PRs) is noise for a morning glance and is filtered out of
 * the overview. The full list still lives on each project's detail page.
 */
const HUMAN_ASK_KINDS = new Set<NeedKind>(["ready", "urgent_action", "blocker", "ci"]);

export function isHumanAsk(n: NeedEntry): boolean {
  return HUMAN_ASK_KINDS.has(n.kind);
}

/** Only the true human asks for one project (sign-off / blocker / red CI). */
export function humanAsksFor(s: ProjectSnapshot): NeedEntry[] {
  return needsFor(s).filter(isHumanAsk);
}

const OVERNIGHT_MS = 24 * 60 * 60 * 1000;

export interface VelocityDay {
  /** YYYY-MM-DD (UTC). */
  key: string;
  /** Two-letter weekday label, e.g. "Mo". */
  weekday: string;
  count: number;
}

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

/** Bucket merged PRs into the last 7 UTC calendar days (oldest → newest). */
export function weeklyVelocity(feed: FeedEntry[]): VelocityDay[] {
  const now = new Date();
  const days: VelocityDay[] = [];
  const index = new Map<string, number>();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - i),
    );
    const key = d.toISOString().slice(0, 10);
    index.set(key, days.length);
    days.push({ key, weekday: WEEKDAYS[d.getUTCDay()], count: 0 });
  }
  for (const e of feed) {
    const t = Date.parse(e.mergedAt ?? "");
    if (Number.isNaN(t)) continue;
    const key = new Date(t).toISOString().slice(0, 10);
    const i = index.get(key);
    if (i !== undefined) days[i].count += 1;
  }
  return days;
}

/** Build the cross-project "what needs you" list for one snapshot. */
export function needsFor(s: ProjectSnapshot): NeedEntry[] {
  const out: NeedEntry[] = [];
  const tag = { projectSlug: s.slug, projectName: s.displayName };

  // 1) Ready to ship. Collapsed to ONE entry — the full submission checklist
  //    lives on the project dashboard, not flooding the cross-project list.
  if (s.readyForSubmission) {
    const steps = s.ready.checklist.length;
    out.push({
      ...tag,
      id: `${s.slug}:ready`,
      text: "Ready to ship — review and submit it.",
      howTo:
        steps > 0
          ? `${steps} submission ${pluralize(steps, "step")} on the project dashboard.`
          : undefined,
      url: s.ready.url,
      kind: "ready",
      priority: KIND_PRIORITY.ready,
      count: steps,
    });
  }

  // 2) CI failing.
  if (s.ci.status === "failing") {
    out.push({
      ...tag,
      id: `${s.slug}:ci`,
      text: `CI is failing on ${s.workingBranch}.`,
      howTo: "Open the latest Actions run to see what broke.",
      url: s.ci.url,
      kind: "ci",
      priority: KIND_PRIORITY.ci,
    });
  }

  // 3) Stuck PRs (open > 12h). Cap to keep the list readable.
  for (const pr of s.openPRs.filter((p) => p.stuck).slice(0, 3)) {
    out.push({
      ...tag,
      id: `${s.slug}:stuck:${pr.number}`,
      text: `PR #${pr.number} has been open ${Math.round(pr.ageHours ?? 0)}h: ${pr.title}`,
      howTo: "Review, merge, or close it to unblock the loop.",
      url: pr.url,
      kind: "stuck",
      priority: KIND_PRIORITY.stuck,
    });
  }

  // 4) Attention issues (blocker / proposal / fyi).
  for (const issue of s.attentionIssues) {
    const kind: NeedKind =
      issue.kind === "blocker"
        ? "blocker"
        : issue.kind === "harness_proposal"
          ? "proposal"
          : "fyi";
    out.push({
      ...tag,
      id: `${s.slug}:issue:${issue.number}`,
      text: issue.title,
      howTo:
        kind === "proposal"
          ? "Harness improvement proposal — approve or decline."
          : kind === "blocker"
            ? "Flagged as a blocker."
            : "FYI from the loop.",
      url: issue.url,
      kind,
      priority: KIND_PRIORITY[kind],
    });
  }

  // 5) Explicit PENDING_OPS action items. An "urgent" owner action is a genuine
  //    human ask, so it gets a human-ask kind and surfaces in the overview.
  for (const item of s.actionItems.items) {
    const urgent = item.priority === "urgent";
    out.push({
      ...tag,
      id: `${s.slug}:action:${item.id}`,
      text: item.text,
      howTo: item.howTo,
      kind: urgent ? "urgent_action" : "action",
      priority: urgent ? KIND_PRIORITY.urgent_action : KIND_PRIORITY.action,
    });
  }

  // 6) GTM channel proposals awaiting the owner's approve/decline call.
  const pendingOpsUrl = s.files.pendingOps.available
    ? `${s.repoUrl}/blob/${s.workingBranch}/${s.files.pendingOps.path}`
    : undefined;
  for (const ap of s.pendingApprovals) {
    out.push({
      ...tag,
      id: `${s.slug}:approval:${ap.actionId}`,
      text: `Approve or decline the ${ap.channel} channel`,
      howTo: ap.thesis ?? "Review the channel proposal — approve or decline it.",
      url: pendingOpsUrl,
      kind: "approval",
      priority: KIND_PRIORITY.approval,
    });
  }

  return out;
}

function summarizeCI(snapshots: ProjectSnapshot[]): CIHealthSummary {
  const tracked = snapshots.filter((s) =>
    ["passing", "failing", "pending"].includes(s.ci.status),
  );
  const passing = tracked.filter((s) => s.ci.status === "passing").length;
  const failingNames = tracked
    .filter((s) => s.ci.status === "failing")
    .map((s) => s.displayName);
  const anyFailing = failingNames.length > 0;
  return {
    passing,
    total: tracked.length,
    anyFailing,
    failingNames,
    tone: anyFailing ? "clay" : tracked.length > 0 ? "sage" : "muted",
  };
}

// Filler words that vary between otherwise-identical owner actions — dropped so
// the same task across projects shares a signature.
const NEED_STOP = new Set([
  "the", "a", "an", "in", "on", "for", "to", "of", "and", "with", "every",
  "each", "all", "your", "hard", "now", "asap", "immediately", "daily",
  "monthly", "weekly", "api", "provider", "dashboard", "dashboards", "please",
  "ensure", "make", "sure", "across", "any", "you", "that", "this",
]);

/** A normalized keyword signature — same task → same signature, order-agnostic. */
function needSignature(text: string): string {
  return text
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ") // drop parentheticals (provider lists, notes)
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !NEED_STOP.has(w))
    .sort()
    .join(" ");
}

/**
 * Keep one member per project (the highest-priority) so a NeedGroup's `members`
 * are DISTINCT projects — a project with several owner actions that cluster to
 * the same task must not appear as multiple chips or inflate the "N projects"
 * count (that was the "HighlightMagic ×3 · 3 projects" bug).
 */
export function distinctByProject(members: NeedEntry[]): NeedEntry[] {
  const byProject = new Map<string, NeedEntry>();
  for (const m of [...members].sort((a, b) => a.priority - b.priority)) {
    if (!byProject.has(m.projectSlug)) byProject.set(m.projectSlug, m);
  }
  return [...byProject.values()];
}

/**
 * Collapse near-identical owner actions across projects into one entry — e.g.
 * the same "set API spend caps + alerts" appearing on four projects becomes a
 * single grouped card carrying all four projects. An action with a unique
 * signature stays a singleton. Sorted by priority, then by how many projects
 * each spans. Pure + order-stable (no LLM) so it's cheap and predictable.
 */
export function groupNeeds(needs: NeedEntry[]): NeedGroup[] {
  const buckets = new Map<string, NeedEntry[]>();
  for (const n of needs) {
    const sig = needSignature(n.text);
    // Need ≥2 significant words to risk grouping; else keep it unique by id.
    const key = sig.split(" ").filter(Boolean).length >= 2 ? `sig:${sig}` : `id:${n.id}`;
    const arr = buckets.get(key);
    if (arr) arr.push(n);
    else buckets.set(key, [n]);
  }

  const groups: NeedGroup[] = [];
  for (const raw of buckets.values()) {
    // A group's members are DISTINCT projects — collapse a project's several
    // same-task owner actions to one so it isn't shown (or counted) repeatedly.
    const members = distinctByProject(raw);
    if (members.length === 1) {
      const m = members[0];
      groups.push({
        id: m.id,
        text: m.text,
        howTo: m.howTo,
        url: m.url,
        kind: m.kind,
        priority: m.priority,
        tag: inferNeedTag(`${m.text} ${m.howTo ?? ""}`),
        members,
      });
      continue;
    }
    const byPriority = [...members].sort((a, b) => a.priority - b.priority);
    const canonical = [...members].sort((a, b) => a.text.length - b.text.length)[0];
    groups.push({
      id: `grp:${canonical.id}`,
      text: canonical.text,
      howTo: byPriority[0].howTo ?? canonical.howTo,
      kind: byPriority[0].kind,
      priority: Math.min(...members.map((m) => m.priority)),
      tag: inferNeedTag(`${canonical.text} ${byPriority[0].howTo ?? ""}`),
      members: byPriority,
    });
  }

  return groups.sort(
    (a, b) => a.priority - b.priority || b.members.length - a.members.length,
  );
}

// ── Owner review — the whole "what needs me" list, bucketed for a morning pass ──

/** The four kinds of owner action, in the order a morning review reads best. */
export type ReviewBucket = "urgent" | "ship" | "unblock" | "approve" | "do";

/** Which bucket each ask kind belongs to; null = informational, excluded. */
const BUCKET_OF_KIND: Record<NeedKind, ReviewBucket | null> = {
  ready: "ship",
  ci: "unblock",
  blocker: "unblock",
  stuck: "unblock",
  proposal: "approve",
  approval: "approve",
  urgent_action: "urgent",
  action: "do",
  fyi: null,
};

// Two tiers. The "Needs you" tier is time-sensitive — confirmed risks
// (urgent_action), ready-to-ship sign-offs, blockers, and quick approvals — and
// it's what the masthead badge counts. The backlog tier ("do") is the routine
// hands-on owner chores: important, but "when you can", not "right now". Keeping
// them apart stops a long chore list from inflating the "needs you now" badge.
const NEEDS_YOU_ORDER: ReviewBucket[] = ["urgent", "ship", "unblock", "approve"];
const BACKLOG_ORDER: ReviewBucket[] = ["do"];

export interface ReviewSection {
  key: ReviewBucket;
  groups: NeedGroup[];
}

export interface OwnerReview {
  /** The time-sensitive tier (urgent / ship / unblock / approve), non-empty
   *  buckets in review order — what the masthead "N need you" badge counts. */
  sections: ReviewSection[];
  /** Count across the needs-you tier — the badge number. */
  total: number;
  /** The routine hands-on backlog (the old "do" bucket), clustered — calm and
   *  separate, so a long chore list doesn't inflate the "right now" badge. */
  backlog: NeedGroup[];
  /** Count of backlog items. */
  backlogTotal: number;
}

/**
 * Everything genuinely waiting on the owner, across all projects, clustered
 * (same task on N projects → one card) and split into two tiers: the
 * time-sensitive "Needs you" set (urgent / ship / unblock / approve — the badge
 * count) and a routine hands-on "backlog" (the do chores). A 5-minute morning
 * pass clears the first tier; the backlog is there when there's time. FYIs
 * (informational, no action) are excluded.
 */
export function buildOwnerReview(snapshots: ProjectSnapshot[]): OwnerReview {
  const entries = snapshots
    .flatMap(needsFor)
    .filter((e) => BUCKET_OF_KIND[e.kind] !== null);
  const groups = groupNeeds(entries); // clusters same task across projects, priority-sorted
  const byBucket = new Map<ReviewBucket, NeedGroup[]>();
  for (const g of groups) {
    const b = BUCKET_OF_KIND[g.kind];
    if (!b) continue;
    const arr = byBucket.get(b);
    if (arr) arr.push(g);
    else byBucket.set(b, [g]);
  }
  const sections = NEEDS_YOU_ORDER.map((key) => ({
    key,
    groups: byBucket.get(key) ?? [],
  })).filter((s) => s.groups.length > 0);
  const backlog = BACKLOG_ORDER.flatMap((key) => byBucket.get(key) ?? []);
  return {
    sections,
    total: sections.reduce((n, s) => n + s.groups.length, 0),
    backlog,
    backlogTotal: backlog.length,
  };
}

export function buildOverview(snapshots: ProjectSnapshot[]): Overview {
  // Only the true human asks make it to the overview — the rest is noise for a
  // morning glance and stays on the per-project pages.
  const needs = snapshots
    .flatMap(needsFor)
    .filter(isHumanAsk)
    .sort((a, b) =>
      a.priority !== b.priority
        ? a.priority - b.priority
        : a.projectName.localeCompare(b.projectName),
    );

  const feed: FeedEntry[] = snapshots
    .flatMap((s) =>
      s.merged7dItems.map((pr) => ({
        ...pr,
        projectSlug: s.slug,
        projectName: s.displayName,
        ci: s.ci.status,
      })),
    )
    .sort((a, b) => Date.parse(b.mergedAt ?? "") - Date.parse(a.mergedAt ?? ""));

  const cutoff = Date.now() - OVERNIGHT_MS;
  const overnightFeed = feed.filter((e) => {
    const t = Date.parse(e.mergedAt ?? "");
    return !Number.isNaN(t) && t >= cutoff;
  });

  const velocity = weeklyVelocity(feed);
  const velocityTotal = velocity.reduce((n, d) => n + d.count, 0);

  const allMerged = snapshots.flatMap((s) => s.merged7dItems);
  const themes = extractThemes(allMerged);
  const mean = (xs: number[]): number | null =>
    xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null;
  const avgReady = mean(
    snapshots
      .map((s) => s.progress.percentToSubmission)
      .filter((n): n is number => n !== null),
  );
  const avgBuild = mean(
    snapshots.map((s) => s.progress.buildPct).filter((n): n is number => n !== null),
  );
  // "Build progress" KPI uses build completeness; readiness is shown elsewhere.
  const avgProgress = avgBuild;

  // Factory KPIs.
  const cycles = allMerged
    .map((p) => {
      if (!p.createdAt || !p.mergedAt) return null;
      const dt = Date.parse(p.mergedAt) - Date.parse(p.createdAt);
      return Number.isNaN(dt) || dt < 0 ? null : dt / 3_600_000;
    })
    .filter((n): n is number => n !== null);
  const passRates = snapshots
    .map((s) => s.ci.passRate)
    .filter((n): n is number => n !== null);
  const fixes = themes.find((t) => t.key === "fix")?.count ?? 0;
  // Lifetime output: sum the per-line all-time counts that resolved (search is
  // rate-limited, so some may be null), and note how many contributed so a
  // partial sum can be flagged rather than shown as a false grand total.
  const allTimeCounts = snapshots
    .map((s) => s.allTimeMerged)
    .filter((n): n is number => n !== null);
  const allTimePRs = allTimeCounts.length
    ? allTimeCounts.reduce((a, b) => a + b, 0)
    : null;
  const firstShipAt = snapshots.reduce<string | null>((acc, s) => {
    const d = s.firstMergedAt;
    if (!d) return acc;
    if (!acc) return d;
    return Date.parse(d) < Date.parse(acc) ? d : acc;
  }, null);
  const factory: FactoryMetrics = {
    throughputPerDay: Math.round((velocityTotal / 7) * 10) / 10,
    leadTimeHours: median(cycles),
    firstPassYield: passRates.length
      ? Math.round(passRates.reduce((a, b) => a + b, 0) / passRates.length)
      : null,
    reworkRate: allMerged.length
      ? Math.round((fixes / allMerged.length) * 100)
      : null,
    wipOpen: snapshots.reduce((n, s) => n + s.openPRs.length, 0),
    wipStuck: snapshots.reduce((n, s) => n + s.stuckPRs, 0),
    activeProjects: snapshots.filter(
      (s) => s.status === "building" || s.merged24h > 0,
    ).length,
    totalProjects: snapshots.length,
    allTimePRs,
    allTimePRLines: allTimeCounts.length,
    firstShipAt,
  };

  const oldestFetchedAt = snapshots.reduce<string | null>((acc, s) => {
    if (!acc) return s.fetchedAt;
    return Date.parse(s.fetchedAt) < Date.parse(acc) ? s.fetchedAt : acc;
  }, null);

  return {
    totalMergedToday: snapshots.reduce((n, s) => n + s.mergedToday, 0),
    totalMerged24h: snapshots.reduce((n, s) => n + s.merged24h, 0),
    projectsShippedOvernight: snapshots.filter((s) => s.merged24h > 0).length,
    needs,
    ci: summarizeCI(snapshots),
    feed,
    overnightFeed,
    velocity,
    velocityTotal,
    themes,
    avgProgress,
    avgReady,
    factory,
    closestToLaunch: closestToLaunch(snapshots),
    oldestFetchedAt,
    anyPartial: snapshots.some((s) => s.partial),
  };
}
