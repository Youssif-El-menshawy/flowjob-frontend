# Frontend instructions

Read README.md first: it covers running the app, the stack and the project structure.

- Repository: Youssif-El-menshawy/flowjob-frontend. Work on a branch from `main` and open a pull request; CI must pass. Preserve history and teammate changes. No push/merge without approval; no force push/reset/history deletion.
- React 18 + TypeScript + Vite, React Query and React Router. API contracts live in src/shared/api. /api/v1 proxies to localhost:8000 in development. The app always uses the real backend: there is no demo or mock mode, and an unreachable server must show a clear error, never sample data or a sign-out.
- Harvard PDF previews must use the backend's original Harvard template. Tailoring must create a new CV with sourceCvId, never update the source. Only verified reorders may be auto-previewed (with Undo); rewrites, deletions and new skills stay pending until the user applies them, pending changes keep the original text, and the truthfulness confirmation stays. Never fabricate qualifications.
- Gmail lives on the Applications page (`src/features/applications/gmail`). Render only backend-built Gmail links that pass `safeGmailUrl`; show email excerpts as plain text; never change an application status without the user's approval in Needs Review.
- Do not trigger matching/tailoring against a paid OpenAI configuration without explicit approval. Tests stub HTTP (fetch) per test and never call a real server.
- VITE_* variables are public: never put an API key, Atlas connection string or JWT secret in them. Ignore private .env variants, node_modules, dist and *.tsbuildinfo. Only sanitized .env.example may be committed.
- Run npm test, npm run lint, npm run typecheck and npm run build as appropriate. CI uses Node 22. Do not hide test failures by changing mocks to match broken behavior.
