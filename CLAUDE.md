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

### Production baselines once, then runs real migrations

`backend/scripts/start-production.js` used to run `prisma db push --accept-data-loss` on every
boot. It no longer does. On a database with no migration history it syncs the schema once and
records every existing migration as applied; after that, every deploy is a plain
`prisma migrate deploy`.

What this means now:

- **Migration SQL does execute in production.** A data fix in a migration works. This was not
  true before, so treat any advice about self-healing-on-read as historical.
- **A destructive change fails loudly instead of silently.** The one-time baseline runs
  `db push` *without* `--accept-data-loss`, so a deploy that would drop a column refuses to
  boot rather than dropping it.
- **The one trap left:** the baseline path marks *every* migration in the folder as applied
  without running it. A new migration added before production has ever been baselined would be
  skipped. Production was baselined at `8be6512`, so this only matters for a fresh database.

Locally, the database was built with `db push`, so a first `prisma migrate deploy` fails with
**P3005**. Baseline the same way: `prisma migrate resolve --applied <name>` for each
pre-existing migration, then deploy.

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

### Node 20 is a floor, not a preference

`engines.node` is `>=20.0.0` because NestJS 11 requires it. Render provisions from that
field, so lowering it produces a container the app cannot boot in.

### Two `npm audit` findings are accepted, deliberately

Production dependencies sit at 6 advisories, down from 46. The two that remain are not
oversights:

- **`xlsx`** has a prototype-pollution and a ReDoS advisory and **no fix exists upstream**.
  It is used only to *write* the analytics export, from rows this app already owns, so
  neither advisory is reachable: both need attacker-controlled spreadsheet input. This
  stops being true the moment any feature *parses* an uploaded spreadsheet. If that is
  ever built, replace `xlsx` first.
- **`prisma`** is flagged with `fixAvailable: prisma@6.12.0`, which is **older than the
  6.16.2 we run**. Taking npm's advice here is a downgrade. It also flags the CLI, which
  is build-time only.

Re-check with `npm audit --omit=dev`; the dev-only noise is not worth reading.

### Route paths cannot use `?`, `*` or `+`

Express 5 arrived with NestJS 11 and its path parser rejects the old optional and
wildcard suffixes. This is not a 404 at request time: the app **throws during route
registration and never finishes booting**. `@Post('upload/:folder?')` did exactly that.
Register an array of literal paths instead, as `files.controller.ts` now does.

The same fix uncovered a second rule worth keeping: two routes on one verb cannot share
a shape. `upload/:folder` and `upload/:taskId` are the same shape, so the first one
registered swallowed every request meant for the second, and task file upload had been
silently broken.

## Commands

```bash
npm run dev                  # all three services

cd backend
npx prisma generate          # after editing schema.prisma
npx tsc --noEmit             # typecheck

cd frontend
npx tsc --noEmit             # typecheck — vite build does NOT do this
npx vite build               # bundle only; esbuild strips types without checking them

cd ai-service
python -m py_compile main.py services/*.py
```
