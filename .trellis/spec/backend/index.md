# Backend Development Guidelines

> Project conventions for the cool-admin v8+ / Midway / TypeORM / PostgreSQL backend.

---

## Overview

The backend is a greenfield cool-admin v8+ application for a multi-tenant rental + retail SaaS platform. The backend must stay close to cool-admin conventions so that tenant isolation, RBAC, generic CRUD, EPS generation, and plugins keep working.

PR0 establishes the non-negotiable backend contract:

- Use **cool-admin v8.0.0+ only**. Do not build from the public GitHub `master` if it is still the older v4.x/egg codebase.
- Verify the v8 tenant implementation exists before backend work: `src/modules/base/db/tenant.ts`.
- Use Midway + TypeORM + PostgreSQL through cool-admin's documented module/service/controller patterns.
- Every tenant-scoped entity, including plugin entities, must extend cool-admin's `BaseEntity`.
- Tenant isolation is enforced by cool-admin's TypeORM Subscriber using the inherited `tenantId` / tenant_id column and JWT/request context.
- Raw SQL paths are forbidden in tenant-scoped code: no `nativeQuery`, `sqlRenderPage`, `query()`, or ad hoc SQL unless the block is explicitly platform-only and wrapped/marked with `noTenant`.
- Production config must use `synchronize: false` and `cool.eps: false`.

---

## Guidelines Index

| Guide | Description | Status |
|-------|-------------|--------|
| [Directory Structure](./directory-structure.md) | Module, controller, service, DTO, schedule, and plugin layout | Active |
| [Database Guidelines](./database-guidelines.md) | TypeORM, BaseEntity, tenant isolation, migrations, and transactions | Active |
| [Error Handling](./error-handling.md) | Domain errors, API responses, transaction failures, and client-safe messages | Active |
| [Logging Guidelines](./logging-guidelines.md) | Midway/cool-admin logging, correlation fields, and sensitive-data rules | Active |
| [Quality Guidelines](./quality-guidelines.md) | Forbidden patterns, required review checks, tests, and production guardrails | Active |

---

## Pre-Development Checklist

Before changing backend code or specs:

- [ ] Read this index and the specific guideline file for the touched layer.
- [ ] Confirm the backend source is cool-admin v8.0.0+ and contains `src/modules/base/db/tenant.ts`.
- [ ] Identify whether the code is tenant-scoped, platform-only, plugin code, scheduled work, or webhook code.
- [ ] For tenant-scoped data, confirm every entity extends `BaseEntity` and uses TypeORM Repository/QueryBuilder paths covered by the tenant Subscriber.
- [ ] For any cross-tenant/platform operation, document why it is platform-only and use the explicit `noTenant` escape.
- [ ] Check production config changes for `synchronize: false` and `cool.eps: false`.
- [ ] If the change touches C-end or admin contracts, read the relevant frontend spec too; do not change frontend specs from backend-only tasks.

---

## Quality Check

For backend PRs, reviewers must verify:

- Tenant A cannot read, update, delete, page, or list Tenant B data through generic CRUD or custom services.
- Platform/admin cross-tenant reads are role-gated and intentionally bypass tenant filtering only with `noTenant`.
- No raw SQL path is introduced in tenant-scoped code.
- Scheduled jobs and webhooks establish tenant context explicitly because they do not naturally have a user JWT.
- Payment, deposit, rental, and order transitions are idempotent and transaction-protected.
- Production config disables TypeORM schema sync and cool-admin EPS.
- Lint, typecheck, and relevant tests pass.

---

## Language

All spec documentation should be written in English. Code comments should be short and only explain non-obvious business or isolation rules.
