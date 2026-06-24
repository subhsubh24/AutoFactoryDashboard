"use client";

import { useEffect, useState } from "react";

/**
 * Time-of-day phrasing computed on the client (the server renders in UTC and
 * can't know the viewer's local hour). Renders a neutral fallback until mount,
 * then swaps to the local-time variant.
 */
function useLocalHour(): number | null {
  const [hour, setHour] = useState<number | null>(null);
  useEffect(() => {
    setHour(new Date().getHours());
    // Re-evaluate occasionally in case the tab is left open across a boundary.
    const id = setInterval(() => setHour(new Date().getHours()), 5 * 60 * 1000);
    return () => clearInterval(id);
  }, []);
  return hour;
}

type Part = "morning" | "afternoon" | "evening" | "night";

function partOfDay(hour: number): Part {
  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 17) return "afternoon";
  if (hour >= 17 && hour < 22) return "evening";
  return "night";
}

const GREETING: Record<Part, string> = {
  morning: "Good morning",
  afternoon: "Good afternoon",
  evening: "Good evening",
  night: "Up late?",
};

/** "enjoy your coffee" → time-appropriate sign-off for the all-clear verdict. */
const CODA: Record<Part, string> = {
  morning: "enjoy your coffee",
  afternoon: "carry on with your day",
  evening: "go enjoy your evening",
  night: "get some rest",
};

export function Greeting() {
  const hour = useLocalHour();
  return <>{hour === null ? "Hello" : GREETING[partOfDay(hour)]}</>;
}

export function CalmCoda() {
  const hour = useLocalHour();
  return (
    <>
      Nothing needs you
      {hour === null ? " right now." : ` — ${CODA[partOfDay(hour)]}.`}
    </>
  );
}

/** Time-aware phrase like "this morning" / "this evening" / "right now". */
const WHEN: Record<Part, string> = {
  morning: "this morning",
  afternoon: "this afternoon",
  evening: "this evening",
  night: "right now",
};

export function TimeOfDay() {
  const hour = useLocalHour();
  return <>{hour === null ? "right now" : WHEN[partOfDay(hour)]}</>;
}
