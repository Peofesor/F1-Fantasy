import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Service-role Supabase client — SERVER ONLY.
 *
 * The service-role key bypasses row-level security entirely, so this module
 * must never be imported from client components. Ingestion is the only writer
 * to the F1 reference tables, and those tables grant no insert/update policies
 * to authenticated users, so the service role is required here.
 */

let cached: SupabaseClient | null = null;

export function createAdminClient(): SupabaseClient {
  if (cached) return cached;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "Missing Supabase credentials. Copy .env.example to .env.local and fill in " +
        "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
    );
  }

  cached = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  return cached;
}

/**
 * Loads .env.local for standalone scripts.
 *
 * Next.js loads env files itself, but `tsx scripts/...` does not, so scripts
 * call this before touching the client.
 */
export function loadLocalEnv(): void {
  try {
    process.loadEnvFile(".env.local");
  } catch {
    // Already-set environment variables (CI, or a shell export) are fine.
  }
}
