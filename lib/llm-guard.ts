/**
 * Deterministic guards for LLM output — catch a draft that contradicts the
 * real numbers before it reaches the UI. These are pure functions (no I/O, no
 * Next runtime) so they're cheap to run on every generation and easy to unit
 * test. The narrative pipeline runs them after each LLM call: a violation
 * triggers one corrective retry, then a fall back to the grounded template.
 *
 * The motivating bug: a digest headlined "…Nearing Completion" for a project
 * that was 0% submission-ready and 37% built. Shipping many PRs is NOT the same
 * as being almost done — these guards stop the model from saying so.
 */

export interface Violation {
  rule: string;
  /** Phrased as a correction the model can act on. */
  message: string;
}

export interface NarrativeFacts {
  /** Submission readiness % (Definition of Done) — the real "how done is it". */
  readinessPct: number | null;
  /** Build completeness % (track checkboxes). */
  buildPct: number | null;
  readyForSubmission: boolean;
}

// Project-level "it's basically done / ready / launched" claims. Deliberately
// targeted to unambiguous overstatements so legitimate phrasing ("shipped a
// complete feature", "ready for review") doesn't trip it.
const OVERSTATE_RE =
  /\b(near(?:ing)? completion|nearly (?:complete|completed|done|finished|ready)|almost (?:complete|completed|done|finished|ready|there)|close to (?:complete|completion|completing|done|finished|launch|launching)|on the (?:verge|cusp) of (?:completion|launch|launching|shipping|finishing)|ready (?:to|for) (?:ship|launch|submit|submission)|launch[- ]ready|production[- ]ready|fully (?:built|complete|completed|done)|all but (?:done|complete|finished))\b/i;

const LAUNCHED_RE =
  /\b(now live|went live|is live|launched (?:on|to|in)|available (?:to download|on the app store|on (?:google )?play)|shipped to production|in production)\b/i;

// Thresholds above which "near done" language is defensible.
const READY_FLOOR = 80; // submission readiness %
const BUILD_FLOOR = 85; // build completeness %

/** Check a narrative (headline + digest) against the project's real numbers. */
export function checkNarrative(text: string, f: NarrativeFacts): Violation[] {
  const out: Violation[] = [];
  const advanced =
    f.readyForSubmission ||
    (f.readinessPct ?? 0) >= READY_FLOOR ||
    (f.buildPct ?? 0) >= BUILD_FLOOR;

  if (!advanced && OVERSTATE_RE.test(text)) {
    out.push({
      rule: "overstated-completion",
      message:
        `Do not imply the project is near completion, almost done, or ready: ` +
        `submission readiness is ${f.readinessPct ?? 0}% and build is ${f.buildPct ?? 0}% — ` +
        `this is still EARLY. Describe what shipped and what's next, not nearness to done.`,
    });
  }

  if (!f.readyForSubmission && LAUNCHED_RE.test(text)) {
    out.push({
      rule: "false-launch",
      message:
        "Do not say the product is live/launched/in production — it has not launched. " +
        "It is still in development.",
    });
  }

  return out;
}

export interface BriefingFacts {
  /** True if at least one project is flagged ready for submission. */
  anyReady: boolean;
}

/** Check the factory-wide briefing for false universal claims. */
export function checkBriefing(text: string, f: BriefingFacts): Violation[] {
  const ALL_DONE_RE =
    /\b(everything|all (?:projects?|of them|are)|the (?:whole|entire) factory)\b[^.]*\b(ready|done|complete|completed|launched|live|shipped to production)\b/i;
  if (!f.anyReady && ALL_DONE_RE.test(text)) {
    return [
      {
        rule: "false-all-ready",
        message:
          "No project is ready for submission yet — do not say everything/all projects " +
          "are ready, done, or launched.",
      },
    ];
  }
  return [];
}
