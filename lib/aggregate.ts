import type { FeedEntry, ProjectSnapshot } from "@/lib/types";
import type { Tone } from "@/lib/utils";

export type NeedKind =
  | "ready"
  | "ci"
  | "stuck"
  | "blocker"
  | "proposal"
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
  /** Oldest "fetchedAt" across snapshots — drives the "updated x ago" stamp. */
  oldestFetchedAt: string | null;
  anyPartial: boolean;
}

const KIND_PRIORITY: Record<NeedKind, number> = {
  ready: 0,
  blocker: 1,
  ci: 2,
  stuck: 3,
  proposal: 4,
  action: 5,
  fyi: 6,
};

/**
 * The kinds that genuinely require a human: sign-off to ship, a hard blocker,
 * or red CI. Everything else (the agent's own queued ops, harness proposals,
 * FYIs, routine stuck PRs) is noise for a morning glance and is filtered out of
 * the overview. The full list still lives on each project's detail page.
 */
const HUMAN_ASK_KINDS = new Set<NeedKind>(["ready", "blocker", "ci"]);

export function isHumanAsk(n: NeedEntry): boolean {
  return HUMAN_ASK_KINDS.has(n.kind);
}

/** Only the true human asks for one project (sign-off / blocker / red CI). */
export function humanAsksFor(s: ProjectSnapshot): NeedEntry[] {
  return needsFor(s).filter(isHumanAsk);
}

const OVERNIGHT_MS = 24 * 60 * 60 * 1000;

/** Build the cross-project "what needs you" list for one snapshot. */
export function needsFor(s: ProjectSnapshot): NeedEntry[] {
  const out: NeedEntry[] = [];
  const tag = { projectSlug: s.slug, projectName: s.displayName };

  // 1) Ready-to-ship submission checklist — the most important thing to do.
  if (s.readyForSubmission) {
    if (s.ready.checklist.length > 0) {
      for (const item of s.ready.checklist) {
        out.push({
          ...tag,
          id: `${s.slug}:ready:${item.id}`,
          text: item.text,
          howTo: item.howTo,
          url: s.ready.url,
          kind: "ready",
          priority: KIND_PRIORITY.ready,
        });
      }
    } else {
      out.push({
        ...tag,
        id: `${s.slug}:ready`,
        text: "Ready for submission — review and ship it.",
        url: s.ready.url,
        kind: "ready",
        priority: KIND_PRIORITY.ready,
      });
    }
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

  // 5) Explicit PENDING_OPS action items.
  for (const item of s.actionItems.items) {
    out.push({
      ...tag,
      id: `${s.slug}:action:${item.id}`,
      text: item.text,
      howTo: item.howTo,
      kind: "action",
      priority: KIND_PRIORITY.action,
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
    oldestFetchedAt,
    anyPartial: snapshots.some((s) => s.partial),
  };
}
