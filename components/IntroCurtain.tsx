"use client";

import { useLayoutEffect, useState } from "react";

/**
 * A brief "factory powering up" reveal, shown once per browser session when you
 * first land on the dashboard. Gears spin and settle with a mechanical clunk, a
 * ring sweeps to full and flips clay→sage (the unlock), then the screen splits
 * like bay doors to reveal the floor. The visuals are pure CSS (see globals.css)
 * so they play even before hydration; this component only decides *whether* to
 * play and removes the node when it's done.
 *
 * Tasteful guardrails: once per session (sessionStorage), skipped entirely for
 * `prefers-reduced-motion`, and click-through so it can never trap input.
 */

const SESSION_KEY = "afd-intro-played";
// Must outlast the longest CSS timeline (doors: 1080ms delay + 620ms).
const TOTAL_MS = 1820;

/** A solid cog: filled teeth + body, punched hub, centered on a 100×100 box. */
function Gear({ teeth, className }: { teeth: number; className: string }) {
  const c = 50;
  const toothTop = 6; // outer edge of a tooth (radius ≈ 44)
  return (
    <svg viewBox="0 0 100 100" className={className} fill="currentColor" aria-hidden="true">
      {Array.from({ length: teeth }, (_, i) => (
        <rect
          key={i}
          x={c - 5}
          y={toothTop}
          width={10}
          height={16}
          rx={2.5}
          transform={`rotate(${(i * 360) / teeth} ${c} ${c})`}
        />
      ))}
      <circle cx={c} cy={c} r={32} />
      {/* Punch the hub and three spokes out of the body with the bg colour. */}
      <circle cx={c} cy={c} r={17} fill="var(--bg)" />
      {[30, 150, 270].map((a) => (
        <rect
          key={a}
          x={c - 3}
          y={c - 31}
          width={6}
          height={16}
          rx={3}
          fill="var(--bg)"
          transform={`rotate(${a} ${c} ${c})`}
        />
      ))}
      <circle cx={c} cy={c} r={6} />
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
      <div className="intro-door intro-door-top" />
      <div className="intro-door intro-door-bottom" />
      <div className="intro-stage">
        <div className="intro-gears">
          <svg viewBox="0 0 100 100" className="intro-ring" aria-hidden="true">
            <circle
              cx="50"
              cy="50"
              r="46"
              fill="none"
              stroke="var(--hairline)"
              strokeWidth="1.5"
            />
            <circle
              className="intro-ring-sweep"
              cx="50"
              cy="50"
              r="46"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeDasharray="290"
            />
            <circle
              className="intro-pulse"
              cx="50"
              cy="50"
              r="46"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            />
          </svg>
          <Gear teeth={12} className="intro-gear intro-gear-a" />
          <Gear teeth={9} className="intro-gear intro-gear-b" />
        </div>
        <p className="intro-label">Spinning up the floor</p>
      </div>
    </div>
  );
}
