"use client";

import { useActionState, useState } from "react";

import { signIn, signUp, type ActionState } from "../auth/actions";

const inputClass =
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none " +
  "focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900";

/**
 * The reveal toggle's icon: an eye, struck through once the password is shown.
 *
 * Drawn inline rather than pulled from an icon set — it is the only icon in the
 * app, and a dependency for one glyph is a poor trade.
 */
function Eye({ crossed }: { crossed: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M1.8 12s3.9-6.5 10.2-6.5S22.2 12 22.2 12s-3.9 6.5-10.2 6.5S1.8 12 1.8 12Z" />
      <circle cx="12" cy="12" r="3.1" />
      {crossed && <path d="M4 20 20 4" />}
    </svg>
  );
}

export function AuthForm() {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [revealed, setRevealed] = useState(false);
  const action = mode === "signin" ? signIn : signUp;
  const [state, formAction, pending] = useActionState<ActionState, FormData>(action, null);

  return (
    <div className="space-y-4">
      {/*
        Labels deliberately differ from the submit button below. Naming the tab
        the same as the button made an already-selected tab look broken: you
        click "Create account", nothing changes, because it was already chosen.
      */}
      <div className="grid grid-cols-2 rounded-lg border border-zinc-300 p-1 text-sm dark:border-zinc-700">
        {(["signin", "signup"] as const).map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={mode === option}
            onClick={() => setMode(option)}
            className={`rounded-md py-1.5 transition ${
              mode === option
                ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
            }`}
          >
            {option === "signin" ? "I have an account" : "I'm new here"}
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
          {/* The reveal sits inside the field's box rather than beside it, so
              the input keeps the same width as the ones above it. Padding on
              the right stops a long password running under the button. */}
          <div className="relative">
            <input
              type={revealed ? "text" : "password"}
              name="password"
              required
              // Only on sign-up: the server refuses anything shorter, and
              // finding that out after a round trip is a poor first thirty
              // seconds. Not applied to sign-in, where an older short password
              // must still be able to get in.
              minLength={mode === "signup" ? 8 : undefined}
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
              className={`${inputClass} pr-11`}
            />
            <button
              type="button"
              onClick={() => setRevealed((shown) => !shown)}
              // The label says what the button does, not what is on screen —
              // a screen reader announcing "hide" on a masked field would be
              // describing the wrong state.
              aria-label={revealed ? "Hide password" : "Show password"}
              aria-pressed={revealed}
              className="absolute inset-y-0 right-0 flex items-center px-3 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
            >
              <Eye crossed={revealed} />
            </button>
          </div>
          {mode === "signup" && (
            <span className="block text-[11px] text-zinc-500">At least 8 characters.</span>
          )}
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
