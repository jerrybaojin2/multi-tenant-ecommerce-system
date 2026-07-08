# Backend Tests

Backend package tests should verify the project-owned Midway.js service, tenant
context, tenant-aware data access, and production guardrails.

Current PR0 test layers:

- Root `tests/tenant-isolation.test.mjs` keeps tenant isolation semantics covered
  without external services.
- Root `tests/real-tenant.test.mjs` runs TypeORM query guard checks against
  PostgreSQL when `rent_test` is available.

Run from the repository root:

```bash
npm run check
```

Run backend package checks from this directory:

```bash
npm run build
npm run lint
npm run check
```
