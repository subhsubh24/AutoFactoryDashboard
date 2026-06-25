/**
 * docs/BUSINESS_CASE.md → Valuation.
 *
 * The autonomous loop maintains a bottoms-up business case whose "Three
 * scenarios" section carries a final annual-revenue total per scenario. Repos
 * phrase that total two ways, both supported here:
 *
 *   AptDesignerAI   Total MRR: $8,342  →  ARR: ~$100,100/year ✓
 *   GroceryManager  | **Annual net revenue** | **$121,017** |
 *
 * We extract ONLY the money that immediately FOLLOWS the result token ("ARR" or
 * "annual (net|recurring) revenue"), and ONLY within the "Three scenarios"
 * section — never pricing ($49/mo), a monthly subtotal ($8,342 MRR), COGS,
 * marketing ($103,200/yr), a "$100K target", or competitor/TAM figures.
 * Conservative → low, Base → headline, Optimistic → high.
 *
 * If a repo's scenarios section has no machine-readable result line (e.g.
 * HighlightMagic expresses scenarios as "time to reach $100K ARR"), we return
 * null and the UI shows a clean "unparseable — see file" link rather than a
 * fabricated number.
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
}

function toNumber(numStr: string, suffix?: string): number {
  const n = parseFloat(numStr.replace(/,/g, ""));
  if (Number.isNaN(n)) return NaN;
  const mult = suffix && /m/i.test(suffix) ? 1_000_000 : suffix && /k/i.test(suffix) ? 1_000 : 1;
  return Math.round(n * mult);
}

// Money that FOLLOWS a result token on a line — the scenario's annual total.
// The token is "ARR" or "annual (net|recurring) revenue"; "Monthly net revenue"
// is intentionally NOT matched (no "annual"). The `[^$\n]{0,20}` allows ": ~",
// " | **", "= ", etc., but no intervening "$", so we bind to the result figure
// (the ARR / annual-revenue number), never an earlier dollar (MRR) on the line.
const RESULT_RE =
  /\b(?:ARR|annual\s+(?:net\s+|recurring\s+)?revenue)\b[^$\n]{0,20}\$\s?([\d][\d,]*(?:\.\d+)?)\s*([kKmM])?/i;

function resultArr(line: string): number | null {
  const m = line.match(RESULT_RE);
  if (!m) return null;
  const n = toNumber(m[1], m[2]);
  return Number.isNaN(n) || n <= 0 ? null : n;
}

const CONSERVATIVE = /conservativ|bear\b|pessimist|worst[\s-]?case|low[\s-]?case|downside|floor/i;
const OPTIMISTIC = /optimist|bull\b|best[\s-]?case|high[\s-]?case|upside|stretch|ceiling/i;
const BASE = /\bbase\b|planning|expected|realistic|likely|central|baseline|\bmid\b/i;

// Plausibility band for an indie pre-launch app's first-year ARR. A headline
// outside this is treated as a parse failure (so a stray figure can't 10× it).
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

const HEADING_RE = /^(#{1,6})\s+(.*)$/;

/**
 * Restrict parsing to the "Three scenarios" section: from the first heading
 * whose text mentions "scenario" up to the next heading of the same or higher
 * level. If there is no such heading, return every line (so a simpler file with
 * a single top-level ARR figure still parses via the fallback).
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
  // Conservative / optimistic are checked first; "base" is the residual.
  if (CONSERVATIVE.test(line)) return "low";
  if (OPTIMISTIC.test(line)) return "high";
  if (BASE.test(line)) return "expected";
  return null;
}

/**
 * Parse the three scenario annual-revenue totals. Each result line is tagged
 * with the most recent scenario label seen above it; the FIRST total per
 * scenario wins (the headline figure precedes any marketing/profit footnotes).
 */
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

  // Prefer label-mapped values; fall back to order/value only when unlabeled.
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
 * Parse docs/BUSINESS_CASE.md into a Valuation from its scenario annual-revenue
 * totals. Returns null when the scenarios section has no machine-readable result
 * line (the caller then shows a "see file" link — it never substitutes the
 * LLM/heuristic when the business-case file exists).
 */
export function parseBusinessCase(
  content: string | null | undefined,
  sourceUrl: string,
  asOf?: string,
): Valuation | null {
  if (!content || !content.trim()) return null;
  const lines = content.replace(/\r\n/g, "\n").split("\n");

  // Scope to the "Three scenarios" section so we never scrape a stray figure
  // from the revenue-model tables, marketing math, or a "$100K target" line.
  const scoped = scenariosSection(lines);

  // Primary: the labeled scenario totals. If found, it's authoritative —
  // validate (don't fall through to a looser scrape on a wild number).
  const scenarios = parseScenarios(scoped, sourceUrl, asOf);
  if (scenarios) return validate(scenarios);

  // Fallback (still result-anchored, not pricing): a single annual-revenue total
  // → base, with a conventional ×0.3 / ×3 band.
  for (const line of scoped) {
    const value = resultArr(line);
    if (value !== null) {
      return validate({
        arrLow: Math.round(value * 0.3),
        arrExpected: value,
        arrHigh: Math.round(value * 3),
        rationale: "Headline ARR target from the business case.",
        scenarioLabel: "target",
        source: "business_case",
        sourceUrl,
        asOf,
      });
    }
  }

  return null;
}
