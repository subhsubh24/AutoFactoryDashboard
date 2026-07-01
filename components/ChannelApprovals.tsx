import type { ApprovedChannel, PendingApproval } from "@/lib/approvals";
import type { ActionItem } from "@/lib/types";
import { cn, formatShortDate, formatUsd } from "@/lib/utils";
import { Chip } from "@/components/Chip";
import { AlertIcon, CheckIcon, ExternalLinkIcon, RocketIcon } from "@/components/icons";

/** Local aliases so the JSX reads the same; both come from lib/utils now. */
const money = (n: number | null) => formatUsd(n);
const shortDate = (iso: string | null) => formatShortDate(iso, true);

function Econ({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-[10px] uppercase tracking-wide text-muted">{label}</span>
      <span className="mt-0.5 text-sm font-semibold tabular text-ink">{value}</span>
    </div>
  );
}

/**
 * One channel/campaign proposal awaiting the owner's call. Shows the full case —
 * thesis, budget, PROJECTED economics (assumptions shown as-is), the falsifiable
 * test, the kill criteria — then the matching gtm-approve owner action and a
 * pointer to where the decision is recorded. Display only: the dashboard reads
 * the repo, it does not write approvals.
 */
function PendingApprovalCard({
  approval: a,
  action,
  pendingOpsUrl,
}: {
  approval: PendingApproval;
  action?: ActionItem;
  pendingOpsUrl?: string;
}) {
  const e = a.economics;
  const hasEcon = e.cacUsd !== null || e.paybackMonths !== null || e.ltvCacRatio !== null;
  return (
    <div className="rounded-xl border border-clay/30 bg-clay-soft/25 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink">
          <RocketIcon className="h-4 w-4 text-clay" />
          {a.channel}
        </p>
        <Chip tone="clay">needs your decision</Chip>
      </div>

      {a.thesis && <p className="mt-1.5 text-sm leading-snug text-ink">{a.thesis}</p>}

      {/* Budget */}
      <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-xs">
        <span className="text-muted">
          Monthly cap <span className="font-semibold tabular text-ink">{money(a.monthlyCapUsd)}</span>
        </span>
        <span className="text-muted">
          Test budget <span className="font-semibold tabular text-ink">{money(a.testBudgetUsd)}</span>
        </span>
      </div>

      {/* Projected economics — assumptions surfaced as-is, never hidden. */}
      <div className="mt-3 rounded-lg bg-card px-3 py-2.5">
        <p className="inline-flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.12em] text-muted">
          Projected economics
          <Chip tone="amber" title="These are projections, not measured results.">
            <AlertIcon className="h-3 w-3" /> projection
          </Chip>
        </p>
        {hasEcon ? (
          <div className="mt-2 grid grid-cols-3 gap-x-4">
            <Econ label="CAC" value={money(e.cacUsd)} />
            <Econ label="Payback" value={e.paybackMonths === null ? "—" : `${e.paybackMonths} mo`} />
            <Econ label="LTV:CAC" value={e.ltvCacRatio === null ? "—" : `${e.ltvCacRatio}×`} />
          </div>
        ) : (
          <p className="mt-1.5 text-xs text-muted">Economics not stated in the proposal.</p>
        )}
        {e.assumptions.length > 0 && (
          <ul className="mt-2 space-y-0.5">
            {e.assumptions.map((as, i) => (
              <li key={i} className="flex items-start gap-1.5 text-[11px] leading-snug text-muted">
                <span aria-hidden className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-amber" />
                <span>{as}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Falsifiable test + kill criteria */}
      {(a.test || a.killCriteria) && (
        <dl className="mt-3 space-y-2 text-xs">
          {a.test && (
            <div>
              <dt className="text-[10px] font-medium uppercase tracking-wide text-muted">
                Falsifiable test
              </dt>
              <dd className="mt-0.5 leading-snug text-ink">{a.test}</dd>
            </div>
          )}
          {a.killCriteria && (
            <div>
              <dt className="text-[10px] font-medium uppercase tracking-wide text-muted">
                Kill criteria
              </dt>
              <dd className="mt-0.5 leading-snug text-clay-strong">{a.killCriteria}</dd>
            </div>
          )}
        </dl>
      )}

      {/* Owner decision — the matching gtm-approve action, surfaced as the CTA. */}
      <div className="mt-3 border-t border-clay/20 pt-3">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] font-medium uppercase tracking-[0.12em] text-muted">
          Your decision
          <code className="rounded bg-bg px-1.5 py-0.5 font-mono text-[10px] tracking-normal text-muted">
            {a.actionId}
          </code>
          {action?.priority && action.priority !== "normal" && (
            <Chip tone={action.priority === "urgent" ? "clay" : "amber"}>{action.priority}</Chip>
          )}
        </p>
        {action?.text && <p className="mt-1.5 text-sm font-medium text-ink">{action.text}</p>}
        {action?.why && <p className="mt-0.5 text-xs leading-snug text-muted">{action.why}</p>}
        <p className="mt-2 text-[11px] leading-relaxed text-muted">
          Approve by recording it in{" "}
          <span className="font-mono">approved_channels:</span> in PENDING_OPS.md; reject by
          leaving it out (or noting why). The dashboard only reads the repo — it doesn&apos;t
          write the decision.
        </p>
        {pendingOpsUrl && (
          <a
            href={pendingOpsUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-clay transition-colors hover:underline"
          >
            Open PENDING_OPS.md to decide <ExternalLinkIcon className="h-3.5 w-3.5" />
          </a>
        )}
      </div>
    </div>
  );
}

/** A small spend-vs-cap bar (clay when over cap). */
function SpendBar({ spent, cap }: { spent: number; cap: number }) {
  const pct = cap > 0 ? Math.min(100, Math.max(2, Math.round((spent / cap) * 100))) : 0;
  const over = cap > 0 && spent > cap;
  return (
    <span className="block h-1.5 w-full overflow-hidden rounded-full bg-[var(--ring-track)]">
      <span
        className={cn("block h-full rounded-full", over ? "bg-clay" : "bg-sage")}
        style={{ width: `${pct}%` }}
      />
    </span>
  );
}

/** The owner-approved channels, with cap, approval date, and live spend/results. */
function ApprovedChannelsView({ channels }: { channels: ApprovedChannel[] }) {
  return (
    <div>
      <p className="mb-2 text-[10px] font-medium uppercase tracking-[0.12em] text-muted">
        Approved channels · {channels.length}
      </p>
      <ul className="space-y-3">
        {channels.map((c) => {
          const hasSpend = c.spentUsd !== null && c.capUsd !== null;
          const date = shortDate(c.approvedOn);
          return (
            <li key={c.channel} className="rounded-xl border border-hairline bg-bg px-3.5 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 text-sm font-medium text-ink">
                  <CheckIcon className="h-3.5 w-3.5 text-sage" />
                  {c.channel}
                </span>
                <span className="text-xs text-muted">
                  cap <span className="font-semibold tabular text-ink">{money(c.capUsd)}</span>/mo
                  {date && <> · approved {date}</>}
                </span>
              </div>

              {hasSpend ? (
                <div className="mt-2.5">
                  <div className="mb-1 flex items-center justify-between text-[11px]">
                    <span className="text-muted">Spend vs cap</span>
                    <span className="tabular text-ink">
                      <span className="font-semibold">{money(c.spentUsd)}</span>
                      <span className="text-muted"> / {money(c.capUsd)}</span>
                    </span>
                  </div>
                  <SpendBar spent={c.spentUsd as number} cap={c.capUsd as number} />
                </div>
              ) : (
                <p className="mt-1.5 text-[11px] text-muted">
                  No spend reported yet — the factory reports spend &amp; results once it runs.
                </p>
              )}

              {c.resultsVsPlan && (
                <p className="mt-2 text-xs leading-snug text-ink">
                  <span className="text-muted">Results vs plan: </span>
                  {c.resultsVsPlan}
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * GTM channel approvals (GTM_STANDARD §9) — pending proposals as owner-decision
 * cards + the approved-channels record. Renders nothing when both are empty (the
 * pre-launch norm). Display only; approvals are recorded by the owner in the repo.
 */
export function ChannelApprovals({
  pending,
  approved,
  actions,
  pendingOpsUrl,
}: {
  pending: PendingApproval[];
  approved: ApprovedChannel[];
  actions: ActionItem[];
  pendingOpsUrl?: string;
}) {
  if (pending.length === 0 && approved.length === 0) return null;
  const actionFor = (a: PendingApproval): ActionItem | undefined =>
    actions.find((it) => it.id === `owner:${a.actionId}` || it.id.endsWith(a.actionId));

  return (
    <div className="space-y-5">
      {pending.length > 0 && (
        <div className="space-y-3">
          <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-muted">
            Pending your decision · {pending.length}
          </p>
          {pending.map((a) => (
            <PendingApprovalCard
              key={a.channel}
              approval={a}
              action={actionFor(a)}
              pendingOpsUrl={pendingOpsUrl}
            />
          ))}
        </div>
      )}
      {approved.length > 0 && <ApprovedChannelsView channels={approved} />}
    </div>
  );
}
