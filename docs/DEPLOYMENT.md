# Deployment

How each part of ChiChat is deployed, and what Render is (and is not) for.

## Summary

| Part | Deployed to | How |
|---|---|---|
| Web app (`src/`, built to `dist/`) | Vercel | Automatic on merge to `main`; preview per pull request |
| Invite page (`api/invite.js`) | Vercel Edge Function | Same deployment as the web app |
| Android app | Google Play (planned), APK built in Android Studio | `npm run build`, `npx cap sync android`, build in Android Studio |
| Database schema and rules (`supabase/migrations/`) | Supabase project `pnpabtxvsrkrldpfmtaz` | Run new migration files in the SQL Editor, in order (see "Database changes" below) |
| Edge Functions (`supabase/functions/`) | Same Supabase project | Supabase CLI or dashboard editor, one function at a time |
| API reference (`docs/api/viewer/`) | Optional: Render static site | `render.yaml` (below) |

## Database changes: one record of what ran

Each file in `supabase/migrations/` runs by hand in the SQL Editor, so the
live database can fall behind the code without anyone noticing. Since
2026-10-28 the database keeps its own record:

- Every migration runs as one transaction (`BEGIN; … COMMIT;`) and its last
  statement records itself:
  `INSERT INTO public.app_migrations (id) VALUES ('<first 14 digits of the file name>') ON CONFLICT (id) DO NOTHING;`
- `EXPECTED_DB_VERSION` in `src/lib/admin.ts` names the newest migration
  the app needs. Change it in the same pull request as the new file.
- `src/test/phoneRequired.test.tsx` fails the PR check if either is missing.
- The Admin page shows "Database up to date" or "Database update missing"
  by comparing `app_db_version()` with `EXPECTED_DB_VERSION`.
- Order for a change with a migration: run the SQL, deploy any functions it
  names, then merge.

To see what has run: `select * from public.app_migrations order by id;`

## Should the backend move to Render?

No, not now. Checked against the code on 2026-10-21:

- **There is no server to deploy.** Every backend action is either a
  Supabase service (database, sign in, live updates, files) or a Supabase
  Edge Function. A Render web service would have nothing to run.
- **Supabase already does what a Render server would add**, and the app
  depends on it directly: row rules on every table, live updates over
  Supabase Realtime, signed file links, and sign-in sessions. Putting a
  server in front would mean rewriting the app's data access and the
  Android decline flow, for no gain at this size.
- **Render is not a database or file store.** A Render service's disk is
  wiped on each deploy unless you pay for a persistent disk, and that disk
  is tied to one instance. ChiChat would still need Supabase (or another
  Postgres and object store) underneath.
- **Cost and moving parts.** Render free web services sleep after 15
  minutes without traffic and take about a minute to wake, which would
  break call ringing. A paid instance is an extra monthly cost and another
  thing to monitor.

**When a separate server would make sense** (from `docs/Scaling and
Costs.md`): long-running work Edge Functions cannot do well, such as a
message fan-out service, a TURN server for calls, or jobs over a few
minutes. If that comes, a Render web service (or a Background Worker) next
to Supabase is a reasonable home, documented in this same `openapi.yaml`.

## What Render is used for here

Only an optional, free static site that shows the API reference
(Swagger UI). It runs no ChiChat code, holds no secrets and needs no
environment variables.

`render.yaml` (repository root):

| Setting | Value | Why |
|---|---|---|
| Service type | Static site (`type: web`, `runtime: static`) | Free, nothing to keep running |
| Repository / root | This repository, root directory | `render.yaml` must be at the root |
| Build command | `npx --yes @redocly/cli@2.66.0 bundle public -o docs/api/viewer/openapi.yaml` | Makes the public copy (internal endpoints removed). Does not install the app's packages |
| Publish directory | `./docs/api/viewer` | `index.html` + the generated `openapi.yaml` |
| Start command | none | Static sites have none |
| Environment variables | none | |
| Health check | none | Static sites are served by Render's CDN |
| Database / storage | none | |
| Builds | Only when the spec, viewer, `redocly.yaml` or `render.yaml` change | `buildFilter` |
| Pull request previews | Manual | |
| Headers | `X-Robots-Tag: noindex`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer` | Keep it out of search results |

CORS: the viewer only fetches its own `openapi.yaml` (same origin). If
"Try it out" is used (`?try=1`), the browser calls the Supabase functions
directly; they already allow any origin (`Access-Control-Allow-Origin: *`),
so no CORS change is needed. Note that this means any website can call
them from a browser; the token checks are what protect them.

### Should the reference be public?

The public copy lists the app's own endpoints, which anyone can already
find in the web app's code. It leaves out the email queue and the Twilio
webhook. It contains no keys. It does show error codes and limits, which
helps an attacker a little. Recommended: publish only if outside developers
or reviewers need it; otherwise open it locally (`npm run api:docs`).
Render static sites cannot be password protected on their own.

### Set it up (only if you want it online)

1. Merge this pull request.
2. Render Dashboard → **New** → **Blueprint** → connect GitHub and pick
   `Adeyemi123ade/bloom-voice-net-864a2c15`, branch `main`.
3. Render reads `render.yaml` and shows one static site,
   `chichat-api-docs`. Click **Apply**.
4. Wait for the first build (under a minute), then open the
   `https://chichat-api-docs.onrender.com` style address Render shows.
   Render picks the exact name; it is not known until then.
5. Optional: add a custom domain such as `api-docs.chichatapp.com` in the
   service's Settings, and the CNAME record Render shows at your DNS
   provider.

If the build fails, open the service's **Events** → the failed deploy →
logs. The usual cause is an invalid `docs/openapi.yaml`; run
`npm run api:lint` locally to see the error.

## Deploying Edge Functions

The dashboard editor uploads one file, so functions that import from
`_shared/` (`verify-otp-code`, `check-email-exists`,
`check-registration-availability`, `request-device-otp`, `submit-report`, `twilio-voice-token`, `twilio-voice-twiml`) must be
deployed with the CLI:

```bash
npx supabase login                      # opens the browser; nothing is saved in the repo
npx supabase link --project-ref pnpabtxvsrkrldpfmtaz
npx supabase functions deploy submit-report
```

`supabase functions deploy` applies the `verify_jwt` setting from
`supabase/config.toml`. Secrets are set once in Dashboard → Project
Settings → Edge Functions → Secrets (names in `docs/SECRETS.md`), or:

```bash
npx supabase secrets set NAME=value     # type it in your own terminal, never in chat or a file
```

Logs: Dashboard → Edge Functions → pick the function → **Logs**.

## Checks before merging

```bash
npm run build         # web build
npm test              # unit and render checks
npm run api:check     # API docs match the code
npm run api:lint      # API docs are valid OpenAPI
```

`api:check` and `api:lint` also run on GitHub for every pull request.
