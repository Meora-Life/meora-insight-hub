export type Sex = "M" | "F";

export type ResultFlag =
  | "normal"
  | "high"
  | "low"
  | "abnormal"
  | "not_detected"
  | "below_detection_limit";

export interface Patient {
  patient_id: string;
  first_name: string;
  last_name: string;
  date_of_birth: string | null;
  sex: string | null;
  notes: string | null;
}

export interface TestDefinition {
  test_def_id: string;
  category: string;
  subcategory: string | null;
  test_name: string;
  unit: string | null;
  range_type: string | null;
  range_low: number | null;
  range_high: number | null;
  range_display: string | null;
  optimal_low: number | null;
  optimal_high: number | null;
  description: string | null;
  panel: string | null;
}

export interface FlatResult {
  result_id: string;
  patient_id: string;
  patient_name: string;
  date_of_birth: string | null;
  sex: string | null;
  submission_id: string;
  date_collected: string | null;
  lab: string | null;
  report_type: string | null;
  category: string | null;
  subcategory: string | null;
  test_name: string;
  result_value: string | null;
  unit: string | null;
  reference_range: string | null;
  flag: string | null;
  lab_flag: string | null;
  notes: string | null;
  optimal_low: number | null;
  optimal_high: number | null;
  description: string | null;
}

export type StatusKey =
  | "optimal"
  | "suboptimal"
  | "out_of_range"
  | "abnormal"
  | "not_detected"
  | "below_detection";

export interface StatusInfo {
  key: StatusKey;
  label: string;
  /** tailwind classes for the pill */
  className: string;
  /** css colour token for markers */
  color: string;
}
