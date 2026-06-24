import type {
  ActionItem,
  ActionItemsInfo,
  ProgressInfo,
  TrackProgress,
} from "@/lib/types";

/**
 * Markdown parsers for the factory's "API": ROADMAP.md, PENDING_OPS.md, and
 * the "ready for submission" issue body.
 *
 * Everything here is deliberately tolerant — the three repos' markdown differs
 * slightly and files may be partially malformed. Parsers degrade to a clear
 * unavailable/partial state rather than throwing.
 */

// ────────────────────────────────────────────────────────────────────────────
// Generic markdown helpers
// ────────────────────────────────────────────────────────────────────────────

export interface Heading {
  level: number;
  text: string;
  /** Index into the line array where this heading sits. */
  line: number;
}

interface Section {
  heading: Heading;
  /** Body lines (excludes the heading line itself), up to the next sibling. */
  body: string[];
}

const HEADING_RE = /^(#{1,6})\s+(.*\S)\s*$/;
const CHECKED_RE = /^\s*[-*+]\s+\[[xX]\]/;
const UNCHECKED_RE = /^\s*[-*+]\s+\[\s\]/;

function lines(md: string): string[] {
  return md.replace(/\r\n/g, "\n").split("\n");
}

function parseHeadings(ls: string[]): Heading[] {
  const out: Heading[] = [];
  let inFence = false;
  for (let i = 0; i < ls.length; i++) {
    const line = ls[i];
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const m = HEADING_RE.exec(line);
    if (m) out.push({ level: m[1].length, text: m[2].trim(), line: i });
  }
  return out;
}

/**
 * Return the section whose heading text satisfies `match`. The body runs until
 * the next heading of the same or higher level (so nested subsections are kept).
 */
function findSection(md: string, match: (text: string) => boolean): Section | null {
  const ls = lines(md);
  const headings = parseHeadings(ls);
  for (let h = 0; h < headings.length; h++) {
    if (!match(headings[h].text)) continue;
    const start = headings[h].line + 1;
    let end = ls.length;
    for (let n = h + 1; n < headings.length; n++) {
      if (headings[n].level <= headings[h].level) {
        end = headings[n].line;
        break;
      }
    }
    return { heading: headings[h], body: ls.slice(start, end) };
  }
  return null;
}

/** Count completed vs. open task-list checkboxes in a set of lines. */
function countCheckboxes(ls: string[]): { done: number; total: number } {
  let done = 0;
  let open = 0;
  let inFence = false;
  for (const line of ls) {
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    if (CHECKED_RE.test(line)) done++;
    else if (UNCHECKED_RE.test(line)) open++;
  }
  return { done, total: done + open };
}

function pct(done: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((done / total) * 100);
}

// ────────────────────────────────────────────────────────────────────────────
// ROADMAP.md → progress
// ────────────────────────────────────────────────────────────────────────────

const TRACK_HEADING_RE = /(?:Track\s+[A-Z]\b|^P0\b)/i;

export function parseRoadmap(md: string | null | undefined): ProgressInfo {
  if (!md || !md.trim()) {
    return {
      available: false,
      reason: "ROADMAP.md not found",
      percentToSubmission: null,
      overallPct: null,
      tracks: [],
    };
  }

  // Definition of Done → percentToSubmission
  const dod = findSection(md, (t) => /definition of done/i.test(t));
  let percentToSubmission: number | null = null;
  if (dod) {
    const c = countCheckboxes(dod.body);
    percentToSubmission = c.total > 0 ? pct(c.done, c.total) : null;
  }

  // Per-track headings → tracks[]
  const ls = lines(md);
  const headings = parseHeadings(ls);
  const tracks: TrackProgress[] = [];
  for (let h = 0; h < headings.length; h++) {
    if (!TRACK_HEADING_RE.test(headings[h].text)) continue;
    const start = headings[h].line + 1;
    let end = ls.length;
    for (let n = h + 1; n < headings.length; n++) {
      if (headings[n].level <= headings[h].level) {
        end = headings[n].line;
        break;
      }
    }
    const c = countCheckboxes(ls.slice(start, end));
    // Only keep tracks that actually carry checkboxes.
    if (c.total > 0) {
      tracks.push({
        label: cleanHeading(headings[h].text),
        done: c.done,
        total: c.total,
        pct: pct(c.done, c.total),
      });
    }
  }

  // Whole-file fallback %
  const overall = countCheckboxes(ls);
  const overallPct = overall.total > 0 ? pct(overall.done, overall.total) : null;

  return {
    available: true,
    percentToSubmission,
    overallPct,
    tracks,
  };
}

/** Strip trailing checkbox counters / emojis from a heading for display. */
function cleanHeading(text: string): string {
  return text
    .replace(/^#+\s*/, "")
    .replace(/\s*\(\d+\s*\/\s*\d+\)\s*$/, "")
    .replace(/\s*[—–-]\s*\d+%\s*$/, "")
    .trim();
}

// ────────────────────────────────────────────────────────────────────────────
// PENDING_OPS.md → action items waiting on the human
// ────────────────────────────────────────────────────────────────────────────

interface MarkdownTable {
  headers: string[];
  rows: string[][];
}

function parseTables(ls: string[]): MarkdownTable[] {
  const tables: MarkdownTable[] = [];
  let i = 0;
  while (i < ls.length) {
    if (!ls[i].includes("|")) {
      i++;
      continue;
    }
    // Gather a contiguous block of pipe lines.
    const block: string[] = [];
    while (i < ls.length && ls[i].includes("|")) {
      block.push(ls[i]);
      i++;
    }
    if (block.length >= 2 && /^\s*\|?[\s:|-]+\|?\s*$/.test(block[1])) {
      const headers = splitRow(block[0]);
      const rows = block.slice(2).map(splitRow);
      tables.push({ headers, rows });
    }
  }
  return tables;
}

function splitRow(line: string): string[] {
  let s = line.trim();
  if (s.startsWith("|")) s = s.slice(1);
  if (s.endsWith("|")) s = s.slice(0, -1);
  return s.split("|").map((c) => c.trim());
}

const PENDING_STATUS_RE = /\b(todo|pending|queued|open|blocked|waiting|not\s*done|in\s*progress|action)\b/i;
const DONE_STATUS_RE = /\b(done|complete[d]?|shipped|merged|closed|n\/a|skip(?:ped)?)\b/i;
const ACTION_VERB_RE =
  /^(apply|set|create|add|configure|enable|disable|rotate|provision|grant|update|deploy|register|upload|submit|generate|run|install|connect|link|verify|confirm|review|approve)\b/i;
const NONE_QUEUED_RE = /none\s+queued|nothing\s+queued|no\s+pending|no\s+action|all\s+clear/i;

function stripBullet(line: string): string {
  return line
    .replace(/^\s*(?:[-*+]|\d+[.)])\s+/, "")
    .replace(/^\[[ xX~/-]\]\s*/, "")
    .trim();
}

function isBullet(line: string): boolean {
  return /^\s*(?:[-*+]|\d+[.)])\s+/.test(line);
}

function makeItem(text: string, i: number, raw = false): ActionItem {
  // Split an optional "— how to / via X" tail into the howTo slot.
  let howTo: string | undefined;
  let main = text.trim();
  const sep = main.match(/\s+[—–]\s+(.+)$/);
  if (sep && sep[1].length > 3) {
    howTo = sep[1].trim();
    main = main.slice(0, sep.index).trim();
  }
  return {
    id: `pending:${i}`,
    text: main.replace(/\s+/g, " "),
    howTo,
    source: "pending_ops",
    raw,
  };
}

export function parsePendingOps(md: string | null | undefined): ActionItemsInfo {
  if (md === null || md === undefined) {
    return {
      available: true,
      items: [],
      note: "PENDING_OPS.md not found — nothing waiting.",
    };
  }
  if (!md.trim()) {
    return { available: true, items: [], note: "PENDING_OPS.md is empty." };
  }

  const ls = lines(md);

  // Prefer a "Pending" section; otherwise consider the whole file.
  const pendingSection = findSection(ls.join("\n"), (t) => /pending/i.test(t));
  const scopeLines = pendingSection ? pendingSection.body : ls;
  const scopeText = scopeLines.join("\n");

  // Explicit "none queued" wins.
  if (NONE_QUEUED_RE.test(scopeText)) {
    return { available: true, items: [], note: "none queued" };
  }

  const items: ActionItem[] = [];
  const seen = new Set<string>();
  const push = (text: string, raw = false) => {
    const t = text.trim();
    if (!t || t.length < 3) return;
    const key = t.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    items.push(makeItem(t, items.length, raw));
  };

  // 1) Tables anywhere in scope whose row status looks pending.
  for (const table of parseTables(scopeLines)) {
    const statusIdx = table.headers.findIndex((h) =>
      /status|state/i.test(h),
    );
    const actionIdx = table.headers.findIndex((h) =>
      /action|item|task|op|description|detail|todo|what/i.test(h),
    );
    for (const row of table.rows) {
      if (row.every((c) => c === "" || /^[-—–]+$/.test(c))) continue;
      const status = statusIdx >= 0 ? row[statusIdx] ?? "" : "";
      const looksPending =
        statusIdx >= 0
          ? PENDING_STATUS_RE.test(status) && !DONE_STATUS_RE.test(status)
          : true; // no status column → treat listed rows as actionable
      if (!looksPending) continue;
      const text =
        actionIdx >= 0 && row[actionIdx]
          ? row[actionIdx]
          : row.find((c, idx) => idx !== statusIdx && c) ?? "";
      push(stripMarkdown(text));
    }
  }

  // 2) Bullet / numbered list items in scope (skip completed checkboxes).
  let inFence = false;
  for (const line of scopeLines) {
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    if (CHECKED_RE.test(line)) continue; // already done
    if (isBullet(line)) {
      const text = stripMarkdown(stripBullet(line));
      if (text) push(text);
    }
  }

  // 3) Imperative "apply/set/create…" lines (only when nothing structured found
  //    and we're scanning the whole file).
  if (items.length === 0 && !pendingSection) {
    for (const line of ls) {
      const t = stripMarkdown(stripBullet(line));
      if (ACTION_VERB_RE.test(t)) push(t);
    }
  }

  if (items.length > 0) {
    return { available: true, items };
  }

  // Nothing structured parsed. If there's a Pending section with prose, surface
  // it raw rather than guessing.
  if (pendingSection) {
    const raw = pendingSection.body.join("\n").trim();
    if (raw) {
      return {
        available: true,
        items: [],
        note: "Couldn't parse structured items — showing the raw Pending section.",
        rawSection: raw,
      };
    }
  }

  return { available: true, items: [], note: "No pending items detected." };
}

function stripMarkdown(s: string): string {
  return s
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1") // links → text
    .replace(/[`*_]/g, "")
    .replace(/^\s*[-—–]\s*/, "")
    .replace(/\s+/g, " ")
    .trim();
}

// ────────────────────────────────────────────────────────────────────────────
// Ready-for-submission checklist (issue body or ROADMAP "Human Core")
// ────────────────────────────────────────────────────────────────────────────

/**
 * Extract a Human-Core submission checklist. Prefers checkbox items in the
 * issue body; falls back to a ROADMAP "Human Core" section.
 */
export function parseReadyChecklist(
  issueBody: string | null | undefined,
  roadmap: string | null | undefined,
): ActionItem[] {
  const out: ActionItem[] = [];
  const collect = (ls: string[]) => {
    let inFence = false;
    for (const line of ls) {
      if (/^\s*(```|~~~)/.test(line)) {
        inFence = !inFence;
        continue;
      }
      if (inFence) continue;
      if (CHECKED_RE.test(line) || UNCHECKED_RE.test(line)) {
        const text = stripMarkdown(stripBullet(line));
        if (text)
          out.push({
            id: `human_core:${out.length}`,
            text,
            source: "human_core",
            raw: false,
          });
      }
    }
  };

  if (issueBody && issueBody.trim()) {
    collect(lines(issueBody));
  }

  if (out.length === 0 && roadmap) {
    const hc = findSection(roadmap, (t) => /human[\s-]*core/i.test(t));
    if (hc) collect(hc.body);
  }

  return out;
}

// ────────────────────────────────────────────────────────────────────────────
// Track parsing from PR titles / bodies
// ────────────────────────────────────────────────────────────────────────────

const TRACK_IN_TEXT_RE = /\bTrack\s+([A-Z])\b/i;
const P0_IN_TEXT_RE = /\bP0\b/;

/** Best-effort: which ROADMAP track a PR belongs to, from its title/body. */
export function parseTrackFromText(
  title: string,
  body?: string | null,
): string | null {
  const hay = `${title}\n${body ?? ""}`;
  const t = TRACK_IN_TEXT_RE.exec(hay);
  if (t) return `Track ${t[1].toUpperCase()}`;
  if (P0_IN_TEXT_RE.test(hay)) return "P0";
  return null;
}
