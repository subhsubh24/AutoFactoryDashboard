import type { ValidatorStatus } from "@/lib/validator";
import { cn } from "@/lib/utils";
import { Chip } from "@/components/Chip";
import { AlertIcon, ExternalLinkIcon } from "@/components/icons";

function shortDate(iso?: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

const fmt = (n: number | null): string =>
  n === null ? "—" : n.toLocaleString("en-US");

function VStat({
  label,
  value,
  tone = "ink",
}: {
  label: string;
  value: number | null;
  tone?: "ink" | "sage" | "clay";
}) {
  const color =
    tone === "sage"
      ? "text-sage-strong"
      : tone === "clay"
        ? "text-clay-strong"
        : "text-ink";
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-xs text-muted">{label}</span>
      <span
        className={cn(
          "text-sm font-semibold tabular",
          value !== null ? color : "text-muted",
        )}
      >
        {fmt(value)}
      </span>
    </div>
  );
}

/**
 * The computer-use validator's last sweep (docs/autonomous-loop/VALIDATOR_STATUS.md):
 * how many real user flows passed when a Claude agent drove the DEPLOYED app like
 * a human, plus the specific flows that broke (each linked to the issue it filed).
 * Absent until the validator runs its first sweep — degrades to a quiet note.
 */
export function ValidatorPanel({ validator }: { validator: ValidatorStatus }) {
  if (!validator.available) {
    return (
      <p className="text-sm text-muted">
        {validator.reason ?? "No validator sweep reported yet."}
      </p>
    );
  }
  const asOf = shortDate(validator.lastSweep ?? validator.asOf);
  const failing = validator.findings.filter((f) => f.status === "fail");
  const allGreen =
    (validator.flowsFailed ?? 0) === 0 && (validator.openFindings ?? 0) === 0;

  return (
    <div className="space-y-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Chip tone={allGreen ? "sage" : "clay"}>
          {validator.flowsPassed !== null && validator.flowsTotal !== null
            ? `${validator.flowsPassed}/${validator.flowsTotal} flows pass`
            : "swept"}
        </Chip>
        {asOf && <span className="text-xs text-muted">swept {asOf}</span>}
      </div>

      <div className="grid grid-cols-1 gap-x-5 gap-y-1.5 sm:grid-cols-2">
        <VStat label="Flows passed" value={validator.flowsPassed} tone="sage" />
        <VStat
          label="Flows failed"
          value={validator.flowsFailed}
          tone={(validator.flowsFailed ?? 0) > 0 ? "clay" : "ink"}
        />
        <VStat
          label="Open findings"
          value={validator.openFindings}
          tone={(validator.openFindings ?? 0) > 0 ? "clay" : "ink"}
        />
        <VStat label="Flows total" value={validator.flowsTotal} />
      </div>

      {failing.length > 0 && (
        <div className="border-t border-hairline pt-3">
          <p className="mb-1.5 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.12em] text-clay-strong">
            <AlertIcon className="h-3.5 w-3.5" />
            Broken flows — found driving the real app
          </p>
          <ul className="space-y-1.5">
            {failing.map((f, i) => (
              <li
                key={i}
                className="flex items-start gap-2 text-xs leading-snug text-ink"
              >
                <span
                  aria-hidden
                  className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-clay"
                />
                <span>
                  <span className="font-semibold">{f.flow}</span>
                  {f.note ? <> — {f.note}</> : null}
                  {f.issueUrl ? (
                    <>
                      {" "}
                      <a
                        href={f.issueUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-muted underline transition-colors hover:text-clay"
                      >
                        issue
                      </a>
                    </>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {validator.targetUrl && (
        <p className="truncate text-[11px] text-muted">
          Target · {validator.targetUrl}
        </p>
      )}

      {validator.sourceUrl && (
        <a
          href={validator.sourceUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 text-xs text-muted transition-colors hover:text-clay"
        >
          VALIDATOR_STATUS.md <ExternalLinkIcon className="h-3 w-3" />
        </a>
      )}
    </div>
  );
}
