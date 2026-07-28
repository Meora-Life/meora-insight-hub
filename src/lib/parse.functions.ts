import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { callClaude } from "./ai.server";
import { clinicalNotes, parseTreatmentPlan, serialiseNotes } from "./treatment";
import { riskFindings, riskSummaryLine } from "./risk";
import type { FlatResult } from "./types";
import {
  PARSE_FAILURE_MESSAGE,
  canonicalKey,
  buildParsePrompt,
  deriveFlag,
  extractPdfText,
  latestDate,
  latestPerTest,
  nextSequentialId,
  normaliseDate,
  normaliseName,
  numericValue,
  parseJsonReport,
  serverSupabase,
  type TestDefRow,
} from "./parse.server";

const ParseInput = z.object({
  patient_id: z.string().trim().min(1).max(40),
  file_name: z.string().trim().min(1).max(255),
  file_base64: z.string().min(1).max(20_000_000),
});

export const parsePdfReport = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => ParseInput.parse(input))
  .handler(async ({ data }) => {
    const text = await extractPdfText(data.file_base64);
    if (text.length < 40) {
      throw new Error(
        "No readable text found in this PDF. Scanned or image-only reports are not supported yet.",
      );
    }

    const supabase = serverSupabase();
    const { data: defRows, error: defError } = await supabase
      .from("test_definitions")
      .select("test_def_id, test_name, unit, range_low, range_high");
    if (defError) throw new Error(defError.message);
    const definitions = (defRows ?? []) as TestDefRow[];

    const byName = new Map<string, TestDefRow>();
    for (const def of definitions) byName.set(canonicalKey(def.test_name), def);

    let report;
    try {
      report = parseJsonReport(
        await callClaude(
          buildParsePrompt(
            definitions.map((d) => d.test_name),
            text,
          ),
        ),
      );
    } catch {
      throw new Error(PARSE_FAILURE_MESSAGE);
    }

    // Claude extracts every dated result instance; we deterministically keep the
    // most recent row per analyte here rather than trusting its layout judgement.
    const deduped = latestPerTest(report.tests ?? [], canonicalKey);

    const matched: Array<{ def: TestDefRow; value: string; labFlag: string | null }> = [];
    const unmatched: string[] = [];
    for (const test of deduped) {
      const def = byName.get(canonicalKey(String(test.test_name)));
      if (!def) {
        unmatched.push(String(test.test_name));
        continue;
      }
      matched.push({
        def,
        value: String(test.value).trim(),
        labFlag: test.lab_flag ? String(test.lab_flag).toLowerCase() : null,
      });
    }

    if (matched.length === 0) {
      throw new Error(
        `No known biomarkers could be matched from this report${
          unmatched.length ? ` (unrecognised: ${unmatched.slice(0, 6).join(", ")})` : ""
        }.`,
      );
    }

    const { data: subs, error: subsError } = await supabase
      .from("report_submissions")
      .select("submission_id");
    if (subsError) throw new Error(subsError.message);
    const submissionId = nextSequentialId(
      "SUB",
      (subs ?? []).map((s: { submission_id: string }) => s.submission_id),
    );

    const dateCollected =
      latestDate(deduped) ??
      normaliseDate(report.date_collected) ??
      new Date().toISOString().slice(0, 10);

    const { error: subInsertError } = await supabase.from("report_submissions").insert({
      submission_id: submissionId,
      patient_id: data.patient_id,
      lab_name: report.lab_name ?? "Unknown laboratory",
      report_type: report.report_type ?? "PDF pathology report",
      date_collected: dateCollected,
      source_file: data.file_name,
      notes: "Parsed by MeorAI from PDF",
    });
    if (subInsertError) throw new Error(subInsertError.message);

    const { data: lastResults, error: lastError } = await supabase
      .from("test_results")
      .select("result_id")
      .order("result_id", { ascending: false })
      .limit(1);
    if (lastError) throw new Error(lastError.message);
    let counter = Number(
      ((lastResults?.[0] as { result_id?: string } | undefined)?.result_id ?? "RES-000").replace(
        /\D/g,
        "",
      ),
    );

    const rows = matched.map((m) => {
      counter += 1;
      const numeric = numericValue(m.value);
      return {
        result_id: `RES-${String(counter).padStart(3, "0")}`,
        submission_id: submissionId,
        test_def_id: m.def.test_def_id,
        result_value_numeric: numeric,
        result_value_text: numeric === null ? m.value.slice(0, 200) : null,
        flag: deriveFlag(numeric, m.def, m.labFlag),
        lab_flag: m.labFlag,
        notes: null,
      };
    });

    const { error: insertError } = await supabase.from("test_results").insert(rows);
    if (insertError) throw new Error(insertError.message);

    /* ---- clinical notes + high-risk scan -------------------------------- */

    const scanResults = rows.map((row, i) => ({
      test_name: matched[i].def.test_name,
      result_value: row.result_value_numeric !== null ? String(row.result_value_numeric) : row.result_value_text,
      unit: matched[i].def.unit,
      flag: row.flag,
      lab_flag: row.lab_flag,
      reference_range: null,
    })) as unknown as FlatResult[];

    const { data: patientRow } = await supabase
      .from("patients")
      .select("notes")
      .eq("patient_id", data.patient_id)
      .maybeSingle();
    const existingNotes = (patientRow as { notes?: string | null } | null)?.notes ?? null;
    const plan = parseTreatmentPlan(existingNotes);

    let clinical = (clinicalNotes(existingNotes) ?? "")
      .replace(/^HIGH RISK:.*$/gim, "")
      .trim();
    const extracted = report.clinical_notes?.trim();
    if (extracted && !clinical.includes(extracted)) {
      clinical = [clinical, extracted].filter(Boolean).join("\n\n");
    }

    const findings = riskFindings(clinical, scanResults);
    if (findings.length > 0) {
      clinical = `HIGH RISK: ${riskSummaryLine(findings)}\n\n${clinical}`.trim();
    }

    const { error: notesError } = await supabase
      .from("patients")
      .update({ notes: serialiseNotes(clinical, plan) })
      .eq("patient_id", data.patient_id);
    if (notesError) throw new Error(notesError.message);

    return {
      submission_id: submissionId,
      inserted: rows.length,
      clinical_notes: extracted ?? null,
      high_risk: findings.length > 0,
      risk_findings: findings,
      unmatched: unmatched.slice(0, 20),
      date_collected: dateCollected,
      lab_name: report.lab_name,
    };
  });
