/**
 * Self-validation capability gate, per repo.
 *
 * Each factory repo declares the external services its product depends on and
 * gates merges on a "capabilities tripwire" CI check. The dashboard surfaces
 * whether that gate is built + enforced, how many capabilities are declared, and
 * how many are OWNER-BLOCKED — capabilities that need an owner-only secret CI
 * can't supply, so the loop literally cannot validate that flow until you wire
 * the key. An owner-blocked count > 0 is the loop telling you it's stuck on you.
 *
 * Source of truth: the `validation:` sub-block of the LOOP_HEALTH block
 * (enforced_in_ci / capabilities_total / active / unmet[] / unmet_unsurfaced[]),
 * refreshed every run. Falls back to the validation/CAPABILITIES.yml manifest
 * (capabilities[] with ci_validatable) when the block is absent. REAL data only —
 * a missing block + missing manifest reads "gate not built here yet", never a guess.
 */
import type { Availability } from "@/lib/types";
import { parseYamlBlock, parseYamlDocument } from "@/lib/growth";

export interface SelfValidation extends Availability {
  /** The capabilities tripwire is a REQUIRED CI status check here. null = unknown. */
  enforcedInCi: boolean | null;
  /** Declared external-service capabilities. */
  capabilitiesTotal: number | null;
  /** Active (in-use) capabilities, when reported. */
  active: number | null;
  /** Capabilities needing an owner-only secret CI can't supply — owner-blocked. */
  unmet: string[];
  /** Unmet capabilities NOT also surfaced as owner actions — should be empty (a bug if not). */
  unmetUnsurfaced: string[];
  /** Where the data came from. */
  source?: "loop_health" | "manifest";
  sourceUrl?: string;
}

function numOrNull(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}
function strList(v: unknown): string[] {
  return Array.isArray(v)
    ? v.map((x) => String(x ?? "").trim()).filter(Boolean)
    : [];
}
function obj(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

function blank(reason: string, sourceUrl?: string): SelfValidation {
  return {
    available: false,
    reason,
    enforcedInCi: null,
    capabilitiesTotal: null,
    active: null,
    unmet: [],
    unmetUnsurfaced: [],
    sourceUrl,
  };
}

/**
 * Build the self-validation view, preferring the LOOP_HEALTH `validation` block
 * and falling back to the capabilities manifest.
 */
export function parseSelfValidation(
  loopHealthMd: string | null | undefined,
  loopHealthUrl: string | undefined,
  manifestYml: string | null | undefined,
  manifestUrl: string | undefined,
): SelfValidation {
  // 1) Preferred: the `validation:` sub-block of LOOP_HEALTH.
  const root = parseYamlBlock(loopHealthMd, "LOOP_HEALTH");
  const v = root ? obj(root.validation) : null;
  if (v && Object.keys(v).length) {
    return {
      available: true,
      enforcedInCi: typeof v.enforced_in_ci === "boolean" ? v.enforced_in_ci : null,
      capabilitiesTotal: numOrNull(v.capabilities_total),
      active: numOrNull(v.active),
      unmet: strList(v.unmet),
      unmetUnsurfaced: strList(v.unmet_unsurfaced),
      source: "loop_health",
      sourceUrl: loopHealthUrl,
    };
  }

  // 2) Fallback: validation/CAPABILITIES.yml — capabilities[] with ci_validatable.
  const doc = obj(parseYamlDocument(manifestYml));
  const caps = doc && Array.isArray(doc.capabilities)
    ? (doc.capabilities as unknown[]).map(obj).filter((c): c is Record<string, unknown> => !!c)
    : [];
  if (caps.length) {
    const unmet = caps
      .filter((c) => c.ci_validatable === false)
      .map((c) => String(c.name ?? c.id ?? "").trim())
      .filter(Boolean);
    return {
      available: true,
      enforcedInCi: null, // the manifest alone doesn't say whether CI enforces it
      capabilitiesTotal: caps.length,
      active: null,
      unmet,
      unmetUnsurfaced: [],
      source: "manifest",
      sourceUrl: manifestUrl,
    };
  }

  return blank("no self-validation block or manifest", loopHealthUrl ?? manifestUrl);
}

/** The gate is built AND enforced as a required CI check. */
export function gateEnforced(sv: SelfValidation): boolean {
  return sv.available && sv.enforcedInCi === true;
}

/** Owner-blocked capability count — the loop can't validate these without you. */
export function ownerBlockedCount(sv: SelfValidation): number {
  return sv.available ? sv.unmet.length : 0;
}
