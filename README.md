# miniAppRentPlatfrom

Multi-tenant rental + retail SaaS platform. pnpm monorepo (D10).

## Packages

| Package | Stack | PR0 status |
|---|---|---|
| `packages/backend` | cool-admin v8 (Midway 3.x + TypeORM + PostgreSQL) — **vendored from `cool-admin-midway` 8.x** | vendored + PG config + guards passing; real-tenant tests gated on PG availability |
| `packages/app-c` | uni-app Vue3 + Vite + TS + wot-design-uni + Pinia (WeChat MP) | placeholder; scaffold = PR1 |
| `packages/admin` | cool-admin-vue 8.x dual-brand (merchant + platform) | placeholder; scaffold = PR1 |

## cool-admin v8 vendoring (PR0 step 1 — done)

`packages/backend` is a vendored copy of `cool-admin-midway` branch `8.x`
(version `8.0.0`). The nested `.git` was removed so it is tracked as project
code (we customize PG config + add business modules).

- Upstream repo: `github.com/cool-team-official/cool-admin-midway` branch `8.x`
  (NOT `master`, which is the legacy v4 with no tenant support).
- `package.json`: `@midwayjs/core ^3.20.3`, `typeorm` aliased to
  `@cool-midway/typeorm@0.3.20`. MySQL driver (`mysql2`) replaced with
  PostgreSQL driver (`pg`).
- `src/modules/base/db/tenant.ts` ships `TenantSubscriber` with
  `afterSelect/Insert/Update/DeleteQueryBuilder` hooks plus a `noTenant(ctx, fn)`
  escape hatch.
- `src/modules/base/entity/base.ts`: `BaseEntity` declares
  `tenantId: number` as a TypeORM `@Column({ nullable: true })` with `@Index`.
- DB config switched to PostgreSQL (`type: 'postgres'`) in
  `src/config/config.local.ts` and `src/config/config.prod.ts`, driven by
  `DB_*` env vars. Production keeps `synchronize: false` + `cool.eps: false`.

Validate the vendored backend:

```bash
npm run guard:cool-admin                    # 默认校验 packages/backend
# 或显式指定其它 v8 checkout：
npm run guard:cool-admin -- --candidate <path>
```

The guard verifies `@midwayjs/core >= 3.x`, the presence of
`src/modules/base/db/tenant.ts`, and that `BaseEntity` exposes `tenantId` as a
TypeORM column.

## PostgreSQL (PR0 step 2/3 — done)

- `packages/backend/docker-compose.yml` — postgres:16-alpine, dev DB `cool_dev`
  + test DB `cool_test` (auto-created by `docker/init-db.sql`), volume
  `./data/postgresql/`, port 5432.
- `packages/backend/src/config/config.{local,prod}.ts` — `type: 'postgres'`,
  `DB_*` env vars.
- `.env.example` / `packages/backend/.env.example` — PG connection env template.

Start PG (requires Docker):

```bash
cd packages/backend
docker compose up -d
```

Check Docker/PG availability (diagnostic, not a gate):

```bash
npm run guard:docker
```

## Multi-tenant isolation verification (PR0 core acceptance)

Two complementary layers:

- `tests/tenant-isolation.test.mjs` — pure-JS business isolation semantics
  (`backend/tenant/isolation-simulator.mjs`). Always runs; no dependencies.
- `tests/real-tenant.test.mjs` — **real TypeORM + real PostgreSQL +
  cool-admin v8 TenantSubscriber hooks**. Runs against the `cool_test` DB;
  **gracefully skips when PG is unavailable** (prints the exact steps to start
  it). Includes a drift guard that asserts the test fixture's hook logic matches
  upstream `tenant.ts`.

Covered scenarios (when PG is available):

- merchant A's records are invisible/unreachable to merchant B (select/update/delete)
- insert hook forces the current `tenantId` (rejects client-forged tenantId)
- platform role (`tenantId=undefined`) sees across tenants (`noTenant` escape)

## Local checks

```bash
npm run check
```

Runs:

1. `npm run guard:cool-admin` — vendored v8 integration markers
   (`@midwayjs/core >=3.x`, `tenant.ts`, `BaseEntity.tenantId`).
2. `node --test tests/*.test.mjs` — guard unit tests + tenant-isolation
   simulation + real-tenant (PG-gated) regression.
3. `npm run guard:prod-config` — asserts production config keeps
   `synchronize: false` and `cool.eps: false`.

## Red lines (must hold)

- cool-admin `8.x`, never `master` (v4 has no tenant support).
- No raw SQL (`nativeQuery`, `sqlRenderPage`, `repository.query`) in
  tenant-scoped code — it bypasses the `TenantSubscriber`.
- Production keeps `synchronize: false` and `cool.eps: false`.
- Admin upstream is `cool-admin-vue` (not `cool-admin-vue3`); extend the router
  `import.meta.glob` to cover `plugins/*` and add `X-Tenant-Id` to the request
  interceptor.
- C-end is WeChat mini-program only for MVP; no runtime hot-plugin (MP forbids
  runtime JS download) — C-end "plugins" are build-time uni subpackages.

## Environment notes

- Node >= 20, pnpm >= 9 (root `engines`). The dev box used for PR0 had pnpm 7.x,
  so dependency install was done with `npm install` inside `packages/backend`
  (succeeds; 1228 pkgs). CI / other devs should use pnpm >= 9 via the workspace.
- Docker was **not** available on the PR0 dev box; the real-tenant suite skips
  gracefully. `docker compose up -d` is the documented path to enable it.
