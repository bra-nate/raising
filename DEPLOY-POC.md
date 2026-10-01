# Vercel + Supabase POC

The existing API stays on Express/Prisma. Supabase supplies PostgreSQL; Vercel hosts two projects from this repo.

## 1. Create a fresh Supabase database

Use a new, empty project. In Supabase's **Connect** panel, copy the **transaction pooler** URL (port 6543) for the API. Append `?pgbouncer=true&connection_limit=1` (or `&...` if the URL already has a query string). Use the **session pooler** URL (port 5432), or a direct URL where IPv6 is available, for migrations. Never put either URL in `VITE_*` variables.

From the repo root, run the committed Prisma migrations against the fresh database, using the migration URL as `DATABASE_URL`:

```sh
cd server
DATABASE_URL='<session-or-direct-url>' pnpm exec prisma migrate deploy
```

Create a first account with the existing seed after setting `SUPERADMIN_EMAIL`, `SUPERADMIN_PASSWORD`, and `SUPERADMIN_NAME`. Do not run the demo seed with real data.

## 2. Create two Vercel projects from this repository

| Project | Root Directory | Environment variables |
| --- | --- | --- |
| API | `server` | `DATABASE_URL` (transaction pooler), `JWT_SECRET` (32+ characters), `CLIENT_URL` (frontend production URL), `CRON_SECRET` (random 16+ characters), optional `RESEND_API_KEY` |
| Web | `client` | `VITE_API_URL` (API production URL, without `/api/v1`) |

Use the default Express and Vite framework presets. Vercel detects `server/src/app.ts` as the Express entry point; `server/src/index.ts` re-exports the same app for other runtimes. The Vite SPA rewrite is in `client/vercel.json`. Enable **Include source files outside of the Root Directory in the Build Step** for the web project because `client/vite.config.ts` reads images from the repo's top-level `public/` directory. Set `CLIENT_URL` to the exact web origin for CORS, with no trailing slash. When the API URL changes, rebuild the web project: Vite embeds `VITE_API_URL` at build time.

For a smoke test, visit `/api/v1/health`, sign in, create a test member, reload, and check that the member persists. Use test data only in this POC.

## Scheduled jobs

Locally, `pnpm dev` still starts `node-cron`. On Vercel, `server/vercel.json` invokes the three daily jobs together at 08:00 UTC through a route protected by `CRON_SECRET`. The hourly safety escalation endpoint is implemented at `/api/v1/internal/cron/hourly` but is **not scheduled** in the POC: Vercel Hobby rejects hourly cron schedules. Before using the deployment for real pastoral or safety cases, use Vercel Pro (add `{ "path": "/api/v1/internal/cron/hourly", "schedule": "0 * * * *" }` to `server/vercel.json`), or arrange an equivalent reliable hourly scheduler. Vercel cron delivery can be delayed or repeated, so verify idempotency and monitoring before production use.

No Vercel or Supabase account is linked by this branch; deployment requires project access and the environment variables above.

## Current POC deployment

- Web: `https://raising-web-beta.vercel.app`
- API: `https://raising-api.vercel.app`
- Supabase project: `tpjrcgoowqecxuqjaumd` in West EU (London)

The schema migrations and production environment variables are installed. Before real use, bootstrap an administrator with a user-owned email and one-time password, configure outbound email, schedule the hourly safety escalation, and complete an authenticated production smoke test.
