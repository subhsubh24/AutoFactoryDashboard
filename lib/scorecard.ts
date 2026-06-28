/**
 * docs/quality/QUALITY_SCORECARD.md → QualityScorecard.
 *
 * An INDEPENDENT quality auditor (never the factory/maker) grades each product
 * across a fixed set of dimensions A+→F and sets a ship gate (true only when
 * every ship-critical dimension is A/A+). We surface the grid + overall + gate +
 * the top gaps. REAL data only: grades stay null until the auditor's first run,
 * rendered as "not graded yet" — never a fabricated grade. Missing/unparseable
 * block → `available: false`.
 */
import type { Availability } from "@/lib/types";
import { parseYamlBlock } from "@/lib/growth";

export type Grade = "A+" | "A" | "B" | "C" | "D" | "F";

export interface ScorecardDimension {
  /** Raw snake_case key, e.g. functional_reality. */
  key: string;
  /** Humanized label, e.g. "Functional reality". */
  label: string;
  grade: Grade | null;
  /** Gates shipping — the gate is met only when every such dim is A/A+. */
  shipCritical: boolean;
  /** What's missing to raise the grade. */
  gap: string | null;
}

export interface ScorecardGap {
  dimension: string;
  gap: string;
  severity: string | null;
}

export interface QualityScorecard extends Availability {
  sourceUrl?: string;
  project?: string;
  asOf?: string;
  /** The independent routine that graded it (never the maker). */
  gradedBy?: string;
  overall: Grade | null;
  /** true only when every ship-critical dimension is A/A+; null until graded. */
  shipGateMet: boolean | null;
  dimensions: ScorecardDimension[];
  topGaps: ScorecardGap[];
}

const GRADES: Grade[] = ["A+", "A", "B", "C", "D", "F"];

function asObj(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
}
function arr(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}
function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}
function bool(v: unknown): boolean | null {
  return typeof v === "boolean" ? v : null;
}
function grade(v: unknown): Grade | null {
  const s = typeof v === "string" ? v.trim().toUpperCase() : "";
  return GRADES.includes(s as Grade) ? (s as Grade) : null;
}
/** "functional_reality" → "Functional reality". */
function humanize(key: string): string {
  const s = key.replace(/[_-]+/g, " ").trim();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : key;
}

/**
 * Parse docs/quality/QUALITY_SCORECARD.md. Returns `available: false` (with a
 * reason + link) when the block is missing or unparseable. Dimensions keep the
 * file's published order; unknown grades degrade to null.
 */
export function parseScorecard(
  md: string | null | undefined,
  fileUrl?: string,
): QualityScorecard {
  const unavailable = (reason: string): QualityScorecard => ({
    available: false,
    reason,
    sourceUrl: fileUrl,
    overall: null,
    shipGateMet: null,
    dimensions: [],
    topGaps: [],
  });

  if (!md || !md.trim()) return unavailable("QUALITY_SCORECARD.md not found");
  const root = parseYamlBlock(md, "QUALITY_SCORECARD");
  if (!root) return unavailable("no QUALITY_SCORECARD block — see file");

  const dimsObj = asObj(root.dimensions);
  const dimensions: ScorecardDimension[] = Object.keys(dimsObj).map((key) => {
    const d = asObj(dimsObj[key]);
    return {
      key,
      label: humanize(key),
      grade: grade(d.grade),
      shipCritical: bool(d.ship_critical) === true,
      gap: str(d.gap),
    };
  });

  const topGaps: ScorecardGap[] = arr(root.top_gaps)
    .map((g) => asObj(g))
    .map((g) => ({
      dimension: str(g.dimension) ?? "",
      gap: str(g.gap) ?? "",
      severity: str(g.severity),
    }))
    .filter((g) => g.gap);

  return {
    available: true,
    sourceUrl: fileUrl,
    project: str(root.project) ?? undefined,
    asOf: str(root.as_of) ?? undefined,
    gradedBy: str(root.graded_by) ?? undefined,
    overall: grade(root.overall),
    shipGateMet: bool(root.ship_gate_met),
    dimensions,
    topGaps,
  };
}
