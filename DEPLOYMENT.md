# Deployment

How the system is deployed, and how to change it.

## What is live now

| | |
| --- | --- |
| **Site** | https://merry-cleaners.vercel.app |
| **Dashboard** | https://merry-cleaners.vercel.app/admin |
| **Code** | github.com/Moixie/merry-cleaners (private) |
| **Database** | Supabase, London region (eu-west-2) |
| **Hosting** | Vercel |

## How a change reaches the live site

```
edit code → git push → Vercel builds → live in about a minute
```

GitHub and Vercel are connected, so a push to `main` deploys automatically.
No token, no manual step.

## Running it locally

```bash
npm install
npm run dev
```

Then http://localhost:3000 — and http://localhost:3000/admin for the dashboard.

Works with no accounts configured at all: the system falls back to a local
JSON file and the scripted agent.

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Start locally |
| `npm run build` | Production build (type-checks everything) |
| `npm run lint` | Check code quality |
| `npm run test:agent` | Run the 15-scenario behaviour suite |
| `npm run reset-data` | Clear the local JSON store back to sample records |

## Environment variables

Copy `.env.example` to `.env.local` for local use. In production they live in
Vercel under **Settings → Environment Variables**.

**Currently set in production:** `ADMIN_PASSWORD`, `ADMIN_SESSION_SECRET`,
`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`,
`NEXT_PUBLIC_SITE_URL`.

**Not yet set:** `ANTHROPIC_API_KEY` (scripted engine in use),
`RESEND_API_KEY`, `STRIPE_SECRET_KEY`, WhatsApp credentials, `MOCK_MODE`.

After adding a variable in Vercel you must **redeploy** for it to take effect.

## Database migrations

Schema lives in `supabase/schema.sql`; changes are numbered files in
`supabase/migrations/`.

To apply one: open the Supabase SQL editor, paste the file, run it. Migration
001 (nullable booking price, agent audit table) has been applied.

## Scheduled jobs

`vercel.json` registers two cron jobs:

| Job | Schedule | Purpose |
| --- | --- | --- |
| `/api/cron/followups` | Daily 09:00 | Send due follow-ups |
| `/api/cron/retention` | Weekly, Monday 03:00 | Erase expired records |

**Important:** Vercel's free plan runs cron **once a day**, which cannot
deliver a five-minute follow-up. Either take Vercel Pro (whose scheduler is
finer-grained) or add a free cron-job.org schedule hitting
`/api/cron/followups?secret=YOUR_CRON_SECRET` every five minutes.

## Pointing merrycleaners.co.uk at the new site

1. Vercel → project → **Settings → Domains** → add `merrycleaners.co.uk` and
   `www.merrycleaners.co.uk`.
2. Vercel shows the DNS records needed.
3. Add those at your domain registrar.
4. Wait for propagation (usually under an hour).
5. Update `NEXT_PUBLIC_SITE_URL` to the new address and redeploy.

**Before you do this:** the new site covers three services; the existing
merrycleaners.co.uk lists seven. Decide whether to add the other four first —
see `README.md`.

**Also switch Vercel to the Pro plan at this point.** Their Hobby plan is
licensed for personal, non-commercial use.

## Rolling back

Vercel keeps every deployment. **Deployments** → find the last good one →
**Promote to Production**. Takes seconds.

For a code rollback: `git revert <commit>` then push.

## Hosting elsewhere

Nothing is Vercel-specific except `vercel.json`. The app is a standard Next.js
application and runs anywhere Node does. The two things to replicate are the
environment variables and the scheduled jobs.

## Health checks

| Check | How |
| --- | --- |
| Site up | `curl -o /dev/null -w "%{http_code}" https://merry-cleaners.vercel.app/` |
| Agent responding | `npm run test:agent` with `BASE_URL` set to production |
| Which services are connected | Dashboard → Overview → **Connections** |
| What the agent has been doing | Dashboard → Escalations, and the `agent_actions` table |
