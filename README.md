# F1 Fantasy

A fantasy Formula 1 game for a private friends' league — duel-based weekly matchups, a unified cost-cap economy, chips, and betting markets.

The full game design is specified in [docs/game-design-spec.md](docs/game-design-spec.md). Read that first: it records not only what the game does but what was deliberately dropped and why.

## Status

Playable. Leagues, rosters, captains, chips, betting, duels, scoring and standings all run against real ingested data.

The 2026 season is being used as a live test bed so that real ingested data accumulates ahead of the 2027 target season.

Run as a **private, non-commercial** league. That is not incidental — the data, the images and the hosting are all permitted on that condition. [docs/going-commercial.md](docs/going-commercial.md) lists what would have to change first.

## Stack

Next.js 16 + TypeScript, Supabase (Postgres, auth, `pg_cron`), Tailwind.

## Data sources

| Source | Provides |
|---|---|
| [jolpica-f1](https://github.com/jolpica/jolpica-f1) | Qualifying, race results, standings, lap timings, pit-lane times |
| [OpenF1](https://openf1.org/) | Overtakes, safety-car events, session-keyed pit timing |

Both are rate-limited, neither is affiliated with Formula 1, and **both are licensed CC BY-NC-SA 4.0** — attribution required, non-commercial only, share-alike. jolpica is the one that matters: it supplies the calendar, results and standings, so there is no version of the game without it. Dropping OpenF1 alone does not make this commercially usable.

Attribution renders site-wide from [`src/lib/f1/data-sources.ts`](src/lib/f1/data-sources.ts), which is also where OpenF1 can be switched off (`F1_OPENF1=off`).

## Development

```bash
npm install
npm run dev
```

| Command | Purpose |
|---|---|
| `npm run dev` | Next.js dev server |
| `npm test` | Vitest suite (pure transform logic, runs offline) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm run backfill` | Ingest completed rounds (skips those already stored) |
| `npm run prices` | Recompute derived driver and constructor prices |
| `npm run db:status` | Row counts, coverage and integrity check |

### Verifying ingestion against live data

Fetches one real race weekend from both APIs, runs it through the transforms, and prints the facts each bet market settles on:

```bash
npx tsx scripts/verify-ingest.ts 2026 13
```

This hits the live APIs and respects their rate limits, so it takes a few seconds per round.

## Scheduled ingestion

[`.github/workflows/ingest.yml`](.github/workflows/ingest.yml) runs daily at 06:00 UTC and ingests any completed rounds of the current season that aren't stored yet. Rounds already present are skipped, so a run with nothing new costs only a few requests. It can also be triggered manually from the Actions tab, optionally against a specific season.

It needs two repository secrets (Settings → Secrets and variables → Actions):

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

> Supabase `pg_cron` was considered and rejected: it runs SQL inside Postgres and cannot call the upstream APIs or run these transforms. Driving it via `pg_net` to a Deno Edge Function would require adding `.ts` extensions across `src/` for Deno's resolver, and Edge Function time limits risk a partial run when catching up on several rounds — which is the failure mode that previously destroyed data.

## Database

Migrations live in `supabase/migrations/`, applied in filename order. With the Supabase CLI linked to a project:

```bash
supabase db push
```

Without the CLI, paste each migration into the Supabase dashboard SQL editor in order.

## Environment

Copy `.env.example` to `.env.local` and fill in your Supabase project values. The service-role key bypasses row-level security and must never reach the browser — it is only used by ingestion.

| Variable | Required | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | yes | Project URL, safe in the browser |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | yes | Public key, constrained by row-level security |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | Bypasses RLS; server and ingestion only |
| `F1_OPENF1` | no | Set to `off` to run without OpenF1 |

## Deployment

Hosted on **Vercel** (Hobby tier — free, and non-commercial, which is what this is). Every page is `force-dynamic` and the game runs on Server Actions, so this needs a Node runtime: static hosting will not work. Nothing here is Vercel-specific, so any host that runs `next start` is a drop-in.

```bash
bash scripts/deploy.sh
```

Walks through the whole setup one screen at a time — opening each dashboard, saying what to click, and checking the result before moving on. The steps it covers are below, if you would rather do them by hand.

On Windows run it from **Git Bash**, not PowerShell or `cmd` — it is a bash script and the other two cannot read it.

1. **Import the repo** at [vercel.com/new](https://vercel.com/new). The framework and build command are detected; no configuration needed.
2. **Add the three environment variables** above under Settings → Environment Variables, for Production and Preview. Set the two `NEXT_PUBLIC_` ones to type **Config**, not Secret.

   Secret and `NEXT_PUBLIC_` are contradictory, and the contradiction fails silently. `NEXT_PUBLIC_` means Next.js compiles the value into the browser bundle at build time; Secret means Vercel never lets the value reach the browser. So a `NEXT_PUBLIC_` variable stored as Secret is simply absent from the build — the build still succeeds, and then every single request 500s with *"Your project's URL and Key are required to create a Supabase client"*, because the proxy runs before every route and cannot construct its client. Even `/rules`, which is static, returns 500.

   Both are safe as Config: the URL is just the project address, and the anon key is designed to be public — row-level security is what constrains it. `SUPABASE_SERVICE_ROLE_KEY` is the one that must stay Secret, and it carries no `NEXT_PUBLIC_` prefix precisely so it cannot leak.
3. **Point Supabase at the deployment.** In the Supabase dashboard, Authentication → URL Configuration: set **Site URL** to the Vercel domain and add it to **Redirect URLs**. Skipping this is the usual cause of a broken launch — confirmation and password-reset links keep pointing at `localhost:3000`, so they work for you and for nobody else.
4. **Decide on email confirmation.** Supabase's built-in mailer is rate-limited to a handful of messages per hour and is prone to spam folders. For a small private league, either turn confirmation off (Authentication → Providers → Email) or configure real SMTP.
5. **Set the Actions secrets** (below) if you have not already, or nothing will be ingested or scored after a race.

Pushing to `master` deploys. Other branches get preview URLs.

Your git commit email has to be a verified address on your GitHub account, or Vercel refuses to build: it cannot match the commit author to an account, treats the author as an outside collaborator, and Hobby projects do not allow those. The deployment shows as **Blocked**, and the redeploy button only offers an upgrade to Pro — so the fix is to verify the address at [github.com/settings/emails](https://github.com/settings/emails) and push again, not to redeploy. Check with `git config user.email`.
