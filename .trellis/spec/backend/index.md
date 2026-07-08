# Backend Development Guidelines

> Project conventions for the self-built Midway.js / PostgreSQL backend.

---

## Overview

The backend is a greenfield Midway.js service for a multi-tenant rental + retail SaaS platform. It is not based on cool-admin. Build only the platform primitives we need: tenant context, RBAC, API modules, scheduled jobs, payment callbacks, and auditability.

PR0 establishes the non-negotiable backend contract:

- Use **Midway.js 3.x** as the main backend framework.
- Use **PostgreSQL** as the primary database.
- Keep shared-database multi-tenancy explicit: every tenant-owned row has `tenantId` / `tenant_id`.
- Resolve tenant context once per request, store it in request/async context, and make services read from that context instead of trusting arbitrary request body fields.
- Add PostgreSQL RLS as the preferred defense-in-depth path for tenant-scoped tables once migrations exist.
- Raw SQL is forbidden in tenant-scoped business code unless it goes through an approved tenant-aware helper and is covered by tests.
- Production config must disable schema auto-sync and must not expose development metadata endpoints.

---

## Guidelines Index

| Guide | Description | Status |
|-------|-------------|--------|
| [Directory Structure](./directory-structure.md) | Midway package, module, controller, service, DTO, middleware, schedule layout | Active |
| [Database Guidelines](./database-guidelines.md) | PostgreSQL, ORM, tenant context, RLS, migrations, and transactions | Active |
| [Error Handling](./error-handling.md) | Domain errors, API responses, transaction failures, and client-safe messages | Active |
| [Logging Guidelines](./logging-guidelines.md) | Midway logging, correlation fields, tenant auditability, and sensitive-data rules | Active |
| [Quality Guidelines](./quality-guidelines.md) | Forbidden patterns, required review checks, tests, and production guardrails | Active |

---

## Pre-Development Checklist

Before changing backend code or specs:

- [ ] Read this index and the specific guideline file for the touched layer.
- [ ] Identify whether the code is tenant-scoped, platform-only, scheduled work, webhook code, or infrastructure.
- [ ] For tenant-scoped data, confirm reads/writes derive tenant context from trusted auth/context, not from request body fields.
- [ ] For any cross-tenant/platform operation, document why it is platform-only and enforce an explicit platform role guard.
- [ ] If adding persistence, include a migration plan and tenant isolation tests.
- [ ] Check production config changes for disabled schema auto-sync and disabled development-only metadata endpoints.
- [ ] If the change touches C-end or admin contracts, read the relevant frontend spec too.

---

## Quality Check

For backend PRs, reviewers must verify:

- Tenant A cannot read, update, delete, page, or list Tenant B data.
- Platform cross-tenant reads are role-gated, audited, and intentionally routed through platform services.
- No raw SQL path is introduced in tenant-scoped code.
- Scheduled jobs and webhooks establish tenant context explicitly because they do not naturally have a user JWT.
- Payment, deposit, rental, and order transitions are idempotent and transaction-protected.
- Production config disables schema sync and development metadata exposure.
- Lint, typecheck, and relevant tests pass.

---

## Language

All spec documentation should be written in English. Code comments should be short and only explain non-obvious business or isolation rules.
