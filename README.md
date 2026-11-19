# FlowJob Frontend

FlowJob helps students and early-career job seekers build a strong CV, check how well it fits a job post, tailor
it for that job, and keep track of every application. It is a team project at Wrocław University of Science and
Technology.

This repository contains the **web app**, built with React and TypeScript. It works with the FlowJob FastAPI
backend in [flowjob-backend](https://github.com/suleymangulymalikov/flowjob-backend), which stores all accounts and
data.

## Features

- **Accounts**: registration, login and sessions that survive page reloads; account settings and password change.
- **Dashboard**: a setup checklist, next steps and an overview of applications by stage.
- **Profile**: experience, education, projects, skills, languages and contact details, reusable across CVs.
- **CV Builder**: a guided, section-by-section form with a live Harvard-style PDF preview (zoom and full screen)
  and PDF download. **My CVs** lists saved CVs with preview, download, rename and delete.
- **Job Match**: paste a job post and get a match score with the requirements your CV meets, partly meets or
  misses, each backed by quotes from your CV.
- **CV Tailoring**: review suggested changes for a specific job, apply them one by one or all at once, confirm
  they are truthful, and save the result as a new CV.
- **Applications**: a board (with drag and drop) and a table, application details with status history, and an
  optional Gmail connection that suggests status updates for your approval in Needs Review.
- Light and dark themes, and responsive layouts.

## Tech stack

| Area | Technology |
| --- | --- |
| Framework | [React 18](https://react.dev/) with TypeScript |
| Build and dev server | [Vite 6](https://vite.dev/) |
| Styling | [Tailwind CSS v4](https://tailwindcss.com/), design tokens in `src/index.css` |
| Routing and data | React Router, TanStack Query |
| Forms | React Hook Form with Zod validation |
| PDF preview | react-pdf (PDF.js), worker bundled with the app |
| Tests and quality | Vitest, Testing Library, ESLint, Prettier, GitHub Actions |

## Project structure

```
src/
  main.tsx        app entry point
  app/            routes, layouts, auth guards, server-unavailable page
  features/       one folder per area: auth, landing, dashboard, profile, cv, match, applications, settings
  shared/
    api/          API client, request and response types (types.ts), TanStack Query hooks
    lib/          theme, hooks and helpers
    ui/           shared components: buttons, fields, cards, dialogs, toasts
  test/           test setup and cross-screen tests
```

## Prerequisites

- **Node.js 22** (the version used in CI) and npm
- A running **FlowJob backend** on `http://localhost:8000`. See the
  [backend README](https://github.com/suleymangulymalikov/flowjob-backend#getting-started) for setup.

## Getting started

```bash
npm install
```

```bash
npm run dev
```

The app runs at `http://localhost:5173`. Start the backend first: the app needs it for every page except the
landing page.

## Connecting to the backend

The app always uses the FlowJob backend; there is no offline or sample-data mode.

- **Development:** the app calls `/api/v1`, and the Vite dev server forwards those requests to
  `http://localhost:8000`. The browser stays on one origin, so no CORS setup is needed. To use a backend on another
  address, set `FLOWJOB_API` when starting the dev server:

  ```bash
  FLOWJOB_API=http://localhost:8001 npm run dev
  ```

- **Sessions:** the access token is kept in memory only. The refresh token is an HttpOnly cookie set by the
  backend, and the app calls `POST /api/v1/auth/refresh` on page load to restore the session.
- **Backend unavailable:** if the backend can't be reached, the app shows "Can't reach the FlowJob server" and
  keeps you signed in. Only a session the backend rejects signs you out.

The request and response shapes are defined in `src/shared/api/types.ts`.

## Environment configuration

No environment variables are needed for local development. `.env.example` documents the one optional setting:

| Variable | Purpose |
| --- | --- |
| `VITE_API_URL` | Full API base URL, for example `https://api.example.com/api/v1`. Leave unset to use `/api/v1` and the dev proxy. |

To set it, copy the template to `.env.local`, which Git ignores, and uncomment the line:

```bash
cp .env.example .env.local
```

`VITE_*` values are built into the public JavaScript bundle. Never put API keys, database connection strings or
other secrets in them. If the API is served from a different origin, its CORS settings must allow the frontend
origin with credentials, for the refresh cookie.

## Testing and quality checks

| Command | What it does |
| --- | --- |
| `npm test` | Run the unit and component tests once (Vitest) |
| `npm run test:watch` | Run tests in watch mode |
| `npm run lint` | Lint with ESLint |
| `npm run typecheck` | Type-check with TypeScript |
| `npm run build` | Type-check and build for production into `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm run format` | Format the source files with Prettier |

Tests stub HTTP requests and never call a real backend, OpenAI or Google. GitHub Actions runs lint, typecheck,
tests and the build on every pull request and on pushes to `main` (`.github/workflows/ci.yml`).

## Not implemented yet

- Password reset by email, data export and account deletion (the backend has no endpoints for them yet)
- Word (.docx) export
- CV upload and parsing

## Contributing

`main` is protected. Create a branch from `main`, open a pull request into `main`, and make sure CI passes.

## Related repository

- Backend: [suleymangulymalikov/flowjob-backend](https://github.com/suleymangulymalikov/flowjob-backend)
