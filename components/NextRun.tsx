"use client";

import { useEffect, useState } from "react";
import { relativeTime } from "@/lib/utils";

/**
 * Renders an expected/next-run time relative to now ("in 5h"), ticking every
 * 30s like RelativeTime. Honest about the edge states: `overdue` (the loop is
 * past due / stalled) shows "overdue"; a time that's already elapsed but not
 * yet stalled shows "due now"; an unknown time shows "—". Never a fake future.
 */
export function NextRun({
  at,
  overdue = false,
  className,
}: {
  at: string | null;
  overdue?: boolean;
  className?: string;
}) {
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  if (overdue) return <span className={className}>overdue</span>;
  if (!at) return <span className={className}>—</span>;

  const past = Date.parse(at) <= Date.now();
  return (
    <time
      dateTime={at}
      title={new Date(at).toLocaleString()}
      suppressHydrationWarning
      className={className}
    >
      {past ? "due now" : relativeTime(at)}
    </time>
  );
}
