import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Meora clinical database (external Supabase project).
 * The publishable/anon key is safe in client code; it is only ever used with
 * the project's public Data API policies.
 *
 * The client is created lazily so that module evaluation during SSR can never
 * throw (e.g. when VITE_* env vars are not inlined in the server bundle).
 */
const FALLBACK_URL = "https://mcfsxksusaxzyvcslvnk.supabase.co";
const FALLBACK_KEY = "sb_publishable_any7wERvyFmaxX_No9_j3A_Er2ER9en";

function readEnv(name: string): string | undefined {
  const viteValue = (import.meta.env as Record<string, string | undefined>)[`VITE_${name}`];
  if (viteValue) return viteValue;
  if (typeof process !== "undefined" && process.env) {
    return process.env[`VITE_${name}`] ?? process.env[name];
  }
  return undefined;
}

export function getSupabaseConfig(): { url: string; key: string } {
  const url = readEnv("SUPABASE_URL") ?? FALLBACK_URL;
  const key = readEnv("SUPABASE_ANON_KEY") ?? FALLBACK_KEY;
  if (!url || !key) {
    console.error(
      new Error(
        `Supabase config missing during ${typeof window === "undefined" ? "SSR" : "client"} render: url=${Boolean(url)} key=${Boolean(key)}`,
      ),
    );
  }
  return { url, key };
}

let client: SupabaseClient | undefined;

export function getSupabase(): SupabaseClient {
  if (!client) {
    try {
      const { url, key } = getSupabaseConfig();
      client = createClient(url, key, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
    } catch (error) {
      console.error(error);
      throw error;
    }
  }
  return client;
}

/** Lazy proxy: behaves like a SupabaseClient but defers creation to first use. */
export const supabase = new Proxy({} as SupabaseClient, {
  get(_target, prop, receiver) {
    return Reflect.get(getSupabase() as object, prop, receiver);
  },
});
