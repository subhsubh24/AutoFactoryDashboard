"use client";

import { useEffect, useState } from "react";
import { relativeTime } from "@/lib/utils";

/**
 * Live "x ago" timestamp. Renders the same string on server and client (with
 * `suppressHydrationWarning` to tolerate the inevitable sub-second clock skew),
 * then refreshes every 30s so a 10-minute-cached page still reads accurately.
 */
export function RelativeTime({
  iso,
  className,
  prefix,
}: {
  iso: string | null | undefined;
  className?: string;
  prefix?: string;
}) {
  const [, tick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  if (!iso) return <span className={className}>—</span>;

  return (
    <time
      dateTime={iso}
      title={new Date(iso).toLocaleString()}
      suppressHydrationWarning
      className={className}
    >
      {prefix}
      {relativeTime(iso)}
    </time>
  );
}
