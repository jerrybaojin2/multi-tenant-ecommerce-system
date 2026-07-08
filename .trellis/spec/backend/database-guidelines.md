# Database Guidelines

> Database patterns and conventions for this project.

---

## Overview

Use PostgreSQL for the self-built Midway.js backend. The primary tenancy model is a shared database with a tenant column on every tenant-owned table. App-layer tenant scoping is mandatory, and PostgreSQL RLS is the preferred defense-in-depth layer once migrations exist.

The database contract is safety-first:

- Tenant-scoped tables contain `tenant_id` and matching application-level `tenantId`.
- Tenant context is resolved from trusted auth/request context once, then consumed by repository/client helpers.
- Business code must not accept `tenantId` from request bodies for writes.
- PostgreSQL RLS should fail closed for tenant-owned tables.
- Raw SQL bypasses helper-level safeguards and is forbidden unless explicitly reviewed.
- Production never uses schema auto-sync.

---

## Entity And Table Rules

- Every tenant-owned business table must include `tenant_id`.
- Platform/global configuration tables may be tenantless only when documented and guarded by platform-only services.
- Plugin-like feature tables that store tenant data must also include `tenant_id`.
- Prefer explicit comments on monetary/status columns so admin tooling and generated docs are understandable.
- Store flexible rental pricing rules in PostgreSQL `jsonb` only when the structure is intentionally variable; keep query-critical fields as typed columns.
- Use PostgreSQL ranges/exclusion constraints for rental availability where practical.

Minimum tenant-scoped shape:

```ts
export interface TenantScopedRow {
  id: string;
  tenantId: string;
  createdAt: Date;
  updatedAt: Date;
}
```

Physical columns should be snake_case (`tenant_id`, `created_at`); TypeScript properties should be camelCase (`tenantId`, `createdAt`).

---

## Query Patterns

Use one approved data-access path per request:

- A tenant-aware repository/client helper that reads tenant context from `core/tenant`.
- Explicit transaction helpers for order, rental, payment, deposit, and inventory workflows.
- Platform-only repository methods for cross-tenant reads, protected by platform role guards.

Forbidden by default:

- `repository.query(...)`
- `dataSource.query(...)`
- string-built SQL
- direct global DB client use in request-scoped business services
- accepting `tenantId` from client input for tenant-owned writes

Exceptions require all of the following:

- The operation is platform-only or otherwise genuinely cross-tenant.
- The method lives in a platform service or approved infrastructure helper.
- The method name or comment states why tenant filtering is intentionally bypassed.
- Tests prove merchant/app users cannot reach the path.

## Scenario: PR0 Tenant Query Guard Contract

### 1. Scope / Trigger

- Trigger: PR0 establishes the first executable tenant-isolation contract before
  full repository helpers and migrations exist.
- Scope: TypeORM `QueryBuilder` paths used by tenant-scoped reads and writes.
- Important boundary: `afterSelectQueryBuilder`, `afterInsertQueryBuilder`,
  `afterUpdateQueryBuilder`, and `afterDeleteQueryBuilder` are project-owned
  guard method names. They are not part of TypeORM's standard
  `EntitySubscriberInterface`, so do not assume TypeORM calls them
  automatically.

### 2. Signatures

- Guard class: `TenantSubscriber`
- Fixture class: `TenantSubscriberForTest`
- Query guard methods:
  - `afterSelectQueryBuilder(queryBuilder: SelectQueryBuilder<unknown>): void`
  - `afterInsertQueryBuilder(queryBuilder: InsertQueryBuilder<unknown>): void`
  - `afterUpdateQueryBuilder(queryBuilder: UpdateQueryBuilder<unknown>): void`
  - `afterDeleteQueryBuilder(queryBuilder: DeleteQueryBuilder<unknown>): void`
- Tenant context helpers:
  - `getTenantContext(): TenantContext | undefined`
  - `requireTenantId(): string`
  - `isPlatformContext(): boolean`

### 3. Contracts

- Environment keys:
  - `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` for local runtime.
  - `TEST_DB_HOST`, `TEST_DB_PORT`, `TEST_DB_USER`, `TEST_DB_PASSWORD`,
    `TEST_DB_NAME` for real PostgreSQL tests.
- Default database names:
  - Runtime dev database: `rent_dev`
  - Real integration-test database: `rent_test`
- Guard behavior:
  - Merchant/consumer select adds a tenant predicate for the active tenant id.
  - Merchant/consumer insert overwrites client-supplied `tenantId` with the
    active tenant id.
  - Merchant/consumer update/delete adds a tenant predicate.
  - Platform context intentionally does not add a tenant predicate; platform
    service and role guards must protect that path.

### 4. Validation & Error Matrix

- Missing tenant context for tenant-scoped write -> throw before writing.
- Merchant tries to forge `tenantId` on insert -> persisted row uses current
  tenant id.
- Merchant tries to update/delete another tenant's row -> affected count is `0`.
- PostgreSQL unavailable during root tests -> real tenant tests skip with an
  explicit startup hint, while pure isolation tests still run.
- Production config has `synchronize:true` -> `guard:prod-config` fails.
- Production config lacks `appMeta.exposeDevMetadata:false` ->
  `guard:prod-config` fails.

### 5. Good/Base/Bad Cases

- Good: service/repository helper reads tenant id from `tenant-context`, applies
  the query guard, and never trusts a request body tenant field.
- Base: root `tests/tenant-isolation.test.mjs` validates isolation semantics
  without a database.
- Bad: implementing `EntitySubscriberInterface` only to expose custom
  `after*QueryBuilder` methods; TypeORM does not define those methods, and the
  build should not pretend they are automatically invoked.
- Bad: adding `TenantSubscriber` to TypeORM `dataSource.subscribers`; TypeORM
  will try to instantiate it as a real subscriber even though the project guard
  methods are not TypeORM lifecycle hooks.

### 6. Tests Required

- Root architecture guard must reject backend packages with `@cool-midway/*`
  runtime dependencies.
- Root production config guard must assert `synchronize:false` and
  `appMeta.exposeDevMetadata:false`.
- Pure isolation tests must cover list, get, create, update, and delete
  tenant boundaries.
- Real PostgreSQL tests must cover select scoping, insert tenant override,
  update/delete write scoping, and platform cross-tenant read behavior.

### 7. Wrong vs Correct

#### Wrong

```ts
export class TenantSubscriber implements EntitySubscriberInterface {
  afterSelectQueryBuilder(queryBuilder: SelectQueryBuilder<unknown>) {
    queryBuilder.andWhere('tenantId = :tenantId', { tenantId });
  }
}
```

This claims a TypeORM interface contract that does not contain the project
guard methods.

#### Correct

```ts
export class TenantSubscriber {
  afterSelectQueryBuilder(queryBuilder: SelectQueryBuilder<unknown>) {
    queryBuilder.andWhere('tenantId = :tenantId', { tenantId });
  }
}
```

Treat these methods as project-owned guard hooks until a tenant-aware
repository/helper wraps and calls them explicitly.

---

## Tenant Context Rules

- Admin requests get tenant context from the verified admin JWT.
- C-end app requests get tenant context from the app token and/or trusted tenant header after validation.
- Payment webhooks have no user JWT. Resolve tenant from trusted provider fields, for example `sub_mchid` or channel merchant id, then execute updates with explicit tenant context.
- Scheduled jobs have no request context. Iterate eligible tenants and run one tenant's work per isolated context.
- Platform operators may run cross-tenant queries only through platform-role-guarded services.

---

## RLS Guidance

Adopt PostgreSQL RLS for tenant-owned tables after the migration system is in place:

- Use an app role that is not table owner, not superuser, and has no `BYPASSRLS`.
- Set tenant context per transaction with `set_config('app.tenant_id', tenantId, true)`.
- Add `USING` and `WITH CHECK` policies so read/write both fail closed.
- Use `FORCE ROW LEVEL SECURITY` where appropriate.
- Platform maintenance jobs should use explicit platform roles or controlled bypass paths, never ordinary merchant request connections.

RLS does not replace app-layer scoping; it is the database backstop for missed filters and future raw-query mistakes.

---

## Transactions And State

- Use transactions for order creation, payment callback handling, rental status transitions, inventory reservation, deposit ledger updates, and profit sharing state.
- State transitions must be idempotent. Use stable keys such as payment transaction id, out trade no, rental event id, or provider callback id.
- For concurrent order/rental/funds transitions, lock the aggregate row or use a clear optimistic locking/idempotency strategy.
- Do not write financial side effects directly inside controllers. Controllers call services; services emit/handle events and persist ledgers.

---

## Migrations And Schema Changes

- PRs that add or change tables must include migrations once the backend skeleton exists.
- Never rely on ORM auto-sync to mutate production schemas.
- Prefer service-level integrity checks over ad hoc foreign-key-free conventions. Use database constraints where they protect money, stock, or rental availability.
- Index tenant-scoped high-volume lookup columns with tenant context, for example tenant + status, tenant + order no, tenant + created time.

---

## Naming Conventions

- Use stable, descriptive table names; avoid future product renames in table names.
- Keep TypeScript property names camelCase and physical columns snake_case.
- Monetary values use integer minor units unless a provider requires a different convention.
- Status columns use string constants/enums; do not store display labels.

---

## Common Mistakes

- Treating `tenant_id` as a field the frontend can choose.
- Using a global DB client inside services and forgetting tenant context.
- Writing raw SQL and silently leaking data across tenants.
- Running scheduled jobs without tenant context.
- Handling payment callbacks with no tenant resolution.
- Leaving schema auto-sync enabled in production.
