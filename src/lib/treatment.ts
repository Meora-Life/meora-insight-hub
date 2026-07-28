/**
 * Current treatment plans.
 *
 * The clinical database is read-only in schema terms (no migrations available),
 * so a patient's treatment plan is persisted as a delimited JSON block inside
 * `patients.notes`. Everything outside the block stays untouched clinical notes.
 */

export type PrescribingStatus =
  | "Active / Purchased"
  | "Active"
  | "Prescribed — not started"
  | "Paused"
  | "Ceased";

export const PRESCRIBING_STATUSES: PrescribingStatus[] = [
  "Active / Purchased",
  "Active",
  "Prescribed — not started",
  "Paused",
  "Ceased",
];

export const ROUTES = [
  "Intramuscular (IM)",
  "Subcutaneous",
  "Oral",
  "Topical / Transdermal",
  "Sublingual",
  "Intravenous",
];

export interface TreatmentMedication {
  name: string;
  dose: string;
  frequency: string;
  route: string;
  status: PrescribingStatus | string;
}

export interface TreatmentPlan {
  summary: string;
  medications: TreatmentMedication[];
  add_ons: string;
  updated_at: string;
}

const OPEN = "[[TREATMENT_PLAN]]";
const CLOSE = "[[/TREATMENT_PLAN]]";
const BLOCK = /\[\[TREATMENT_PLAN\]\]([\s\S]*?)\[\[\/TREATMENT_PLAN\]\]/;

export function emptyMedication(): TreatmentMedication {
  return { name: "", dose: "", frequency: "", route: ROUTES[0], status: "Active" };
}

export function emptyPlan(): TreatmentPlan {
  return { summary: "", medications: [], add_ons: "", updated_at: new Date().toISOString() };
}

export function parseTreatmentPlan(notes: string | null): TreatmentPlan | null {
  if (!notes) return null;
  const match = notes.match(BLOCK);
  if (!match) return null;
  try {
    const raw = JSON.parse(match[1]) as Partial<TreatmentPlan>;
    return {
      summary: raw.summary ?? "",
      medications: Array.isArray(raw.medications) ? (raw.medications as TreatmentMedication[]) : [],
      add_ons: raw.add_ons ?? "",
      updated_at: raw.updated_at ?? "",
    };
  } catch {
    return null;
  }
}

/** Clinical notes with the treatment plan block removed. */
export function clinicalNotes(notes: string | null): string | null {
  if (!notes) return notes;
  const stripped = notes.replace(BLOCK, "").trim();
  return stripped.length ? stripped : null;
}

/** Writes the plan back into the notes field, preserving clinical notes. */
export function serialiseNotes(notes: string | null, plan: TreatmentPlan | null): string | null {
  const base = clinicalNotes(notes) ?? "";
  if (!plan || (!plan.summary.trim() && plan.medications.length === 0 && !plan.add_ons.trim())) {
    return base.length ? base : null;
  }
  const block = `${OPEN}${JSON.stringify({ ...plan, updated_at: new Date().toISOString() })}${CLOSE}`;
  return base.length ? `${base}\n\n${block}` : block;
}

export function isActiveStatus(status: string): boolean {
  const s = status.toLowerCase();
  return s.startsWith("active") || s.includes("purchased");
}

export function hasActivePlan(plan: TreatmentPlan | null): boolean {
  return Boolean(plan?.medications.some((m) => m.name.trim() && isActiveStatus(m.status)));
}

export function describeMedication(m: TreatmentMedication): string {
  const parts = [m.dose, m.route, m.frequency].map((p) => p.trim()).filter(Boolean);
  const detail = parts.length ? ` — ${parts.join(", ")}` : "";
  const status = m.status.trim() ? ` (${m.status.trim()})` : "";
  return `${m.name.trim()}${detail}${status}`;
}

/* ------------------------------------------------------------------ */
/* Protocol domains                                                    */
/* ------------------------------------------------------------------ */

export interface TreatmentDomain {
  /** Short protocol label, e.g. TRT */
  label: string;
  /** medication keywords that place a medication in this domain */
  keywords: string[];
  /** biomarkers to review to confirm dosing */
  markers: string[];
  /** initiate-style protocol names this plan supersedes */
  supersedes: string[];
}

export const TREATMENT_DOMAINS: TreatmentDomain[] = [
  {
    label: "TRT",
    keywords: ["testosterone", "primoteston", "sustanon", "nebido", "enanthate", "cypionate", "trt"],
    markers: ["testosterone", "shbg", "haematocrit", "hematocrit", "oestradiol", "estradiol"],
    supersedes: ["TRT Evaluation", "Men's TRT Evaluation"],
  },
  {
    label: "thyroid",
    keywords: ["thyroxine", "levothyroxine", "liothyronine", "oroxine", "eutroxsig", "t3", "t4"],
    markers: ["tsh", "free t4", "free t3", "tpo"],
    supersedes: ["Thyroid Function Review", "Thyroid Support Protocol"],
  },
  {
    label: "vitamin D",
    keywords: ["vitamin d", "cholecalciferol", "ostelin"],
    markers: ["vitamin d", "25-oh", "calcium"],
    supersedes: ["Nutraceutical Support — Vitamin D", "Longevity"],
  },
  {
    label: "iron repletion",
    keywords: ["ferro", "iron", "maltofer", "ferrous"],
    markers: ["ferritin", "iron", "transferrin saturation", "haemoglobin"],
    supersedes: ["Iron Repletion Protocol", "Longevity"],
  },
  {
    label: "lipid",
    keywords: ["statin", "atorvastatin", "rosuvastatin", "ezetimibe", "bempedoic"],
    markers: ["ldl", "non-hdl", "apolipoprotein b", "lipoprotein(a)", "alt"],
    supersedes: ["Lipid Optimisation Protocol"],
  },
  {
    label: "metabolic",
    keywords: ["metformin", "semaglutide", "ozempic", "tirzepatide", "mounjaro", "glp"],
    markers: ["glucose", "hba1c", "insulin"],
    supersedes: ["Metabolic Reset Protocol", "Performance + Recovery"],
  },
];

export function domainFor(medicationName: string): TreatmentDomain | undefined {
  const n = medicationName.toLowerCase();
  return TREATMENT_DOMAINS.find((d) => d.keywords.some((k) => n.includes(k)));
}
