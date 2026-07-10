"use client";

import { useState } from "react";
import type { DrillPr, VelocityDay } from "@/lib/aggregate";
import { cn } from "@/lib/utils";
import { Modal } from "@/components/Modal";
import { DrillDownTable } from "@/components/DrillDownTable";

/**
 * Weekly velocity chart. Fixed-pixel bar heights (a flex %-height collapses
 * inside an `items-end` row), solid fills so every bar is visible on dark, today
 * in the brighter accent. When `rows` is supplied each non-empty bar is a button
 * that opens a drill-down: the PRs that shipped that day, grouped by project.
 */
function formatDayLabel(key: string): string {
  return new Date(`${key}T12:00:00Z`).toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function WeekBars({ days, rows }: { days: VelocityDay[]; rows?: DrillPr[] }) {
  const [openKey, setOpenKey] = useState<string | null>(null);
  const max = Math.max(1, ...days.map((d) => d.count));
  const CHART = 116; // px
  const LABEL = 20; // px reserved above each bar for its count
  const MAX_BAR = CHART - LABEL;

  const openDay = openKey ? (days.find((d) => d.key === openKey) ?? null) : null;
  const dayRows = rows && openKey ? rows.filter((r) => r.dayKey === openKey) : [];
  const projectCount = new Set(dayRows.map((r) => r.projectSlug)).size;

  return (
    <div>
      <div className="flex items-end justify-between gap-2.5" style={{ height: CHART }}>
        {days.map((d, i) => {
          const isToday = i === days.length - 1;
          const h = d.count === 0 ? 2 : Math.max(8, Math.round((d.count / max) * MAX_BAR));
          const clickable = Boolean(rows) && d.count > 0;
          const inner = (
            <>
              {d.count > 0 && (
                <span
                  className={cn(
                    "mb-1.5 text-xs leading-none tabular",
                    isToday ? "font-semibold text-ink" : "text-muted",
                  )}
                >
                  {d.count}
                </span>
              )}
              <div
                className={cn(
                  "w-full max-w-[2.5rem] rounded-t-md transition-all",
                  d.count === 0 ? "bg-hairline" : isToday ? "bg-sage-strong" : "bg-sage",
                  clickable && "group-hover/bar:brightness-110",
                )}
                style={{ height: h }}
              />
            </>
          );
          return clickable ? (
            <button
              key={d.key}
              type="button"
              onClick={() => setOpenKey(d.key)}
              aria-label={`${formatDayLabel(d.key)}: ${d.count} PRs merged — open the breakdown`}
              title={`${d.weekday}: ${d.count} PR${d.count === 1 ? "" : "s"} — click for the breakdown`}
              className="group/bar flex flex-1 cursor-pointer flex-col items-center justify-end rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-clay"
            >
              {inner}
            </button>
          ) : (
            <div
              key={d.key}
              className="flex flex-1 flex-col items-center justify-end"
              title={`${d.weekday}: ${d.count} PR${d.count === 1 ? "" : "s"} merged`}
            >
              {inner}
            </div>
          );
        })}
      </div>
      <div className="mt-2.5 flex justify-between gap-2.5">
        {days.map((d, i) => (
          <span
            key={d.key}
            className={cn(
              "flex-1 text-center text-[11px] leading-none",
              i === days.length - 1 ? "font-semibold text-ink" : "text-muted",
            )}
          >
            {d.weekday}
          </span>
        ))}
      </div>

      {rows && (
        <Modal
          open={Boolean(openDay)}
          onClose={() => setOpenKey(null)}
          title={openDay ? `Shipped ${formatDayLabel(openDay.key)}` : ""}
          subtitle={
            openDay
              ? `${dayRows.length} PR${dayRows.length === 1 ? "" : "s"} · ${projectCount} project${projectCount === 1 ? "" : "s"}`
              : undefined
          }
        >
          <DrillDownTable rows={dayRows} />
        </Modal>
      )}
    </div>
  );
}
