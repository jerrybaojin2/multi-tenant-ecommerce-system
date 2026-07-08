# Quality Guidelines

> Code quality standards for backend development.

---

## Overview

Backend quality is primarily about tenant isolation, financial correctness, and keeping the self-built Midway.js architecture simple enough to maintain. Prefer explicit, boring services and guards over framework magic.

---

## Forbidden Patterns

- Treating Next.js/API routes as the main backend for core business workflows.
- Tenant-scoped tables without `tenant_id`.
- Request body or query parameters directly controlling tenant-owned write scope.
- Direct global DB client use in request-scoped services.
- Raw SQL in tenant-scoped code: `query`, string-built SQL, or ORM raw helpers outside approved infrastructure.
- Cross-tenant reads/writes without platform role guard and audit logging.
- Production schema auto-sync.
- Development metadata, docs, or debug endpoints exposed in production.
- Controllers containing payment, funds, rental, or inventory business logic.
- Payment/funds state changes outside transactions or without idempotency keys.
- Scheduled jobs that process tenant data without explicit tenant iteration/context.
- Logging secrets, certificates, raw provider payloads, or full personal data.

---

## Required Patterns

- Use Midway.js 3.x modules/controllers/services/middleware for the main backend.
- Use `/admin/**` for platform/merchant admin APIs and `/app/consumer/**` for C-end APIs.
- Resolve tenant context once per request and read it from a central tenant-context helper.
- Use tenant-aware data-access helpers for tenant-owned rows.
- Add PostgreSQL RLS policies for tenant-owned tables once migrations are in place.
- Keep platform-only operations isolated in platform services and visibly marked.
- Use transactions for order, rental, payment, deposit, settlement, inventory, and callback workflows.
- Use idempotency keys for provider callbacks, state transitions, and ledger writes.
- Use enums/constants for status/state transitions and centralize transition guards.
- Use Midway logger with tenant and domain identifiers.

---

## Testing Requirements

PR0 and later backend PRs should add or preserve tests for:

- Tenant isolation: Tenant A cannot list/info/update/delete Tenant B records.
- Platform bypass: platform role can intentionally run cross-tenant reads; merchant roles cannot.
- Raw SQL guard: lint/review tooling rejects raw query usage in tenant modules.
- Production config guard: schema auto-sync disabled and development metadata disabled in production.
- Order/rental state machine transitions and invalid transition rejection.
- Payment callback idempotency and tenant resolution from provider merchant identifiers.
- Deposit ledger side effects for freeze, unfreeze, deduct, refund, and bought-out transfer.
- Scheduled overdue scan processes tenants independently.
- RLS policies fail closed once migration support exists.

If automated coverage is not yet possible in PR0, document the manual verification and add the automated check in PR2 as planned.

---

## Code Review Checklist

- [ ] Backend package depends on Midway.js directly and does not depend on cool-admin runtime packages.
- [ ] Every new tenant-scoped table includes `tenant_id`.
- [ ] No tenant-scoped code uses raw SQL or string-built queries.
- [ ] Any platform-scope usage is role-gated, logged, and tested.
- [ ] Webhooks and scheduled jobs establish tenant context explicitly.
- [ ] Production config disables schema sync and development metadata exposure.
- [ ] Order/rental/funds changes are transaction-protected and idempotent.
- [ ] Payment code stores provider ids and maps provider errors to client-safe errors.
- [ ] Logs include useful identifiers and do not include secrets or PII.

---

## Common Mistakes To Prevent

- Assuming a middleware guard protects raw database access automatically.
- Letting C-end headers pick arbitrary tenant ids without validation.
- Treating deposits as order revenue instead of separate funds ledger entries.
- Mixing platform-global provider config with tenant-specific payment credentials.
- Letting one tenant failure abort all scheduled job processing.
