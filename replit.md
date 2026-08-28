# Clause Risk Interceptor

A legal clause screening workspace that returns a 0–100 risk score, applies the fixed INTERCEPT threshold, and preserves an audit record for every evaluation.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/clause-risk-interceptor` — responsive screening workspace and audit history.
- `artifacts/api-server/src/routes/risk-evaluations.ts` — screening endpoint, adapter seam, and aggregate summary endpoint.
- `lib/api-spec/openapi.yaml` — source of truth for screening and audit API contracts.
- `lib/db/src/schema/risk-evaluations.ts` — evaluation and audit event tables.
- `artifacts/clause-risk-interceptor/INTEGRATION_HANDOFF.md` — Claude, database, and document-upload handoff notes.

## Architecture decisions

- The server, not the model or browser, owns the `riskScore >= 80` decision comparison.
- Evaluations and audit events are stored separately and created in one database transaction.
- The preview uses an explicit local analyzer adapter so the UI and audit flow work before a Claude credential is connected.
- Uploads are intentionally normalized to plain text at the browser/API boundary; document extraction can be swapped in without changing the screening contract.

## Product

- Screen pasted clauses or `.txt` uploads.
- Review the current score, decision, rationale, findings, provider metadata, and audit ID.
- View recent screening history and aggregate totals.
- Distinguish threshold screening from legal advice with an in-product disclaimer.

## User preferences

- The user wants the smallest genuinely usable version first and will connect their own external services later.

## Gotchas

- `RISK_ANALYZER_MODE=demo` is the working preview mode. Claude mode intentionally fails until the provider adapter is installed; see `INTEGRATION_HANDOFF.md`.
- The preview supports `.txt` uploads in this first version; PDF/DOCX extraction belongs in the document pipeline handoff.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
