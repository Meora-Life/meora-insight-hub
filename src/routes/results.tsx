import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { PageShell } from "@/components/site-chrome";
import { PatientSelector } from "@/components/patient-selector";
import { RangeBar } from "@/components/range-bar";
import { Pill, Skeleton, StatusBadge } from "@/components/ui-bits";
import { isUnlocked } from "@/lib/gate.functions";
import { generateHealthSummary } from "@/lib/ai.functions";
import { patientsQuery, resultsQuery, testDefinitionsQuery } from "@/lib/queries";
import {
  buildRangeBar,
  definitionKey,
  formatDate,
  matchesFilter,
  patientName,
  resultStatus,
  statusInfo,
  type ResultFilter,
} from "@/lib/meora";
import { HighRiskBanner } from "@/components/risk-banner";
import { riskFindings, type RiskFinding } from "@/lib/risk";
import { clinicalNotes } from "@/lib/treatment";
import type { FlatResult, StatusKey, TestDefinition } from "@/lib/types";

export const Route = createFileRoute("/results")({
  validateSearch: (search: Record<string, unknown>): { patient?: string } => ({
    patient: typeof search.patient === "string" ? search.patient : undefined,
  }),
  beforeLoad: async () => {
    const { unlocked } = await isUnlocked();
    if (!unlocked) throw redirect({ to: "/unlock" });
  },
  head: () => ({
    meta: [
      { title: "Results & Insights — MeorAI" },
      {
        name: "description",
        content:
          "Review every biomarker by category with reference ranges, optimal zones and AI health summaries.",
      },
      { property: "og:title", content: "Results & Insights — MeorAI" },
      {
        property: "og:description",
        content:
          "Review every biomarker by category with reference ranges, optimal zones and AI health summaries.",
      },
    ],
  }),
  component: ResultsPage,
});

const FILTERS: Array<{ id: ResultFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "optimal", label: "Optimal" },
  { id: "suboptimal", label: "Suboptimal" },
  { id: "out_of_range", label: "Out of Range" },
  { id: "other", label: "Other" },
];

function ResultsPage() {
  const { patient: patientParam } = Route.useSearch();
  const navigate = Route.useNavigate();
  const patients = useQuery(patientsQuery());
  const definitions = useQuery(testDefinitionsQuery());

  const selectedId = patientParam ?? patients.data?.[0]?.patient_id ?? null;
  const results = useQuery(resultsQuery(selectedId));
  const [filter, setFilter] = useState<ResultFilter>("all");
  const [submissionChoice, setSubmissionChoice] = useState<{
    patientId: string | null;
    submissionId: string | null;
  }>({ patientId: null, submissionId: null });

  const patient = patients.data?.find((p) => p.patient_id === selectedId) ?? null;
  const defs: Map<string, TestDefinition> = definitions.data ?? new Map();

  const submissions = useMemo(() => {
    const map = new Map<string, { id: string; date: string | null; reportType: string | null }>();
    for (const r of results.data ?? []) {
      if (!map.has(r.submission_id)) {
        map.set(r.submission_id, {
          id: r.submission_id,
          date: r.date_collected,
          reportType: r.report_type,
        });
      }
    }
    return [...map.values()].sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
  }, [results.data]);

  const activeSubmission =
    submissionChoice.patientId === selectedId ? submissionChoice.submissionId : null;

  const visible = useMemo(() => {
    const rows = results.data ?? [];
    if (activeSubmission) return rows.filter((r) => r.submission_id === activeSubmission);
    // Latest view: keep only the most recent result per test
    const latest = new Map<string, FlatResult>();
    for (const r of rows) {
      const key = definitionKey(r.category, r.test_name);
      const current = latest.get(key);
      if (!current || (r.date_collected ?? "") > (current.date_collected ?? "")) latest.set(key, r);
    }
    return [...latest.values()];
  }, [results.data, activeSubmission]);

  const statuses = useMemo(() => {
    const map = new Map<string, StatusKey>();
    for (const r of visible) {
      map.set(r.result_id, resultStatus(r, defs.get(definitionKey(r.category, r.test_name))));
    }
    return map;
  }, [visible, defs]);

  const counts = useMemo(() => {
    let optimal = 0;
    let suboptimal = 0;
    let outOfRange = 0;
    statuses.forEach((s) => {
      if (s === "optimal") optimal += 1;
      else if (s === "suboptimal") suboptimal += 1;
      else if (s === "out_of_range" || s === "abnormal") outOfRange += 1;
    });
    return { total: statuses.size, optimal, suboptimal, outOfRange };
  }, [statuses]);

  const grouped = useMemo(() => {
    const groups = new Map<string, FlatResult[]>();
    for (const r of visible) {
      const status = statuses.get(r.result_id);
      if (!status || !matchesFilter(status, filter)) continue;
      const key = r.category ?? "Other";
      const list = groups.get(key) ?? [];
      list.push(r);
      groups.set(key, list);
    }
    return [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [visible, statuses, filter]);


  const findings = useMemo(
    () => riskFindings(patient?.notes ?? null, results.data ?? []),
    [patient?.notes, results.data],
  );

  return (
    <PageShell>
      {findings.length > 0 && <HighRiskBanner findings={findings} />}
      <div className="mx-auto max-w-7xl px-6 py-12">
        <h1 className="font-display text-4xl font-semibold tracking-tight text-ink">
          Results &amp; Insights
        </h1>

        <div className="mt-6">
          <PatientSelector
            patients={patients.data ?? []}
            value={selectedId}
            loading={patients.isPending}
            onChange={(id) => void navigate({ to: ".", search: { patient: id } })}
          />
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <label htmlFor="submission-select" className="text-sm font-semibold text-ink">
            Submission
          </label>
          <select
            id="submission-select"
            value={activeSubmission ?? ""}
            disabled={results.isPending}
            onChange={(e) =>
              setSubmissionChoice({
                patientId: selectedId,
                submissionId: e.target.value || null,
              })
            }
            className="min-w-[320px] rounded-xl border border-input bg-card px-4 py-2.5 text-sm font-medium text-foreground shadow-[var(--shadow-card)] outline-none focus:border-primary focus:ring-2 focus:ring-primary/25 disabled:opacity-60"
          >
            <option value="">Latest result per test (all submissions)</option>
            {submissions.map((s) => (
              <option key={s.id} value={s.id}>
                {formatDate(s.date)}
                {s.reportType ? ` — ${s.reportType}` : ""}
              </option>
            ))}
          </select>
        </div>

        <div className="mt-8 grid grid-cols-2 gap-4 md:grid-cols-4">
          <Pill label="Total results" value={results.isPending ? "…" : counts.total} />
          <Pill
            label="Out of range"
            value={results.isPending ? "…" : counts.outOfRange}
            tone="outofrange"
          />
          <Pill
            label="Suboptimal"
            value={results.isPending ? "…" : counts.suboptimal}
            tone="suboptimal"
          />
          <Pill label="Optimal" value={results.isPending ? "…" : counts.optimal} tone="optimal" />
        </div>

        <div className="mt-6 flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
                filter === f.id
                  ? "bg-ink text-ink-foreground"
                  : "border border-border bg-card text-muted-foreground hover:text-ink"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        <AiSummaryPanel
          patientLabel={patient ? patientName(patient) : null}
          results={visible}
          statuses={statuses}
          notes={clinicalNotes(patient?.notes ?? null)}
          findings={findings}
        />

        <div className="mt-10 space-y-10">
          {results.isPending &&
            Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-64 rounded-xl" />
            ))}

          {!results.isPending && grouped.length === 0 && (
            <div className="rounded-xl border border-dashed border-border bg-card p-12 text-center">
              <p className="text-sm font-semibold text-ink">No results to show</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {counts.total === 0
                  ? "This patient has no processed results yet."
                  : "No results match the selected filter."}
              </p>
            </div>
          )}

          {grouped.map(([category, rows]) => (
            <section key={category}>
              <div className="flex items-baseline gap-3 border-b border-border pb-3">
                <h2 className="text-lg font-extrabold tracking-tight text-ink">{category}</h2>
                <span className="text-sm text-muted-foreground">{rows.length} tests</span>
              </div>
              <div className="divide-y divide-border rounded-b-xl bg-card shadow-[var(--shadow-card)]">
                {rows.map((row) => (
                  <ResultRow
                    key={row.result_id}
                    row={row}
                    def={defs.get(definitionKey(row.category, row.test_name))}
                    status={statuses.get(row.result_id) ?? "optimal"}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </PageShell>
  );
}

function ResultRow({
  row,
  def,
  status,
}: {
  row: FlatResult;
  def?: TestDefinition;
  status: StatusKey;
}) {
  const bar = buildRangeBar(row, def);
  const info = statusInfo(status);

  return (
    <div className="grid grid-cols-1 items-center gap-3 px-6 py-4 md:grid-cols-[1.4fr_1fr_1.1fr_auto]">
      <div>
        <div className="font-semibold text-ink">{row.test_name}</div>
        {row.subcategory && (
          <div className="text-xs text-muted-foreground">{row.subcategory}</div>
        )}
      </div>
      <div>
        <div className="text-xl font-extrabold tabular-nums text-foreground">
          {row.result_value ?? "—"}
          {row.unit && <span className="ml-1 text-sm font-medium text-muted-foreground">{row.unit}</span>}
        </div>
        <div className="text-xs text-muted-foreground">{formatDate(row.date_collected)}</div>
      </div>
      <div>
        {bar ? (
          <>
            <RangeBar model={bar} markerColor={info.color} />
            <div className="mt-0.5 text-[11px] text-muted-foreground">
              {row.reference_range ?? ""}
            </div>
          </>
        ) : (
          <div className="text-xs text-muted-foreground">{row.reference_range ?? ""}</div>
        )}
      </div>
      <div className="justify-self-start md:justify-self-end">
        <StatusBadge status={status} />
      </div>
    </div>
  );
}

function AiSummaryPanel({
  patientLabel,
  results,
  statuses,
  notes,
  findings,
}: {
  patientLabel: string | null;
  results: FlatResult[];
  statuses: Map<string, StatusKey>;
  notes: string | null;
  findings: RiskFinding[];
}) {
  const [open, setOpen] = useState(false);
  const generate = useServerFn(generateHealthSummary);

  // Send the full selected submission — flagged and normal — so Claude has full context.
  const flagged = useMemo(
    () =>
      results
        .slice(0, 250)
        .map((r) => ({
          test_name: r.test_name,
          category: r.category,
          result_value: r.result_value,
          unit: r.unit,
          reference_range: r.reference_range,
          flag: r.flag,
          status: statuses.get(r.result_id) ?? "unknown",
        })),
    [results, statuses],
  );

  const summary = useMutation({
    mutationFn: async () => {
      if (!patientLabel) throw new Error("Select a patient first");
      return generate({
        data: {
          patient_name: patientLabel,
          results: flagged,
          clinical_notes: notes,
          high_risk: findings.length > 0,
          risk_reasons: findings.map((f) => `${f.category}: ${f.detail}`),
        },
      });
    },
  });

  return (
    <div className="mt-6 rounded-xl border border-border bg-card shadow-[var(--shadow-card)]">
      <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="text-left text-base font-extrabold tracking-tight text-ink"
        >
          AI Health Summary
          <span className="ml-2 text-xs font-medium text-muted-foreground">
            {open ? "Hide" : "Show"}
          </span>
        </button>
        <button
          type="button"
          disabled={!patientLabel || summary.isPending}
          onClick={() => {
            setOpen(true);
            summary.mutate();
          }}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {summary.isPending ? "Generating…" : "Generate Summary"}
        </button>
      </div>

      {open && (
        <div className="border-t border-border px-6 py-5">
          {summary.isPending && (
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              Analysing {flagged.length} biomarkers…
            </div>
          )}
          {summary.isError && (
            <p className="text-sm text-outofrange">
              {summary.error instanceof Error
                ? summary.error.message
                : "Could not generate the summary."}
            </p>
          )}
          {summary.isSuccess && <SummaryText text={summary.data.summary} />}
          {summary.isIdle && (
            <p className="text-sm text-muted-foreground">
              Generate a clinical summary of this patient&apos;s flagged results, key findings and
              recommended actions.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function SummaryText({ text }: { text: string }) {
  const blocks = text.split(/\n{2,}/).filter((b) => b.trim().length > 0);
  return (
    <div className="space-y-4">
      {blocks.map((block, i) => {
        const trimmed = block.trim();
        const isHeading = trimmed.length < 60 && !trimmed.includes("\n") && /:?$/.test(trimmed) && /^[A-Z0-9]/.test(trimmed) && trimmed.split(" ").length <= 6;
        if (isHeading) {
          return (
            <h3 key={i} className="text-sm font-extrabold uppercase tracking-wide text-ink">
              {trimmed.replace(/:$/, "")}
            </h3>
          );
        }
        return (
          <p key={i} className="whitespace-pre-line text-sm leading-relaxed text-foreground/85">
            {trimmed}
          </p>
        );
      })}
    </div>
  );
}
