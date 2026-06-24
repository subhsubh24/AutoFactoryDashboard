import type { TrackProgress } from "@/lib/types";
import { cn, type Tone } from "@/lib/utils";

const TONE_BG: Record<Tone, string> = {
  sage: "bg-sage",
  amber: "bg-amber",
  clay: "bg-clay",
  muted: "bg-muted",
};

function toneForPct(pct: number): Tone {
  if (pct >= 100) return "sage";
  if (pct >= 50) return "clay";
  return "amber";
}

/** Horizontal per-track progress bars. */
export function TrackBars({
  tracks,
  className,
}: {
  tracks: TrackProgress[];
  className?: string;
}) {
  if (tracks.length === 0) {
    return (
      <p className={cn("text-sm text-muted", className)}>
        No tracks detected in ROADMAP.md.
      </p>
    );
  }

  return (
    <ul className={cn("space-y-3.5", className)}>
      {tracks.map((track) => {
        const tone = toneForPct(track.pct);
        return (
          <li key={track.label}>
            <div className="mb-1.5 flex items-baseline justify-between gap-3">
              <span className="truncate text-sm font-medium text-ink">
                {track.label}
              </span>
              <span className="shrink-0 text-xs text-muted">
                <span className="tabular text-ink">{track.done}</span>/
                {track.total} · <span className="tabular">{track.pct}%</span>
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-[var(--ring-track)]">
              <div
                className={cn("h-full rounded-full transition-[width]", TONE_BG[tone])}
                style={{ width: `${Math.max(2, track.pct)}%`, transitionDuration: "700ms" }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
