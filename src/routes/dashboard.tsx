import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ArrowDownRight, ArrowUpRight, Info, X } from "lucide-react";
import { PageShell } from "@/components/site-chrome";
import { PatientSelector } from "@/components/patient-selector";
import { ArcDial } from "@/components/arc-dial";
import { Skeleton } from "@/components/ui-bits";
import { isUnlocked } from "@/lib/gate.functions";
import {
  patientsQuery,
  resultsQuery,
  submissionCountQuery,
  testDefinitionsQuery,
} from "@/lib/queries";
import {
  definitionKey,
  formatDate,
  patientName,
  recommendedProtocols,
  resultStatus,
  riskLevel,
  riskReason,
  statusInfo,
  systemScores,
  wearablesFor,
  type Protocol,
  type SystemScore,
} from "@/lib/meora";
import { BIO_AGE_TOOLTIP, biologicalAge } from "@/lib/bioage";
import type { FlatResult, Patient, TestDefinition } from "@/lib/types";


export const Route = createFileRoute("/dashboard")({
  validateSearch: (search: Record<string, unknown>): { patient?: string } => ({
    patient: typeof search.patient === "string" ? search.patient : undefined,
  }),
  beforeLoad: async () => {
    const { unlocked } = await isUnlocked();
    if (!unlocked) throw redirect({ to: "/unlock" });
  },
  head: () => ({
    meta: [
      { title: "Patient Dashboard — MeorAI" },
      {
        name: "description",
        content:
          "Biological age, eight system health scores, wearables and recommended protocols for each patient.",
      },
      { property: "og:title", content: "Patient Dashboard — MeorAI" },
      {
        property: "og:description",
        content:
          "Biological age, eight system health scores, wearables and recommended protocols for each patient.",
      },
    ],
  }),
  component: DashboardPage,
});

function DashboardPage() {
  const { patient: patientParam } = Route.useSearch();
  const navigate = Route.useNavigate();
  const patients = useQuery(patientsQuery());
  const definitions = useQuery(testDefinitionsQuery());

  const selectedId = patientParam ?? patients.data?.[0]?.patient_id ?? null;
  const results = useQuery(resultsQuery(selectedId));
  const submissions = useQuery(submissionCountQuery(selectedId));

  const patient = patients.data?.find((p) => p.patient_id === selectedId) ?? null;
  const rows = results.data ?? [];

  const [openSystem, setOpenSystem] = useState<string | null>(null);

  const scores = useMemo(
    () => systemScores(rows, definitions.data ?? new Map()),
    [rows, definitions.data],
  );
  const openDetail = scores.find((s) => s.system.id === openSystem) ?? null;


  return (
    <PageShell>
      <div className="mx-auto max-w-7xl px-6 py-12">
        <h1 className="font-display text-4xl font-semibold tracking-tight text-ink">Dashboard</h1>

        <div className="mt-6">
          <PatientSelector
            patients={patients.data ?? []}
            value={selectedId}
            loading={patients.isPending}
            onChange={(id) => void navigate({ to: ".", search: { patient: id } })}
          />
        </div>

        {patient ? (
          <HeroCard
            patient={patient}
            rows={rows}
            submissionCount={submissions.data ?? 0}
            loading={results.isPending}
          />
        ) : (
          <Skeleton className="mt-8 h-52 rounded-xl" />
        )}

        <section className="mt-12">
          <h2 className="text-xl font-extrabold tracking-tight text-ink">System Health Scores</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Select a system to see the biomarkers behind its score.
          </p>
          <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-4">
            {results.isPending
              ? Array.from({ length: 8 }).map((_, i) => (
                  <Skeleton key={i} className="h-52 rounded-xl" />
                ))
              : scores.map((s) => (
                  <ArcDial
                    key={s.system.id}
                    score={s.score}
                    label={s.system.name}
                    count={s.count}
                    active={openSystem === s.system.id}
                    onClick={
                      s.contributions.length
                        ? () =>
                            setOpenSystem((cur) => (cur === s.system.id ? null : s.system.id))
                        : undefined
                    }
                  />
                ))}
          </div>

          {openDetail && (
            <SystemDetail
              detail={openDetail}
              defs={definitions.data ?? new Map()}
              onClose={() => setOpenSystem(null)}
            />
          )}
        </section>


        {patient && (
          <section className="mt-12">
            <h2 className="text-xl font-extrabold tracking-tight text-ink">Wearables</h2>
            <WearablesStrip patient={patient} />
          </section>
        )}
      </div>

      {patient && (
        <section className="border-t border-border bg-background">
          <div className="mx-auto max-w-7xl px-6 py-14">
            <h2 className="text-xl font-extrabold tracking-tight text-ink">
              Recommended Protocols
            </h2>
            <div className="mt-6 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
              {results.isPending
                ? Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="h-40 rounded-xl" />
                  ))
                : recommendedProtocols(patient, rows).map((p) => (
                    <ProtocolCard key={p.name} protocol={p} />
                  ))}
            </div>
          </div>
        </section>
      )}
    </PageShell>
  );
}

function HeroCard({
  patient,
  rows,
  submissionCount,
  loading,
}: {
  patient: Patient;
  rows: FlatResult[];
  submissionCount: number;
  loading: boolean;
}) {
  const risk = riskLevel(patient.notes);
  const lastDate = rows.reduce<string | null>(
    (acc, r) => (r.date_collected && (!acc || r.date_collected > acc) ? r.date_collected : acc),
    null,
  );
  const bioAge = biologicalAge(patient, rows);
  const chrono = bioAge.chronoAge;
  const bio = bioAge.bioAge;
  const delta = bioAge.delta;

  return (
    <div className="mt-8 overflow-hidden rounded-xl bg-ink text-ink-foreground shadow-[var(--shadow-card)]">
      {risk !== "none" && (
        <div
          className={`px-8 py-4 text-sm font-semibold ${
            risk === "exclusion" ? "bg-outofrange text-white" : "bg-suboptimal text-white"
          }`}
        >
          {risk === "exclusion" ? "Exclusion — " : "High risk — "}
          <span className="font-medium">{riskReason(patient.notes)}</span>
        </div>
      )}

      <div className="grid gap-8 p-8 md:grid-cols-3 md:items-center">
        <div>
          <div className="font-display text-4xl font-semibold tracking-tight">
            {patientName(patient)}
          </div>
          <div className="mt-4 space-y-1 text-sm text-ink-foreground/70">
            <div>Chronological age: {chrono !== null ? `${chrono}` : "—"}</div>
            <div>
              Biological age: {bio !== null ? `${bio}` : "Not measured"}
              {bio !== null && bioAge.source === "derived" && " (derived)"}
            </div>
          </div>
        </div>

        <div className="text-center">
          <div className="group relative inline-block">
            <div className="flex items-center justify-center gap-2">
              <span className="text-[4rem] font-extrabold leading-none tabular-nums">
                {loading ? "…" : bio !== null ? bio : "—"}
              </span>
              <Info className="h-4 w-4 text-ink-foreground/50" aria-hidden="true" />
            </div>
            <div
              role="tooltip"
              className="pointer-events-none absolute left-1/2 top-full z-20 mt-3 w-72 -translate-x-1/2 rounded-xl bg-card p-4 text-left text-xs leading-relaxed text-foreground opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100"
            >
              {BIO_AGE_TOOLTIP}
              {bioAge.missing.length > 0 && bioAge.source === "derived" && (
                <span className="mt-2 block text-muted-foreground">
                  Not available in this patient&apos;s panels (population median assumed):{" "}
                  {bioAge.missing.join(", ")}.
                </span>
              )}
            </div>
          </div>
          <div
            className="mt-1 text-xs uppercase tracking-wide text-ink-foreground/60"
            tabIndex={0}
          >
            Biological age
          </div>
          {delta !== null && (
            <span
              className="mt-3 inline-flex rounded-full px-3 py-1 text-sm font-semibold"
              style={{
                backgroundColor: delta <= 0 ? "var(--optimal)" : "var(--outofrange)",
                color: "white",
              }}
            >
              {delta <= 0 ? "−" : "+"}
              {Math.abs(delta)} years
            </span>
          )}
        </div>


        <div className="space-y-2 text-sm md:text-right">
          <HeroStat label="Last test" value={formatDate(lastDate)} />
          <HeroStat label="Total biomarkers" value={loading ? "…" : String(rows.length)} />
          <HeroStat label="Submissions" value={String(submissionCount)} />
        </div>
      </div>
    </div>
  );
}

function HeroStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-ink-foreground/60">{label}: </span>
      <span className="font-semibold">{value}</span>
    </div>
  );
}

function WearablesStrip({ patient }: { patient: Patient }) {
  const w = wearablesFor(patient);
  const metrics = [
    { name: "Steps (today)", value: w.steps },
    { name: "Sleep (last night)", value: w.sleep },
    { name: "HRV (last night)", value: w.hrv },
    { name: "Resting HR", value: w.rhr },
  ];
  const Icon = w.trend === "up" ? ArrowUpRight : ArrowDownRight;
  const trendColor = w.trend === "up" ? "text-optimal" : "text-outofrange";

  return (
    <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-4">
      {metrics.map((m) => (
        <div
          key={m.name}
          className="rounded-xl border border-border bg-card p-5 shadow-[var(--shadow-card)]"
        >
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {m.name}
          </div>
          <div className="mt-2 flex items-center gap-2">
            <span className="text-2xl font-extrabold tabular-nums text-ink">{m.value}</span>
            <Icon className={`h-4 w-4 ${trendColor}`} aria-hidden="true" />
          </div>
        </div>
      ))}
    </div>
  );
}

function ProtocolCard({ protocol }: { protocol: Protocol }) {
  const toneClass =
    protocol.tone === "red"
      ? "border-outofrange/40 bg-outofrange-soft"
      : protocol.tone === "amber"
        ? "border-suboptimal/40 bg-suboptimal-soft"
        : protocol.tone === "green"
          ? "border-optimal/40 bg-optimal-soft"
          : "border-border bg-card";

  const badgeClass =
    protocol.urgency === "Urgent"
      ? "bg-outofrange text-white"
      : protocol.urgency === "Priority"
        ? "bg-suboptimal text-white"
        : "bg-muted text-muted-foreground";

  return (
    <div className={`rounded-xl border p-6 shadow-[var(--shadow-card)] ${toneClass}`}>
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-semibold text-ink">{protocol.name}</h3>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${badgeClass}`}>
          {protocol.urgency}
        </span>
      </div>
      <p className="mt-3 text-sm leading-relaxed text-foreground/80">{protocol.rationale}</p>
      <p className="mt-4 text-xs text-muted-foreground">Discuss with your doctor.</p>
    </div>
  );
}
