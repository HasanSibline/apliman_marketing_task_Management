# CLAUDE.md

Apliman marketing task management — a multi-tenant SaaS. Three services, one Postgres.

This file covers what the code does **not** tell you. Everything else, read from source.

## Layout

| Path | Stack | Hosted on | URL |
|---|---|---|---|
| `frontend/` | React 18 + Vite + Tailwind | Cloudflare Pages | `apliman-marketing-task-management.pages.dev` |
| `backend/` | NestJS + Prisma | Render | `taskmanagement-backendv2.onrender.com` |
| `ai-service/` | FastAPI (Python) | Render | `apliman-marketing-task-management.onrender.com` |
| database | PostgreSQL | Neon (serverless) | `DATABASE_URL`, use the **pooled** connection string |
| uploads | — | Cloudinary | `CLOUDINARY_*` |

Local dev: `npm run dev` at the root runs all three. The dev database is Docker Postgres on
**port 5433**, not 5432.

The browser never talks to `ai-service` directly. Only the backend does, authenticated with
`AI_SERVICE_SECRET`, which must be identical in both services' environments.

## Gotchas

### Production applies schema with `db push`, not migrations

`backend/scripts/start-production.js` runs `prisma db push --accept-data-loss` on every boot.
Two consequences that have already bitten:

- **Migration SQL never executes in production.** A migration that includes a data fix (an
  `UPDATE`, a backfill) silently does nothing there. Put data repairs in application code that
  self-heals on read, not in migration files.
- **A column removed from `schema.prisma` is dropped from production silently.** No prompt, no
  backup.

Locally, the database was built with `db push` too, so `prisma migrate deploy` fails with
**P3005**. Baseline first: `prisma migrate resolve --applied <name>` for each pre-existing
migration, then deploy.

### AI credentials resolve in one place

Order is **company key → platform key → unavailable**, implemented once in
`AiService.resolveAiCredential` (`backend/src/ai/ai.service.ts`). `chat.service.ts` calls that
same method — it used to duplicate the logic and drifted into a separate bug. Do not add a third
copy.

The platform key lives in `SystemSettings.platformAi*`, is set by a super admin at
Settings → AI Platform, and is encrypted with `ENCRYPTION_KEY` via
`CompaniesService.encryptApiKey`. **If `ENCRYPTION_KEY` changes, every stored key becomes
undecryptable** — decryption returns `[DECRYPTION_FAILED]` rather than throwing, so watch for
that string in logs.

Providers: `anthropic` (default, reads images and PDFs), `gemini` (reads images, low free-tier
rate limit), `groq` and `openai` (text only — image attachments error).

### AI quota is a circuit breaker, not provider billing

A company is paused only after `QUOTA_STRIKES_BEFORE_LOCKOUT` rate-limit hits inside a rolling
hour, and **every lockout carries an expiry**. If AI "runs out" unexpectedly, look at
`recordQuotaStrike` / `clearQuotaStrikes` before suspecting the provider.

An older version flagged a company on its first 429 with no reset time, which disabled AI
permanently. `resolveAiCredential` treats a lockout with a null reset time as a legacy row and
releases it.

Note each chat message costs **2+ upstream calls** — `ContextLearningService` fires a second one
to extract user context. Budget accordingly.

### `blue-*` is a semantic colour, `primary-*` is the brand

`applyBrandColor` (`frontend/src/theme/brandTheme.ts`) themes `--color-primary-*` per company at
runtime. Interactive affordances and focus rings use `primary-*`.

Tailwind `blue-*` is **status**: Completed, Approved, Closed, priority 2, TRIAL plan. Do not
bulk-convert `blue-*` to `primary-*` — it would turn status badges into the brand colour. About
460 such call sites remain, deliberately.

### Python service dependency pins

`ai-service/requirements.txt` is a full freeze file. Adding a package that needs a newer
transitive dependency than an existing pin makes pip's resolver fail outright
(`ResolutionImpossible`) — this broke a Render build once via `typing_extensions`. After changing
it, run `pip install -r requirements.txt --dry-run` before pushing.

## Commands

```bash
npm run dev                  # all three services

cd backend
npx prisma generate          # after editing schema.prisma
npx tsc --noEmit             # typecheck

cd frontend
npx vite build               # typechecks and builds

cd ai-service
python -m py_compile main.py services/*.py
```
