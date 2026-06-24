import type { PRItem } from "@/lib/types";

/**
 * Deterministic PR theme classification — answers "what did the work focus on?"
 * straight from PR titles, no LLM required. Each PR gets one PRIMARY theme
 * (highest-priority match) so counts sum to the PR total.
 */

export type ThemeKey =
  | "security"
  | "monetization"
  | "auth"
  | "store"
  | "mobile"
  | "design"
  | "tests"
  | "perf"
  | "infra"
  | "refactor"
  | "docs"
  | "fix"
  | "feature"
  | "chore";

interface ThemeDef {
  key: ThemeKey;
  label: string;
  test: RegExp;
}

// Order = priority. Domain/quality themes win over generic feat/fix/chore so the
// summary reads "auth & store work", not "features & chores".
const THEMES: ThemeDef[] = [
  { key: "security", label: "security", test: /\b(security|rls|vuln|secret|sanitiz|xss|csrf|injection|advisor|exposure|hardening|leak)\b/i },
  { key: "monetization", label: "monetization", test: /\b(subscription|paywall|billing|revenuecat|storekit|stripe|entitlement|monetiz|pricing|trial|purchase|checkout)\b/i },
  { key: "auth", label: "auth", test: /\b(auth|login|signup|sign-?in|session|oauth|password|account|sign-?up)\b/i },
  { key: "store", label: "store prep", test: /\b(store|submission|privacy|compliance|asset|screenshot|aso|listing|metadata|deletion|terms|policy|data safety|app privacy|disclosure|review guideline)\b/i },
  { key: "mobile", label: "mobile", test: /\b(mobile|expo|native|ios|android|eas|app\.json|swift|react native|haptic|deep ?link)\b/i },
  { key: "design", label: "design", test: /\b(design|\bui\b|\bux\b|brand|splash|theme|layout|polish|visual|typography|spacing|onboarding|empty state)\b/i },
  { key: "tests", label: "tests & evals", test: /\b(test|eval|spec|coverage|e2e|playwright|fixture|snapshot test)\b/i },
  { key: "perf", label: "performance", test: /\b(perf|optimi|latency|speed|throughput|cache|memoiz|bundle size)\b/i },
  { key: "infra", label: "infra", test: /\b(\bci\b|migration|supabase|deploy|infra|workflow|pipeline|\benv\b|database|schema|build|docker|config|webhook)\b/i },
  { key: "refactor", label: "refactoring", test: /\b(refactor|cleanup|clean up|rename|restructure|extract|dedupe|simplif)\b/i },
  { key: "docs", label: "docs", test: /\b(docs|readme|documentation|changelog|comment)\b/i },
  { key: "fix", label: "fixes", test: /^\s*fix|\b(bug|hotfix|patch|regression|broken|crash|revert)\b/i },
  { key: "feature", label: "features", test: /^\s*feat|\b(add|implement|introduce|new|support|build|wire)\b/i },
  { key: "chore", label: "housekeeping", test: /^\s*chore|\b(bookkeep|bump|housekeep|maintenance|chore)\b/i },
];

export interface ThemeCount {
  key: ThemeKey;
  label: string;
  count: number;
}

function classify(title: string): ThemeDef {
  for (const t of THEMES) if (t.test.test(title)) return t;
  return THEMES.find((t) => t.key === "feature")!;
}

/** Theme breakdown for a set of PRs, most common first. */
export function extractThemes(prs: PRItem[]): ThemeCount[] {
  const counts = new Map<ThemeKey, ThemeCount>();
  for (const pr of prs) {
    const def = classify(pr.title);
    const cur = counts.get(def.key);
    if (cur) cur.count++;
    else counts.set(def.key, { key: def.key, label: def.label, count: 1 });
  }
  return [...counts.values()].sort((a, b) => b.count - a.count);
}

function joinList(parts: string[]): string {
  if (parts.length <= 1) return parts.join("");
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts.slice(0, -1).join(", ")}, and ${parts[parts.length - 1]}`;
}

/**
 * One-line human summary of what a batch of PRs focused on, e.g.
 * "Mostly mobile and store-prep work, with auth and security."
 */
export function themeSummary(themes: ThemeCount[]): string | null {
  if (themes.length === 0) return null;
  const total = themes.reduce((n, t) => n + t.count, 0);
  const top = themes.slice(0, 3);
  // Lead with the dominant theme(s), mention the rest as "with …".
  const lead = top.slice(0, 2).map((t) => t.label);
  const rest = top.slice(2).map((t) => t.label);
  let s = `Mostly ${joinList(lead)} work`;
  if (rest.length) s += `, with ${joinList(rest)}`;
  s += ".";
  // Capitalize, and note breadth when very diverse.
  if (themes.length > top.length && total >= 8) {
    s = s.replace(/\.$/, `, plus ${themes.length - top.length} more.`);
  }
  return s;
}
