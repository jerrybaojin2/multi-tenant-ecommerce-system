# miniAppRentPlatfrom

Multi-tenant rental + retail SaaS platform. pnpm monorepo (D10).

## Packages

| Package | Stack | Status |
|---|---|---|
| `packages/backend` | Self-developed Midway.js 3.x + TypeORM + PostgreSQL backend | Main backend; tenant isolation uses `tenant_id` plus tenant context |
| `packages/app-c` | uni-app Vue3 + Vite + TS + wot-design-uni + Pinia (WeChat MP) | Placeholder; scaffold = PR1 |
| `packages/admin` | Admin stack is not finalized: PR1 chooses Next.js or Vue | Placeholder; product shape is merchant console + platform ops console |

## Backend Direction

`packages/backend` is the primary server application for the project. It is a
self-developed Midway.js 3.x service using PostgreSQL as the persistence layer.
Multi-tenant data isolation is part of the backend contract:

- tenant-scoped tables carry a `tenant_id` column.
- request handling resolves a tenant context before business code reads or
  writes tenant-scoped data.
- platform operations are handled through explicit service-level policy instead
  of ad hoc tenant bypasses.
- production database config must keep schema synchronization disabled.

## PostgreSQL

Development and test database names:

- dev DB: `rent_dev`
- test DB: `rent_test`

`.env.example` contains the shared connection template. Package-local backend
environment files may add package-specific overrides as the backend evolves.

## Admin Direction

`packages/admin` is intentionally a placeholder until PR1. The admin product
needs both a merchant console and a platform operations console, but the
frontend stack is still undecided. PR1 will choose either Next.js or Vue and
then land the scaffold, routing, auth shell, and build commands.

## Local Checks

```bash
npm run check
```

The check target is expected to cover architecture guards, production config
guards, and test suites as they stabilize. If PostgreSQL is unavailable, tests
that require a real database should report the missing dependency clearly.

## Red Lines

- Tenant-scoped business data must include and consistently apply `tenant_id`.
- Tenant context must be resolved at backend boundaries before tenant-scoped
  reads or writes.
- Production database config must not auto-sync schemas.
- Admin PR1 must record the chosen stack and remove the placeholder language.
- C-end is WeChat mini-program only for MVP; runtime plugin loading is out of
  scope for the mini-program client.

## Environment Notes

- Node >= 20, pnpm >= 9.
- PostgreSQL is the supported database for local development and tests.
- Keep entry documentation aligned with the self-developed backend direction as
  architecture decisions land.
