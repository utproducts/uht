# UHT Platform — Ultimate Hockey Tournaments

Complete tournament management platform for [ultimatetournaments.com](https://ultimatetournaments.com).

## Tech Stack

- **Frontend:** Next.js 14 + React + Tailwind CSS → Cloudflare Pages
- **API:** Hono on Cloudflare Workers
- **Database:** Cloudflare D1 (SQLite at edge)
- **File Storage:** Cloudflare R2
- **Sessions/Cache:** Cloudflare KV
- **Payments:** Stripe
- **Email:** SendGrid
- **SMS:** TextMagic
- **AI Chatbot:** Claude API (Anthropic)

## Structure

```
uht-platform/
├── apps/
│   ├── web/          # Next.js consumer site + dashboards
│   └── api/          # Cloudflare Workers API (Hono)
├── packages/
│   └── shared/       # Shared types, utils, validation
├── turbo.json        # Turborepo config
└── package.json      # Root workspace
```

## Getting Started

```bash
# Install dependencies
npm install

# Run dev servers (both API and web)
npm run dev

# Run database migrations (local)
npm run db:migrate:local

# Deploy
cd apps/api && npm run deploy
cd apps/web && npm run build
```

## Environment Variables

### API (`apps/api/.dev.vars`)
```
STRIPE_SECRET_KEY=sk_test_...
SENDGRID_API_KEY=SG...
TEXTMAGIC_USERNAME=...
TEXTMAGIC_API_KEY=...
CLAUDE_API_KEY=sk-ant-...
JWT_SECRET=your-secret-key
USA_HOCKEY_API_KEY=...
```

### Web (`apps/web/.env.local`)
```
NEXT_PUBLIC_API_URL=http://localhost:8787
```
