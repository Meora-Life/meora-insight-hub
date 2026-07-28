import { createClient } from "@supabase/supabase-js";

export interface ExtractedTest {
  test_name: string;
  value: string;
  unit: string | null;
  reference_range: string | null;
  lab_flag: string | null;
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
{"lab_name": string|null, "report_type": string|null, "date_collected": "YYYY-MM-DD"|null, "tests": [{"test_name": string, "value": string, "unit": string|null, "reference_range": string|null, "lab_flag": "normal"|"high"|"low"|"abnormal"|null}]}

Rules:
- Use the test names from this known list wherever the report refers to the same analyte (match synonyms and abbreviations to the list entry): ${knownTests.join(", ")}.
- If a test is not in the list, keep the report's own name.
- "value" is the measured result exactly as reported, digits only where numeric (no units, no < or > unless the report states a limit).
- Never invent tests or values. Omit anything you cannot read confidently.

Report text:
${reportText.slice(0, 120_000)}`;
}

export function parseJsonReport(raw: string): ExtractedReport {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/, "")
    .trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("Claude did not return JSON");
  const parsed = JSON.parse(cleaned.slice(start, end + 1)) as Partial<ExtractedReport>;
  return {
    lab_name: parsed.lab_name ?? null,
    report_type: parsed.report_type ?? null,
    date_collected: parsed.date_collected ?? null,
    tests: Array.isArray(parsed.tests) ? parsed.tests : [],
  };
}

export function normaliseName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\(.*?\)/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Numeric flag derived from the definition's reference bounds. */
export function deriveFlag(value: number | null, def: TestDefRow): string {
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
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Supabase server credentials are not configured");
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
