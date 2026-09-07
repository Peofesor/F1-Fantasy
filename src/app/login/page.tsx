import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/supabase/server";
import { AuthForm } from "./auth-form";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/leagues");

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 p-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">F1 Fantasy</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Sign in to build a roster and join a league.
        </p>
      </header>
      <AuthForm />
    </main>
  );
}
