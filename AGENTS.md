# Frontend instructions

Read PROJECT_HANDOFF.md and GITHUB_COMPARISON.md for the preserved source baseline and project constraints.

- Target repository: Youssif-El-menshawy/flowjob-frontend; existing branch feature/backend-integration. Preserve history and teammate changes. No push/merge without approval; no force push/reset/history deletion.
- React 18 + TypeScript + Vite, React Query and React Router. API contracts live in src/shared/api. /api/v1 proxies to localhost:8000 in development. Keep VITE_USE_MOCKS=false for connected development; mock data is not a backend implementation.
- Harvard PDF previews must use the backend's original Harvard template. Tailoring must create a new CV with sourceCvId, never update the source. Keep review-required suggestions unchecked by default and retain truthfulness confirmation. Never fabricate qualifications.
- Do not trigger matching/tailoring against a paid OpenAI configuration without explicit approval. Use a mocked backend for tests.
- VITE_* variables are public: never put an API key, Atlas connection string or JWT secret in them. Ignore private .env variants, node_modules, dist and *.tsbuildinfo. Only sanitized .env.example may be committed.
- Run npm test, npm run lint, npm run typecheck and npm run build as appropriate. CI uses Node 22; handoff checks also passed on installed Node 24. Do not hide test failures by changing mocks to match broken behavior.
