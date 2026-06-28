/**
 * Evals for the LLM output guards. Pure functions, so no runtime needed:
 *   node --experimental-strip-types lib/llm-guard.test.ts   (Node 22.6+)
 * Also wired as `npm test`.
 *
 * These lock the behaviour that prompted the guards: a digest must not imply a
 * project is near completion / ready / launched when the numbers say otherwise,
 * while normal early-stage prose must pass untouched.
 */
import { checkNarrative, checkBriefing } from "./llm-guard.ts";

let failed = 0;
function expect(name: string, got: boolean, want: boolean) {
  const ok = got === want;
  if (!ok) failed++;
  console.log(`  ${ok ? "PASS" : "FAIL"} ${name}`);
}
const flags = (t: string, f: Parameters<typeof checkNarrative>[1]) =>
  checkNarrative(t, f).length > 0;

console.log("── overstated completion (the reported bug) ──");
expect(
  "flags 'Nearing Completion' @ 0% ready / 37% build",
  flags("HighlightMagic Ships Key Features, Nearing Completion. The agent shipped…", {
    readinessPct: 0,
    buildPct: 37,
    readyForSubmission: false,
  }),
  true,
);
expect(
  "flags 'almost done' @ 10% ready",
  flags("Almost done — final polish underway.", {
    readinessPct: 10,
    buildPct: 40,
    readyForSubmission: false,
  }),
  true,
);
expect(
  "flags 'ready to ship' when not ready",
  flags("It's ready to ship after a couple fixes.", {
    readinessPct: 20,
    buildPct: 50,
    readyForSubmission: false,
  }),
  true,
);
expect(
  "flags 'production-ready' early",
  flags("The auth layer is production-ready.", {
    readinessPct: 5,
    buildPct: 30,
    readyForSubmission: false,
  }),
  true,
);

console.log("── allowed when genuinely advanced ──");
expect(
  "allows 'nearing completion' @ 90% build",
  flags("Nearing completion of the build.", {
    readinessPct: 30,
    buildPct: 90,
    readyForSubmission: false,
  }),
  false,
);
expect(
  "allows 'ready to ship' when readyForSubmission",
  flags("Ready to ship — your sign-off is the last step.", {
    readinessPct: 100,
    buildPct: 100,
    readyForSubmission: true,
  }),
  false,
);
expect(
  "allows 'almost done' @ 85% ready",
  flags("Almost done; one track left.", {
    readinessPct: 85,
    buildPct: 80,
    readyForSubmission: false,
  }),
  false,
);

console.log("── no false positives on normal early-stage prose ──");
expect(
  "allows 'shipped key features, 37% built, next up Track G'",
  flags(
    "Shipped per-user generation ceilings and App Store metadata; build is 37% with next up Track G.",
    { readinessPct: 0, buildPct: 37, readyForSubmission: false },
  ),
  false,
);
expect(
  "allows 'ready for review'",
  flags("The migration PR is ready for review.", {
    readinessPct: 10,
    buildPct: 30,
    readyForSubmission: false,
  }),
  false,
);
expect(
  "allows 'completed 5 PRs'",
  flags("Completed 5 PRs overnight, momentum building.", {
    readinessPct: 15,
    buildPct: 35,
    readyForSubmission: false,
  }),
  false,
);

console.log("── false launch ──");
expect(
  "flags 'now live' when not ready",
  flags("The app is now live on the App Store.", {
    readinessPct: 40,
    buildPct: 60,
    readyForSubmission: false,
  }),
  true,
);

console.log("── briefing ──");
const bflags = (t: string, anyReady: boolean) => checkBriefing(t, { anyReady }).length > 0;
expect("flags 'all projects are ready' when none ready", bflags("Great momentum — all projects are ready to launch.", false), true);
expect("allows 'all projects shipped PRs'", bflags("All projects shipped PRs overnight; nothing needs you.", false), false);

console.log(failed === 0 ? "\nALL PASS" : `\n${failed} FAILED`);
if (failed) process.exitCode = 1;
