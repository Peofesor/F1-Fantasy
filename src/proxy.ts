import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Session refresh.
 *
 * Note the filename: Next.js 16 renamed Middleware to Proxy, so this must be
 * `proxy.ts` exporting `proxy`. Named `middleware.ts` it would silently never
 * run, and every session would appear expired.
 *
 * Supabase auth tokens are short-lived. This refreshes them on each request and
 * writes the rotated cookies onto the response, so Server Components see a
 * valid session. It deliberately does no authorisation — that belongs in the
 * pages and Server Actions themselves, since proxy code is an optimistic check
 * rather than a security boundary.
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // Touching getUser() is what triggers the refresh; the result is unused here.
  await supabase.auth.getUser();

  return response;
}

export const config = {
  // Skip static assets and images: refreshing a session for a favicon request
  // is wasted work.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
