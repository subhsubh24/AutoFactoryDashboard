import type { CIStatus, ProjectSnapshot, ProjectStatus } from "@/lib/types";
import type { ProjectKind } from "@/config/projects";

/** Join class names, dropping falsy values. */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

/** Compact relative time, e.g. "just now", "7m ago", "3h ago", "2d ago". */
export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "—";
  const diff = Date.now() - t;
  const future = diff < 0;
  const s = Math.abs(diff) / 1000;
  const fmt = (n: number, unit: string) =>
    future ? `in ${n}${unit}` : `${n}${unit} ago`;
  if (s < 45) return future ? "soon" : "just now";
  const m = s / 60;
  if (m < 60) return fmt(Math.round(m), "m");
  const h = m / 60;
  if (h < 24) return fmt(Math.round(h), "h");
  const d = h / 24;
  if (d < 7) return fmt(Math.round(d), "d");
  const w = d / 7;
  if (w < 5) return fmt(Math.round(w), "w");
  const mo = d / 30;
  if (mo < 12) return fmt(Math.round(mo), "mo");
  return fmt(Math.round(d / 365), "y");
}

/** Whole hours/days for PR ages. */
export function formatAge(hours: number | undefined): string {
  if (hours === undefined || Number.isNaN(hours)) return "—";
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))}m`;
  if (hours < 48) return `${Math.round(hours)}h`;
  return `${Math.round(hours / 24)}d`;
}

export function pluralize(n: number, one: string, many = `${one}s`): string {
  return n === 1 ? one : many;
}

export type Tone = "sage" | "amber" | "clay" | "muted";

export interface ToneClasses {
  text: string;
  badge: string;
  dot: string;
}

export function toneClasses(tone: Tone): ToneClasses {
  switch (tone) {
    case "sage":
      return { text: "text-sage", badge: "bg-sage-soft text-sage", dot: "bg-sage" };
    case "amber":
      return { text: "text-amber", badge: "bg-amber-soft text-amber", dot: "bg-amber" };
    case "clay":
      return { text: "text-clay", badge: "bg-clay-soft text-clay", dot: "bg-clay" };
    default:
      return {
        text: "text-muted",
        badge: "bg-card text-muted border border-hairline",
        dot: "bg-muted",
      };
  }
}

export interface StatusMeta {
  label: string;
  tone: Tone;
  /** True for the "building" state — UI pulses the dot. */
  live: boolean;
}

export function statusMeta(status: ProjectStatus): StatusMeta {
  switch (status) {
    case "ready":
      return { label: "Ready to ship", tone: "sage", live: false };
    case "building":
      return { label: "Building", tone: "amber", live: true };
    case "blocked":
      return { label: "Needs you", tone: "clay", live: false };
    default:
      return { label: "Idle", tone: "muted", live: false };
  }
}

/** Short human reason behind a "blocked"/"needs you" status. */
export function describeBlock(s: ProjectSnapshot): string | null {
  if (s.status !== "blocked") return null;
  const reasons: string[] = [];
  if (s.ci.status === "failing") reasons.push("CI failing");
  if (s.stuckPRs > 0)
    reasons.push(`${s.stuckPRs} stuck ${pluralize(s.stuckPRs, "PR")}`);
  if (s.attentionIssues.length > 0)
    reasons.push(
      `${s.attentionIssues.length} ${pluralize(s.attentionIssues.length, "issue")}`,
    );
  return reasons.length ? reasons.join(" · ") : "Needs attention";
}

export interface CIMeta {
  label: string;
  tone: Tone;
}

export function ciMeta(status: CIStatus): CIMeta {
  switch (status) {
    case "passing":
      return { label: "Passing", tone: "sage" };
    case "failing":
      return { label: "Failing", tone: "clay" };
    case "pending":
      return { label: "Running", tone: "amber" };
    case "none":
      return { label: "No CI", tone: "muted" };
    default:
      return { label: "Unknown", tone: "muted" };
  }
}

export function kindLabel(kind: ProjectKind): string {
  switch (kind) {
    case "ios":
      return "iOS";
    case "web":
      return "Web";
    case "mobile":
      return "Mobile";
    case "ios+web":
      return "iOS + Web";
    case "web+mobile":
      return "Web + Mobile";
    default:
      return kind;
  }
}

/** The lowest-completion incomplete track — the "next milestone". */
export function nextMilestone(s: ProjectSnapshot): string | null {
  const incomplete = s.progress.tracks.filter((t) => t.pct < 100);
  if (incomplete.length === 0) return null;
  incomplete.sort((a, b) => a.pct - b.pct);
  return incomplete[0].label;
}

/** Best single % to show for a project (DoD first, then overall). */
export function headlinePct(s: ProjectSnapshot): number | null {
  if (s.progress.percentToSubmission !== null) return s.progress.percentToSubmission;
  return s.progress.overallPct;
}
