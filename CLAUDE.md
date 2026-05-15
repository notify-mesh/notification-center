@AGENTS.md

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Runtime & toolchain

- **Bun** is the runtime/package manager (`bun.lock`, native `RedisClient` from `"bun"`). Use `bun` / `bunx` rather than `npm`/`npx`.
- **Next.js 16** with App Router — many experimental flags enabled in `next.config.ts`. See AGENTS.md: do NOT assume APIs from prior Next.js versions; consult `node_modules/next/dist/docs/` first.
- **Prisma v7** with the multi-file schema layout under `prisma/schema/*.prisma` and the `@prisma/adapter-mariadb` driver — there is no `DATABASE_URL`; connection params come from `DB_HOST` / `DB_PORT` / `DB_USERNAME` / `DB_PASSWORD` / `DB_DATABASE` / `DB_CONNECTION_LIMIT` / `DB_SSL` (see `src/lib/prisma.ts`).
- **TypeScript path alias**: `@root/*` → `./src/*` (defined in `tsconfig.json`). Use `@root/...`, not `@/...`.

## Common commands

```bash
bun dev                  # next dev
bun run build            # next build
bun start                # next start

bun run lint             # eslint .
bun run lint:fix         # eslint . --fix
bun run format           # prettier --write "**/*.ts"
bun run format:check     # prettier --check "**/*.ts"
bun run check-types      # tsc --noEmit --pretty
bun run typegen          # next typegen (regenerates typed routes / typed env)

bun run db:generate      # prisma generate
bun run db:push          # prisma db push   (no migration history; use during early dev)
bun run db:push:reset    # prisma db push --force-reset  (DESTRUCTIVE — drops data)
bun run db:migrate       # prisma migrate dev
bun run db:pull          # prisma db pull (introspect existing DB into schema)
bun run db:view          # prisma studio
bun run db:seed          # runs prisma/seed.ts via bunx ts-node + prisma/tsconfig.json
```

Local infrastructure:

```bash
docker compose -f docker/compose.yml up -d        # MariaDB + Redis (dev)
docker compose -f docker/mariadb/compose.yml up   # 3-node Galera + HAProxy (prod-like)
docker compose -f docker/redis-insight.yml up -d  # RedisInsight UI
```

Seeding accepts subcommand flags forwarded to `prisma/seed.ts`:

```bash
bun run db:seed -- --prepare              # run all prepare seeds
bun run db:seed -- --prepare --main       # run only the "main" prepare seed
bun run db:seed -- --prepare --exclude=main
bun run db:seed -- --prune                # prune seeded data
```

There is no test runner configured — do not invent `bun test` / `vitest` commands.

## Architecture

### Layout (non-standard)

```
src/
  app/         — App Router pages and route handlers (e.g. src/app/route.ts, src/app/[slug]/route.ts)
  api/         — Additional route handlers OUTSIDE app/. Catch-all auth handler lives at
                 src/api/auth/[...all]/route.ts and exports `default toNodeHandler(auth.handler)`
                 along with `export const config = { api: { bodyParser: false } }` (pages-style export).
  components/  — UI; shadcn/ui generated into components/ui (style "radix-nova", neutral base, Lucide icons)
  lib/         — auth.ts, auth-client.ts, prisma.ts, redis.ts, utils.ts (cn helper)
  providers/   — Notification provider integrations (e.g. kavenegar.provider.ts)
prisma/
  schema/      — Multi-file Prisma schema (schema.prisma, user.prisma, projects.prisma, api-key.prisma, …)
  seed.ts      — Entry point; dispatches to seed/prepare and seed/prune based on argv
  seed/        — prepare/* and prune/* tasks orchestrated with `tasuku`
docker/        — compose.yml (dev), mariadb/compose.yml (Galera+HAProxy), redis-insight.yml
proxy.ts       — Root-level middleware-style file; the auth gate for protected routes
                 (matcher: ["/dashboard"]). This replaces what was `middleware.ts` in older Next.js.
```

### Authentication (Better Auth)

`src/lib/auth.ts` configures a single `auth` export with a large plugin set: `haveIBeenPwned`, `multiSession`, `organization` (teams, dynamic access control, hooks), `lastLoginMethod`, `bearer`, `twoFactor`, `deviceAuthorization`, `admin`, `passkey` (`@better-auth/passkey`, RP `dashboard.local`), `jwt` (issuer "Notification Center", audience `https://gateway.local`), `phoneNumber`, `username`, `openAPI`.

Key wiring:
- Prisma adapter with `provider: "mysql"` and transactions enabled.
- **Redis is wired as `secondaryStorage`** for sessions/cache — when adding auth features, expect session state to live in Redis, not Postgres/MySQL.
- Cookie prefix is `notification-center`; `useSecureCookies: true`; trusts a wide range of forwarded-IP headers (Cloudflare, Fastly, generic).
- The catch-all auth endpoint is mounted via `src/api/auth/[...all]/route.ts` — note the location under `src/api/`, not `src/app/api/`.

Client-side auth: `src/lib/auth-client.ts` uses `createAuthClient` with the `nextCookies()` plugin from `better-auth/next-js`.

### Notifications (Better Notify)

The `@betternotify/*` packages provide the notification pipeline: `core`, `autosend`, `email`, `smtp`, `resend`, `react-email`, `handlebars`, `sms`, `push`, `telegram`. Custom provider integrations live in `src/providers/` (e.g. `kavenegar.provider.ts` for Iranian SMS, plus Bale Messenger documented in `docs/bale-messenger-otp.md`).

### Data model conventions

- Primary keys: `String @id @default(cuid(2))` (cuid2, not the legacy `cuid()`).
- JSON columns are pervasive on `ApiKey` for restrictions/quotas/metadata — when adding fields, check whether the data belongs inside one of those JSON blobs rather than a new column.
- `ProjectEnvironment` ↔ `ApiKey` is **one-to-one** (`environmentId` is `@unique`); per-project per-environment uniqueness is enforced by `@@unique([projectId, environmentId])`.
- Tables are explicitly mapped to snake_case with `@@map(...)`.

## Code style

- Prettier: 100-col, double quotes, semicolons, trailing commas everywhere, `arrowParens: "always"`.
- ESLint: extends `eslint-config-next/core-web-vitals` + `eslint-config-next/typescript` + `eslint-config-prettier`; `@typescript-eslint/ban-ts-comment` and `ban-ts-ignore` are **off**, so `@ts-expect-error` / `@ts-ignore` are tolerated where intentional.
- Imports from the app source use the `@root/...` alias.
