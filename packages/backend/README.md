# @miniapp-rent/backend

Self-built Midway.js 3.x backend for the multi-tenant rental + retail SaaS
platform.

This package is no longer a vendored admin framework runtime. Keep the backend
explicit and project-owned: tenant context, RBAC, audit logging, jobs, payment
callbacks, and domain APIs are implemented in this codebase.

## Stack

- Midway.js 3.x + Koa
- TypeScript
- PostgreSQL
- TypeORM for the current PR0 tenant-isolation skeleton
- Request tenant context via `src/core/tenant/tenant-context.ts`

## Current PR0 Scope

- Minimal Midway application bootstrapping in `src/configuration.ts`.
- PostgreSQL config in `src/config/config.default.ts`, with production override
  in `src/config/config.prod.ts`.
- Tenant context middleware in `src/core/tenant/tenant.middleware.ts`.
- Tenant-scoped base entity in `src/core/database/base-tenant.entity.ts`.
- QueryBuilder tenant guard in `src/core/database/tenant.subscriber.ts`.
- Placeholder platform, consumer, and health controllers under `src/modules/**`.

## Local Setup

```bash
npm install
docker compose up -d
npm run dev
```

The local Docker database defaults are:

- Dev database: `rent_dev`
- Test database: `rent_test`
- User/password: `postgres` / `postgres`

Copy `.env.example` to `.env` and adjust `DB_*` values when using a different
PostgreSQL instance.

## Checks

Run root checks from the repository root:

```bash
npm run check
```

Package-level checks:

```bash
npm run build
npm run lint
npm run check
```

`npm run check` verifies the backend architecture guard and production config
guard. Root tests also include:

- `tests/tenant-isolation.test.mjs`: dependency-free tenant isolation semantics.
- `tests/real-tenant.test.mjs`: real TypeORM + PostgreSQL query guard test,
  skipped with an explicit message when `rent_test` is unavailable.

## Tenant Isolation Rules

- Tenant-owned tables must contain `tenant_id` and expose `tenantId` in code.
- Request code reads tenant scope from `tenant-context`, not from client body
  fields.
- Merchant and consumer paths are tenant-scoped by default.
- Platform cross-tenant operations must go through platform-only services and
  role guards.
- Raw SQL in tenant-scoped business code is forbidden unless it goes through an
  approved helper and has isolation tests.
- Production config keeps `synchronize: false` and
  `appMeta.exposeDevMetadata: false`.

See `.trellis/spec/backend/` for the full backend conventions.
