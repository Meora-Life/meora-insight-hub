import { patientName, riskLevel } from "@/lib/meora";
import type { Patient } from "@/lib/types";

export function PatientSelector({
  patients,
  value,
  onChange,
  loading,
}: {
  patients: Patient[];
  value: string | null;
  onChange: (patientId: string) => void;
  loading: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <label htmlFor="patient-select" className="text-sm font-semibold text-ink">
        Patient
      </label>
      <select
        id="patient-select"
        value={value ?? ""}
        disabled={loading}
        onChange={(event) => onChange(event.target.value)}
        className="min-w-[280px] rounded-xl border border-input bg-card px-4 py-2.5 text-sm font-medium text-foreground shadow-[var(--shadow-card)] outline-none focus:border-primary focus:ring-2 focus:ring-primary/25 disabled:opacity-60"
      >
        <option value="" disabled>
          {loading ? "Loading patients…" : "Select a patient"}
        </option>
        {patients.map((p) => {
          const risk = riskLevel(p.notes);
          const suffix =
            risk === "exclusion" ? " — Excluded" : risk === "high_risk" ? " — High Risk" : "";
          return (
            <option key={p.patient_id} value={p.patient_id}>
              {patientName(p)}
              {suffix}
            </option>
          );
        })}
      </select>
    </div>
  );
}
