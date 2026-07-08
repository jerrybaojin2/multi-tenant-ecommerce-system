# MVP PR Breakdown - Multi-Tenant Rental + Retail SaaS

- Date: 2026-07-08
- Current decision: self-built Midway.js 3.x main backend, PostgreSQL, shared database plus `tenant_id`, app-layer tenant context, and later PostgreSQL RLS.
- Supersedes: the 2026-07-07 cool-admin v8 vendor roadmap. The cool-admin research files remain historical references only.
- PR0 implementation commit: `bb3ca3958c4bccf86de2b7d60311cae46ebb82e0`
- Trellis phase split: see `research/phase-task-breakdown.md` for the parent/child task model across backend, C-side, and admin.

## Cross-PR Guardrails

1. Backend business workflows live in the Midway.js backend, not in Next.js API routes or frontend code.
2. Tenant-owned tables must include `tenant_id`; TypeScript code exposes this as `tenantId`.
3. Tenant context is resolved from trusted auth/request boundaries, then read from backend context helpers.
4. Client request bodies must not control tenant-owned write scope.
5. Raw SQL in tenant-scoped business code is forbidden unless routed through an approved tenant-aware helper and covered by tests.
6. Platform cross-tenant reads/writes require explicit platform services, role guards, and audit logging.
7. Production config keeps `synchronize:false` and `appMeta.exposeDevMetadata:false`.
8. C-side MVP is WeChat mini-program only. Runtime plugin loading is out of scope for the mini-program client.
9. Payment callbacks and scheduled jobs must establish tenant context explicitly because they do not naturally have a user JWT.

## PR Overview

```text
PR0  Self-built Midway backend foundation + tenant isolation guards
  -> PR1  Three-surface walking skeleton
      -> PR2  CI/lint guardrails + migrations/RLS preparation
      -> PR3  Rental + retail product model
          -> PR4  Inventory and rental availability
              -> PR5  Order and rental state machines
                  -> PR6  Payment, deposit, and funds ledger
                      -> PR7  Rental fulfillment
      -> PR8  Extension strategy demo
      -> PR9  Platform operations
```

## PR0 - Self-Built Midway Foundation

- Status: implemented in `bb3ca39`.
- Scope:
  - Remove cool-admin runtime/vendor backend source.
  - Create Midway.js 3.x bootstrap, config, health/platform/consumer ping controllers.
  - Add tenant context helper, tenant middleware, tenant-scoped base entity, and PR0 query guard skeleton.
  - Add architecture guard that rejects `@cool-midway/*` runtime dependencies.
  - Add production config guard for `synchronize:false` and `appMeta.exposeDevMetadata:false`.
  - Rename local databases to `rent_dev` and `rent_test`.
  - Update README, env, Cursor, and VSCode templates so new code is generated in project-owned Midway style.
- Acceptance:
  - `npm run check` passes.
  - `packages/backend npm run build` passes.
  - `packages/backend npm run lint` passes.
  - Real PostgreSQL tenant tests use `rent_test` and skip clearly when PostgreSQL is unavailable.

## PR1 - Three-Surface Walking Skeleton

- Scope:
  - Backend: create a real tenant-scoped demo resource behind `/admin/merchant/**`, `/admin/platform/**`, and `/app/consumer/**`.
  - C-side: uni-app Vue3 skeleton with tenant-aware request wrapper and one demo page.
  - Admin: choose Next.js or Vue before implementation, then land login shell, route shell, and role-aware menu placeholder.
- Acceptance:
  - Merchant context sees only its tenant data.
  - Platform role can intentionally see cross-tenant demo data through a platform route.
  - C-side request carries validated tenant context.
  - Admin stack decision is recorded in PRD and frontend spec.

## PR2 - CI, Raw SQL Guard, Migrations, RLS Preparation

- Scope:
  - Add lint/review guard against `repository.query`, `dataSource.query`, and string-built SQL in tenant modules.
  - Add migration skeleton and document when schema auto-sync is allowed locally.
  - Add RLS helper/prototype for a single tenant table after migrations exist.
  - Keep production guard wired into root checks.
- Acceptance:
  - Deliberate raw SQL fixture fails lint/check.
  - Production guard fails on `synchronize:true` or exposed dev metadata.
  - Migration path can create the demo tenant table.

## PR3 - Rental + Retail Product Model

- Scope:
  - Product/SKU entities with sale fields and rental fields.
  - Rental pricing rules in JSONB only where flexible structure is needed.
  - Admin product configuration pages.
  - C-side product list/detail with rent and buy entry points.
- Acceptance:
  - Same product can be sale-only, rental-only, or both.
  - Tenant isolation regression covers product list/detail/update/delete.
  - C-side can calculate an estimated rental price.

## PR4 - Inventory And Rental Availability

- Scope:
  - Retail stock quantity.
  - Rental availability/reservation model.
  - Transactional reserve, confirm, release operations.
  - Admin inventory dashboard.
- Acceptance:
  - Concurrent sale orders cannot oversell.
  - Overlapping rental windows are rejected.
  - Tenant isolation applies to all inventory operations.

## PR5 - Orders And State Machines

- Scope:
  - Order header, order items, sale/rental item types, rental subtable, and rental event stream.
  - Explicit state transition tables for sale transaction state and rental fulfillment state.
  - C-side checkout/order list/detail.
  - Admin order management and fulfillment action entry points.
- Acceptance:
  - Legal transitions are covered by parameterized tests.
  - Illegal transitions are rejected.
  - Cancel/refund releases inventory correctly.
  - Mixed rental/sale cart is persisted without cross-tenant order mixing.

## PR6 - Payment, Deposit, And Funds Ledger

- Scope:
  - Project-owned `PaymentChannel` Strategy interface.
  - Mock payment channel first, then WeChat/Alipay/cross-border adapters later.
  - Deposit, rent, and goods payment ledgers as separate financial records.
  - Idempotent provider callback handling.
- Acceptance:
  - Duplicate callbacks do not advance state twice.
  - Deposit freeze/unfreeze/deduct/refund flows are tested.
  - Payment callbacks resolve tenant from trusted provider merchant identifiers.

## PR7 - Rental Fulfillment

- Scope:
  - Delivery/outbound, return inspection, renew, overdue scan, buyout, and deposit settlement.
  - Scheduled jobs iterate tenants explicitly and isolate failures.
- Acceptance:
  - Return damage settlement updates deposit ledger correctly.
  - Renew extends availability without conflicts.
  - Overdue scheduled scan processes tenants independently.

## PR8 - Extension Strategy Demo

- Scope:
  - Demonstrate project-owned module/Strategy extension points without cool-admin plugin runtime.
  - Candidate: payment channel sandbox, announcement module, or rental pricing strategy.
  - Admin configuration surface for enabling/disabling a feature per tenant.
- Acceptance:
  - Feature can be enabled/disabled per tenant.
  - Extension data remains tenant-scoped.
  - C-side extension surface is build-time/route-time only, not runtime JS loading.

## PR9 - Platform Operations

- Scope:
  - Merchant onboarding, qualification, package binding, platform overview, and simulated settlement/split ledger.
  - Platform-only cross-tenant services with audit logging.
- Acceptance:
  - Onboarding creates an isolated tenant and initial merchant admin.
  - Platform overview uses platform-only services, not ordinary merchant routes.
  - Settlement records reconcile against PR6 funds ledger.

## Agent Mapping

| Agent | PRs | Focus |
|---|---|---|
| backend-agent | PR0-PR9 backend slices | Midway modules, tenant context, PostgreSQL, transactions, state machines |
| c-frontend-agent | PR1, PR3, PR5, PR6, PR7 | uni-app Vue3, tenant request wrapper, cart/order/rental UX |
| admin-frontend-agent | PR1, PR3, PR4, PR5, PR7, PR8, PR9 | Admin shell, product/order/inventory/platform pages |
| payment-agent | PR6, PR9 | Payment channel Strategy, callbacks, funds ledger, settlement |
| reviewer-agent | every PR | Spec compliance, tenant isolation, production guardrails, test coverage |

## Open Decisions Before PR1/PR2

- Admin stack: Next.js or Vue.
- ORM/migration stack: continue TypeORM, or switch to Drizzle/Prisma before business tables harden.
- Compliance prerequisites: ICP/EDI, WeChat/Alipay service-provider onboarding, cross-border account/data compliance.
