import type { ProjectKind } from "@/config/projects";

/** Computed project state. */
export type ProjectStatus = "ready" | "blocked" | "building" | "idle";

/** Current CI state for the working branch. */
export type CIStatus = "passing" | "failing" | "pending" | "unknown" | "none";

/**
 * Every fetched/parsed field carries an `available` flag so the UI can render
 * a clear "unavailable" state instead of crashing when a call fails or a file
 * is missing.
 */
export interface Availability {
  available: boolean;
  /** Human-readable reason when `available` is false. */
  reason?: string;
}

export interface PRItem {
  number: number;
  title: string;
  url: string;
  author?: string;
  /** ISO timestamp; present for merged PRs. */
  mergedAt?: string;
  createdAt?: string;
  updatedAt?: string;
  /** Age in hours for open PRs. */
  ageHours?: number;
  /** Open PR older than the stuck threshold (12h). */
  stuck?: boolean;
  draft?: boolean;
  /** ROADMAP track parsed from the title/body, if any. */
  track?: string | null;
}

export interface TrackProgress {
  label: string;
  done: number;
  total: number;
  /** 0–100. */
  pct: number;
}

/** A single roadmap sub-track (e.g. "B2"), with its completion state. */
export interface SubTrack {
  /** Code like "A1", "B2", "D3", or "P0". */
  code: string;
  /** Track letter the sub-track belongs to ("A".."E", or "P0"). */
  track: string;
  label: string;
  /** Marked done via inline annotation or a merged PR referencing it. */
  done: boolean;
}

export type ActionSource = "pending_ops" | "issue" | "human_core";

export interface ActionItem {
  id: string;
  text: string;
  /** Optional "how to" detail surfaced beneath the item. */
  howTo?: string;
  source: ActionSource;
  /** True when this is raw fallback text rather than a cleanly parsed item. */
  raw?: boolean;
}

export type AttentionKind = "harness_proposal" | "fyi" | "blocker" | "other";

export interface AttentionIssue {
  number: number;
  title: string;
  url: string;
  kind: AttentionKind;
  createdAt?: string;
  updatedAt?: string;
}

export interface ProgressInfo extends Availability {
  /**
   * Headline build progress, 0–100. Derived from roadmap sub-track *coverage*
   * (sub-tracks shipped via PRs or marked done) rather than the all-or-nothing
   * "Definition of Done" gate, which stays 0% until launch.
   */
  percentToSubmission: number | null;
  /** Whole-file checkbox % fallback. */
  overallPct: number | null;
  tracks: TrackProgress[];
  /** All parsed roadmap sub-tracks with completion state. */
  subtracks: SubTrack[];
  /** "Definition of Done" launch-gate boxes ticked / total. */
  gateDone: number;
  gateTotal: number;
  /** How `percentToSubmission` was derived. */
  method: "coverage" | "checkbox" | "none";
}

export interface CIInfo extends Availability {
  status: CIStatus;
  /** Pass rate over recent runs, 0–100. */
  passRate: number | null;
  totalRuns: number;
  lastRunAt?: string;
  url?: string;
}

export interface ActionItemsInfo extends Availability {
  items: ActionItem[];
  /** e.g. "none queued", "PENDING_OPS.md not found". */
  note?: string;
  /** Raw "Pending" section text surfaced when parsing is ambiguous. */
  rawSection?: string;
}

export interface ReadyInfo {
  ready: boolean;
  url?: string;
  /** Human-Core submission checklist, when ready. */
  checklist: ActionItem[];
}

export interface RawFile extends Availability {
  path?: string;
  content?: string;
}

export interface RepoMeta extends Availability {
  defaultBranch?: string;
  visibility?: string;
  pushedAt?: string;
  htmlUrl?: string;
  isPrivate?: boolean;
}

/** The single typed object the whole UI renders from. */
export interface ProjectSnapshot {
  // identity
  slug: string;
  displayName: string;
  owner: string;
  repo: string;
  kind: ProjectKind;
  /** Resolved working branch (config.branch or repo default_branch). */
  workingBranch: string;
  repoUrl: string;
  branchUrl: string;

  // repo meta
  repoMeta: RepoMeta;

  // computed status
  status: ProjectStatus;
  readyForSubmission: boolean;
  ready: ReadyInfo;

  // progress
  progress: ProgressInfo;

  // PR activity
  mergedToday: number;
  merged24h: number;
  merged7d: number;
  /** All PRs merged within the last 7 days (newest first). */
  merged7dItems: PRItem[];
  /** Last 10 merged PRs (newest first). */
  recentMerged: PRItem[];
  openPRs: PRItem[];
  stuckPRs: number;

  // commits on working branch in the last ~25h
  commitsToday: number | null;

  // CI
  ci: CIInfo;

  // action items + attention
  actionItems: ActionItemsInfo;
  attentionIssues: AttentionIssue[];

  // raw factory files
  files: {
    roadmap: RawFile;
    pendingOps: RawFile;
    improvementLog: RawFile;
    loopMemory: RawFile;
  };

  // freshness
  lastActivityAt: string | null;
  /** ISO timestamp when this snapshot was computed. */
  fetchedAt: string;
  /** Non-fatal errors collected while building the snapshot. */
  errors: string[];
  /** True when any field degraded to an unavailable/partial state. */
  partial: boolean;
}

/** A single merged-PR entry in the cross-project activity feed. */
export interface FeedEntry extends PRItem {
  projectSlug: string;
  projectName: string;
  ci: CIStatus;
}
