import { queryOptions } from "@tanstack/react-query";
import { supabase } from "./supabase";
import { definitionKey } from "./meora";
import type { FlatResult, Patient, TestDefinition } from "./types";

export const patientsQuery = () =>
  queryOptions({
    queryKey: ["patients"],
    staleTime: 60_000,
    queryFn: async (): Promise<Patient[]> => {
      const { data, error } = await supabase
        .from("patients")
        .select("patient_id, first_name, last_name, date_of_birth, sex, notes")
        .order("patient_id");
      if (error) throw new Error(error.message);
      return (data ?? []) as Patient[];
    },
  });

export const testDefinitionsQuery = () =>
  queryOptions({
    queryKey: ["test_definitions"],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<Map<string, TestDefinition>> => {
      const { data, error } = await supabase.from("test_definitions").select("*");
      if (error) throw new Error(error.message);
      const map = new Map<string, TestDefinition>();
      for (const def of (data ?? []) as TestDefinition[]) {
        map.set(definitionKey(def.category, def.test_name), def);
      }
      return map;
    },
  });

export const resultsQuery = (patientId: string | null) =>
  queryOptions({
    queryKey: ["flat_results", patientId],
    enabled: Boolean(patientId),
    staleTime: 60_000,
    queryFn: async (): Promise<FlatResult[]> => {
      if (!patientId) return [];
      const { data, error } = await supabase
        .from("flat_view_all_results")
        .select("*")
        .eq("patient_id", patientId)
        .order("category")
        .order("test_name");
      if (error) throw new Error(error.message);
      return (data ?? []) as FlatResult[];
    },
  });

export interface PatientSummaryRow {
  patient_id: string;
  count: number;
  lastDate: string | null;
}

export const patientSummariesQuery = () =>
  queryOptions({
    queryKey: ["patient_summaries"],
    staleTime: 60_000,
    queryFn: async (): Promise<Map<string, PatientSummaryRow>> => {
      const { data, error } = await supabase
        .from("flat_view_all_results")
        .select("patient_id, date_collected");
      if (error) throw new Error(error.message);
      const map = new Map<string, PatientSummaryRow>();
      for (const row of (data ?? []) as Array<{
        patient_id: string;
        date_collected: string | null;
      }>) {
        const entry = map.get(row.patient_id) ?? {
          patient_id: row.patient_id,
          count: 0,
          lastDate: null,
        };
        entry.count += 1;
        if (row.date_collected && (!entry.lastDate || row.date_collected > entry.lastDate)) {
          entry.lastDate = row.date_collected;
        }
        map.set(row.patient_id, entry);
      }
      return map;
    },
  });

export const platformStatsQuery = () =>
  queryOptions({
    queryKey: ["platform_stats"],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<{ biomarkers: number; categories: number }> => {
      const { data, error } = await supabase.from("test_definitions").select("category");
      if (error) throw new Error(error.message);
      const rows = (data ?? []) as Array<{ category: string }>;
      return {
        biomarkers: rows.length,
        categories: new Set(rows.map((r) => r.category)).size,
      };
    },
  });

export const submissionCountQuery = (patientId: string | null) =>
  queryOptions({
    queryKey: ["submissions", patientId],
    enabled: Boolean(patientId),
    staleTime: 60_000,
    queryFn: async (): Promise<number> => {
      if (!patientId) return 0;
      const { count, error } = await supabase
        .from("report_submissions")
        .select("submission_id", { count: "exact", head: true })
        .eq("patient_id", patientId);
      if (error) throw new Error(error.message);
      return count ?? 0;
    },
  });
