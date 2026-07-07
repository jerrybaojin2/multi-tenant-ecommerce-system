# Database Guidelines

> Database patterns and conventions for this project.

---

## Overview

Use cool-admin v8's TypeORM integration with PostgreSQL. The primary tenancy model is a shared database with a tenant column inherited from cool-admin `BaseEntity` and enforced by the v8 TypeORM tenant Subscriber.

The database contract is safety-first:

- Tenant-scoped entities extend `BaseEntity`.
- Tenant isolation is automatic only when queries go through TypeORM Repository/QueryBuilder paths covered by the Subscriber.
- Raw SQL bypasses tenant filtering and is forbidden unless explicitly platform-only.
- PostgreSQL RLS is optional later hardening, not the MVP primary isolation layer.
- Production never uses schema auto-sync.

---

## Entity Rules

- Every tenant-owned business table must extend cool-admin's `BaseEntity`.
- Do not create independent `tenant_id` columns or redeclare `tenantId`; use the inherited field so the Subscriber can recognize it.
- Plugin entities that store tenant data must also extend `BaseEntity`.
- Platform/global configuration tables may be tenantless only when documented in the entity file and guarded by platform-only services.
- Prefer explicit comments on monetary/status columns so generated admin metadata is understandable.
- Store flexible rental pricing rules in PostgreSQL `jsonb` only when the structure is intentionally variable; keep query-critical fields as typed columns.

Minimum tenant-scoped entity shape:

```ts
import { Entity, Column } from 'typeorm';
import { BaseEntity } from '../../base/entity/base';

@Entity('shop_order')
export class ShopOrderEntity extends BaseEntity {
  @Column({ comment: 'Order type: sale, rental, mixed' })
  type: string;
}
```

---

## Query Patterns

Use these by default:

- `@InjectEntityModel(Entity)` repositories.
- cool-admin `BaseService` generic `add/delete/update/info/list/page`.
- TypeORM Repository methods and QueryBuilder for custom filtering.
- `@CoolTransaction` or TypeORM transaction/query runner for multi-row state transitions.

Forbidden by default:

- `nativeQuery(...)`
- `sqlRenderPage(...)`
- `repository.query(...)`
- `dataSource.query(...)`
- string-built SQL

Exceptions require all of the following:

- The operation is platform-only or otherwise genuinely cross-tenant.
- The code is wrapped in the official `noTenant(ctx, async () => ...)` escape or the upstream v8 equivalent.
- The method name or comment states why tenant filtering is intentionally bypassed.
- Tests prove merchant users cannot reach the path.

Do not use raw SQL as a pagination shortcut. Use TypeORM QueryBuilder and cool-admin `entityRenderPage`/generic page support when possible.

---

## Tenant Context Rules

- Admin requests get tenant context from the verified admin JWT.
- C-end app requests get tenant context from the app token and/or trusted tenant header after validation.
- Payment webhooks have no user JWT. Resolve tenant from trusted provider fields, for example `sub_mchid`, then execute updates with explicit tenant context.
- Scheduled jobs have no request context. Iterate eligible tenants and run one tenant's work per isolated context.
- Platform operators may run cross-tenant queries only through platform-role-guarded services.

---

## Transactions And State

- Use transactions for order creation, payment callback handling, rental status transitions, inventory reservation, deposit ledger updates, and profit sharing state.
- State transitions must be idempotent. Use stable keys such as payment transaction id, out trade no, rental event id, or provider callback id.
- For concurrent order/rental/funds transitions, lock the aggregate row or use a clear optimistic locking/idempotency strategy.
- Do not write financial side effects directly inside controllers. Controllers call services; services emit/handle events and persist ledgers.

---

## Migrations And Schema Changes

- Development may use cool-admin bootstrap tools, but production must set `synchronize: false`.
- PRs that add or change tables must include a migration or the project-approved cool-admin migration/install step once the backend skeleton exists.
- Never rely on TypeORM `synchronize` to mutate production schemas.
- Avoid database foreign keys if following cool-admin's default no-FK style, but enforce referential integrity in services and tests.
- Index tenant-scoped high-volume lookup columns with tenant context, for example tenant + status, tenant + order no, tenant + created time.

---

## Naming Conventions

- Use stable, descriptive table names; avoid future product renames in table names.
- Keep TypeORM property names camelCase.
- Preserve the upstream cool-admin naming strategy for physical columns. The tenant concept is tenant_id; the inherited TypeORM property is `tenantId`.
- Monetary values use integer cents unless a provider requires a different minor-unit convention.
- Status columns use string constants/enums; do not store display labels.

---

## Common Mistakes

- Cloning cool-admin `master` and accidentally using old v4.x code without tenant support.
- Writing `nativeQuery` or `sqlRenderPage` and silently leaking data across tenants.
- Creating plugin tables that do not extend `BaseEntity`.
- Running scheduled jobs without tenant context.
- Handling payment callbacks with no tenant resolution.
- Leaving `synchronize: true` or `cool.eps: true` in production config.
