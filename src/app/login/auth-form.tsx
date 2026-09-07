"use client";

import { useActionState, useState } from "react";

import { signIn, signUp, type ActionState } from "../auth/actions";

const inputClass =
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none " +
  "focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900";

export function AuthForm() {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const action = mode === "signin" ? signIn : signUp;
  const [state, formAction, pending] = useActionState<ActionState, FormData>(action, null);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 rounded-lg border border-zinc-300 p-1 text-sm dark:border-zinc-700">
        {(["signin", "signup"] as const).map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setMode(option)}
            className={`rounded-md py-1.5 transition ${
              mode === option
                ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                : "text-zinc-600 dark:text-zinc-400"
            }`}
          >
            {option === "signin" ? "Sign in" : "Create account"}
          </button>
        ))}
      </div>

      <form action={formAction} className="space-y-3">
        {mode === "signup" && (
          <label className="block space-y-1">
            <span className="text-xs font-medium text-zinc-500">Display name</span>
            <input name="displayName" required maxLength={40} className={inputClass} />
          </label>
        )}

        <label className="block space-y-1">
          <span className="text-xs font-medium text-zinc-500">Email</span>
          <input type="email" name="email" required autoComplete="email" className={inputClass} />
        </label>

        <label className="block space-y-1">
          <span className="text-xs font-medium text-zinc-500">Password</span>
          <input
            type="password"
            name="password"
            required
            autoComplete={mode === "signin" ? "current-password" : "new-password"}
            className={inputClass}
          />
        </label>

        {state && "error" in state && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
            {state.error}
          </p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-lg bg-zinc-900 py-2 text-sm font-medium text-white disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900"
        >
          {pending ? "Working…" : mode === "signin" ? "Sign in" : "Create account"}
        </button>
      </form>
    </div>
  );
}
