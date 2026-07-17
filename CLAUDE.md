# UHT Platform — Ultimate Hockey Tournaments

## What This Is

Full-stack tournament management platform for Ultimate Hockey Tournaments (ultimatetournaments.com). Monorepo with three apps: API, website, and mobile app. Currently live in production with real users and real payments.

## Architecture

- **API** (`apps/api/`) — Cloudflare Worker (TypeScript). Routes in `src/routes/`. Bindings: D1 database, KV sessions, R2 storage.
- **Web** (`apps/web/`) — Next.js 14 with `output: 'export'` (static site). Deployed to Cloudflare Pages.
- **Mobile** (`apps/mobile/`) — Expo React Native (iOS). Built with EAS Build, updates via EAS Update.

### Infrastructure

| Resource | ID/Name |
|---|---|
| Cloudflare Account | `15782127b37f9a925bbab8593969eac3` |
| Worker name | `uht` |
| D1 Database | `uht-db` / `3aa708ea-fcfb-4c90-b487-33b18556e08c` |
| KV Namespace | `SESSIONS` / `9bfc3fda183f40dcb2bbaae0ff07b2c3` |
| R2 Bucket | `uht-assets` |
| Pages project | `uht-web` |
| Custom domain | `api.ultimatetournaments.com` (has 522 issues — use direct worker URL) |
| Worker URL | `https://uht.chad-157.workers.dev` |
| Site URL | `https://ultimatetournaments.com` |
| EAS project | `@utp1/uht` / `b26f3538-a6ef-485a-b9e1-b2fff20ac9b0` |
| Bundle ID | `com.ultimatetournaments.uht` |
| ASC App ID | `6786085393` |
| Apple Team | Ultimate Team Posters, LLC (`4AT4Z2ABQP`) |
| Apple ID | `chad.scott0814@gmail.com` |

### Worker Secrets (set via `wrangler secret put`)

These are already configured — do NOT put them in source code:
- `STRIPE_SECRET_KEY` — Stripe live key
- `RESEND_API` — Resend email API key
- `TEXTMAGIC_USERNAME` / `TEXTMAGIC_API_KEY` — SMS
- `CLAUDE_API_KEY` — Claude API for AI features
- `JWT_SECRET` — Auth token signing
- `USA_HOCKEY_API_KEY` — Roster lookup

### Frontend API Configuration

The web frontend uses `NEXT_PUBLIC_API_URL` env var, defaulting to `https://uht.chad-157.workers.dev`. This is the direct worker URL (NOT `api.ultimatetournaments.com` which has DNS issues).

## Deploy Commands

### API (Cloudflare Worker)
```bash
cd apps/api
CLOUDFLARE_API_TOKEN=<token> npx wrangler deploy
```

### Web (Cloudflare Pages)
```bash
cd apps/web
npx next build
CLOUDFLARE_API_TOKEN=<token> CLOUDFLARE_ACCOUNT_ID=15782127b37f9a925bbab8593969eac3 npx wrangler pages deploy out --project-name=uht-web --branch=main
```

### Mobile (EAS Build)
```bash
cd apps/mobile
eas build --platform ios --profile production
eas submit --platform ios --profile production
```

### OTA Update (no App Store review needed)
```bash
cd apps/mobile
eas update --branch production --message "description"
```

### D1 Database Queries
```bash
cd apps/api
npx wrangler d1 execute uht-db --command "SELECT ..."
```

## Critical Rules

### DO NOT deploy web unless there is an actual web code change
Mobile EAS builds are completely separate from the web. Building the web and deploying to Cloudflare Pages when only mobile code changed has caused the registration form to break multiple times. Only deploy web when you've changed files in `apps/web/`.

### DO NOT modify the registration form without extreme caution
The registration flow at `/register/` is the most critical user-facing page. It handles Stripe payments with real money. Every time it has been accidentally modified, it broke. Test thoroughly before deploying any registration changes.

### DO NOT backfill or mass-modify production data without asking
Past data (old seasons, old events) is only used for email marketing. Don't run migrations or backfills on it unless specifically asked.

### Static Export Gotchas (Next.js `output: 'export'`)
- `useSearchParams()` causes components to suspend — always wrap in its own `<Suspense>` boundary, isolated from other components
- `router.replace()` / `router.push()` are unreliable for navigation — use `window.location.href` for reliable full-page loads
- Dynamic routes need `generateStaticParams()` to be pre-rendered
- No server-side rendering — everything is client-side after initial HTML load

### Stripe is LIVE
The Stripe key is the live key (`pk_live_...`). Payments are real. The deposit amount is $350 flat per team. Test with caution.

### Email auth (simple key)
The email/reward send endpoint uses simple key auth: `sendKey: 'uht-coaches-2026'`

## User Roles (8 total)
Coach, Manager, Organization Admin, Parent/Fan, Scorekeeper, Referee, Director, Admin

Users can hold multiple roles simultaneously. Role switching happens in-app.

## Demo/Test Accounts
- **Apple/Google reviewer**: `demo@ultimatetournaments.com` / `Demo1234` (parent role, 2 followed teams)
- **Full access testing**: `john@ultimatetournaments.com` / `UHT2026!` (all 8 roles)
- **Chad (owner)**: `utproducts1@gmail.com` / user ID `chad-owner-001`

## Database

D1 (SQLite). Key tables: `users`, `teams`, `organizations`, `events`, `event_divisions`, `event_registrations`, `registrations`, `games`, `game_scores`, `team_coaches`, `team_managers`, `team_members`, `players`, `venues`, `rinks`, `hotels`, `contacts`, `user_notifications`, `meeting_rewards`, `shop_products`, `shop_orders`.

Two registration tables exist:
- `registrations` — newer flow
- `event_registrations` — older form-based flow (still active, has most data)

Both need to be queried when showing registration data.

## Key Technical Notes

- Teams have both `invite_code` (for coaches) and `parent_invite_code` (for parents) — separate codes
- `is_active` flag on teams filters them from queries — if a team isn't showing, check this
- Team creation must add the creator to `team_coaches`, `team_managers`, AND `team_members`
- The `/my-teams` endpoint joins across all three junction tables
- Images are stored in R2 (`uht-assets` bucket) and served via worker proxy routes
- The mobile app uses `https://uht.chad-157.workers.dev` as its API base URL

## Project Structure

```
apps/
  api/
    src/
      index.ts          — Main router, all route mounting
      routes/            — 31 route files (auth, events, teams, stripe, etc.)
    wrangler.toml        — Worker config, bindings, secrets list
    migrations/          — D1 schema migrations
  web/
    app/                 — Next.js App Router pages
      admin/             — Admin dashboard (23 pages)
      dashboard/[role]/  — Role-based dashboards
      events/            — Public event pages
      register/          — Registration + payment flow
      pay/               — Standalone payment link page
    public/              — Static assets (logos, images)
    out/                 — Build output (deployed to Pages)
  mobile/
    src/
      screens/           — 26 React Native screens
    app.json             — Expo config
    eas.json             — EAS Build profiles
```
