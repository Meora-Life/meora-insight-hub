export interface FlaggedResultInput {
  test_name: string;
  category: string | null;
  result_value: string | null;
  unit: string | null;
  reference_range: string | null;
  flag: string | null;
  status: string;
}

export interface SummaryContext {
  clinical_notes?: string | null;
  high_risk?: boolean;
  risk_reasons?: string[];
}

export function buildSummaryPrompt(
  patientName: string,
  results: FlaggedResultInput[],
  context: SummaryContext = {},
): string {
  const lines = results
    .map(
      (r) =>
        `- ${r.test_name} (${r.category ?? "Uncategorised"}): ${r.result_value ?? "—"} ${
          r.unit ?? ""
        } | reference: ${r.reference_range ?? "n/a"} | lab flag: ${r.flag ?? "n/a"} | status: ${r.status}`,
    )
    .join("\n");

  const notesBlock = context.clinical_notes?.trim()
    ? `\n\nClinical notes on file for ${patientName} (use these for context before analysing anything):\n${context.clinical_notes.trim()}`
    : "";

  const riskBlock = context.high_risk
    ? `\n\nCRITICAL: This patient is flagged HIGH RISK for the following reasons: ${
        (context.risk_reasons ?? []).join("; ") || "clinical red flags detected"
      }. You MUST open your response with a section headed "Risk Flag" stating the high-risk status and the reason, before any other analysis. Do not recommend initiating any protocol; state that specialist review and referral to the treating physician are required first.`
    : "";

  return `You are a clinical health analyst for Meora, an Australian longevity telehealth clinic. The patient's name is exactly "${patientName}" — refer to them only by that name and never invent another name. Analyse the full panel below — it contains every result from the selected submission, both in-range and out-of-range. Provide: 1) A brief overview of their health status, 2) The top 3 findings that need attention, 3) Three specific recommended actions. Be direct, clinical, and evidence-based. Do not mention specific medication names. Always recommend consulting with a GP before acting on any findings.

Results:
${lines || `No biomarkers are flagged as suboptimal or out of range for ${patientName}; every measured marker sits within its reference range. Frame the overview around this, and make the findings and actions about maintaining and monitoring current status.`}

${notesBlock}${riskBlock}

Format your response with the section headers "Overview", "Key Findings" and "Recommended Actions". Use plain text with short paragraphs and numbered lists. Do not use markdown asterisks or emojis.`;
}

export async function callClaude(prompt: string): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not configured");

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-5",
      max_tokens: 1500,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Anthropic API error (${response.status}): ${detail.slice(0, 300)}`);
  }

  const payload = (await response.json()) as {
    content?: Array<{ type: string; text?: string }>;
  };

  return (payload.content ?? [])
    .filter((block) => block.type === "text")
    .map((block) => block.text ?? "")
    .join("\n")
    .trim();
}
