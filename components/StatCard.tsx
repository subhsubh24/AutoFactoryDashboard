import { cn, toneClasses, type Tone } from "@/lib/utils";

/** A single headline metric in the top stat strip. */
export function StatCard({
  label,
  value,
  sublabel,
  tone = "muted",
  icon,
}: {
  label: string;
  value: React.ReactNode;
  sublabel?: React.ReactNode;
  tone?: Tone;
  icon?: React.ReactNode;
}) {
  const t = toneClasses(tone);
  return (
    <div className="card flex items-start justify-between gap-3 p-4 shadow-card sm:p-5">
      <div className="min-w-0">
        <p className="text-xs font-medium uppercase tracking-wide text-muted">
          {label}
        </p>
        <p className="mt-1.5 text-3xl font-semibold tabular tracking-tight text-ink">
          {value}
        </p>
        {sublabel && <p className="mt-1 text-xs text-muted">{sublabel}</p>}
      </div>
      {icon && (
        <span
          className={cn(
            "grid h-9 w-9 shrink-0 place-items-center rounded-lg",
            t.badge,
          )}
        >
          {icon}
        </span>
      )}
    </div>
  );
}
