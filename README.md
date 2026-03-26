# Central Web Desk

A personal digital hub for lists, reminders, and file storage — accessible anywhere, secured with OAuth.

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | SvelteKit 2 + TypeScript |
| Auth | Clerk (Google, Apple, GitHub OAuth) |
| Database | Cloudflare D1 (SQLite at the edge) |
| Storage | Cloudflare R2 (S3-compatible) |
| Hosting | Cloudflare Pages |
| Testing | Playwright |

## Getting Started

### 1. Prerequisites

- Node.js 20+
- npm or pnpm
- Cloudflare account with API token
- Clerk account (free tier)

### 2. Clone & Install

```bash
git clone <repo-url>
cd centralwebdesk
npm install
```

### 3. Set up environment variables

```bash
cp .env.example .env
# Edit .env with your credentials
```

Required variables:
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` — from Clerk dashboard
- `CLERK_SECRET_KEY` — from Clerk dashboard
- `CLOUDFLARE_ACCOUNT_ID` — from Cloudflare dashboard
- `CLOUDFLARE_API_TOKEN` — create at dash.cloudflare.com
- `D1_DATABASE_ID` — created by `npm run cf:setup`
- `R2_*` credentials — created by `npm run cf:setup`

### 4. Cloudflare Setup

```bash
npm run cf:setup
npm run cf:d1:migrate
```

### 5. Run locally

```bash
npm run dev
```

Visit `http://localhost:5173`

## Project Structure

```
centralwebdesk/
├── src/
│   ├── lib/
│   │   ├── components/     # Reusable UI components
│   │   ├── server/         # Server-only code (DB, R2, Clerk)
│   │   └── stores/         # Svelte stores
│   ├── routes/
│   │   ├── auth/           # Sign in, sign up, OAuth callback
│   │   ├── dashboard/      # Main app dashboard
│   │   ├── lists/          # List management
│   │   ├── reminders/      # Reminder management
│   │   ├── files/          # File management
│   │   └── api/            # API endpoints
│   ├── app.css             # Global styles
│   ├── app.html             # HTML template
│   └── hooks.server.ts     # Auth middleware
├── static/                 # Static assets
├── scripts/
│   ├── cloudflare-setup.js  # Initial Cloudflare setup
│   └── d1-migrate.js        # Database migrations
├── tests/
│   └── smoke.spec.ts        # Playwright tests
├── playwright.config.ts
├── svelte.config.js
├── vite.config.ts
└── package.json
```

## Features

- **OAuth-only auth** — Google, Apple, GitHub (no passwords)
- **Bullet Lists** — Create, organize, check off items
- **Reminders** — Set due dates, get organized
- **File Storage** — Upload/download with R2
- **User Isolation** — Strict data separation (D1 row-level security via Clerk user ID)

## Development

```bash
npm run dev          # Start dev server
npm run build        # Build for production
npm run preview      # Preview production build
npm run test         # Run Playwright tests
npm run test:ui       # Run tests with UI
npm run check         # Type check
```

## Deployment

1. Push to GitHub
2. Connect repo to Cloudflare Pages
3. Set environment variables in Pages settings
4. Deploy!

See [Cloudflare Pages docs](https://developers.cloudflare.com/pages/) for details.

## Security

- All routes except `/` and `/auth/*` require authentication
- User data is isolated by Clerk user ID — users can only access their own data
- R2 keys are server-side only, never exposed to the browser
- Clerk webhooks sync user data on sign-in/sign-up
