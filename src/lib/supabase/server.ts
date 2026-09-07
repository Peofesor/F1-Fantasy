import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Supabase client for Server Components, Server Actions and route handlers.
 *
 * Uses the anon key and the caller's session cookie, so every query runs as the
 * signed-in user and row-level security applies. This is the opposite of
 * ./admin.ts, which uses the service role to bypass RLS for ingestion — that
 * one must never be reachable from a request handler serving a user.
 */
export async function createServerSupabase() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Server Components cannot set cookies. Session refresh happens in
            // proxy.ts instead, so ignoring this is safe.
          }
        },
      },
    },
  );
}

/**
 * The signed-in user, or null.
 *
 * Always uses `getUser()` rather than reading the session from the cookie:
 * `getSession()` trusts data the browser sent, whereas `getUser()` revalidates
 * against Supabase. Server-side authorisation must not trust the client.
 */
export async function getCurrentUser() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}
