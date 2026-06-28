"use client";

import { useLayoutEffect, useState } from "react";

/**
 * A brief geared vault-door reveal, shown once per browser session when you
 * first land on the dashboard. Two meshed gears — one big, one small — turn
 * slowly in opposite directions like an idling machine, decelerating until
 * they engage (clay→sage, the dashboard's own go/ready colour). Then they
 * disengage — sliding apart and fading — as the vault doors split to reveal
 * the floor.
 *
 * The gears sit on a centred layer above the two background doors so they
 * interlock cleanly. Visuals are pure CSS so they play even before hydration;
 * this component only decides *whether* to play and removes the node when done.
 *
 * Tasteful guardrails: once per session (sessionStorage), skipped entirely for
 * `prefers-reduced-motion`, and click-through so it can never trap input.
 */

const SESSION_KEY = "afd-intro-played";
// Must outlast the longest CSS timeline (doors: 1820ms delay + 780ms).
const TOTAL_MS = 2660;

/** A clean cog: filled teeth + body, punched hub + spokes, centred in a 0–100 box. */
function Cog({ teeth, cogClass }: { teeth: number; cogClass: string }) {
  const c = 50;
  return (
    <svg viewBox="0 0 100 100" width="100%" height="100%" aria-hidden="true">
      <g className={cogClass} fill="currentColor">
        {Array.from({ length: teeth }, (_, i) => (
          <rect
            key={i}
            x={c - 3.6}
            y={4}
            width={7.2}
            height={13}
            rx={2}
            transform={`rotate(${(i * 360) / teeth} ${c} ${c})`}
          />
        ))}
        <circle cx={c} cy={c} r={34} />
        <circle cx={c} cy={c} r={16} fill="var(--bg)" />
        {[0, 120, 240].map((a) => (
          <rect
            key={a}
            x={c - 3.5}
            y={18}
            width={7}
            height={17}
            rx={3.5}
            fill="var(--bg)"
            transform={`rotate(${a} ${c} ${c})`}
          />
        ))}
        <circle cx={c} cy={c} r={6} />
      </g>
    </svg>
  );
}

export function IntroCurtain() {
  // Present in SSR + first paint so it covers content immediately; the effect
  // below removes it synchronously (before paint) for repeat/reduced-motion.
  const [show, setShow] = useState(true);

  useLayoutEffect(() => {
    let played = false;
    try {
      played = sessionStorage.getItem(SESSION_KEY) === "1";
    } catch {
      /* storage blocked — treat as not-yet-played */
    }
    const reduce =
      typeof matchMedia === "function" &&
      matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (played || reduce) {
      setShow(false);
      return;
    }
    try {
      sessionStorage.setItem(SESSION_KEY, "1");
    } catch {
      /* ignore */
    }
    const t = setTimeout(() => setShow(false), TOTAL_MS);
    return () => clearTimeout(t);
  }, []);

  if (!show) return null;

  return (
    <div className="intro-root" aria-hidden="true">
      {/* Background doors — the actual reveal. */}
      <div className="intro-half intro-half-left" />
      <div className="intro-half intro-half-right" />
      {/* Meshed gear pair, above the doors. */}
      <div className="intro-gears">
        <div className="intro-gear-box intro-gear-big">
          <Cog teeth={16} cogClass="intro-cog-big" />
        </div>
        <div className="intro-gear-box intro-gear-small">
          <Cog teeth={12} cogClass="intro-cog-small" />
        </div>
      </div>
    </div>
  );
}
