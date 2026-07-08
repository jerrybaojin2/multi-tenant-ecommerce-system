# backend/ (root) - pure-logic tenant isolation simulator

This directory is an early PR0 support area, not the main backend application.
The active server code lives in [`../packages/backend/`](../packages/backend/).

The root `backend/` directory keeps a pure JavaScript tenant-isolation simulator
used by `tests/tenant-isolation.test.mjs`. It has no runtime dependencies and is
intended to protect the business isolation contract even when PostgreSQL is not
available locally.

- `tenant/isolation-simulator.mjs` - `TenantScopedStore`, which models
  tenant-scoped list/get/create/update/delete behavior plus explicit platform
  access semantics.
- `config/config.default.example.ts` / `config.prod.example.ts` - early config
  examples retained as fallback inputs for production-config checks.

Real backend integration work belongs in `packages/backend`, which is the
self-developed Midway.js 3.x + PostgreSQL service.
