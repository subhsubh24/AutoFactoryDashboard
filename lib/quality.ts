import type { CIInfo, PRItem } from "@/lib/types";
import { extractThemes } from "@/lib/themes";

/** Quality signals for a project — speed and rework, not just throughput. */
export interface QualitySignals {
  ciPassRate: number | null;
  ciStatus: CIInfo["status"];
  /** Median open→merge time (hours) over merged PRs that carry both stamps. */
  medianCycleHours: number | null;
  /** Share of recent merges that were fixes, 0–100 (higher = more rework). */
  fixRate: number | null;
  revertCount: number;
  sampleSize: number;
}

function median(nums: number[]): number | null {
  if (nums.length === 0) return null;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export function qualitySignals(merged: PRItem[], ci: CIInfo): QualitySignals {
  const cycles = merged
    .map((p) => {
      if (!p.createdAt || !p.mergedAt) return null;
      const dt = Date.parse(p.mergedAt) - Date.parse(p.createdAt);
      return Number.isNaN(dt) || dt < 0 ? null : dt / 3_600_000;
    })
    .filter((n): n is number => n !== null);

  const themes = extractThemes(merged);
  const fixCount = themes.find((t) => t.key === "fix")?.count ?? 0;
  const revertCount = merged.filter((p) => /\brevert\b/i.test(p.title)).length;
  const fixRate = merged.length
    ? Math.round((fixCount / merged.length) * 100)
    : null;

  return {
    ciPassRate: ci.passRate,
    ciStatus: ci.status,
    medianCycleHours: median(cycles),
    fixRate,
    revertCount,
    sampleSize: merged.length,
  };
}

/** Human label for a cycle time in hours. */
export function formatCycle(hours: number | null): string {
  if (hours === null) return "—";
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))}m`;
  if (hours < 48) return `${Math.round(hours)}h`;
  return `${Math.round(hours / 24)}d`;
}
