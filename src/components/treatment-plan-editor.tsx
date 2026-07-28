import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { patientName } from "@/lib/meora";
import {
  PRESCRIBING_STATUSES,
  ROUTES,
  emptyMedication,
  emptyPlan,
  parseTreatmentPlan,
  serialiseNotes,
  type TreatmentMedication,
  type TreatmentPlan,
} from "@/lib/treatment";
import type { Patient } from "@/lib/types";

const input =
  "w-full rounded-lg border border-input bg-card px-3 py-2 text-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/25";

export function TreatmentPlanEditor({
  patient,
  onClose,
}: {
  patient: Patient;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [plan, setPlan] = useState<TreatmentPlan>(
    () => parseTreatmentPlan(patient.notes) ?? emptyPlan(),
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const save = useMutation({
    mutationFn: async () => {
      const notes = serialiseNotes(patient.notes, plan);
      const { error } = await supabase
        .from("patients")
        .update({ notes })
        .eq("patient_id", patient.patient_id);
      if (error) throw new Error(error.message);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["patients"] });
      onClose();
    },
  });

  function updateMed(index: number, patch: Partial<TreatmentMedication>) {
    setPlan((p) => ({
      ...p,
      medications: p.medications.map((m, i) => (i === index ? { ...m, ...patch } : m)),
    }));
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/60 p-4 py-10">
      <div className="w-full max-w-3xl rounded-xl bg-card p-8 shadow-[var(--shadow-card-hover)]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-extrabold tracking-tight text-ink">
              Current Treatment Plan
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {patientName(patient)} · {patient.patient_id}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-1.5 text-sm font-semibold text-muted-foreground hover:text-ink"
          >
            Close
          </button>
        </div>

        <label className="mt-6 block">
          <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Plan notes
          </span>
          <textarea
            className={`${input} min-h-24`}
            value={plan.summary}
            maxLength={2000}
            placeholder="Free-text summary of the patient's current protocol, goals and review cadence."
            onChange={(e) => setPlan((p) => ({ ...p, summary: e.target.value }))}
          />
        </label>

        <div className="mt-6">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Medications
            </span>
            <button
              type="button"
              className="text-sm font-semibold text-primary hover:underline"
              onClick={() =>
                setPlan((p) => ({ ...p, medications: [...p.medications, emptyMedication()] }))
              }
            >
              Add medication
            </button>
          </div>

          {plan.medications.length === 0 && (
            <p className="mt-3 text-sm text-muted-foreground">
              No medications recorded — recommendations will suggest initiating protocols.
            </p>
          )}

          <div className="mt-3 space-y-4">
            {plan.medications.map((med, index) => (
              <div key={index} className="rounded-xl border border-border p-4">
                <div className="grid gap-3 md:grid-cols-2">
                  <Field label="Medication name">
                    <input
                      className={input}
                      value={med.name}
                      maxLength={160}
                      onChange={(e) => updateMed(index, { name: e.target.value })}
                    />
                  </Field>
                  <Field label="Dose">
                    <input
                      className={input}
                      value={med.dose}
                      maxLength={120}
                      placeholder="0.25ml"
                      onChange={(e) => updateMed(index, { dose: e.target.value })}
                    />
                  </Field>
                  <Field label="Frequency">
                    <input
                      className={input}
                      value={med.frequency}
                      maxLength={120}
                      placeholder="2x per week"
                      onChange={(e) => updateMed(index, { frequency: e.target.value })}
                    />
                  </Field>
                  <Field label="Route of administration">
                    <input
                      className={input}
                      list="meora-routes"
                      value={med.route}
                      maxLength={120}
                      onChange={(e) => updateMed(index, { route: e.target.value })}
                    />
                  </Field>
                  <Field label="Prescribing status">
                    <select
                      className={input}
                      value={med.status}
                      onChange={(e) => updateMed(index, { status: e.target.value })}
                    >
                      {PRESCRIBING_STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>
                <button
                  type="button"
                  className="mt-3 text-xs font-semibold text-outofrange hover:underline"
                  onClick={() =>
                    setPlan((p) => ({
                      ...p,
                      medications: p.medications.filter((_, i) => i !== index),
                    }))
                  }
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
          <datalist id="meora-routes">
            {ROUTES.map((r) => (
              <option key={r} value={r} />
            ))}
          </datalist>
        </div>

        <label className="mt-6 block">
          <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Add-ons
          </span>
          <input
            className={input}
            value={plan.add_ons}
            maxLength={300}
            placeholder="Injection Kit + Vials (Mandatory)"
            onChange={(e) => setPlan((p) => ({ ...p, add_ons: e.target.value }))}
          />
        </label>

        {save.isError && (
          <p className="mt-4 text-sm text-outofrange">
            Could not save the treatment plan. {(save.error as Error).message}
          </p>
        )}

        <div className="mt-8 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-border px-5 py-2.5 text-sm font-semibold text-ink"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={save.isPending}
            onClick={() => save.mutate()}
            className="rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
          >
            {save.isPending ? "Saving…" : "Save treatment plan"}
          </button>
        </div>
      </div>
    </div>
  );
}

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
