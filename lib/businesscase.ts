/**
 * docs/BUSINESS_CASE.md → Valuation.
 *
 * The autonomous loop maintains a bottoms-up business case whose "Three
 * scenarios" block carries a final ARR total per scenario, e.g.
 *
 *   Scenario A — Conservative      Total MRR: $3,133  → ARR: ~$37,600/year
 *   Scenario B — Base (planning)   Total MRR: $8,342  → ARR: ~$100,100/year ✓
 *   Scenario C — Optimistic        Total MRR: $18,730 → ARR: ~$224,760/year
 *
 * We extract ONLY those scenario ARR totals (money that immediately follows the
 * token "ARR") — never pricing ($49/mo), COGS, marketing ($103,200/yr) or
 * competitor/TAM figures (<$1M). Conservative→low, Base→headline, Optimistic→high.
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

// Money that FOLLOWS the token "ARR" on a line — the scenario total. The
// `[^$\n]{0,14}` allows ": ~", " ≈ ", etc., but no intervening "$" so we bind to
// the ARR figure, not some earlier dollar amount (MRR) on the same line.
const ARR_TOTAL_RE = /\bARR\b[^$\n]{0,14}\$\s?([\d][\d,]*(?:\.\d+)?)\s*([kKmM])?/i;

function arrTotal(line: string): number | null {
  const m = line.match(ARR_TOTAL_RE);
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

type ScenarioKey = "low" | "expected" | "high";

function scenarioOf(line: string): ScenarioKey | null {
  // Conservative / optimistic are checked first; "base" is the residual.
  if (CONSERVATIVE.test(line)) return "low";
  if (OPTIMISTIC.test(line)) return "high";
  if (BASE.test(line)) return "expected";
  return null;
}

/**
 * Parse the three scenario ARR totals. Each ARR-total line is tagged with the
 * most recent scenario label seen above it; the FIRST total per scenario wins.
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
    const value = arrTotal(line);
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
 * Parse docs/BUSINESS_CASE.md into a Valuation from its scenario ARR totals.
 * Returns null only when no ARR-total line can be found at all (the caller then
 * shows no number — it never substitutes the LLM/heuristic when the file exists).
 */
export function parseBusinessCase(
  content: string | null | undefined,
  sourceUrl: string,
  asOf?: string,
): Valuation | null {
  if (!content || !content.trim()) return null;
  const lines = content.replace(/\r\n/g, "\n").split("\n");

  // Primary: the three labeled scenario ARR totals. If found, it's authoritative
  // — validate (don't fall through to a looser scrape on a wild number).
  const scenarios = parseScenarios(lines, sourceUrl, asOf);
  if (scenarios) return validate(scenarios);

  // Fallback (still ARR-anchored, not pricing): a single ARR total → base, with
  // a conventional ×0.3 / ×3 band.
  for (const line of lines) {
    const value = arrTotal(line);
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
