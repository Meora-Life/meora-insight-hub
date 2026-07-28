import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState, type FormEvent } from "react";
import { useServerFn } from "@tanstack/react-start";
import Papa from "papaparse";
import { PageShell } from "@/components/site-chrome";
import { Skeleton } from "@/components/ui-bits";
import { isUnlocked } from "@/lib/gate.functions";
import { parsePdfReport } from "@/lib/parse.functions";
import {
  patientSummariesQuery,
  patientsQuery,
  platformStatsQuery,
  testDefinitionsQuery,
} from "@/lib/queries";
import { supabase } from "@/lib/supabase";
import { formatDate, isSynthetic, patientName, riskLevel } from "@/lib/meora";

export const Route = createFileRoute("/")({
  beforeLoad: async () => {
    const { unlocked } = await isUnlocked();
    if (!unlocked) throw redirect({ to: "/unlock" });
  },
  head: () => ({
    meta: [
      { title: "MeorAI — Know your biology. Own your future." },
      {
        name: "description",
        content:
          "Add a patient, upload lab results and analyse blood tests, hormones and biomarkers with MeorAI.",
      },
      { property: "og:title", content: "MeorAI — Know your biology. Own your future." },
      {
        property: "og:description",
        content:
          "Add a patient, upload lab results and analyse blood tests, hormones and biomarkers with MeorAI.",
      },
    ],
  }),
  component: HomePage,
});

type UploadMethod = "pdf" | "csv" | "manual";

interface NewPatientForm {
  first_name: string;
  last_name: string;
  date_of_birth: string;
  sex: "M" | "F";
}

function nextId(prefix: string, existing: string[]): string {
  const max = existing.reduce((acc, id) => {
    const match = id.match(/(\d+)$/);
    return match ? Math.max(acc, Number(match[1])) : acc;
  }, 0);
  return `${prefix}-${String(max + 1).padStart(3, "0")}`;
}

function HomePage() {
  const queryClient = useQueryClient();
  const patients = useQuery(patientsQuery());
  const summaries = useQuery(patientSummariesQuery());
  const stats = useQuery(platformStatsQuery());
  const definitions = useQuery(testDefinitionsQuery());

  const [form, setForm] = useState<NewPatientForm>({
    first_name: "",
    last_name: "",
    date_of_birth: "",
    sex: "M",
  });
  const [method, setMethod] = useState<UploadMethod>("pdf");
  const [fileName, setFileName] = useState<string>("");
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pasted, setPasted] = useState("");
  const [stage, setStage] = useState<ParseStage>(null);
  const [csvMatches, setCsvMatches] = useState<{ matched: string[]; unmatched: string[] } | null>(
    null,
  );

  const navigate = useNavigate();
  const parsePdf = useServerFn(parsePdfReport);

  const definitionNames = useMemo(() => {
    const names = new Set<string>();
    definitions.data?.forEach((def) => names.add(def.test_name.toLowerCase()));
    return names;
  }, [definitions.data]);

  function handleCsv(file: File) {
    setFileName(file.name);
    Papa.parse<Record<string, string>>(file, {
      header: true,
      preview: 1,
      skipEmptyLines: true,
      complete: (parsed) => {
        const headers = (parsed.meta.fields ?? []).map((h) => h.trim()).filter(Boolean);
        const matched: string[] = [];
        const unmatched: string[] = [];
        for (const header of headers) {
          if (definitionNames.has(header.toLowerCase())) matched.push(header);
          else unmatched.push(header);
        }
        setCsvMatches({ matched, unmatched });
      },
    });
  }

  const createPatient = useMutation({
    mutationFn: async (): Promise<string> => {
      if (method === "pdf" && !pdfFile) throw new Error("Select a PDF pathology report first.");

      setStage("patient");
      const existingPatients = (patients.data ?? []).map((p) => p.patient_id);
      const patientId = nextId("PAT", existingPatients);

      const { error: patientError } = await supabase.from("patients").insert({
        patient_id: patientId,
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        date_of_birth: form.date_of_birth || null,
        sex: form.sex,
        notes: "Created via MeorAI upload",
      });
      if (patientError) throw new Error(patientError.message);

      if (method === "pdf" && pdfFile) {
        setStage("extracting");
        const file_base64 = await fileToBase64(pdfFile);
        setStage("analysing");
        const result = await parsePdf({
          data: { patient_id: patientId, file_name: pdfFile.name, file_base64 },
        });
        setStage("saving");
        void result;
        return patientId;
      }

      const { data: subs, error: subsError } = await supabase
        .from("report_submissions")
        .select("submission_id");
      if (subsError) throw new Error(subsError.message);
      const submissionId = nextId(
        "SUB",
        (subs ?? []).map((s: { submission_id: string }) => s.submission_id),
      );

      const { error: submissionError } = await supabase.from("report_submissions").insert({
        submission_id: submissionId,
        patient_id: patientId,
        lab_name: "Pending — uploaded via MeorAI",
        report_type: method === "manual" ? "Manual paste" : method.toUpperCase(),
        date_collected: new Date().toISOString().slice(0, 10),
        source_file: method === "manual" ? "manual-paste.txt" : fileName || null,
        notes: method === "manual" ? pasted.slice(0, 2000) : null,
      });
      if (submissionError) throw new Error(submissionError.message);

      return patientId;
    },
    onError: () => setStage(null),
    onSuccess: (patientId) => {
      setStage(null);
      void queryClient.invalidateQueries({ queryKey: ["patients"] });
      void queryClient.invalidateQueries({ queryKey: ["patient_summaries"] });
      void queryClient.invalidateQueries({ queryKey: ["platform_stats"] });
      void queryClient.invalidateQueries({ queryKey: ["flat_results", patientId] });
      if (method === "pdf") void navigate({ to: "/results", search: { patient: patientId } });
    },
  });

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    createPatient.mutate();
  }

  return (
    <PageShell>
      <section className="mx-auto max-w-7xl px-6 pb-4 pt-16 md:pt-24">
        <div className="max-w-3xl">
          <h1 className="font-display text-5xl font-semibold leading-[1.05] tracking-tight text-ink md:text-6xl">
            Know your biology. <span className="text-primary">Own your future.</span>
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-foreground/80">
            MeorAI analyses your blood tests, hormones, and biomarkers to build a complete picture
            of your health — and what to do about it.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <StatPill
              text={`${stats.data ? stats.data.biomarkers : "—"} biomarkers tracked`}
              loading={stats.isPending}
            />
            <StatPill
              text={`${stats.data ? stats.data.categories : "—"} categories analysed`}
              loading={stats.isPending}
            />
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-6 pt-10">
        <div className="rounded-xl border border-border bg-card p-8 shadow-[var(--shadow-card)]">
          <h2 className="text-xl font-extrabold tracking-tight text-ink">
            Add a patient &amp; upload results
          </h2>

          {createPatient.isSuccess ? (
            <div className="mt-6 rounded-xl border border-optimal/30 bg-optimal-soft p-6">
              <p className="text-sm font-semibold text-optimal">Patient created.</p>
              <p className="mt-1 text-sm text-foreground/80">
                Results will appear in the dashboard once processed.
              </p>
              <div className="mt-4 flex gap-3">
                <Link
                  to="/results"
                  search={{ patient: createPatient.data }}
                  className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
                >
                  View patient
                </Link>
                <button
                  type="button"
                  onClick={() => createPatient.reset()}
                  className="rounded-lg border border-input px-4 py-2 text-sm font-semibold text-ink"
                >
                  Add another
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="mt-6 space-y-6">
              <div className="grid gap-4 md:grid-cols-4">
                <Field label="First name">
                  <input
                    required
                    maxLength={80}
                    value={form.first_name}
                    onChange={(e) => setForm({ ...form, first_name: e.target.value })}
                    className={inputClass}
                  />
                </Field>
                <Field label="Last name">
                  <input
                    required
                    maxLength={80}
                    value={form.last_name}
                    onChange={(e) => setForm({ ...form, last_name: e.target.value })}
                    className={inputClass}
                  />
                </Field>
                <Field label="Date of birth">
                  <input
                    type="date"
                    required
                    value={form.date_of_birth}
                    onChange={(e) => setForm({ ...form, date_of_birth: e.target.value })}
                    className={inputClass}
                  />
                </Field>
                <Field label="Sex">
                  <select
                    value={form.sex}
                    onChange={(e) => setForm({ ...form, sex: e.target.value === "F" ? "F" : "M" })}
                    className={inputClass}
                  >
                    <option value="M">M</option>
                    <option value="F">F</option>
                  </select>
                </Field>
              </div>

              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Upload method
                </div>
                <div className="mt-2 inline-flex rounded-xl border border-border bg-muted p-1">
                  {(["pdf", "csv", "manual"] as UploadMethod[]).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => {
                        setMethod(m);
                        setCsvMatches(null);
                        setFileName("");
                      }}
                      className={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
                        method === m
                          ? "bg-card text-ink shadow-[var(--shadow-card)]"
                          : "text-muted-foreground hover:text-ink"
                      }`}
                    >
                      {m === "pdf" ? "PDF" : m === "csv" ? "CSV" : "Manual paste"}
                    </button>
                  ))}
                </div>
              </div>

              {method === "pdf" && (
                <Field label="Pathology report (PDF)">
                  <input
                    type="file"
                    accept=".pdf"
                    onChange={(e) => setFileName(e.target.files?.[0]?.name ?? "")}
                    className={fileInputClass}
                  />
                </Field>
              )}

              {method === "csv" && (
                <div className="space-y-3">
                  <Field label="Results file (CSV)">
                    <input
                      type="file"
                      accept=".csv"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleCsv(file);
                      }}
                      className={fileInputClass}
                    />
                  </Field>
                  {csvMatches && (
                    <div className="rounded-xl border border-border bg-muted/60 p-4 text-sm">
                      <p className="font-semibold text-ink">
                        {csvMatches.matched.length} of{" "}
                        {csvMatches.matched.length + csvMatches.unmatched.length} columns matched to
                        known tests
                      </p>
                      {csvMatches.matched.length > 0 && (
                        <p className="mt-2 text-optimal">Matched: {csvMatches.matched.join(", ")}</p>
                      )}
                      {csvMatches.unmatched.length > 0 && (
                        <p className="mt-1 text-muted-foreground">
                          Unmatched: {csvMatches.unmatched.join(", ")}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}

              {method === "manual" && (
                <Field label="Paste results in any format — one test per line">
                  <textarea
                    rows={6}
                    value={pasted}
                    onChange={(e) => setPasted(e.target.value)}
                    className={`${inputClass} font-mono text-xs`}
                  />
                </Field>
              )}

              {createPatient.isError && (
                <p className="text-sm font-medium text-outofrange">
                  {createPatient.error instanceof Error
                    ? createPatient.error.message
                    : "Could not create patient."}
                </p>
              )}

              <button
                type="submit"
                disabled={createPatient.isPending}
                className="rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {createPatient.isPending ? "Uploading…" : "Upload & Analyse"}
              </button>
              <p className="text-xs text-muted-foreground">
                Report parsing runs in a later phase. The patient, submission and file reference are
                stored now.
              </p>
            </form>
          )}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-6 pt-14">
        <h2 className="text-xl font-extrabold tracking-tight text-ink">Existing patients</h2>
        <div className="mt-6 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {patients.isPending &&
            Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-[168px] rounded-xl" />
            ))}
          {patients.data?.map((p) => {
            const summary = summaries.data?.get(p.patient_id);
            const risk = riskLevel(p.notes);
            return (
              <Link
                key={p.patient_id}
                to="/results"
                search={{ patient: p.patient_id }}
                className="group rounded-xl border border-border bg-card p-6 shadow-[var(--shadow-card)] transition-shadow hover:shadow-[var(--shadow-card-hover)]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="text-lg font-extrabold tracking-tight text-ink">
                    {patientName(p)}
                  </div>
                  <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
                    {risk === "exclusion" && <Badge tone="red">Excluded</Badge>}
                    {risk === "high_risk" && <Badge tone="amber">High Risk</Badge>}
                    {isSynthetic(p.notes) && <Badge tone="grey">Synthetic</Badge>}
                  </div>
                </div>
                <dl className="mt-4 space-y-1.5 text-sm">
                  <Row label="Date of birth" value={formatDate(p.date_of_birth)} />
                  <Row label="Sex" value={p.sex ?? "—"} />
                  <Row
                    label="Results"
                    value={summaries.isPending ? "…" : String(summary?.count ?? 0)}
                  />
                  <Row
                    label="Last test"
                    value={summaries.isPending ? "…" : formatDate(summary?.lastDate ?? null)}
                  />
                </dl>
                <div className="mt-4 text-sm font-semibold text-primary group-hover:underline">
                  View results
                </div>
              </Link>
            );
          })}
        </div>
        {patients.isError && (
          <p className="mt-4 text-sm text-outofrange">
            Could not load patients from the clinical database.
          </p>
        )}
      </section>
    </PageShell>
  );
}

const inputClass =
  "w-full rounded-xl border border-input bg-card px-4 py-2.5 text-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/25";
const fileInputClass =
  "w-full rounded-xl border border-dashed border-input bg-card px-4 py-3 text-sm file:mr-4 file:rounded-lg file:border-0 file:bg-ink file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-ink-foreground";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-semibold text-foreground">{value}</dd>
    </div>
  );
}

function Badge({ tone, children }: { tone: "red" | "amber" | "grey"; children: React.ReactNode }) {
  const cls =
    tone === "red"
      ? "bg-outofrange-soft text-outofrange"
      : tone === "amber"
        ? "bg-suboptimal-soft text-suboptimal"
        : "bg-muted text-muted-foreground";
  return (
    <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${cls}`}>{children}</span>
  );
}

function StatPill({ text, loading }: { text: string; loading: boolean }) {
  return (
    <span className="inline-flex items-center rounded-full border border-ink/15 bg-card px-5 py-2.5 text-sm font-semibold text-ink shadow-[var(--shadow-card)]">
      {loading ? <Skeleton className="h-4 w-40" /> : text}
    </span>
  );
}
