import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = import.meta.env["VITE_SUPABASE_URL"] as string | undefined;
const anonKey = import.meta.env["VITE_SUPABASE_ANON_KEY"] as string | undefined;

export const supabaseConfigured = Boolean(url && anonKey);

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!url || !anonKey) {
    throw new Error("Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.");
  }
  if (!client) {
    const isBrowser = typeof window !== "undefined";
    client = createClient(url, anonKey, {
      auth: { persistSession: isBrowser, autoRefreshToken: isBrowser, detectSessionInUrl: isBrowser },
    });
  }
  return client;
}
