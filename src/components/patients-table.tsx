import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronDown } from "lucide-react";
import { Skeleton } from "@/components/ui-bits";
import { formatDate, isSynthetic, patientName, riskLevel } from "@/lib/meora";
import { describeMedication, isActiveStatus, parseTreatmentPlan } from "@/lib/treatment";
import { notesRiskFindings, type RiskFinding } from "@/lib/risk";
import type { Patient } from "@/lib/types";

type Summary = { count: number; lastDate: string | null; riskFindings?: RiskFinding[] };

type SortKey = "name_asc" | "name_desc" | "recent" | "results";
type FilterKey = "all" | "protocol" | "excluded" | "high_risk" | "synthetic";

const SORTS: { id: SortKey; label: string }[] = [
  { id: "name_asc", label: "Name A–Z" },
  { id: "name_desc", label: "Name Z–A" },
  { id: "recent", label: "Most Recent Test" },
  { id: "results", label: "Result Count" },
];

const FILTERS: { id: FilterKey; label: string }[] = [
  { id: "all", label: "All" },
  { id: "protocol", label: "On Protocol" },
  { id: "excluded", label: "Excluded" },
  { id: "high_risk", label: "High Risk" },
  { id: "synthetic", label: "Synthetic" },
];

function ageFrom(dob: string | null | undefined): string {
  if (!dob) return "—";
  const d = new Date(dob);
  if (Number.isNaN(d.getTime())) return "—";
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age -= 1;
  return age >= 0 && age < 130 ? String(age) : "—";
}

function StatusPill({ tone, children }: { tone: "green" | "red" | "amber" | "grey"; children: React.ReactNode }) {
  const cls = {
    green: "bg-optimal-soft text-optimal",
    red: "bg-outofrange-soft text-outofrange",
    amber: "bg-suboptimal-soft text-suboptimal",
    grey: "bg-muted text-muted-foreground",
  }[tone];
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${cls}`}>
      {children}
    </span>
  );
}

export function PatientsTable({
  patients,
  summaries,
  isPending,
  summariesPending,
  onEditPlan,
}: {
  patients: Patient[];
  summaries: Map<string, Summary> | undefined;
  isPending: boolean;
  summariesPending: boolean;
  onEditPlan: (p: Patient) => void;
}) {
  const [sort, setSort] = useState<SortKey>("name_asc");
  const [filter, setFilter] = useState<FilterKey>("all");
  const [open, setOpen] = useState<string | null>(null);

  const rows = useMemo(() => {
    const mapped = patients.map((p) => {
      const plan = parseTreatmentPlan(p.notes);
      const activeMeds = (plan?.medications ?? []).filter(
        (m) => m.name.trim() && isActiveStatus(m.status),
      );
      const risk = riskLevel(p.notes);
      const summary = summaries?.get(p.patient_id);
      const findings = [...notesRiskFindings(p.notes), ...(summary?.riskFindings ?? [])];
      return {
        highRisk: findings.length > 0 || risk === "high_risk",
        patient: p,
        name: patientName(p),
        plan,
        activeMeds,
        risk,
        synthetic: isSynthetic(p.notes),
        count: summary?.count ?? 0,
        lastDate: summary?.lastDate ?? null,
      };
    });

    const filtered = mapped.filter((r) => {
      if (filter === "all") return true;
      if (filter === "protocol") return r.activeMeds.length > 0;
      if (filter === "excluded") return r.risk === "exclusion";
      if (filter === "high_risk") return r.highRisk;
      return r.synthetic;
    });

    const sorted = [...filtered].sort((a, b) => {
      if (sort === "name_asc") return a.name.localeCompare(b.name);
      if (sort === "name_desc") return b.name.localeCompare(a.name);
      if (sort === "results") return b.count - a.count;
      return (b.lastDate ?? "").localeCompare(a.lastDate ?? "");
    });
    return sorted;
  }, [patients, summaries, sort, filter]);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              className={`rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                filter === f.id
                  ? "border-ink bg-ink text-ink-foreground"
                  : "border-border bg-card text-ink hover:border-primary hover:text-primary"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Sort by
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="rounded-lg border border-border bg-card pl-3 pr-9 py-1.5 text-xs font-semibold normal-case tracking-normal text-ink outline-none focus:border-primary"
          >
            {SORTS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-5 overflow-hidden rounded-xl border border-border shadow-[var(--shadow-card)]">
        <div className="grid grid-cols-[minmax(140px,2fr)_56px_64px_130px_84px_minmax(120px,1.1fr)_minmax(150px,1.4fr)_28px] items-center gap-3 bg-ink pl-5 pr-6 py-3 text-[11px] font-semibold uppercase tracking-wide text-ink-foreground">
          <span>Name</span>
          <span>Age</span>
          <span>Sex</span>
          <span>Last Test Date</span>
          <span>Results</span>
          <span>Status</span>
          <span>Protocol</span>
          <span />
        </div>

        {isPending &&
          Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="border-t border-border bg-card px-5 py-3">
              <Skeleton className="h-5 w-full" />
            </div>
          ))}

        {!isPending && rows.length === 0 && (
          <p className="border-t border-border bg-card px-5 py-6 text-sm text-muted-foreground">
            No patients match this filter.
          </p>
        )}

        {rows.map((r, i) => {
          const expanded = open === r.patient.patient_id;
          const protocolText =
            r.highRisk
              ? "Specialist review required"
              : r.activeMeds.length > 0
              ? r.activeMeds.map((m) => m.name.trim()).join(", ")
              : r.risk === "exclusion"
                ? "Excluded from protocols"
                : "—";
          return (
            <div key={r.patient.patient_id} className="border-t border-border">
              <div
                role="button"
                tabIndex={0}
                aria-expanded={expanded}
                onClick={() => setOpen(expanded ? null : r.patient.patient_id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setOpen(expanded ? null : r.patient.patient_id);
                  }
                }}
                className={`grid cursor-pointer grid-cols-[minmax(140px,2fr)_56px_64px_130px_84px_minmax(120px,1.1fr)_minmax(150px,1.4fr)_28px] items-center gap-3 pl-5 pr-6 py-3 text-sm transition-colors hover:bg-muted/70 ${
                  i % 2 === 0 ? "bg-card" : "bg-background"
                }`}
              >
                <span className="truncate font-semibold text-ink">{r.name}</span>
                <span className="text-foreground/80">{ageFrom(r.patient.date_of_birth)}</span>
                <span className="text-foreground/80">{r.patient.sex ?? "—"}</span>
                <span className="text-foreground/80">
                  {summariesPending ? "…" : formatDate(r.lastDate)}
                </span>
                <span className="text-foreground/80">{summariesPending ? "…" : r.count}</span>
                <span className="flex flex-wrap gap-1">
                  {r.highRisk && <StatusPill tone="red">HIGH RISK</StatusPill>}
                  {r.risk === "exclusion" && <StatusPill tone="red">Excluded</StatusPill>}
                  {r.activeMeds.length > 0 && <StatusPill tone="green">On Protocol</StatusPill>}
                  {r.synthetic && <StatusPill tone="grey">Synthetic</StatusPill>}
                </span>
                <span className="truncate text-foreground/80">{protocolText}</span>
                <span className="flex justify-end">
                  <ChevronDown
                    size={18}
                    className={`text-muted-foreground transition-transform ${expanded ? "rotate-180" : ""}`}
                  />
                </span>
              </div>

              {expanded && (
                <div className="border-t border-border bg-card px-5 py-5">
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Current treatment plan
                  </div>
                  {r.activeMeds.length === 0 && !r.plan?.summary?.trim() ? (
                    <p className="mt-1.5 text-sm text-muted-foreground">Not on a protocol</p>
                  ) : (
                    <ul className="mt-1.5 space-y-1 text-sm text-foreground/85">
                      {r.activeMeds.map((m, idx) => (
                        <li key={idx}>{describeMedication(m)}</li>
                      ))}
                      {r.plan?.summary?.trim() && <li>{r.plan.summary.trim()}</li>}
                    </ul>
                  )}
                  <div className="mt-4 flex flex-wrap items-center gap-3">
                    <Link
                      to="/results"
                      search={{ patient: r.patient.patient_id }}
                      className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
                    >
                      View Results
                    </Link>
                    <button
                      type="button"
                      onClick={() => onEditPlan(r.patient)}
                      className="rounded-lg border border-border bg-card px-4 py-2 text-sm font-semibold text-ink transition-colors hover:border-primary hover:text-primary"
                    >
                      Edit Treatment Plan
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
