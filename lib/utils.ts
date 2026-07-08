import type { CIStatus, Liveness, ProjectSnapshot, ProjectStatus } from "@/lib/types";
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

/**
 * The absolute scheduled time with a weekday for context, e.g. "Mon, 2:00 PM EDT".
 * Pairs with relativeTime for "Mon, 2:00 PM EDT · in 3h".
 *
 * `local` picks the timezone:
 *  - false (default) → canonical UTC ("Mon, 14:00 UTC"). Deterministic, so it's
 *    what the server and the first client paint render (no hydration mismatch).
 *  - true → the viewer's own timezone + locale conventions (12h/24h). Browser
 *    only — call it after mount, never during SSR (the server has no viewer TZ).
 * Either way the time carries its zone label, so it's never ambiguous.
 */
export function formatRunClock(iso: string | null | undefined, local = false): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  if (local) {
    return d.toLocaleString(undefined, {
      weekday: "short",
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short",
    });
  }
  return d.toLocaleString("en-US", {
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: "UTC",
    timeZoneName: "short",
  });
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

/** Compact money, e.g. $0, $4k, $120k, $1.2M. For ARR/valuation headlines. */
export function formatMoney(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "$0";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1000)}k`;
  return `$${Math.round(n)}`;
}

/**
 * Precise USD for small figures — cost, CAC, budgets: cents under $1k, $Nk above.
 * Currency-aware (non-USD → trailing code). null/NaN → "—". Distinct from
 * formatMoney, which rounds hard for ARR/valuation headlines.
 */
export function formatUsd(n: number | null | undefined, currency = "USD"): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  const body =
    n >= 1000
      ? `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1)}k`
      : Number.isInteger(n)
        ? `${n}`
        : n.toFixed(2);
  return currency === "USD" ? `$${body}` : `${body} ${currency}`;
}

/** Short UTC date — "Jun 30" or (withYear) "Jun 30, 2026". Bad/empty → null. */
export function formatShortDate(
  iso: string | null | undefined,
  withYear = false,
): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(withYear ? { year: "numeric" } : {}),
    timeZone: "UTC",
  });
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
      return { text: "text-sage-strong", badge: "bg-sage-soft text-sage-strong", dot: "bg-sage" };
    case "amber":
      return { text: "text-amber-strong", badge: "bg-amber-soft text-amber-strong", dot: "bg-amber" };
    case "clay":
      return { text: "text-clay-strong", badge: "bg-clay-soft text-clay-strong", dot: "bg-clay" };
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
}

/**
 * Coarse status label + tone. NOTE: "building" reads as "In progress", not
 * "Building" — the factory is a scheduled loop (every ~6h) that's idle between
 * runs, so a present-tense "building" (and a pulsing dot) would imply real-time
 * work it isn't doing. Real recency is the separate, time-accurate liveness
 * signal (livenessMeta) — "shipped 1h ago" / "slowing" / "stalled".
 */
export function statusMeta(status: ProjectStatus): StatusMeta {
  switch (status) {
    case "ready":
      return { label: "Ready to ship", tone: "sage" };
    case "building":
      return { label: "In progress", tone: "amber" };
    case "blocked":
      return { label: "Needs you", tone: "clay" };
    default:
      return { label: "Idle", tone: "muted" };
  }
}

/** Short human reason behind a "blocked" status (CI red or an explicit blocker). */
export function describeBlock(s: ProjectSnapshot): string | null {
  if (s.status !== "blocked") return null;
  const reasons: string[] = [];
  if (s.ci.status === "failing") reasons.push("CI failing");
  const blockers = s.attentionIssues.filter((a) => a.kind === "blocker").length;
  if (blockers > 0) reasons.push(`${blockers} ${pluralize(blockers, "blocker")}`);
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

/**
 * Strip the "loop: harness improvement proposal —" boilerplate from a harness
 * proposal issue title so the UI shows the actual ask, not a doubled label
 * (the proposal type is already conveyed by its badge/icon). Non-matching
 * titles pass through unchanged.
 */
export function cleanProposalTitle(title: string): string {
  const cleaned = title
    .replace(
      /^\s*(?:loop\s*:\s*)?harness(?:\s+improvement)?\s+proposal\s*[—–:-]*\s*/i,
      "",
    )
    .trim();
  return cleaned || title;
}

/**
 * A short, glanceable milestone title for the hero. Roadmap checkbox items can
 * be long run-ons (and we only capture the first physical line, so they can end
 * mid-sentence) — so take the first real sentence (keeping a leading "A5."/"P0."
 * id), else clip at a word boundary with an ellipsis. Never cuts mid-word.
 */
export function milestoneTitle(s: string, max = 120): string {
  const t = s.replace(/\s+/g, " ").trim();
  // Strip a leading id like "A5." or "P0)" so the first period isn't mistaken
  // for a sentence end.
  const idMatch = t.match(/^([A-Za-z]?\d+[.)])\s+/);
  const id = idMatch ? idMatch[0] : "";
  const body = t.slice(id.length);
  const sentence = body.match(/^(.*?[.!?])(?:\s|$)/);
  let out =
    sentence && sentence[1].trim().length >= 10 ? id + sentence[1] : t;
  if (out.length > max) {
    out = `${out.slice(0, max).replace(/\s+\S*$/, "").trim()}…`;
  }
  return out.trim();
}

/**
 * The opening of a longer narrative, clipped to whole sentences within a
 * character budget — so a tile teaser always ends on a period, never mid-
 * sentence (which is what a CSS line-clamp does). Returns the whole string when
 * it's already within budget; only falls back to a word-boundary ellipsis if
 * the very first sentence alone exceeds the budget.
 */
export function leadSentences(text: string | null | undefined, maxChars = 180): string {
  if (!text) return "";
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= maxChars) return t;
  const sentences = t.match(/[^.!?]+[.!?]+(?:\s|$)/g) ?? [];
  let out = "";
  for (const s of sentences) {
    if (out && (out + s).trim().length > maxChars) break;
    out += s;
  }
  out = out.trim();
  if (!out) out = `${t.slice(0, maxChars).replace(/\s+\S*$/, "").trim()}…`;
  return out;
}

/** The next concrete thing — first unchecked item (full), else lowest-% track. */
export function nextMilestone(s: ProjectSnapshot): string | null {
  if (s.progress.nextItem) return s.progress.nextItem;
  const incomplete = s.progress.tracks.filter((t) => t.pct < 100);
  if (incomplete.length === 0) return null;
  incomplete.sort((a, b) => a.pct - b.pct);
  return incomplete[0].label;
}

/**
 * A SHORT milestone label for embedding in one-line digests — the lowest-%
 * incomplete track ("Track A"), else a concise readiness phrase. Never a long
 * checkbox sentence, so digests don't truncate mid-thought.
 */
export function nextMilestoneShort(s: ProjectSnapshot): string | null {
  const incomplete = s.progress.tracks.filter((t) => t.pct < 100);
  if (incomplete.length > 0) {
    incomplete.sort((a, b) => a.pct - b.pct);
    return incomplete[0].label;
  }
  if (s.progress.submissionAvailable && (s.progress.percentToSubmission ?? 0) < 100) {
    return "the Definition of Done";
  }
  return null;
}

export interface LivenessMeta {
  label: string;
  tone: Tone;
  /** Pulse the dot when the loop is actively shipping. */
  pulse: boolean;
}

/** Liveness → a label + tone for the green/amber/red "is it running?" dot. */
export function livenessMeta(l: Liveness): LivenessMeta {
  const ago = l.hoursSinceShip === null ? null : formatAge(l.hoursSinceShip);
  switch (l.level) {
    case "fresh":
      return { label: ago ? `shipped ${ago} ago` : "shipping", tone: "sage", pulse: true };
    case "slow":
      return { label: ago ? `${ago} since a ship` : "slowing", tone: "amber", pulse: false };
    case "stalled":
      return {
        label: ago ? `stalled · ${ago} since a ship` : "may be stalled",
        tone: "clay",
        pulse: false,
      };
    default:
      return { label: "no recent ship", tone: "muted", pulse: false };
  }
}

/** Headline % = submission readiness (Definition of Done), or null if unmeasured. */
export function headlinePct(s: ProjectSnapshot): number | null {
  return s.progress.percentToSubmission;
}

/**
 * Allow only http(s) URLs through to an `href`. Repo docs — and especially the
 * demand-signal "sources", which are mined from public forums — can carry a
 * `javascript:` (or `data:`) URL, and React does NOT sanitize hrefs; a scheme
 * allowlist at parse time is the fix. Returns undefined for anything unsafe or
 * unparseable, so callers can drop the link entirely.
 */
export function safeHttpUrl(u?: string | null): string | undefined {
  if (!u) return undefined;
  try {
    const { protocol } = new URL(u.trim());
    return protocol === "https:" || protocol === "http:" ? u.trim() : undefined;
  } catch {
    return undefined;
  }
}

/** First sentence of a string (whitespace-collapsed), clipped at a word boundary. */
export function firstSentence(s: string, max = 180): string {
  const t = s.replace(/\s+/g, " ").trim();
  const m = t.match(/^(.*?[.!?])(?:\s|$)/);
  const out = m ? m[1] : t;
  return out.length > max ? `${out.slice(0, max).replace(/\s+\S*$/, "").trim()}…` : out;
}
