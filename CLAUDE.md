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

### Production runs `migrate deploy`, and baselines only if told to

`backend/scripts/start-production.js` used to run `prisma db push --accept-data-loss` on every
boot. It no longer does. It runs `prisma migrate deploy`, and falls back to baselining only
when Prisma answers **P3005**, which is Prisma saying the database has no migration history.

What this means now:

- **Migration SQL does execute in production.** A data fix in a migration works. This was not
  true before, so treat any advice about self-healing-on-read as historical.
- **A destructive change fails loudly instead of silently.** The baseline path runs `db push`
  *without* `--accept-data-loss`, so it refuses to drop a column rather than dropping it.
- **A failure on a database that already has history stops the boot.** It is not treated as a
  baselining problem, because baselining an established database marks pending migrations as
  applied without running them, and loses the change silently.

**Never build a `node -e` script for Prisma through a shell.** Every client method starts with
`$`, and a shell expands `$queryRawUnsafe` and `$disconnect` inside double quotes to nothing.
This is not hypothetical: `hasMigrationHistory` did exactly that, Node received `p.(...)`, and
the `catch` turned the SyntaxError into "no history". Every deploy from `8be6512` until this
was fixed therefore took the baseline path, and the first migration that dropped a column
brought production down. Both probes use `execFileSync` with an argument array now, where no shell is
involved. An earlier version of this file claimed production had been baselined at `8be6512`;
that was never true.

Locally, the database was built with `db push`, so a first `prisma migrate deploy` fails with
**P3005**. Baseline the same way: `prisma migrate resolve --applied <name>` for each
pre-existing migration, then deploy.

### Every AI call goes through the gateway. There is no second path

`AiGatewayService.execute` picks a provider from the company's chain, and
`AiService.callAiService` is the only way to reach the AI service. Nothing else resolves a
credential, and nothing else knows a provider exists.

This is worth defending. There used to be a second resolver, `resolveAiCredential`, reading a
single `Company.aiApiKey`. Chat, the day brief, ticket checks and both learning calls used it,
so the chain's priority order, cooldowns, failover and usage figures applied to every AI
feature except the ones people actually used. Both it and the platform-wide key are gone, along
with a company-level circuit breaker that nothing ever called.

Ask `AiGatewayService.statusFor` whether a company can use AI. Do not infer it from
`Company.aiEnabled` or `Company.aiApiKey`: those are the legacy single key, and a company
configured through the chain has neither, so inferring from them told such a tenant that AI was
disabled and locked the chat composer.

Keys are encrypted with `ENCRYPTION_KEY` via `CompaniesService.encryptApiKey`. **If
`ENCRYPTION_KEY` changes, every stored key becomes undecryptable**: decryption returns
`[DECRYPTION_FAILED]` rather than throwing, so watch for that string in logs.

Providers: `anthropic` (reads images and PDFs), `gemini` (reads images, low free-tier rate
limit), `groq` and `openai` (text only, image attachments error). The Gemini default is
`gemini-2.5-flash`; **it retires on 2026-10-16**, successor `gemini-3.5-flash` at roughly
fifteen times the price.

### Cooldowns are per provider entry, and they are not billing

When AI stops working, read `AiProviderConfig.status`, `cooldownUntil` and `lastError` before
suspecting the provider. A rate limit rests one entry and moves to the next; it does not stop
the company. The clock half-opens the breaker, so nothing has to run to release it.

The company-wide breaker this replaced is gone. It flagged a whole tenant, its state lived in
memory so it forgot everything on each deploy, and by the end nothing called it at all while
its tests still passed.

`estimatedCost` is written from real token counts, so `monthlyBudget` on an emergency entry is
a real ceiling rather than a field. Rates go stale: they live in `backend/src/ai/ai-cost.ts`
with their sources.

Note each chat message costs **2+ upstream calls**, since `ContextLearningService` fires a
second one to extract user context. That second call is now throttled to once a day per topic
rather than once per message. Budget accordingly.

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
