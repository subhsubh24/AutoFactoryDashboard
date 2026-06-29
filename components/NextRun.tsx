"use client";

import { useEffect, useState } from "react";
import { nextCron } from "@/lib/routine";
import { formatRunClock, relativeTime } from "@/lib/utils";

/**
 * The next scheduled run of a routine, rendered relative to now ("in 3h") and
 * ticking every 30s. With `withClock` it leads with the absolute slot in the
 * viewer's local timezone ("Mon, 2:00 PM EDT · in 3h"). The schedule itself is
 * fixed in UTC, so the server (and first paint) render UTC and we swap to local
 * time once mounted — keeping hydration clean while showing each viewer their
 * own clock. When a `cron` is supplied and the server-rendered time has already
 * elapsed (a long-open tab), it recomputes the next fire client-side, so it
 * never gets stuck on a stale past time.
 */
export function NextRun({
  at,
  cron,
  withClock = false,
  className,
}: {
  /** Server-computed next fire (ISO, UTC); null when unknown. */
  at: string | null;
  /** The routine's cron — lets the client recompute after the time passes. */
  cron?: string;
  /** Lead with the absolute UTC slot, not just the relative time. */
  withClock?: boolean;
  className?: string;
}) {
  const [, tick] = useState(0);
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
    const id = setInterval(() => tick((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  let iso = at;
  // After hydration only (so SSR and first client render match), roll forward
  // past an elapsed slot using the cron.
  if (mounted && cron && iso && Date.parse(iso) <= Date.now()) {
    const t = nextCron(cron, Date.now());
    if (t !== null) iso = new Date(t).toISOString();
  }
  if (!iso) return <span className={className}>—</span>;

  const past = mounted && Date.parse(iso) <= Date.now();
  const rel = past ? "due now" : relativeTime(iso);
  return (
    <time
      dateTime={iso}
      // Tooltip keeps the canonical UTC slot — the schedule is defined in UTC.
      title={`${formatRunClock(iso, false)} · fixed schedule`}
      suppressHydrationWarning
      className={className}
    >
      {withClock ? `${formatRunClock(iso, mounted)} · ${rel}` : rel}
    </time>
  );
}
