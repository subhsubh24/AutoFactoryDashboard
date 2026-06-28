"use client";

import { useLayoutEffect, useState } from "react";

/**
 * A brief vault-door reveal, shown once per browser session when you first land
 * on the dashboard. A gear-lock is mounted on the door (a bolted housing); the
 * cog spins and settles into alignment with a clunk, flips clay→sage on lock
 * (the dashboard's own go/ready colour), and the door splits down the middle —
 * cleaving the gear in two — to reveal the floor behind it.
 *
 * Each half renders the SAME mechanism centred on the seam and clips its outer
 * half (see globals.css), so the two read as one continuous gear until they
 * part. Visuals are pure CSS so they play even before hydration; this component
 * only decides *whether* to play and removes the node when it's done.
 *
 * Tasteful guardrails: once per session (sessionStorage), skipped entirely for
 * `prefers-reduced-motion`, and click-through so it can never trap input.
 */

const SESSION_KEY = "afd-intro-played";
// Must outlast the longest CSS timeline (doors: 1040ms delay + 620ms).
const TOTAL_MS = 1740;

const C = 60; // SVG centre (viewBox 0 0 120 120)

/** The gear-lock mechanism: a static bolted housing + a rotating cog. */
function Mechanism({ side }: { side: "left" | "right" }) {
  const teeth = Array.from({ length: 12 }, (_, i) => (
    <rect
      key={i}
      x={C - 5}
      y={18}
      width={10}
      height={14}
      rx={2.5}
      transform={`rotate(${i * 30} ${C} ${C})`}
    />
  ));
  const bolts = Array.from({ length: 8 }, (_, i) => {
    const a = (i * 45 * Math.PI) / 180;
    return (
      <circle
        key={i}
        cx={(C + 49 * Math.cos(a)).toFixed(2)}
        cy={(C + 49 * Math.sin(a)).toFixed(2)}
        r={2.1}
        fill="currentColor"
        opacity={0.45}
      />
    );
  });
  return (
    <div className={`intro-mech intro-mech-${side}`}>
      <svg viewBox="0 0 120 120" width={188} height={188} aria-hidden="true">
        {/* Housing — the metal rim the lock is mounted in (stays neutral). */}
        <circle cx={C} cy={C} r={52} fill="none" stroke="var(--hairline)" strokeWidth={2.5} />
        {bolts}
        {/* The cog — spins into alignment, then tints with the rest. */}
        <g className="intro-cog" fill="currentColor">
          {teeth}
          <circle cx={C} cy={C} r={30} />
          <circle cx={C} cy={C} r={15} fill="var(--bg)" />
          {[0, 120, 240].map((a) => (
            <rect
              key={a}
              x={C - 3}
              y={31}
              width={6}
              height={16}
              rx={3}
              fill="var(--bg)"
              transform={`rotate(${a} ${C} ${C})`}
            />
          ))}
          <circle cx={C} cy={C} r={5.5} />
        </g>
        {/* Shock ring on lock. */}
        <circle
          className="intro-pulse"
          cx={C}
          cy={C}
          r={52}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
        />
      </svg>
    </div>
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
      <div className="intro-half intro-half-left">
        <Mechanism side="left" />
      </div>
      <div className="intro-half intro-half-right">
        <Mechanism side="right" />
      </div>
    </div>
  );
}
