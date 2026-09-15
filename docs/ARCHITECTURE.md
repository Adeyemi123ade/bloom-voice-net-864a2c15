# Architecture

ChiChat is a Vite/React frontend talking directly to **Supabase** as a fully
managed backend. There is no Node/Express server in this repo — "the
backend" is Supabase's hosted Postgres + Auth + Realtime + Storage, plus a
set of Supabase Edge Functions (Deno, serverless) for anything that needs to
run with elevated privileges or call a third-party API with a secret.

This doc exists so that split is explicit and documented, without moving
files around. Both halves already live in clearly separate, non-overlapping
directories, and neither imports from the other — see "Why no physical
client/server folders" below.

## Client — frontend (Vite + React + Capacitor)

Everything that ships to the browser / the Android app.

| Path | Responsibility |
|---|---|
| `src/pages/` | Route-level screens (`ChatRoom.tsx`, `Login.tsx`, `CallScreen.tsx`, etc.) |
| `src/components/` | Reusable UI — `components/chat`, `components/call`, `components/contacts`, `components/ui` (shadcn primitives) |
| `src/hooks/` | React hooks (`useAuth.tsx`, `useRingback.ts`, `useLongPress.ts`, ...) |
| `src/lib/` | Frontend-only logic: device contacts, call media, phone formatting, device IDs, presence, password strength, etc. |
| `src/integrations/supabase/` | The Supabase JS client (`client.ts`, hardcoded project URL + **anon** key — see [docs/SECRETS.md](SECRETS.md)) and generated DB types (`types.ts`) |
| `src/test/` | Vitest setup + example test |
| `public/`, `index.html`, `src/assets/` | Static assets, HTML shell |
| `android/`, `capacitor.config.ts` | Capacitor native Android wrapper around the built web app |
| `vite.config.ts`, `tsconfig*.json`, `tailwind.config.ts`, `postcss.config.js`, `eslint.config.js`, `vitest.config.ts`, `components.json` | Frontend build/lint/test tooling |
| `vercel.json` | Vercel SPA rewrite config for deploying the built frontend |

Talks to the backend only through the Supabase client SDK (Postgres via
PostgREST, Realtime via WebSocket, Storage, Auth) and by calling edge
function URLs (`supabase.functions.invoke(...)`) for anything that needs a
secret or admin privileges.

## Server — Supabase (managed backend + edge functions)

| Path | Responsibility |
|---|---|
| `supabase/config.toml` | Supabase CLI/project config (must stay at repo root for the CLI to auto-discover it) |
| `supabase/migrations/*.sql` | Postgres schema history — tables, RLS policies, functions, triggers |
| `supabase/functions/*/index.ts` | Deno edge functions — auth flows (OTP, Google sign-in), calling (Twilio token/room/voice), Google Contacts sync, chat backup/restore, account deletion, voice transcription, email queue dispatch. One function = one deployable unit; see [docs/SECRETS.md](SECRETS.md) for exactly which secrets each one needs |
| `supabase/functions/_shared/rateLimit.ts` | The one helper genuinely shared *among edge functions* (not with the client) |
| `migration/` | One-off SQL export/import scripts for migrating between Supabase projects (ops tooling, not app code — see `migration/README.md`) |

Edge functions run in Supabase's Deno runtime and are deployed via the
Supabase CLI or Dashboard editor — never started as a local `npm run
dev:server` process. Database, Auth, Realtime, and Storage are Supabase
platform services with no code in this repo at all beyond the SQL
migrations that define the schema/policies.

## Shared

Checked directly: no file under `supabase/functions/` imports from `src/`,
and nothing in `src/` imports from `supabase/`. The generated DB types in
`src/integrations/supabase/types.ts` describe the same schema the
migrations create, but they're client-only (Deno functions each import
their own dependencies from `esm.sh`/`deno.land`, not from this repo's
`src/`). There is currently no code that is genuinely used by both sides, so
there is no `shared/` folder — adding one would be speculative.

## Why no physical `client/` / `server/` folders

The client and server are already fully separated by directory (`src/` vs.
`supabase/`) and share no imports. Physically moving them into `client/` /
`server/` subfolders was considered and deliberately not done, because:

- Several tools resolve paths **relative to the repo root**: Vercel builds
  from root (`vercel.json`), Capacitor's `webDir: "dist"` in
  `capacitor.config.ts` feeds the native `android/` project via
  `npx cap sync`, and the Supabase CLI auto-discovers `supabase/` at root.
  Moving either tree means reconfiguring all three, plus `vite.config.ts`'s
  `@` alias, `tsconfig*.json`, Tailwind's content globs, ESLint, and
  Vitest — for a live, auto-deploying production app with a
  distributed native Android build.
- There's no actual server *process* to put in a `server/` folder — the
  backend is Supabase itself. A `server/` directory would only ever hold
  SQL and Deno function source, not something you run alongside `client/`
  with a root dev script.

If a genuine need to relocate either tree comes up later (e.g. adopting a
package-manager workspace), revisit this doc first — the constraints above
are why it wasn't done as a blanket "reorganize for tidiness" pass.
