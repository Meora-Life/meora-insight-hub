import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { buildSummaryPrompt, callClaude } from "./ai.server";

const SummaryInput = z.object({
  patient_name: z.string().trim().min(1).max(120),
  results: z
    .array(
      z.object({
        test_name: z.string().max(200),
        category: z.string().max(120).nullable(),
        result_value: z.string().max(200).nullable(),
        unit: z.string().max(60).nullable(),
        reference_range: z.string().max(200).nullable(),
        flag: z.string().max(60).nullable(),
        status: z.string().max(60),
      }),
    )
    .max(120),
});

export const generateHealthSummary = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => SummaryInput.parse(input))
  .handler(async ({ data }) => {
    const prompt = buildSummaryPrompt(data.patient_name, data.results);
    const summary = await callClaude(prompt);
    return { summary };
  });
