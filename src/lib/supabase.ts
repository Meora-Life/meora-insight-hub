import { createClient } from "@supabase/supabase-js";

/**
 * Meora clinical database (external Supabase project).
 * The publishable/anon key is safe in client code; it is only ever used with
 * the project's public Data API policies.
 */
const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL ?? "https://mcfsxksusaxzyvcslvnk.supabase.co";
const SUPABASE_ANON_KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY ?? "sb_publishable_any7wERvyFmaxX_No9_j3A_Er2ER9en";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
