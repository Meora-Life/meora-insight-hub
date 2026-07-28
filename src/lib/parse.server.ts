import { createClient } from "@supabase/supabase-js";

export interface ExtractedTest {
  test_name: string;
  value: string;
  unit: string | null;
  reference_range: string | null;
  lab_flag: string | null;
  /** Collection date for this specific result instance, if the report states one. */
  date: string | null;
}

export interface ExtractedReport {
  lab_name: string | null;
  report_type: string | null;
  date_collected: string | null;
  tests: ExtractedTest[];
}

export interface TestDefRow {
  test_def_id: string;
  test_name: string;
  unit: string | null;
  range_low: number | null;
  range_high: number | null;
}

/** Pure-JS pdf.js build that runs in the worker runtime. */
export async function extractPdfText(base64: string): Promise<string> {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const doc = await getDocumentProxy(bytes);
  const { text } = await extractText(doc, { mergePages: true });
  return (Array.isArray(text) ? text.join("\n") : text).trim();
}

export function buildParsePrompt(knownTests: string[], reportText: string): string {
  return `You are a pathology report parser. Extract every test result from the report text below.

Return ONLY a JSON object, no prose and no markdown fences, in exactly this shape:
{"lab_name": string|null, "report_type": string|null, "date_collected": "YYYY-MM-DD"|null, "tests": [{"test_name": string, "value": string, "unit": string|null, "reference_range": string|null, "date": "YYYY-MM-DD"|null, "lab_flag": "normal"|"high"|"low"|"abnormal"|"not_detected"|"below_detection_limit"|null}]}

Rules:
- This report may contain multiple result columns showing historical data (Australian labs such as 4Cyte, Sonic, Laverty, Douglass Hanly Moir, QML and Melbourne Pathology commonly print 2-3 dated columns side by side). Extract EVERY result instance you can see, including all historical columns. Do not decide which one is most recent — that is handled downstream.
- For each extracted result, set "date" to the collection date of the column that value came from, formatted YYYY-MM-DD. If a column header only shows a partial date, infer the full date from the report header where possible; if no date can be determined, use null.
- Emit one object per (test, date) pair. The same test_name may therefore appear several times with different dates and values — that is expected and correct.
- Never merge values across columns, and never shift a value into the wrong date column.
- Set "date_collected" to the newest collection date on the report.
- Use the test names from this known list wherever the report refers to the same analyte (match synonyms and abbreviations to the list entry): ${knownTests.join(", ")}.
- If a test is not in the list, keep the report's own name.
- "value" is the measured result exactly as reported, digits only where numeric (no units, no < or > unless the report states a limit).
- Never invent tests, values or dates. Omit anything you cannot read confidently.

Report text:
${reportText.slice(0, 120_000)}`;
}

export const PARSE_FAILURE_MESSAGE =
  "Report could not be parsed automatically — please use Manual Paste";

function stripFences(raw: string): string {
  return raw
    .trim()
    .replace(/^```[a-z]*\s*/i, "")
    .replace(/```\s*$/, "")
    .trim();
}

/** Salvage individual well-formed test objects from a truncated/malformed array. */
function salvageTests(text: string): ExtractedTest[] {
  const tests: ExtractedTest[] = [];
  const objectPattern = /\{[^{}]*"test_name"[^{}]*\}/g;
  for (const match of text.match(objectPattern) ?? []) {
    try {
      const obj = JSON.parse(match) as Partial<ExtractedTest>;
      if (obj.test_name && obj.value !== undefined && obj.value !== null) {
        tests.push({
          test_name: String(obj.test_name),
          value: String(obj.value),
          unit: obj.unit ?? null,
          reference_range: obj.reference_range ?? null,
          lab_flag: obj.lab_flag ?? null,
          date: obj.date ?? null,
        });
      }
    } catch {
      // skip unrecoverable fragment
    }
  }
  return tests;
}

function scalar(text: string, key: string): string | null {
  const match = text.match(new RegExp(`"${key}"\\s*:\\s*"([^"]*)"`));
  return match ? match[1] : null;
}

export function parseJsonReport(raw: string): ExtractedReport {
  const cleaned = stripFences(raw);
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");

  if (start !== -1 && end !== -1) {
    try {
      const parsed = JSON.parse(cleaned.slice(start, end + 1)) as Partial<ExtractedReport>;
      return {
        lab_name: parsed.lab_name ?? null,
        report_type: parsed.report_type ?? null,
        date_collected: parsed.date_collected ?? null,
        tests: Array.isArray(parsed.tests) ? parsed.tests : [],
      };
    } catch {
      // fall through to salvage
    }
  }

  const tests = salvageTests(cleaned);
  if (tests.length === 0) throw new Error(PARSE_FAILURE_MESSAGE);

  return {
    lab_name: scalar(cleaned, "lab_name"),
    report_type: scalar(cleaned, "report_type"),
    date_collected: scalar(cleaned, "date_collected"),
    tests,
  };
}

export function normaliseName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\(.*?\)/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const LAB_FLAGS = new Set([
  "normal",
  "high",
  "low",
  "abnormal",
  "not_detected",
  "below_detection_limit",
]);

/** Prefer the flag stated on the report; otherwise derive from the definition's bounds. */
export function deriveFlag(value: number | null, def: TestDefRow, labFlag?: string | null): string {
  const stated = labFlag?.toLowerCase().trim().replace(/\s+/g, "_");
  if (stated && LAB_FLAGS.has(stated)) return stated;
  if (value === null) return "normal";
  if (def.range_low !== null && value < def.range_low) return "low";
  if (def.range_high !== null && value > def.range_high) return "high";
  return "normal";
}

export function numericValue(raw: string): number | null {
  const match = raw.replace(/,/g, "").match(/-?\d+(\.\d+)?/);
  if (!match) return null;
  const n = Number(match[0]);
  return Number.isFinite(n) ? n : null;
}

export function serverSupabase() {
  const url =
    process.env.SUPABASE_URL ??
    process.env.VITE_SUPABASE_URL ??
    "https://mcfsxksusaxzyvcslvnk.supabase.co";
  const key =
    process.env.SUPABASE_PUBLISHABLE_KEY ??
    process.env.VITE_SUPABASE_ANON_KEY ??
    "sb_publishable_any7wERvyFmaxX_No9_j3A_Er2ER9en";
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input: RequestInfo | URL, init?: RequestInit) => {
        const headers = new Headers(init?.headers);
        if (key.startsWith("sb_") && headers.get("Authorization") === `Bearer ${key}`) {
          headers.delete("Authorization");
        }
        headers.set("apikey", key);
        return fetch(input, { ...init, headers });
      },
    },
  });
}

export function nextSequentialId(prefix: string, existing: string[]): string {
  const max = existing.reduce((acc, id) => {
    const match = id.match(/(\d+)$/);
    return match ? Math.max(acc, Number(match[1])) : acc;
  }, 0);
  return `${prefix}-${String(max + 1).padStart(3, "0")}`;
}
