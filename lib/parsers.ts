import type {
  ActionItem,
  ActionItemsInfo,
  ProgressInfo,
  SubTrack,
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

// A roadmap sub-track line: optional bullet/checkbox, then a code (A1, B2, D3,
// P0…), then its label. Matches both "- [ ] A1. …" and plain "- A1. …".
const SUBTRACK_LINE_RE =
  /^\s*(?:[-*+]\s+)?(?:\[[ xX~/-]\]\s+)?((?:P[0-9])|(?:[A-E][0-9]{1,2}))[.):]?\s+(\S.*)$/;

const TRACK_CODE_RE = /\b((?:P[0-9])|(?:[A-E][0-9]{1,2}))\b/g;

/** Sort track codes naturally: P-phases first, then A1, A2, …, B1, … */
function compareCodes(a: string, b: string): number {
  const pa = a.startsWith("P");
  const pb = b.startsWith("P");
  if (pa !== pb) return pa ? -1 : 1;
  if (a[0] !== b[0]) return a[0] < b[0] ? -1 : 1;
  return (parseInt(a.slice(1), 10) || 0) - (parseInt(b.slice(1), 10) || 0);
}

/** All distinct track codes (A1, B2, D3, P0…) referenced in a blob of text. */
export function extractTrackCodes(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(TRACK_CODE_RE)) out.add(m[1].toUpperCase());
  return [...out];
}

const DONE_WORD_RE = /\b(done|complete[d]?|shipped|staged|live|landed|finished)\b/i;
const NOT_DONE_RE =
  /\b(pending|todo|to-do|in[\s-]?progress|wip|not\s+done|blocked|planned|upcoming|backlog)\b/i;

/**
 * Codes the roadmap *annotates* as done. The loop records progress in inline
 * notes like "[B1 done; B3 done (PR #29); B4-B5 pending]" rather than ticking
 * checkboxes, so we split into clauses and keep codes in any "done"-ish clause.
 */
export function extractDoneAnnotations(md: string | null | undefined): string[] {
  if (!md) return [];
  const out = new Set<string>();
  for (const clause of md.split(/[;\n]/)) {
    if (!DONE_WORD_RE.test(clause) || NOT_DONE_RE.test(clause)) continue;
    for (const c of extractTrackCodes(clause)) out.add(c);
  }
  return [...out];
}

/**
 * Codes the roadmap explicitly annotates as NOT done ("B4-B5 pending", "C1 in
 * progress"). Used to keep a merely-PR-touched sub-track from counting as done
 * when the agent says it isn't — improves accuracy of the headline %.
 */
export function extractPendingAnnotations(md: string | null | undefined): string[] {
  if (!md) return [];
  const out = new Set<string>();
  for (const clause of md.split(/[;\n]/)) {
    if (!NOT_DONE_RE.test(clause) || DONE_WORD_RE.test(clause)) continue;
    for (const c of extractTrackCodes(clause)) out.add(c);
  }
  return [...out];
}

export function parseRoadmap(md: string | null | undefined): ProgressInfo {
  if (!md || !md.trim()) {
    return {
      available: false,
      reason: "ROADMAP.md not found",
      percentToSubmission: null,
      overallPct: null,
      tracks: [],
      subtracks: [],
      gateDone: 0,
      gateTotal: 0,
      method: "none",
    };
  }

  const ls = lines(md);

  // Definition of Done → launch-gate box count (kept separate from progress;
  // these stay all-unchecked until the very end, so they're a gate not a %).
  const dod = findSection(md, (t) => /definition of done/i.test(t));
  const gate = dod ? countCheckboxes(dod.body) : { done: 0, total: 0 };

  // Sub-tracks: prefer coded lines that also give us a label (A1, B2…). But some
  // roadmaps don't use a parseable bullet format, yet still reference the codes
  // (in track text, the DoD, or annotations) — so we fold in EVERY code that
  // appears anywhere as the universe. This keeps progress from reading 0% just
  // because the bullet style differs across repos.
  const labels = new Map<string, string>();
  let inFence = false;
  for (const line of ls) {
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const m = SUBTRACK_LINE_RE.exec(line);
    if (!m) continue;
    const code = m[1].toUpperCase();
    if (!labels.has(code)) {
      labels.set(code, cleanHeading(m[2]).replace(/\s*\*\*.*$/, "").trim());
    }
  }
  const codes = [...new Set([...labels.keys(), ...extractTrackCodes(md)])];
  codes.sort(compareCodes);
  const subtracks: SubTrack[] = codes.map((code) => ({
    code,
    track: code.startsWith("P") ? code : code[0],
    label: labels.get(code) ?? "",
    done: false,
  }));

  // Whole-file checkbox % (fallback when there are no coded sub-tracks).
  const overall = countCheckboxes(ls);
  const overallPct = overall.total > 0 ? pct(overall.done, overall.total) : null;

  return {
    available: true,
    percentToSubmission: null, // filled by finalizeProgress()
    overallPct,
    tracks: [],
    subtracks,
    gateDone: gate.done,
    gateTotal: gate.total,
    method: "none",
  };
}

/**
 * Apply coverage: mark sub-tracks done (from annotations + merged-PR codes),
 * compute per-track bars and the headline %. Falls back to the checkbox % when
 * a roadmap has no coded sub-tracks.
 */
export function finalizeProgress(
  base: ProgressInfo,
  doneCodes: Set<string>,
): ProgressInfo {
  if (!base.available) return base;

  if (base.subtracks.length === 0) {
    return {
      ...base,
      percentToSubmission: base.overallPct,
      method: base.overallPct !== null ? "checkbox" : "none",
    };
  }

  const subtracks = base.subtracks.map((s) => ({
    ...s,
    done: doneCodes.has(s.code),
  }));

  const byTrack = new Map<string, SubTrack[]>();
  for (const s of subtracks) {
    const arr = byTrack.get(s.track) ?? [];
    arr.push(s);
    byTrack.set(s.track, arr);
  }
  const tracks: TrackProgress[] = [...byTrack.entries()]
    .map(([track, arr]) => {
      const done = arr.filter((s) => s.done).length;
      return {
        label: track.startsWith("P") ? track : `Track ${track}`,
        done,
        total: arr.length,
        pct: pct(done, arr.length),
      };
    })
    .sort((a, b) => a.label.localeCompare(b.label));

  const done = subtracks.filter((s) => s.done).length;

  return {
    ...base,
    subtracks,
    tracks,
    percentToSubmission: pct(done, subtracks.length),
    method: "coverage",
  };
}

/** Strip trailing checkbox counters / emojis / "(added …)" from a heading. */
function cleanHeading(text: string): string {
  return text
    .replace(/^#+\s*/, "")
    .replace(/\s*\(\d+\s*\/\s*\d+\)\s*$/, "")
    .replace(/\s*\((?:added|applied)[^)]*\)\s*$/i, "")
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

function makeItem(
  text: string,
  i: number,
  howTo?: string,
  raw = false,
): ActionItem {
  return {
    id: `pending:${i}`,
    text: text.replace(/\s+/g, " ").trim(),
    howTo: howTo?.trim() || undefined,
    source: "pending_ops",
    raw,
  };
}

function clip(s: string, n = 140): string {
  const t = s.trim();
  return t.length > n ? `${t.slice(0, n)}…` : t;
}

const EXCLUDED_SECTION_RE =
  /^(applied|done|completed?|production notes|for context|archive|history|changelog|notes)\b/i;

/** Line indices belonging to "Applied"/notes-style sections (to ignore). */
function excludedRanges(ls: string[], headings: Heading[]): Set<number> {
  const ex = new Set<number>();
  for (let i = 0; i < headings.length; i++) {
    if (!EXCLUDED_SECTION_RE.test(headings[i].text)) continue;
    let end = ls.length;
    for (let n = i + 1; n < headings.length; n++) {
      if (headings[n].level <= headings[i].level) {
        end = headings[n].line;
        break;
      }
    }
    for (let l = headings[i].line; l < end; l++) ex.add(l);
  }
  return ex;
}

/** First prose/bullet line beneath a heading → a "how to" hint. */
function firstProseLine(ls: string[], from: number): string | undefined {
  let inFence = false;
  for (let i = from; i < ls.length; i++) {
    const line = ls[i];
    if (HEADING_RE.test(line)) break;
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const t = line.trim();
    if (!t) continue;
    if (isBullet(t)) {
      const b = stripMarkdown(stripBullet(t));
      return b ? clip(b) : undefined;
    }
    return clip(stripMarkdown(t));
  }
  return undefined;
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
  const headings = parseHeadings(ls);

  // The real "Pending" section is a level-2+ heading starting with "pending" —
  // NOT the document title "Pending Operations", and NOT "Applied"/notes. This
  // is the fix for the title heading swallowing the whole file.
  const pendingH = headings.find(
    (h) =>
      h.level >= 2 &&
      /^pending\b/i.test(h.text) &&
      !/^pending operations\b/i.test(h.text),
  );

  let scopeLines: string[];
  let scopeHeadings: Heading[];
  const minHeadingLevel = pendingH ? pendingH.level + 1 : 2;
  if (pendingH) {
    let end = ls.length;
    for (const h of headings) {
      if (h.line > pendingH.line && h.level <= pendingH.level) {
        end = h.line;
        break;
      }
    }
    scopeLines = ls.slice(pendingH.line + 1, end);
    scopeHeadings = headings.filter(
      (h) => h.line > pendingH.line && h.line < end,
    );
  } else {
    // No explicit Pending section: whole file MINUS done/notes sections.
    const excluded = excludedRanges(ls, headings);
    scopeLines = ls.filter((_, i) => !excluded.has(i));
    scopeHeadings = headings.filter((h) => !EXCLUDED_SECTION_RE.test(h.text));
  }
  const scopeText = scopeLines.join("\n");

  if (NONE_QUEUED_RE.test(scopeText)) {
    return { available: true, items: [], note: "none queued" };
  }

  const items: ActionItem[] = [];
  const seen = new Set<string>();
  const push = (text: string, howTo?: string) => {
    const t = text.trim();
    if (!t || t.length < 3) return;
    // Skip "applied/done" notes and pure file paths / code.
    if (DONE_STATUS_RE.test(t) && !ACTION_VERB_RE.test(t)) return;
    const key = t.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    items.push(makeItem(t, items.length, howTo));
  };

  // 1) Sub-headings within scope are discrete pending ops (the dominant format:
  //    "### Mobile env vars — Supabase", "### 017_waitlist.sql").
  for (const h of scopeHeadings) {
    if (h.level < minHeadingLevel) continue;
    const title = cleanHeading(h.text);
    if (title) push(stripMarkdown(title), firstProseLine(ls, h.line + 1));
  }

  // 2) Tables whose row status looks pending.
  for (const table of parseTables(scopeLines)) {
    const statusIdx = table.headers.findIndex((h) => /status|state/i.test(h));
    const actionIdx = table.headers.findIndex((h) =>
      /action|item|task|op|description|detail|todo|what/i.test(h),
    );
    for (const row of table.rows) {
      if (row.every((c) => c === "" || /^[-—–]+$/.test(c))) continue;
      const status = statusIdx >= 0 ? row[statusIdx] ?? "" : "";
      const looksPending =
        statusIdx >= 0
          ? PENDING_STATUS_RE.test(status) && !DONE_STATUS_RE.test(status)
          : true;
      if (!looksPending) continue;
      const text =
        actionIdx >= 0 && row[actionIdx]
          ? row[actionIdx]
          : row.find((c, idx) => idx !== statusIdx && c) ?? "";
      push(stripMarkdown(text));
    }
  }

  // 3) Bullet / numbered items (skip completed checkboxes and ✅ lines).
  let inFence = false;
  for (const line of scopeLines) {
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    if (CHECKED_RE.test(line)) continue;
    if (/✅|✔️|☑️/u.test(line)) continue;
    if (isBullet(line)) {
      const text = stripMarkdown(stripBullet(line));
      if (text) push(text);
    }
  }

  if (items.length > 0) return { available: true, items };

  return { available: true, items: [], note: "No pending items detected." };
}

function stripMarkdown(s: string): string {
  return s
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1") // links → text
    .replace(/[`*]/g, "") // bold/italic/code markers — NOT underscores (snake_case)
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

/** Best-effort sub-track tag(s) for a PR from its title/body (e.g. "B2", "D2 · D3"). */
export function parseTrackFromText(
  title: string,
  body?: string | null,
): string | null {
  const codes = extractTrackCodes(`${title}\n${body ?? ""}`);
  if (codes.length > 0) return codes.slice(0, 2).join(" · ");
  const t = /\bTrack\s+([A-Z])\b/i.exec(title);
  if (t) return `Track ${t[1].toUpperCase()}`;
  return null;
}
