# Quality Guidelines

> Code quality standards for backend development.

---

## Overview

Backend quality is primarily about tenant isolation, financial correctness, and staying on the supported cool-admin v8 path. Prefer boring cool-admin/Midway/TypeORM patterns over custom framework code.

---

## Forbidden Patterns

- Building on cool-admin v4.x or any branch without `src/modules/base/db/tenant.ts`.
- Tenant-scoped entities that do not extend `BaseEntity`.
- Redeclaring or hand-maintaining tenant columns instead of using `BaseEntity.tenantId`.
- Raw SQL in tenant-scoped code: `nativeQuery`, `sqlRenderPage`, `repository.query`, `dataSource.query`, string-built SQL.
- Cross-tenant reads/writes without platform role guard and explicit `noTenant`.
- Production `synchronize: true`.
- Production `cool.eps: true`.
- Controllers containing payment, funds, rental, or inventory business logic.
- Payment/funds state changes outside transactions or without idempotency keys.
- Scheduled jobs that process tenant data without explicit tenant iteration/context.
- Plugin entities or plugin services that bypass tenant isolation.
- Logging secrets, certificates, raw provider payloads, or full personal data.

---

## Required Patterns

- Source and verify cool-admin v8.0.0+ before backend implementation.
- Use `controller/admin/**` for merchant/platform admin APIs and `controller/app/consumer/**` for C-end APIs.
- Use cool-admin `@CoolController` generic CRUD when it fits; move custom rules into services.
- Use TypeORM Repository/QueryBuilder paths covered by the tenant Subscriber.
- Use `BaseEntity` for tenant-scoped business and plugin tables.
- Keep platform-only operations isolated in platform services and visibly marked.
- Use transactions for order, rental, payment, deposit, settlement, inventory, and callback workflows.
- Use idempotency keys for provider callbacks, state transitions, and ledger writes.
- Use enums/constants for status/state transitions and centralize transition guards.
- Use Midway/cool-admin logger with tenant and domain identifiers.

---

## Testing Requirements

PR0 and later backend PRs should add or preserve tests for:

- Tenant isolation: Tenant A cannot list/info/update/delete Tenant B records.
- Platform bypass: platform role can intentionally run cross-tenant reads through `noTenant`; merchant roles cannot.
- Raw SQL guard: lint/review tooling rejects `nativeQuery`, `sqlRenderPage`, and repository/data-source raw query usage in tenant modules.
- Production config guard: `synchronize === false` and `cool.eps === false` in production.
- Order/rental state machine transitions and invalid transition rejection.
- Payment callback idempotency and tenant resolution from `sub_mchid`.
- Deposit ledger side effects for freeze, unfreeze, deduct, refund, and bought-out transfer.
- Scheduled overdue scan processes tenants independently.
- Plugin install/enable/disable respects tenant isolation and plugin config boundaries.

If automated coverage is not yet possible in PR0, document the manual verification and add the automated check in PR2 as planned.

---

## Code Review Checklist

- [ ] The source baseline is cool-admin v8+, not v4.x master.
- [ ] Every new tenant-scoped entity extends `BaseEntity`.
- [ ] No tenant-scoped code uses raw SQL or string-built queries.
- [ ] Any `noTenant` usage is platform-only, role-gated, logged, and tested.
- [ ] Webhooks and scheduled jobs establish tenant context explicitly.
- [ ] Production config disables schema sync and EPS.
- [ ] Order/rental/funds changes are transaction-protected and idempotent.
- [ ] Payment code stores provider ids and maps provider errors to client-safe errors.
- [ ] Plugin code is audited for tenant columns, raw SQL, singleton/request-context assumptions, and config scope.
- [ ] Logs include useful identifiers and do not include secrets or PII.

---

## Common Mistakes To Prevent

- Assuming TypeORM Subscriber isolation applies to raw SQL.
- Assuming admin superuser behavior is safe for merchant endpoints.
- Letting C-end headers pick arbitrary tenant ids without validation.
- Treating deposits as order revenue instead of separate funds ledger entries.
- Mixing platform-global plugin config with tenant-specific payment credentials.
- Letting one tenant failure abort all scheduled job processing.
