import type { FlatResult, Patient, StatusInfo, StatusKey, TestDefinition } from "./types";
import {
  clinicalNotes,
  describeMedication,
  domainFor,
  isActiveStatus,
  parseTreatmentPlan,
  type TreatmentDomain,
  type TreatmentMedication,
} from "./treatment";

/* ------------------------------------------------------------------ */
/* Patient helpers                                                     */
/* ------------------------------------------------------------------ */

export function patientName(p: Patient): string {
  return `${p.first_name} ${p.last_name}`.trim();
}

export type RiskLevel = "exclusion" | "high_risk" | "none";

export function riskLevel(notes: string | null): RiskLevel {
  const n = (clinicalNotes(notes) ?? "").toUpperCase();
  if (n.includes("EXCLUSION")) return "exclusion";
  if (n.includes("HIGH RISK")) return "high_risk";
  return "none";
}

export function isSynthetic(notes: string | null): boolean {
  return (clinicalNotes(notes) ?? "").toUpperCase().includes("SYNTHETIC");
}

/** Extracts the clinical reason that follows the EXCLUSION / HIGH RISK marker. */
export function riskReason(notes: string | null): string {
  const source = clinicalNotes(notes);
  if (!source) return "";
  const match = source.match(/(EXCLUSION|HIGH RISK)\s*:?\s*(.*)$/is);
  return match ? match[2].trim() : source.trim();
}


export function chronologicalAge(dob: string | null, at?: string | null): number | null {
  if (!dob) return null;
  const birth = new Date(dob);
  if (Number.isNaN(birth.getTime())) return null;
  const ref = at ? new Date(at) : new Date();
  let age = ref.getFullYear() - birth.getFullYear();
  const m = ref.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && ref.getDate() < birth.getDate())) age -= 1;
  return age;
}

export function formatDate(value: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-AU", { day: "2-digit", month: "short", year: "numeric" });
}

/* ------------------------------------------------------------------ */
/* Result status                                                       */
/* ------------------------------------------------------------------ */

export function numericValue(value: string | null): number | null {
  if (value === null || value === undefined) return null;
  const cleaned = value.replace(/[<>~≤≥]/g, "").trim();
  const n = Number(cleaned);
  return Number.isFinite(n) && cleaned !== "" ? n : null;
}

const STATUS_STYLES: Record<StatusKey, { label: string; className: string; color: string }> = {
  optimal: {
    label: "Optimal",
    className: "bg-optimal-soft text-optimal",
    color: "var(--optimal)",
  },
  suboptimal: {
    label: "Suboptimal",
    className: "bg-suboptimal-soft text-suboptimal",
    color: "var(--suboptimal)",
  },
  out_of_range: {
    label: "Out of Range",
    className: "bg-outofrange-soft text-outofrange",
    color: "var(--outofrange)",
  },
  abnormal: {
    label: "Abnormal",
    className: "bg-outofrange-soft text-outofrange",
    color: "var(--outofrange)",
  },
  not_detected: {
    label: "Not Detected",
    className: "bg-muted text-muted-foreground",
    color: "var(--neutral-status)",
  },
  below_detection: {
    label: "Below Detection",
    className: "bg-muted text-muted-foreground",
    color: "var(--neutral-status)",
  },
};

export function statusInfo(key: StatusKey): StatusInfo {
  return { key, ...STATUS_STYLES[key] };
}

/**
 * Badge logic:
 *  normal        -> within optimal range ? Optimal : Suboptimal
 *  high | low    -> Out of Range
 *  abnormal      -> Abnormal
 *  not_detected  -> Not Detected
 */
export function resultStatus(result: FlatResult, def?: TestDefinition): StatusKey {
  const flag = (result.flag ?? "").toLowerCase();
  if (flag === "high" || flag === "low") return "out_of_range";
  if (flag === "abnormal") return "abnormal";
  if (flag === "not_detected") return "not_detected";
  if (flag === "below_detection_limit") return "below_detection";

  const low = result.optimal_low ?? def?.optimal_low ?? null;
  const high = result.optimal_high ?? def?.optimal_high ?? null;
  const value = numericValue(result.result_value);

  if (value === null || (low === null && high === null)) return "optimal";
  if (low !== null && value < low) return "suboptimal";
  if (high !== null && value > high) return "suboptimal";
  return "optimal";
}

export type ResultFilter = "all" | "optimal" | "suboptimal" | "out_of_range" | "other";

export function matchesFilter(status: StatusKey, filter: ResultFilter): boolean {
  if (filter === "all") return true;
  if (filter === "optimal") return status === "optimal";
  if (filter === "suboptimal") return status === "suboptimal";
  if (filter === "out_of_range") return status === "out_of_range";
  return status === "abnormal" || status === "not_detected" || status === "below_detection";
}

/* ------------------------------------------------------------------ */
/* Range bar geometry                                                  */
/* ------------------------------------------------------------------ */

export interface RangeBarModel {
  min: number;
  max: number;
  optimalStart: number;
  optimalEnd: number;
  rangeStart: number;
  rangeEnd: number;
  marker: number | null;
}

export function definitionKey(category: string | null, testName: string): string {
  return `${(category ?? "").toLowerCase()}||${testName.toLowerCase()}`;
}

export function buildRangeBar(result: FlatResult, def?: TestDefinition): RangeBarModel | null {
  if (!def) return null;
  const value = numericValue(result.result_value);
  const type = (def.range_type ?? "").toLowerCase();
  const optLow = result.optimal_low ?? def.optimal_low;
  const optHigh = result.optimal_high ?? def.optimal_high;

  let min: number;
  let max: number;
  let rangeStart: number;
  let rangeEnd: number;
  let optimalStart: number;
  let optimalEnd: number;

  if (type === "upper_bound" && def.range_high !== null) {
    min = 0;
    max = def.range_high * 2;
    rangeStart = 0;
    rangeEnd = def.range_high;
    optimalStart = 0;
    optimalEnd = optHigh ?? def.range_high;
  } else if (type === "lower_bound" && def.range_low !== null) {
    min = 0;
    max = Math.max(150, def.range_low * 2, value ?? 0);
    rangeStart = def.range_low;
    rangeEnd = max;
    optimalStart = optLow ?? def.range_low;
    optimalEnd = max;
  } else if (def.range_low !== null && def.range_high !== null) {
    const span = def.range_high - def.range_low || 1;
    min = def.range_low - span * 0.25;
    max = def.range_high + span * 0.25;
    rangeStart = def.range_low;
    rangeEnd = def.range_high;
    optimalStart = optLow ?? def.range_low;
    optimalEnd = optHigh ?? def.range_high;
  } else {
    return null;
  }

  if (value !== null) {
    if (value < min) min = value - (max - min) * 0.05;
    if (value > max) max = value + (max - min) * 0.05;
  }
  if (max <= min) return null;

  return { min, max, rangeStart, rangeEnd, optimalStart, optimalEnd, marker: value };
}

/* ------------------------------------------------------------------ */
/* System health scores                                                */
/* ------------------------------------------------------------------ */

export interface SystemDefinition {
  id: string;
  name: string;
  categories: string[];
  /** matched against subcategory or test name when the category is broad */
  keywords?: string[];
}

export const SYSTEMS: SystemDefinition[] = [
  { id: "cardiovascular", name: "Cardiovascular", categories: ["Heart"] },
  { id: "metabolic", name: "Metabolic", categories: ["Metabolic"] },
  { id: "hormonal", name: "Hormonal", categories: ["Hormones"] },
  { id: "thyroid", name: "Thyroid", categories: ["Thyroid"] },
  { id: "immune", name: "Immune", categories: ["Haematology", "Autoimmunity"] },
  {
    id: "liver",
    name: "Liver",
    categories: ["Biochemistry"],
    keywords: [
      "liver",
      "alt",
      "ast",
      "ggt",
      "alkaline phosphatase",
      "bilirubin",
      "albumin",
      "protein",
    ],
  },
  {
    id: "renal",
    name: "Renal",
    categories: ["Biochemistry"],
    keywords: [
      "renal",
      "kidney",
      "egfr",
      "creatinine",
      "urea",
      "sodium",
      "potassium",
      "chloride",
      "bicarbonate",
    ],
  },
  { id: "gut", name: "Gut", categories: ["Gut & Microbiome"] },
];

export function systemResults(results: FlatResult[], system: SystemDefinition): FlatResult[] {
  return results.filter((r) => {
    if (!r.category || !system.categories.includes(r.category)) return false;
    if (!system.keywords) return true;
    const haystack = `${r.subcategory ?? ""} ${r.test_name}`.toLowerCase();
    return system.keywords.some((k) => haystack.includes(k));
  });
}

export function resultScore(result: FlatResult, def?: TestDefinition): number {
  const flag = (result.flag ?? "").toLowerCase();
  if (flag === "high" || flag === "low") return 30;
  if (flag === "abnormal") return 0;
  if (flag === "normal") {
    return resultStatus(result, def) === "optimal" ? 100 : 70;
  }
  return 70;
}

export interface SystemContribution {
  result: FlatResult;
  score: number;
}

export interface SystemScore {
  system: SystemDefinition;
  score: number | null;
  count: number;
  contributions: SystemContribution[];
}

export function systemScores(
  results: FlatResult[],
  defs: Map<string, TestDefinition>,
): SystemScore[] {
  return SYSTEMS.map((system) => {
    const scoped = systemResults(results, system).filter((r) => {
      const flag = (r.flag ?? "").toLowerCase();
      return ["normal", "high", "low", "abnormal"].includes(flag);
    });
    const contributions: SystemContribution[] = scoped
      .map((r) => ({
        result: r,
        score: resultScore(r, defs.get(definitionKey(r.category, r.test_name))),
      }))
      .sort((a, b) => a.score - b.score);

    if (scoped.length < 3) {
      return { system, score: null, count: scoped.length, contributions };
    }
    const total = contributions.reduce((sum, c) => sum + c.score, 0);
    return {
      system,
      score: Math.round(total / contributions.length),
      count: scoped.length,
      contributions,
    };
  });
}


export function scoreColor(score: number): string {
  if (score >= 80) return "var(--optimal)";
  if (score >= 50) return "var(--suboptimal)";
  return "var(--outofrange)";
}

/* ------------------------------------------------------------------ */
/* Wearables (demo data)                                               */
/* ------------------------------------------------------------------ */

export interface Wearables {
  steps: string;
  sleep: string;
  hrv: string;
  rhr: string;
  trend: "up" | "down";
}

const WEARABLES: Record<string, Wearables> = {
  "Alex Chen": { steps: "11,200", sleep: "8.1h", hrv: "68ms", rhr: "52", trend: "up" },
  "William Foster": { steps: "6,800", sleep: "6.4h", hrv: "38ms", rhr: "64", trend: "down" },
  "Michael Okafor": { steps: "5,200", sleep: "5.8h", hrv: "28ms", rhr: "72", trend: "down" },
  "Liam Andrews": { steps: "8,400", sleep: "7.2h", hrv: "52ms", rhr: "58", trend: "up" },
  "Zoe Parker": { steps: "7,600", sleep: "6.8h", hrv: "44ms", rhr: "62", trend: "up" },
  "Sarah Mitchell": { steps: "6,200", sleep: "5.4h", hrv: "32ms", rhr: "68", trend: "down" },
  "David Harrington": { steps: "4,800", sleep: "5.9h", hrv: "24ms", rhr: "74", trend: "down" },
  "Emma Walsh": { steps: "12,400", sleep: "8.4h", hrv: "72ms", rhr: "48", trend: "up" },
  "David Malcolm": { steps: "9,200", sleep: "7.6h", hrv: "58ms", rhr: "56", trend: "up" },
};

const EXCLUDED_WEARABLES: Wearables = {
  steps: "0",
  sleep: "—",
  hrv: "—",
  rhr: "—",
  trend: "down",
};

const DEFAULT_WEARABLES: Wearables = {
  steps: "7,000",
  sleep: "7.0h",
  hrv: "45ms",
  rhr: "62",
  trend: "up",
};

export function wearablesFor(patient: Patient): Wearables {
  if (riskLevel(patient.notes) === "exclusion") return EXCLUDED_WEARABLES;
  return WEARABLES[patientName(patient)] ?? DEFAULT_WEARABLES;
}

/* ------------------------------------------------------------------ */
/* Recommended protocols                                               */
/* ------------------------------------------------------------------ */

export type Urgency = "Recommended" | "Priority" | "Urgent";

export type ProtocolAction = "Initiate" | "Continue" | "Adjust" | "Review" | "Refer";

export interface Protocol {
  name: string;
  rationale: string;
  urgency: Urgency;
  tone: "green" | "amber" | "red" | "neutral";
  /** What the system is advising against the current treatment plan. */
  action?: ProtocolAction;
  /** Supporting lines, e.g. the medications a patient is currently on. */
  details?: string[];
}

/**
 * Direction a marker sits away from its optimal window.
 * Uses the lab flag when present, otherwise compares the value to the optimal
 * range so uploaded reports (which often carry no lab flag) still trigger rules.
 */
export function markerDirection(r: FlatResult): "high" | "low" | null {
  const flag = (r.flag ?? "").toLowerCase();
  if (flag === "high" || flag === "low") return flag;
  if (["abnormal", "not_detected", "below_detection_limit"].includes(flag)) return null;
  const value = numericValue(r.result_value);
  if (value === null) return null;
  const low = r.optimal_low;
  const high = r.optimal_high;
  if (low !== null && value < low) return "low";
  if (high !== null && value > high) return "high";
  return null;
}

function findFlagged(results: FlatResult[], needles: string[], flag: "high" | "low") {
  return results.find((r) => {
    if (markerDirection(r) !== flag) return false;
    const name = r.test_name.toLowerCase();
    return needles.some((n) => name.includes(n));
  });
}

interface CompositeTrigger {
  needles: string[];
  direction: "high" | "low";
}

interface CompositeRule {
  name: string;
  urgency: Urgency;
  tone: Protocol["tone"];
  minHits: number;
  supersedes: string[];
  triggers: CompositeTrigger[];
  note: string;
}

const COMPOSITE_RULES: CompositeRule[] = [
  {
    name: "Performance + Recovery",
    urgency: "Priority",
    tone: "amber",
    minHits: 2,
    supersedes: ["Anti-Inflammatory Protocol", "Metabolic Reset Protocol"],
    note: "Inflammation, fatty acid status and glucose handling are limiting recovery and training adaptation.",
    triggers: [
      { needles: ["crp", "c-reactive"], direction: "high" },
      { needles: ["omega-3", "omega 3", "epa", "dha"], direction: "low" },
      { needles: ["insulin", "hba1c", "glucose", "homa"], direction: "high" },
      { needles: ["triglyceride"], direction: "high" },
    ],
  },
  {
    name: "Men's TRT Evaluation",
    urgency: "Priority",
    tone: "amber",
    minHits: 1,
    supersedes: ["TRT Evaluation"],
    note: "Androgen status sits below optimal — confirm with a repeat morning panel before considering therapy.",
    triggers: [
      { needles: ["testosterone"], direction: "low" },
      { needles: ["free androgen", "fai"], direction: "low" },
      { needles: ["shbg", "sex hormone binding"], direction: "high" },
      { needles: ["lh", "luteinising hormone"], direction: "low" },
    ],
  },
  {
    name: "Longevity",
    urgency: "Recommended",
    tone: "neutral",
    minHits: 2,
    supersedes: [
      "Methylation Support Protocol",
      "Nutraceutical Support — Vitamin D",
      "Iron Repletion Protocol",
    ],
    note: "Methylation, micronutrient and iron status all influence long-term healthspan trajectory.",
    triggers: [
      { needles: ["homocysteine"], direction: "high" },
      { needles: ["vitamin d", "25-oh", "25 oh"], direction: "low" },
      { needles: ["ferritin"], direction: "low" },
      { needles: ["b12", "folate"], direction: "low" },
    ],
  },
];

function compositeProtocols(results: FlatResult[]): {
  protocols: Protocol[];
  superseded: Set<string>;
} {
  const protocols: Protocol[] = [];
  const superseded = new Set<string>();

  for (const rule of COMPOSITE_RULES) {
    const hits: FlatResult[] = [];
    for (const trigger of rule.triggers) {
      const hit = findFlagged(results, trigger.needles, trigger.direction);
      if (hit && !hits.includes(hit)) hits.push(hit);
    }
    if (hits.length < rule.minHits) continue;
    rule.supersedes.forEach((n) => superseded.add(n));
    protocols.push({
      name: rule.name,
      urgency: rule.urgency,
      tone: rule.tone,
      rationale: `${rule.note} Drivers: ${hits
        .map(
          (r) =>
            `${r.test_name} ${markerDirection(r) === "high" ? "elevated" : "low"} at ${
              r.result_value ?? "—"
            } ${r.unit ?? ""}`.trim(),
        )
        .join("; ")}.`,
      details: hits.map(
        (r) => `${r.test_name}: ${r.result_value ?? "—"} ${r.unit ?? ""}`.trim(),
      ),
    });
  }

  return { protocols, superseded };
}


function markerLabel(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/**
 * Turns an active treatment plan into "Continue / Adjust" protocols and reports
 * which initiate-style protocols it supersedes.
 */
function treatmentPlanProtocols(
  patient: Patient,
  results: FlatResult[],
): { planProtocols: Protocol[]; superseded: Set<string> } {
  const plan = parseTreatmentPlan(patient.notes);
  const superseded = new Set<string>();
  if (!plan) return { planProtocols: [], superseded };

  const active = plan.medications.filter((m) => m.name.trim() && isActiveStatus(m.status));
  if (active.length === 0) return { planProtocols: [], superseded };

  const groups = new Map<string, { domain?: TreatmentDomain; meds: TreatmentMedication[] }>();
  for (const med of active) {
    const domain = domainFor(med.name);
    const key = domain?.label ?? med.name.trim().toLowerCase();
    const group = groups.get(key) ?? { domain, meds: [] };
    group.meds.push(med);
    groups.set(key, group);
  }

  const planProtocols: Protocol[] = [];
  for (const [key, group] of groups) {
    const label = group.domain?.label ?? group.meds[0].name.trim();
    group.domain?.supersedes.forEach((n) => superseded.add(n));

    const markers = group.domain?.markers ?? [];
    const flagged = results.filter((r) => {
      const flag = (r.flag ?? "").toLowerCase();
      if (!["high", "low", "abnormal"].includes(flag)) return false;
      const name = r.test_name.toLowerCase();
      return markers.some((m) => name.includes(m));
    });

    const reviewNames = markers.length
      ? markerLabel(
          markers
            .filter((m) => !["hematocrit", "estradiol"].includes(m))
            .map((m) => (m === "shbg" ? "SHBG" : m)),
        )
      : "";

    const rationale = [
      markers.length
        ? `Review ${reviewNames} on the next blood panel to confirm dosing is optimised.`
        : "Review response and tolerance at the next consultation.",
      flagged.length
        ? `Latest panel flags ${flagged
            .slice(0, 3)
            .map((r) => `${r.test_name} ${r.result_value ?? "—"} ${r.unit ?? ""}`.trim())
            .join("; ")} — dose review advised before the next cycle.`
        : "Latest results support continuing at the current dose.",
    ].join(" ");

    const details = group.meds.map(describeMedication);
    if (plan.add_ons.trim()) details.push(`Add-on: ${plan.add_ons.trim()}`);

    planProtocols.push({
      name: `Continue current ${label} protocol`,
      rationale,
      urgency: flagged.length ? "Priority" : "Recommended",
      tone: flagged.length ? "amber" : "green",
      action: flagged.length ? "Adjust" : "Continue",
      details,
    });
    void key;
  }

  return { planProtocols, superseded };
}


/** Keeps only the most recent result for each test, so stale panels don't drive protocols. */
export function latestPerTest(results: FlatResult[]): FlatResult[] {
  const map = new Map<string, FlatResult>();
  for (const r of results) {
    const key = definitionKey(r.category, r.test_name);
    const prev = map.get(key);
    if (!prev || (r.date_collected ?? "") > (prev.date_collected ?? "")) map.set(key, r);
  }
  return [...map.values()];
}

function describe(r: FlatResult, word: string): string {
  return `${r.test_name} is ${word} at ${r.result_value ?? "—"} ${r.unit ?? ""}`.trim();
}

export function recommendedProtocols(patient: Patient, allResults: FlatResult[]): Protocol[] {
  const risk = riskLevel(patient.notes);
  if (risk === "exclusion") {
    return [
      {
        name: "Specialist Referral Required",
        rationale: riskReason(patient.notes),
        urgency: "Urgent",
        tone: "red",
      },
    ];
  }

  const results = latestPerTest(allResults);
  const protocols: Protocol[] = [];


  if (risk === "high_risk") {
    protocols.push({
      name: "Nephrology / Specialist Referral Required",
      rationale: riskReason(patient.notes),
      urgency: "Urgent",
      tone: "amber",
    });
  }

  const testosterone = findFlagged(results, ["testosterone"], "low");
  if (testosterone) {
    protocols.push({
      name: "TRT Evaluation",
      rationale: `${testosterone.test_name} is low at ${testosterone.result_value ?? "—"} ${testosterone.unit ?? ""}`.trim(),
      urgency: "Priority",
      tone: "amber",
    });
  }

  const glucose = findFlagged(results, ["glucose", "hba1c", "insulin"], "high");
  if (glucose) {
    protocols.push({
      name: "Metabolic Reset Protocol",
      rationale: `${glucose.test_name} is elevated at ${glucose.result_value ?? "—"} ${glucose.unit ?? ""}`.trim(),
      urgency: "Priority",
      tone: "amber",
    });
  }

  const vitD = findFlagged(results, ["vitamin d", "25-oh", "25 oh"], "low");
  if (vitD) {
    protocols.push({
      name: "Nutraceutical Support — Vitamin D",
      rationale: `${vitD.test_name} is low at ${vitD.result_value ?? "—"} ${vitD.unit ?? ""}`.trim(),
      urgency: "Recommended",
      tone: "neutral",
    });
  }

  const tpo = findFlagged(results, ["tpo", "thyroid peroxidase", "thyroglobulin"], "high");
  if (tpo) {
    protocols.push({
      name: "Thyroid Support Protocol",
      rationale: `${tpo.test_name} is elevated at ${tpo.result_value ?? "—"} ${tpo.unit ?? ""} — autoimmune thyroiditis pattern`.trim(),
      urgency: "Priority",
      tone: "amber",
    });
  }

  const crp = findFlagged(results, ["crp", "c-reactive"], "high");
  if (crp) {
    protocols.push({
      name: "Anti-Inflammatory Protocol",
      rationale: `${crp.test_name} is elevated at ${crp.result_value ?? "—"} ${crp.unit ?? ""}`.trim(),
      urgency: "Priority",
      tone: "amber",
    });
  }

  const iron = findFlagged(results, ["ferritin", "iron", "transferrin saturation"], "low");
  if (iron) {
    protocols.push({
      name: "Iron Repletion Protocol",
      rationale: `${iron.test_name} is low at ${iron.result_value ?? "—"} ${iron.unit ?? ""}`.trim(),
      urgency: "Recommended",
      tone: "neutral",
    });
  }

  const homocysteine = findFlagged(results, ["homocysteine"], "high");
  if (homocysteine) {
    protocols.push({
      name: "Methylation Support Protocol",
      rationale:
        `${homocysteine.test_name} is elevated at ${homocysteine.result_value ?? "—"} ${homocysteine.unit ?? ""}`.trim(),
      urgency: "Recommended",
      tone: "neutral",
    });
  }

  const oestradiol = findFlagged(results, ["oestradiol", "estradiol"], "high");
  if (oestradiol) {
    protocols.push({
      name: "Oestrogen Management Protocol",
      rationale: `${describe(oestradiol, "elevated")} — review aromatisation, body composition and alcohol intake`,
      urgency: "Priority",
      tone: "amber",
    });
  }

  const bilirubin = findFlagged(results, ["bilirubin"], "high");
  if (bilirubin) {
    protocols.push({
      name: "Hepatobiliary Review",
      rationale: `${describe(bilirubin, "elevated")} — most often a benign Gilbert's pattern; recheck fasting with LFTs`,
      urgency: "Recommended",
      tone: "neutral",
    });
  }

  const lipids = findFlagged(results, ["ldl", "non-hdl", "apolipoprotein b", "lipoprotein(a)"], "high");
  if (lipids) {
    protocols.push({
      name: "Lipid Optimisation Protocol",
      rationale: describe(lipids, "elevated"),
      urgency: "Priority",
      tone: "amber",
    });
  }

  const thyroidFn = findFlagged(results, ["tsh"], "high") ?? findFlagged(results, ["free t3", "free t4"], "low");
  if (thyroidFn) {
    protocols.push({
      name: "Thyroid Function Review",
      rationale: describe(thyroidFn, (thyroidFn.flag ?? "").toLowerCase() === "high" ? "elevated" : "low"),
      urgency: "Priority",
      tone: "amber",
    });
  }

  const gutFlags = results.filter(
    (r) =>
      r.category === "Gut & Microbiome" &&
      ["high", "low", "abnormal"].includes((r.flag ?? "").toLowerCase()),
  );
  if (gutFlags.length >= 3) {
    protocols.push({
      name: "Gut Microbiome Rebalance",
      rationale: `${gutFlags.length} flagged microbiome markers including ${gutFlags
        .slice(0, 3)
        .map((r) => r.test_name)
        .join(", ")}`,
      urgency: "Recommended",
      tone: "neutral",
    });
  }

  // Composite, patient-agnostic protocol groupings evaluated against optimal ranges.
  const composite = compositeProtocols(results);
  if (composite.protocols.length) {
    const kept = protocols.filter((p) => !composite.superseded.has(p.name));
    protocols.length = 0;
    protocols.push(...composite.protocols, ...kept);
  }

  // Catch-all: never claim a clean bill of health while flags exist.
  const covered = new Set(protocols.flatMap((p) => p.rationale.toLowerCase().split(/\s+/)));
  const remainingFlagged = results.filter((r) => {
    if (markerDirection(r) === null && (r.flag ?? "").toLowerCase() !== "abnormal") return false;
    if (r.category === "Gut & Microbiome" && gutFlags.length >= 3) return false;
    return !covered.has(r.test_name.toLowerCase());
  });


  if (protocols.length === 0 && remainingFlagged.length > 0) {
    protocols.push({
      name: "Flagged Biomarker Review",
      rationale: `${remainingFlagged.length} out-of-range marker${
        remainingFlagged.length === 1 ? "" : "s"
      }: ${remainingFlagged
        .slice(0, 4)
        .map((r) => `${r.test_name} ${r.result_value ?? "—"} ${r.unit ?? ""}`.trim())
        .join("; ")}`,
      urgency: "Priority",
      tone: "amber",
    });
  }

  const { planProtocols, superseded } = treatmentPlanProtocols(patient, results);
  if (planProtocols.length) {
    const kept = protocols.filter(
      (p) => !superseded.has(p.name) && p.name !== "Maintenance Protocol",
    );
    return [...planProtocols, ...kept];
  }

  if (protocols.length === 0) {
    protocols.push({
      name: "Maintenance Protocol",
      rationale: "No flagged biomarkers on the most recent panels — annual monitoring recommended",
      urgency: "Recommended",
      tone: "green",
      action: "Initiate",
    });
  }




  return protocols;
}
