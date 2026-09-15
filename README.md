# ChiChat

A WhatsApp-style chat app. Frontend: Vite + React + shadcn/ui, wrapped in
Capacitor for Android. Backend: Supabase (Postgres + Auth + Realtime +
Storage + Edge Functions). Calls via Twilio. Deployed on Vercel.

- Architecture (client/server split, why there's no `client/`/`server/`
  folder split): [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- Secrets/env var reference: [docs/SECRETS.md](docs/SECRETS.md)
- Session log / open items: [docs/SESSION_STATUS.md](docs/SESSION_STATUS.md)

## Development

```bash
npm install
npm run dev      # frontend dev server (localhost:8080)
```

Edge functions (`supabase/functions/`) are deployed via the Supabase
Dashboard/CLI, not run as a local dev server — see
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
