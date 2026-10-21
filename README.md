# ChiChat

A WhatsApp-style chat app. Frontend: Vite + React + shadcn/ui, wrapped in
Capacitor for Android. Backend: Supabase (Postgres + Auth + Realtime +
Storage + Edge Functions). In-app calls via Agora (Twilio Video for older
rooms), phone-number calls via Twilio. Deployed on Vercel.

- Project status, open work and how changes reach users (start here):
  [docs/SESSION_STATUS.md](docs/SESSION_STATUS.md)
- Google Play submission answers: [docs/GOOGLE_PLAY.md](docs/GOOGLE_PLAY.md)
- Architecture (client/server split, why there's no `client/`/`server/`
  folder split): [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- Secrets/env var reference: [docs/SECRETS.md](docs/SECRETS.md)
- API reference (OpenAPI 3.1): [docs/openapi.yaml](docs/openapi.yaml), guide in
  [docs/api/README.md](docs/api/README.md); view it with `npm run api:docs`
- Deployment (Vercel, Supabase, optional Render docs site):
  [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)

## Development

```bash
npm install
npm run dev      # frontend dev server (localhost:8080)
```

Edge functions (`supabase/functions/`) are deployed via the Supabase
Dashboard/CLI, not run as a local dev server — see
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
