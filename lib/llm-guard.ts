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

/**
 * Flag a false "live / launched / in production" claim. Used to guard the
 * product-facing summaries (tagline, launch, last-run) that are generated from
 * repo-controlled text (README / ROADMAP / PR bodies) — a crafted doc could
 * otherwise steer the LLM into telling the owner a pre-launch product is live.
 * These products are pre-launch by definition, so any such claim is false.
 */
export function checkNoFalseLaunch(text: string): Violation[] {
  if (LAUNCHED_RE.test(text)) {
    return [
      {
        rule: "false-launch",
        message:
          "Do not say the product is live/launched/in production/on the app store — " +
          "it has NOT launched to users. Describe what was built, not that it's live.",
      },
    ];
  }
  return [];
}

export interface BriefingFacts {
  /** True if at least one project is flagged ready for submission. */
  anyReady: boolean;
}

// The briefing must not state its OWN count of what needs the owner — the
// masthead badge is the single source of that number, so a hand-written count
// (e.g. "six items require your attention") drifts from it and contradicts the
// badge. Catch a quantity attached to an item noun in a clause that's about
// needing attention. A count of what SHIPPED ("42 items merged") is fine — the
// merged/shipped exclusion and the attention-verb requirement both spare it.
const ATTN_QUANTITY_RE =
  /\b(?:\d{1,3}|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|a few|a couple|couple of|several|a handful|handful of|a dozen|dozens?|numerous|multiple)\s+(?:\w+\s+){0,2}?(?:items?|things?|tasks?|actions?|prs?|pull requests?|projects?|blockers?|approvals?|decisions?|reviews?)\b/i;
const ATTN_VERB_RE =
  /\b(?:need|needs|require|requires|await|awaiting|waiting|attention|for your review|sign-?off|approv)\w*/i;
const MERGED_RE = /\b(?:merged|shipped|ship|shipping|landed)\b/i;

/** Check the factory-wide briefing for false universal claims + stray counts. */
export function checkBriefing(text: string, f: BriefingFacts): Violation[] {
  const out: Violation[] = [];

  const ALL_DONE_RE =
    /\b(everything|all (?:projects?|of them|are)|the (?:whole|entire) factory)\b[^.]*\b(ready|done|complete|completed|launched|live|shipped to production)\b/i;
  if (!f.anyReady && ALL_DONE_RE.test(text)) {
    out.push({
      rule: "false-all-ready",
      message:
        "No project is ready for submission yet — do not say everything/all projects " +
        "are ready, done, or launched.",
    });
  }

  // Per clause (the merged count and the attention line are separate sentences),
  // flag a quantity of items that sits in an attention clause but isn't merged.
  for (const clause of text.split(/[.;\n]/)) {
    if (ATTN_QUANTITY_RE.test(clause) && ATTN_VERB_RE.test(clause) && !MERGED_RE.test(clause)) {
      out.push({
        rule: "attention-count",
        message:
          "Do not state HOW MANY items need the owner — the dashboard prints that exact " +
          "number beside your text. Describe WHICH thing needs attention, with no count.",
      });
      break;
    }
  }

  return out;
}
