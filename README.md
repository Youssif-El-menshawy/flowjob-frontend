# FlowJob frontend

React + TypeScript web app for FlowJob: CV builder, AI job matching, CV tailoring, application tracking and Gmail sync.
It always talks to the FlowJob FastAPI backend ([flowjob-backend](https://github.com/suleymangulymalikov/flowjob-backend)).
There is no demo or offline mode: accounts, CVs, matches and applications all live in the backend.

## Run it

Start the backend first (see its README), on `http://localhost:8000`. Then:

```bash
npm install
npm run dev          # http://localhost:5173
```

In development, Vite proxies `/api/v1` to `http://localhost:8000` (set `FLOWJOB_API` to use another address).
Leave `VITE_API_URL` unset for that. Set it only when the API is served from a different origin.

If the backend can't be reached, the app says so ("Can't reach the FlowJob server") and keeps you signed in. It
never shows sample data instead. Only a session the backend actually rejects signs you out.

If you used the old in-browser demo on this machine, the app removes its leftovers (the `flowjob.mockdb.*` and
`flowjob.mock.refreshCookie` storage keys and the `/mockServiceWorker.js` service worker) on startup. Nothing else
is touched.

| Script | What it does |
| --- | --- |
| `npm run dev` | Dev server with hot reload |
| `npm run build` | Type-check and production build to `dist/` |
| `npm run preview` | Serve the production build |
| `npm test` | Unit tests (Vitest) |
| `npm run lint` / `npm run typecheck` | ESLint / TypeScript |

## Stack

- **Vite + React 18 + TypeScript**
- **Tailwind CSS v4** with design tokens in `src/index.css` (same names as the Figma "Theme Light" / "Theme Dark" variables). Light and dark mode.
- **React Router** for pages, **TanStack Query** for server data, **React Hook Form + Zod** for forms
- **Vitest + Testing Library**, ESLint, Prettier, GitHub Actions CI (`.github/workflows/ci.yml`)
- Font: Geist (Google Fonts)

## Structure

```
src/
  app/            routes, layout with sidebar, auth guards
  features/       one folder per feature (auth, landing, dashboard, profile, cv, match, applications, settings)
  shared/
    api/          types.ts (API contract), client.ts (fetch + tokens), queries.ts (TanStack Query hooks)
    ui/           Button, Field, Card, StatusPill, Modal, Toast... (= Figma Components page)
    lib/          theme, hooks, helpers
  test/           shared test setup and cross-screen tests (HTTP is stubbed per test; no real server is called)
```

## Auth (matches P-004)

- `POST /auth/register`, `/auth/login` return `{ accessToken, user }`. The access token is kept **in memory only**.
- The refresh token is an **httpOnly cookie** set by the server. On page load the app calls `POST /auth/refresh` to restore the session, and retries once on a 401.
- A refresh the server rejects (4xx) ends the session. A refresh that can't reach the server (network error, timeout, or a 5xx/gateway error) keeps it, and the app shows "Can't reach the FlowJob server" with **Try again**.

## API contract

`src/shared/api/types.ts` holds the request and response shapes the backend serves. If the API runs on another
origin (`VITE_API_URL`), its CORS settings must allow the frontend origin with credentials, for the refresh cookie.

## Screens

Landing · Log in · Register · Forgot password · Dashboard · Profile · CV builder · My CVs · Job match · Tailor CV · Applications (board with drag and drop, and table) · Add application · Application detail · Settings

## Not done yet

- Word (.docx) export. PDF export works: the backend renders the Harvard-style PDF (WeasyPrint) and the app previews it with PDF.js.
- Password reset by email, data export and account deletion (the backend has no endpoints for them yet).
- CV upload and parsing (waiting for the team decision).

Gmail uses the backend's Gmail integration, which needs a Google OAuth client. See the backend README, including
"Production configuration" for the same-host `/api/v1` proxy that the OAuth callback requires, and "Privacy and
data retention".

## Git workflow

`main` is protected. Work on a branch from `main` (for example `feature/<name>`) and open a pull request into `main`. CI must pass.
