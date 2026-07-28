/**
 * High-risk detection.
 *
 * A patient is HIGH RISK when either their clinical notes contain a red-flag
 * keyword, or one of their results trips a hard clinical threshold / carries a
 * critical lab flag. Both scans are pure so they can run on the server during
 * PDF parsing and on the client for already-stored patients.
 */

import { clinicalNotes } from "./treatment";
import type { FlatResult } from "./types";

export interface RiskFinding {
  source: "notes" | "result";
  category: string;
  detail: string;
}

const NOTE_KEYWORDS: Array<{ category: string; terms: string[] }> = [
  {
    category: "Cancer",
    terms: [
      "lymphoma",
      "leukaemia",
      "leukemia",
      "carcinoma",
      "malignancy",
      "malignant",
      "oncology",
      "chemotherapy",
      "remission",
      "tumour",
      "tumor",
      "metastatic",
    ],
  },
  {
    category: "Pregnancy",
    terms: ["pregnant", "pregnancy", "hcg positive", "beta-hcg", "beta hcg"],
  },
  {
    category: "Organ failure",
    terms: ["renal failure", "dialysis", "cirrhosis", "hepatic failure", "liver failure"],
  },
  {
    category: "Cardiac",
    terms: ["heart failure", "myocardial infarction", "unstable angina"],
  },
];

export function notesRiskFindings(notes: string | null): RiskFinding[] {
  const text = (clinicalNotes(notes) ?? "").toLowerCase();
  if (!text.trim()) return [];
  const findings: RiskFinding[] = [];
  for (const group of NOTE_KEYWORDS) {
    const hit = group.terms.find((t) => text.includes(t));
    if (hit) {
      findings.push({
        source: "notes",
        category: group.category,
        detail: `Clinical notes mention "${hit}"`,
      });
    }
  }
  if (text.includes("high risk")) {
    findings.push({
      source: "notes",
      category: "Flagged",
      detail: "Clinical notes flag this patient as high risk",
    });
  }
  return findings;
}

function numeric(value: string | null): number | null {
  if (!value) return null;
  const match = value.replace(/,/g, "").match(/-?\d+(\.\d+)?/);
  if (!match) return null;
  const n = Number(match[0]);
  return Number.isFinite(n) ? n : null;
}

function flagText(r: FlatResult): string {
  return `${r.flag ?? ""} ${r.lab_flag ?? ""}`.toLowerCase();
}

function isHigh(r: FlatResult): boolean {
  return /\bhigh\b|\bh\b|abnormal/.test(flagText(r));
}

function isCritical(r: FlatResult): boolean {
  return /critical|panic|urgent/.test(flagText(r));
}

function name(r: FlatResult): string {
  return r.test_name.toLowerCase();
}

function display(r: FlatResult): string {
  return `${r.test_name} ${r.result_value ?? "—"} ${r.unit ?? ""}`.trim();
}

export function resultRiskFindings(results: FlatResult[]): RiskFinding[] {
  const findings: RiskFinding[] = [];
  const push = (category: string, detail: string) => {
    if (!findings.some((f) => f.detail === detail)) {
      findings.push({ source: "result", category, detail });
    }
  };

  for (const r of results) {
    const n = name(r);
    const value = numeric(r.result_value);

    if (isCritical(r)) push("Critical result", `${display(r)} flagged critical by the laboratory`);

    if (n.includes("hcg") && isHigh(r)) {
      push("Pregnancy / hCG", `${display(r)} is above the reference range`);
    }

    if ((n.includes("prostate specific") || n.includes("psa")) && (isHigh(r) || (value !== null && value > 4.0))) {
      push("Prostate", `${display(r)} is elevated (>4.0 ug/L or lab-flagged high)`);
    }

    if (n.includes("egfr") && value !== null && value < 30) {
      push("Renal", `${display(r)} indicates severely reduced kidney function (eGFR < 30)`);
    }

    if ((n.includes("haematocrit") || n.includes("hematocrit")) && value !== null) {
      const fraction = value > 1 ? value / 100 : value;
      if (fraction > 0.54) push("Polycythaemia", `${display(r)} exceeds 0.54 (polycythaemia)`);
    }

    if (
      (n.includes("haemoglobin") || n.includes("hemoglobin")) &&
      !n.includes("a1c") &&
      value !== null &&
      value > 185
    ) {
      push("Polycythaemia", `${display(r)} exceeds 185 g/L`);
    }
  }

  return findings;
}

export function riskFindings(notes: string | null, results: FlatResult[]): RiskFinding[] {
  return [...notesRiskFindings(notes), ...resultRiskFindings(results)];
}

export function isHighRisk(notes: string | null, results: FlatResult[]): boolean {
  return riskFindings(notes, results).length > 0;
}

export function riskSummaryLine(findings: RiskFinding[]): string {
  return findings.map((f) => `${f.category}: ${f.detail}`).join("; ");
}
