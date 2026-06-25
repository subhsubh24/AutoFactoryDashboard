/**
 * docs/BUSINESS_CASE.md → Valuation.
 *
 * PRIMARY (authoritative): a machine-readable BUSINESS_CASE_SUMMARY block — a
 * fenced YAML block near the top of the file — e.g.
 *
 *   ```yaml
 *   # BUSINESS_CASE_SUMMARY
 *   arr_year1:
 *     conservative: 42000
 *     base: 89900
 *     optimistic: 180000
 *   planning_case: base
 *   floor_usd: 100000
 *   floor_met_year1: false
 *   time_to_floor: yr2-3
 *   as_of: 2026-06-25
 *   ```
 *
 *   headline = arr_year1[planning_case] (default base); range = conservative →
 *   optimistic; floor_usd / floor_met_year1 / time_to_floor drive a small note.
 *   When the block is present it is the ONLY source — we never mix in prose.
 *
 * FALLBACK (only when the block is absent): a tolerant scrape of the "Three
 * scenarios" section. It anchors on the result token ("ARR" or "annual
 * (net|recurring) revenue") with the dollar AFTER it, PREFERS an explicitly
 * annual "$X/year" figure and REJECTS monthly "$X/month" — so a line like
 * "ARR = $7,493 × 12 ≈ $89,900/year" reads $89,900, never the $7,493 monthly,
 * and a marketing/COGS dollar line (no result token) is ignored entirely.
 *
 * Both paths apply the sanity band ($1k–$500k headline); anything outside is a
 * parse failure, so the UI links to the file rather than show a wild number.
 */

export interface Valuation {
  arrLow: number;
  arrExpected: number;
  arrHigh: number;
  rationale: string;
  /** Which scenario the headline reflects, e.g. "base case". */
  scenarioLabel?: string;
  source: "business_case" | "llm" | "template";
  sourceUrl?: string;
  asOf?: string;
  /** Revenue "floor" target from the summary block (e.g. 100000), if stated. */
  floorUsd?: number;
  /** Whether year-1 ARR meets the floor (from the summary block). */
  floorMetYear1?: boolean;
  /** Human label for time to reach the floor, e.g. "yr2-3". */
  timeToFloor?: string;
}

function toNumber(numStr: string, suffix?: string): number {
  const n = parseFloat(numStr.replace(/,/g, ""));
  if (Number.isNaN(n)) return NaN;
  const mult = suffix && /m/i.test(suffix) ? 1_000_000 : suffix && /k/i.test(suffix) ? 1_000 : 1;
  return Math.round(n * mult);
}

/** Pull a positive dollar value out of a scalar like "$90,000", "90k", "89900". */
function parseMoneyValue(raw: string | undefined): number | null {
  if (raw == null) return null;
  const m = String(raw).match(/([\d][\d,]*(?:\.\d+)?)\s*([kKmM])?/);
  if (!m) return null;
  const n = toNumber(m[1], m[2]);
  return Number.isNaN(n) || n <= 0 ? null : n;
}

// Plausibility band for an indie pre-launch app's first-year ARR headline. A
// headline outside this is treated as a parse failure (so a stray or typo'd
// figure can't 10× it). The low/high ends may legitimately exceed it.
const PLAUSIBLE_MIN = 1_000;
const PLAUSIBLE_MAX = 500_000;

/** Enforce ordering + a plausible headline; return null if the number is wild. */
function validate(v: Valuation): Valuation | null {
  if (!(v.arrExpected > 0)) return null;
  const arrLow = Math.min(v.arrLow, v.arrExpected);
  const arrHigh = Math.max(v.arrHigh, v.arrExpected);
  if (v.arrExpected < PLAUSIBLE_MIN || v.arrExpected > PLAUSIBLE_MAX) return null;
  return { ...v, arrLow, arrHigh };
}

// ────────────────────────────────────────────────────────────────────────────
// PRIMARY — the BUSINESS_CASE_SUMMARY block
// ────────────────────────────────────────────────────────────────────────────

function unquote(s: string): string {
  return s.replace(/^["']|["']$/g, "").trim();
}

/**
 * Strip a `#` comment that sits outside quotes. Handles both a value that is
 * purely a comment ("arr_year1:   # note" → "", so the key introduces a map)
 * and a trailing comment ("false  # note" → "false"). A `#` inside quotes or
 * not preceded by whitespace (e.g. a hex color) is left alone.
 */
function stripComment(val: string): string {
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < val.length; i++) {
    const c = val[i];
    if (c === "'" && !inDouble) inSingle = !inSingle;
    else if (c === '"' && !inSingle) inDouble = !inDouble;
    else if (c === "#" && !inSingle && !inDouble && (i === 0 || /\s/.test(val[i - 1]))) {
      return val.slice(0, i).trim();
    }
  }
  return val.trim();
}

/** Parse an inline flow map like "{conservative: 38000, base: 100100}". */
function parseFlowMap(s: string): Record<string, string> {
  const inner = s.replace(/^\{/, "").replace(/\}.*$/, "");
  const out: Record<string, string> = {};
  for (const pair of inner.split(",")) {
    const m = pair.match(/^\s*([A-Za-z0-9_]+)\s*:\s*(.*?)\s*$/);
    if (m) out[m[1]] = unquote(m[2]);
  }
  return out;
}

type YamlValue = string | Record<string, string>;

/**
 * Minimal YAML-subset parser: flat `key: value` scalars plus one level of
 * nesting (an indented map, or an inline `{…}` flow map). Enough for the
 * summary block; not a general YAML parser.
 */
function parseYamlish(body: string): Record<string, YamlValue> {
  const root: Record<string, YamlValue> = {};
  let curKey: string | null = null;
  let curIndent = -1;
  for (const rawLine of body.split("\n")) {
    if (!rawLine.trim() || /^\s*#/.test(rawLine)) continue; // blanks / comments
    const indent = rawLine.length - rawLine.trimStart().length;
    const m = rawLine.trim().match(/^([A-Za-z0-9_]+)\s*:\s*(.*)$/);
    if (!m) continue;
    const key = m[1];
    const val = stripComment(m[2]); // drop inline comment (handles "key:  # note")

    if (val.startsWith("{")) {
      root[key] = parseFlowMap(val);
      curKey = null;
    } else if (val === "") {
      root[key] = {};
      curKey = key;
      curIndent = indent;
    } else if (curKey && indent > curIndent) {
      (root[curKey] as Record<string, string>)[key] = unquote(val);
    } else {
      root[key] = unquote(val);
      curKey = null;
    }
  }
  return root;
}

/** Find the fenced block that carries the summary (by marker or by arr_year1). */
function findSummaryBlock(content: string): string | null {
  const lines = content.split("\n");
  let open = false;
  let info = "";
  let body: string[] = [];
  for (const line of lines) {
    const fence = line.match(/^\s*(?:```|~~~)\s*(.*)$/);
    if (fence) {
      if (!open) {
        open = true;
        info = fence[1].trim();
        body = [];
      } else {
        const text = body.join("\n");
        if (
          /business[_\s-]?case[_\s-]?summary/i.test(info) ||
          /business_case_summary/i.test(text) ||
          /(^|\n)\s*arr_year1\s*:/i.test(text)
        ) {
          return text;
        }
        open = false;
      }
      continue;
    }
    if (open) body.push(line);
  }
  return null;
}

const PLANNING_LABEL: Record<string, string> = {
  conservative: "conservative case",
  base: "base case",
  optimistic: "optimistic case",
};

function parseSummaryBlock(
  body: string,
  sourceUrl: string,
  asOf?: string,
): Valuation | null {
  const y = parseYamlish(body);
  const arr = (typeof y.arr_year1 === "object" ? y.arr_year1 : {}) as Record<string, string>;

  const conservative = parseMoneyValue(arr.conservative);
  const base = parseMoneyValue(arr.base);
  const optimistic = parseMoneyValue(arr.optimistic);

  const planning = String(y.planning_case ?? "base").toLowerCase();
  const headline = parseMoneyValue(arr[planning]) ?? base ?? conservative ?? optimistic;
  if (headline == null) return null; // block present but no usable ARR

  const floorMetRaw = String(y.floor_met_year1 ?? "");
  const floorMetYear1 = /^(true|yes)$/i.test(floorMetRaw)
    ? true
    : /^(false|no)$/i.test(floorMetRaw)
      ? false
      : undefined;

  return validate({
    arrLow: conservative ?? headline,
    arrExpected: headline,
    arrHigh: optimistic ?? headline,
    rationale: "From the project's BUSINESS_CASE_SUMMARY block (year-1 ARR scenarios).",
    scenarioLabel: PLANNING_LABEL[planning] ?? "base case",
    source: "business_case",
    sourceUrl,
    asOf: typeof y.as_of === "string" && y.as_of ? y.as_of : asOf,
    floorUsd: parseMoneyValue(typeof y.floor_usd === "string" ? y.floor_usd : undefined) ?? undefined,
    floorMetYear1,
    timeToFloor: typeof y.time_to_floor === "string" && y.time_to_floor ? y.time_to_floor : undefined,
  });
}

// ────────────────────────────────────────────────────────────────────────────
// FALLBACK — tolerant scrape of the "Three scenarios" prose (no block present)
// ────────────────────────────────────────────────────────────────────────────

const RESULT_TOKEN_RE = /\b(?:ARR|annual\s+(?:net\s+|recurring\s+)?revenue)\b/i;
const DOLLAR_RE =
  /\$\s?([\d][\d,]*(?:\.\d+)?)\s*([kKmM])?\s*(?:\/\s*(mo|month|yr|year|annum|annual))?/gi;

/**
 * The annual result figure that FOLLOWS a result token on the line. Among the
 * dollars after the token it prefers one explicitly tagged "/year" (so a
 * monthly→annual line resolves to the annual figure) and rejects a lone
 * monthly "$X/month". A bare figure (e.g. a table cell whose label already says
 * "annual") is accepted.
 */
function resultArr(line: string): number | null {
  const tok = line.match(RESULT_TOKEN_RE);
  if (!tok) return null;
  const after = line.slice((tok.index ?? 0) + tok[0].length);

  const figures: { value: number; monthly: boolean; annual: boolean }[] = [];
  DOLLAR_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = DOLLAR_RE.exec(after))) {
    const value = toNumber(m[1], m[2]);
    if (Number.isNaN(value) || value <= 0) continue;
    const period = (m[3] ?? "").toLowerCase();
    figures.push({
      value,
      monthly: /^(mo|month)$/.test(period),
      annual: /^(yr|year|annum|annual)$/.test(period),
    });
  }
  if (figures.length === 0) return null;
  const annual = figures.find((f) => f.annual);
  if (annual) return annual.value;
  const nonMonthly = figures.find((f) => !f.monthly);
  return nonMonthly ? nonMonthly.value : null;
}

const CONSERVATIVE = /conservativ|bear\b|pessimist|worst[\s-]?case|low[\s-]?case|downside|floor/i;
const OPTIMISTIC = /optimist|bull\b|best[\s-]?case|high[\s-]?case|upside|stretch|ceiling/i;
const BASE = /\bbase\b|planning|expected|realistic|likely|central|baseline|\bmid\b/i;

const HEADING_RE = /^(#{1,6})\s+(.*)$/;

/**
 * Restrict the prose scrape to the "Three scenarios" section: from the first
 * heading mentioning "scenario" to the next heading of the same/higher level.
 * No such heading → every line (so a simpler file still parses).
 */
function scenariosSection(lines: string[]): string[] {
  let start = -1;
  let level = 0;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(HEADING_RE);
    if (m && /scenario/i.test(m[2])) {
      start = i;
      level = m[1].length;
      break;
    }
  }
  if (start === -1) return lines;

  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    const m = lines[i].match(HEADING_RE);
    if (m && m[1].length <= level) {
      end = i;
      break;
    }
  }
  return lines.slice(start, end);
}

type ScenarioKey = "low" | "expected" | "high";

function scenarioOf(line: string): ScenarioKey | null {
  if (CONSERVATIVE.test(line)) return "low";
  if (OPTIMISTIC.test(line)) return "high";
  if (BASE.test(line)) return "expected";
  return null;
}

function parseScenarios(
  lines: string[],
  sourceUrl: string,
  asOf?: string,
): Valuation | null {
  let current: ScenarioKey | null = null;
  const byLabel: Partial<Record<ScenarioKey, number>> = {};
  const allValues: number[] = [];

  for (const line of lines) {
    const label = scenarioOf(line);
    if (label) current = label;
    const value = resultArr(line);
    if (value === null) continue;
    allValues.push(value);
    if (current && byLabel[current] === undefined) byLabel[current] = value;
  }

  if (allValues.length === 0) return null;

  const sorted = [...allValues].sort((a, b) => a - b);
  let expected = byLabel.expected;
  if (expected === undefined) {
    if (allValues.length >= 3) expected = sorted[Math.floor(sorted.length / 2)];
    else if (allValues.length) expected = sorted[sorted.length - 1];
  }
  if (expected === undefined) return null;

  let low = byLabel.low ?? sorted[0];
  let high = byLabel.high ?? sorted[sorted.length - 1];
  low = Math.min(low, expected);
  high = Math.max(high, expected);

  return {
    arrLow: low,
    arrExpected: expected,
    arrHigh: high,
    rationale: "Base/planning case; range shown is conservative → optimistic.",
    scenarioLabel: "base case",
    source: "business_case",
    sourceUrl,
    asOf,
  };
}

/**
 * Parse docs/BUSINESS_CASE.md into a Valuation. The summary block is
 * authoritative when present; otherwise we fall back to the scenario prose.
 * Returns null when nothing usable is found (the caller links to the file).
 */
export function parseBusinessCase(
  content: string | null | undefined,
  sourceUrl: string,
  asOf?: string,
): Valuation | null {
  if (!content || !content.trim()) return null;
  const normalized = content.replace(/\r\n/g, "\n");

  // 1) Authoritative: the machine-readable summary block. If it's present we
  //    use ONLY it (a present-but-unusable/out-of-band block → null → "see file"
  //    link; we never silently scrape prose behind a real summary block).
  const block = findSummaryBlock(normalized);
  if (block !== null) return parseSummaryBlock(block, sourceUrl, asOf);

  // 2) No block: tolerant prose scrape, scoped to the scenarios section.
  const scoped = scenariosSection(normalized.split("\n"));
  const scenarios = parseScenarios(scoped, sourceUrl, asOf);
  if (scenarios) return validate(scenarios);

  // Single result line → base, with a conventional ×0.3 / ×3 band.
  for (const line of scoped) {
    const value = resultArr(line);
    if (value !== null) {
      return validate({
        arrLow: Math.round(value * 0.3),
        arrExpected: value,
        arrHigh: Math.round(value * 3),
        rationale: "Headline ARR from the business case.",
        scenarioLabel: "target",
        source: "business_case",
        sourceUrl,
        asOf,
      });
    }
  }

  return null;
}
