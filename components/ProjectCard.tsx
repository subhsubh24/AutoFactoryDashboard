import Link from "next/link";
import type { ProjectSnapshot } from "@/lib/types";
import { needsFor } from "@/lib/aggregate";
import {
  cn,
  describeBlock,
  headlinePct,
  kindLabel,
  ciMeta,
  toneClasses,
} from "@/lib/utils";
import { ProgressRing } from "@/components/ProgressRing";
import { StatusBadge } from "@/components/StatusBadge";
import { RelativeTime } from "@/components/RelativeTime";
import { ArrowRightIcon, MergeIcon } from "@/components/icons";

export function ProjectCard({ snapshot }: { snapshot: ProjectSnapshot }) {
  const pct = headlinePct(snapshot);
  const ringTone =
    snapshot.status === "ready" || pct === 100 ? "sage" : "clay";
  const needCount = needsFor(snapshot).length;
  const ci = ciMeta(snapshot.ci.status);
  const ciTone = toneClasses(ci.tone);
  const blockReason = describeBlock(snapshot);

  return (
    <Link
      href={`/p/${snapshot.slug}`}
      className="group card flex flex-col gap-4 p-5 shadow-card transition-all hover:-translate-y-0.5 hover:shadow-lift focus-visible:-translate-y-0.5"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-serif text-lg font-medium tracking-tight text-ink">
            {snapshot.displayName}
          </h3>
          <p className="mt-0.5 text-xs text-muted">
            {kindLabel(snapshot.kind)} ·{" "}
            <span className="font-mono text-[11px]">
              {snapshot.workingBranch}
            </span>
          </p>
        </div>
        <StatusBadge status={snapshot.status} size="sm" />
      </div>

      <div className="flex items-center gap-5">
        <ProgressRing value={pct} size={92} stroke={9} tone={ringTone} />

        <div className="flex min-w-0 flex-1 flex-col gap-2.5">
          <Stat
            icon={<MergeIcon className="h-3.5 w-3.5" />}
            label="merged today"
            value={snapshot.mergedToday}
          />
          <div className="flex items-center gap-2">
            <span className={cn("h-2 w-2 rounded-full", ciTone.dot)} />
            <span className="text-sm text-ink">{ci.label}</span>
            {snapshot.ci.passRate !== null && (
              <span className="text-xs text-muted">
                {snapshot.ci.passRate}% pass
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "grid h-4 min-w-4 place-items-center rounded-full px-1 text-[10px] font-semibold",
                needCount > 0
                  ? "bg-clay text-white"
                  : "bg-sage-soft text-sage",
              )}
            >
              {needCount}
            </span>
            <span className="text-sm text-ink">
              {needCount === 0
                ? "nothing waiting"
                : `${needCount === 1 ? "thing" : "things"} need you`}
            </span>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-hairline pt-3">
        <span className="text-xs text-muted">
          {blockReason ? (
            <span className="text-clay">{blockReason}</span>
          ) : snapshot.lastActivityAt ? (
            <RelativeTime iso={snapshot.lastActivityAt} prefix="active " />
          ) : (
            "no recent activity"
          )}
        </span>
        <span className="flex items-center gap-1 text-xs font-medium text-muted transition-colors group-hover:text-clay">
          View
          <ArrowRightIcon className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
        </span>
      </div>
    </Link>
  );
}

function Stat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-muted">{icon}</span>
      <span className="text-sm text-ink">
        <span className="tabular font-semibold">{value}</span>{" "}
        <span className="text-muted">{label}</span>
      </span>
    </div>
  );
}
