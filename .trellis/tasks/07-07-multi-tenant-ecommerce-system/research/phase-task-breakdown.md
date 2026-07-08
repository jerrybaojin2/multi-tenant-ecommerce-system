# Phase Task Breakdown - Three-Surface Delivery

- Date: 2026-07-08
- Parent task: `multi-tenant-ecommerce-system`
- Purpose: split the current Trellis program into staged work that matches the three delivery surfaces: backend, C-side mini-program, and admin.

## Task Model

Keep `multi-tenant-ecommerce-system` as the parent program task. Create child tasks by phase only when the phase is ready to implement. Inside each phase, track backend, C-side, admin, and cross-cutting acceptance separately.

Recommended hierarchy:

```text
multi-tenant-ecommerce-system
  phase-00-foundation
  phase-01-three-surface-skeleton
  phase-02-product-inventory
  phase-03-order-rental-transaction
  phase-04-payment-fulfillment
  phase-05-platform-ops-hardening
```

This avoids creating many idle tasks while still making ownership clear.

## Phase 00 - Foundation

- Status: mostly done.
- Maps to: PR0 plus PR1 backend demo resource slice.
- Backend:
  - Self-built Midway.js backend.
  - PostgreSQL Docker environment.
  - Tenant context, base tenant entity, demo resource service, and runtime startup path.
  - Architecture and production config guards.
- C-side:
  - Package exists, no real request wrapper yet.
- Admin:
  - Package exists, stack decision still open.
- Cross-cutting:
  - Trellis backend specs updated.
  - Root checks and real PostgreSQL tenant tests pass.

## Phase 01 - Three-Surface Skeleton

- Status: active next phase.
- Maps to: PR1.
- Backend:
  - Keep `/admin/merchant/demo-resources`, `/admin/platform/demo-resources`, and `/app/consumer/demo-resources` as the first walking resource.
  - Add migration path or documented local schema setup when PR2 begins.
- C-side:
  - Build uni-app Vue3 request wrapper.
  - Add one demo page that calls `/app/consumer/demo-resources`.
  - Confirm tenant header/auth boundary.
- Admin:
  - Decide admin stack: Next.js or Vue.
  - Add login shell, route shell, and role-aware menu placeholder.
  - Add merchant demo resource page and platform demo resource page.
- Cross-cutting acceptance:
  - Tenant A merchant sees only Tenant A demo resources.
  - Tenant B C-side cannot see Tenant A resources.
  - Platform route intentionally lists cross-tenant data.
  - Admin stack decision is recorded in PRD and frontend spec.

## Phase 02 - Product And Inventory

- Status: pending after skeleton.
- Maps to: PR3 and PR4.
- Backend:
  - Product, SKU, rental pricing, retail stock, rental availability, and reservation APIs.
  - Tenant isolation tests for product and inventory CRUD.
- C-side:
  - Product list/detail.
  - Buy/rent entry points.
  - Estimated rental price display.
- Admin:
  - Product management.
  - Inventory and rental availability dashboard.
- Cross-cutting acceptance:
  - Product can be sale-only, rental-only, or both.
  - Concurrent sale and rental availability rules are tested.

## Phase 03 - Order And Rental Transaction

- Status: pending.
- Maps to: PR5.
- Backend:
  - Order header, order items, sale/rental item types, rental subtable, and state transitions.
  - Inventory reservation and release on create/cancel/refund.
- C-side:
  - Cart, checkout, order list, and order detail.
- Admin:
  - Order management shell.
  - Fulfillment action placeholders.
- Cross-cutting acceptance:
  - Legal state transitions pass parameterized tests.
  - Illegal transitions fail without side effects.
  - Mixed rental/sale carts remain tenant isolated.

## Phase 04 - Payment And Fulfillment

- Status: pending.
- Maps to: PR6 and PR7.
- Backend:
  - Payment channel Strategy interface.
  - Mock payment first, then provider adapters later.
  - Deposit, rent, goods payment ledgers, return inspection, renew, overdue, buyout, and settlement.
- C-side:
  - Payment result, deposit status, rental fulfillment status, renew/return/buyout entry points.
- Admin:
  - Fulfillment operations.
  - Deposit and settlement visibility.
- Cross-cutting acceptance:
  - Payment callbacks are idempotent.
  - Deposit flows are separate from order revenue.
  - Scheduled jobs iterate tenants explicitly.

## Phase 05 - Platform Ops And Hardening

- Status: pending.
- Maps to: PR2, PR8, and PR9. PR2 can start earlier if raw SQL/migration/RLS guardrails become a blocker.
- Backend:
  - CI/raw SQL guard, migrations, RLS preparation.
  - Merchant onboarding, package binding, audit logging, and platform-only services.
  - Project-owned extension strategy demo.
- C-side:
  - Tenant/merchant package effects where visible to users.
  - Build-time or route-time extension surfaces only.
- Admin:
  - Platform operations console.
  - Merchant onboarding and package management.
  - Extension enable/disable configuration.
- Cross-cutting acceptance:
  - Platform services are role-gated and audited.
  - Ordinary merchant routes cannot access cross-tenant operations.
  - Migration and production guards are part of root checks.

## Child Task Creation Rule

Create a Trellis child task when a phase is ready to execute and has clear acceptance. Suggested first child tasks:

1. `phase-01-app-c-skeleton`
2. `phase-01-admin-shell`
3. `phase-02-product-inventory-backend`

Do not split every future phase immediately. Keep future phases in this roadmap until their scope is stable enough for implementation.
