import type { FlatResult, Patient } from "./types";
import { chronologicalAge, numericValue } from "./meora";

/* ------------------------------------------------------------------ */
/* PhenoAge-inspired biological age                                    */
/* ------------------------------------------------------------------ */

export interface BioMarkerUse {
  key: string;
  label: string;
  value: number;
  display: string;
  unit: string | null;
  date: string | null;
  imputed: boolean;
}

export interface BioAgeResult {
  bioAge: number | null;
  chronoAge: number | null;
  delta: number | null;
  markers: BioMarkerUse[];
  missing: string[];
  source: "measured" | "derived" | "unavailable";
}

interface MarkerSpec {
  key: string;
  label: string;
  unit: string;
  /** lower-cased substrings; first match wins */
  match: (name: string) => boolean;
  /** population median used when the marker is absent */
  fallback: number;
}

const SPECS: MarkerSpec[] = [
  {
    key: "albumin",
    label: "Albumin",
    unit: "g/L",
    match: (n) => n === "albumin",
    fallback: 45,
  },
  {
    key: "creatinine",
    label: "Creatinine",
    unit: "umol/L",
    match: (n) => n.includes("creatinine") && !n.includes("ratio"),
    fallback: 80,
  },
  {
    key: "glucose",
    label: "Glucose",
    unit: "mmol/L",
    match: (n) => n.includes("glucose"),
    fallback: 5,
  },
  {
    key: "crp",
    label: "hs-CRP",
    unit: "mg/L",
    match: (n) => n.includes("crp") || n.includes("c-reactive"),
    fallback: 1,
  },
  {
    key: "lymphocytes",
    label: "Lymphocytes",
    unit: "x10^9/L",
    match: (n) => n.includes("lymphocyte"),
    fallback: 2,
  },
  { key: "mcv", label: "MCV", unit: "fL", match: (n) => n === "mcv", fallback: 90 },
  { key: "rdw", label: "RDW", unit: "%", match: (n) => n === "rdw", fallback: 13 },
  {
    key: "wcc",
    label: "White Cell Count",
    unit: "x10^9/L",
    match: (n) => n.includes("white cell count") || n.includes("wcc"),
    fallback: 6.5,
  },
];

function latestNumeric(rows: FlatResult[], spec: MarkerSpec) {
  let best: { value: number; row: FlatResult } | null = null;
  for (const row of rows) {
    if (!spec.match(row.test_name.trim().toLowerCase())) continue;
    const v = numericValue(row.result_value);
    if (v === null) continue;
    if (!best || (row.date_collected ?? "") > (best.row.date_collected ?? "")) {
      best = { value: v, row };
    }
  }
  return best;
}

/**
 * Levine et al. (2018) PhenoAge, restricted to the eight markers available in
 * the Meora panels plus chronological age. Missing markers fall back to a
 * population median and are flagged as imputed.
 */
export function biologicalAge(patient: Patient, rows: FlatResult[]): BioAgeResult {
  const lastDate = rows.reduce<string | null>(
    (acc, r) => (r.date_collected && (!acc || r.date_collected > acc) ? r.date_collected : acc),
    null,
  );
  const chronoAge = chronologicalAge(patient.date_of_birth, lastDate);

  // A directly measured biological age result always wins.
  const measured = rows.find((r) => r.test_name.toLowerCase().includes("biological age"));
  const measuredValue = measured ? numericValue(measured.result_value) : null;
  if (measuredValue !== null) {
    return {
      bioAge: Math.round(measuredValue * 10) / 10,
      chronoAge,
      delta: chronoAge !== null ? Math.round(measuredValue - chronoAge) : null,
      markers: [],
      missing: [],
      source: "measured",
    };
  }

  if (chronoAge === null) {
    return { bioAge: null, chronoAge, delta: null, markers: [], missing: [], source: "unavailable" };
  }

  const values: Record<string, number> = {};
  const markers: BioMarkerUse[] = [];
  const missing: string[] = [];
  let found = 0;

  for (const spec of SPECS) {
    const hit = latestNumeric(rows, spec);
    const value = hit ? hit.value : spec.fallback;
    values[spec.key] = value;
    if (hit) found += 1;
    else missing.push(spec.label);
    markers.push({
      key: spec.key,
      label: spec.label,
      value,
      display: hit ? (hit.row.result_value ?? String(value)) : `${spec.fallback} (assumed)`,
      unit: hit ? hit.row.unit : spec.unit,
      date: hit ? hit.row.date_collected : null,
      imputed: !hit,
    });
  }

  if (found < 4) {
    return { bioAge: null, chronoAge, delta: null, markers, missing, source: "unavailable" };
  }

  // Lymphocyte percentage of total white cells.
  const lymphPct = Math.min(
    80,
    Math.max(1, (values.lymphocytes / Math.max(values.wcc, 0.1)) * 100),
  );
  const crpMgDl = Math.max(values.crp, 0.01) / 10;

  const xb =
    -19.907 -
    0.0336 * values.albumin +
    0.0095 * values.creatinine +
    0.1953 * values.glucose +
    0.0954 * Math.log(crpMgDl) -
    0.012 * lymphPct +
    0.0268 * values.mcv +
    0.3306 * values.rdw +
    0.0554 * values.wcc +
    0.0804 * chronoAge;

  const gamma = 0.0076927;
  const mortality = 1 - Math.exp((-Math.exp(xb) * (Math.exp(120 * gamma) - 1)) / gamma);
  const clamped = Math.min(Math.max(mortality, 1e-9), 1 - 1e-9);
  const raw = 141.50225 + Math.log(-0.00553 * Math.log(1 - clamped)) / 0.090165;

  if (!Number.isFinite(raw)) {
    return { bioAge: null, chronoAge, delta: null, markers, missing, source: "unavailable" };
  }

  const bioAge = Math.round(Math.min(Math.max(raw, 18), 110) * 10) / 10;
  return {
    bioAge,
    chronoAge,
    delta: Math.round(bioAge - chronoAge),
    markers,
    missing,
    source: "derived",
  };
}

export const BIO_AGE_TOOLTIP =
  "Calculated from 8 biomarkers using a PhenoAge-inspired model (albumin, creatinine, glucose, hs-CRP, lymphocytes, MCV, RDW, WCC). Lower than chronological age indicates reduced biological ageing rate.";
