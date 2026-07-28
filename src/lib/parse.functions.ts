import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { callClaude } from "./ai.server";
import {
  PARSE_FAILURE_MESSAGE,
  buildParsePrompt,
  deriveFlag,
  extractPdfText,
  nextSequentialId,
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
    for (const def of definitions) byName.set(normaliseName(def.test_name), def);

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

    const matched: Array<{ def: TestDefRow; value: string; labFlag: string | null }> = [];
    const unmatched: string[] = [];
    const seen = new Set<string>();
    for (const test of report.tests) {
      if (!test?.test_name || test.value === undefined || test.value === null) continue;
      const def = byName.get(normaliseName(String(test.test_name)));
      if (!def) {
        unmatched.push(String(test.test_name));
        continue;
      }
      if (seen.has(def.test_def_id)) continue;
      seen.add(def.test_def_id);
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

    const dateCollected = /^\d{4}-\d{2}-\d{2}$/.test(report.date_collected ?? "")
      ? report.date_collected
      : new Date().toISOString().slice(0, 10);

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

    return {
      submission_id: submissionId,
      inserted: rows.length,
      unmatched: unmatched.slice(0, 20),
      date_collected: dateCollected,
      lab_name: report.lab_name,
    };
  });
