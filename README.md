# F1 Fantasy

A fantasy Formula 1 game for a private friends' league — duel-based weekly matchups, a unified cost-cap economy, chips, and betting markets.

The full game design is specified in [docs/game-design-spec.md](docs/game-design-spec.md). Read that first: it records not only what the game does but what was deliberately dropped and why.

## Status

Data pipeline under construction. No game logic yet.

The 2026 season is being used as a live test bed so that real ingested data accumulates ahead of the 2027 target season.

## Stack

Next.js 16 + TypeScript, Supabase (Postgres, auth, `pg_cron`), Tailwind.

## Data sources

| Source | Provides |
|---|---|
| [jolpica-f1](https://github.com/jolpica/jolpica-f1) | Qualifying, race results, standings, lap timings, pit-lane times |
| [OpenF1](https://openf1.org/) | Overtakes, safety-car events, session-keyed pit timing |

Both are rate-limited and neither is affiliated with Formula 1. OpenF1 is licensed **CC BY-NC-SA 4.0 (non-commercial)** — fine for a private league, a blocker for a commercial launch. See §11 of the spec.

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
