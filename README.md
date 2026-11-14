# FlowJob frontend

React + TypeScript web app for FlowJob: CV builder, AI job matching, CV tailoring, application tracking and Gmail sync.
Runs fully on mock data today (no backend needed), and switches to the FastAPI backend with one env variable.

## Run it

```bash
npm install
npm run dev          # http://localhost:5173
```

Demo account: **sara@flowjob.dev / flowjob123** (or click "Try the demo account" on the login page).
You can also register a new account. Accounts and data are saved in your browser (localStorage), so they survive reloads.
To reset the mock data, clear site data for localhost.

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
- **MSW (Mock Service Worker)** fakes the REST API in the browser (`src/mocks`)
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
  mocks/          MSW handlers, in-browser DB, seed data, mock "AI" matcher
```

## Auth (matches P-004)

- `POST /auth/register`, `/auth/login` return `{ accessToken, user }`. The access token is kept **in memory only**.
- The refresh token is an **httpOnly cookie** set by the server. On page load the app calls `POST /auth/refresh` to restore the session, and retries once on a 401.
- In mock mode the cookie is simulated in localStorage inside `src/mocks/db.ts`; the app code does not change.

## Connecting the real backend

1. Copy `.env.example` to `.env.local` and set `VITE_USE_MOCKS=false` and `VITE_API_URL=http://localhost:8000/api/v1`.
2. The backend must implement the endpoints in `src/mocks/handlers.ts` with the shapes in `src/shared/api/types.ts`. That file is the contract to agree on with the backend team.
3. CORS must allow the frontend origin with credentials (for the refresh cookie).
4. Later: generate types from the backend with `npx openapi-typescript http://localhost:8000/openapi.json -o src/shared/api/schema.ts`.

## Screens

Landing · Log in · Register · Forgot password · Dashboard · Profile · CV builder · My CVs · Job match · Tailor CV · Applications (board with drag and drop, and table) · Add application · Application detail · Settings

## Not done yet

- Word (.docx) export. PDF export uses the browser's print dialog on the CV preview.
- Reset-password link screen (the email step exists).
- CV upload and parsing (waiting for the team decision).
- In demo mode (`VITE_USE_MOCKS=true`), Gmail and the LLM are simulated (`src/mocks`). Connected mode uses the backend's Gmail integration, which needs a Google OAuth client (see the backend README, including "Production configuration" for the same-host `/api/v1` proxy that the OAuth callback requires, and "Privacy and data retention").

## Git workflow

`main` is protected. Work on `feature/<name>` branches and open a pull request into `develop`. CI must pass.
