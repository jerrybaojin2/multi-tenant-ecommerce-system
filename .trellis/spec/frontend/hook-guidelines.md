# Hook Guidelines

> How composables and stateful helpers are used.

---

## Overview

Use Vue composables for reusable frontend logic. Name them `useXxx` and keep them framework-appropriate:

- C-end composables may call uni APIs and Pinia stores.
- Admin composables may use cool-admin-vue services, router, and permission helpers.
- Shared pure logic should be a typed utility instead of a composable.

---

## Custom Composable Patterns

Good candidates:

- `useTenantRequest` for request preconditions, status, and normalized errors.
- `useRentBuyMode` for local product detail mode switching.
- `useRentalTimeline` for deriving rental progress display state.
- `useSubscribeMessage` for mini-program subscription-message authorization.

Rules:

- Return refs/computed values and explicit actions.
- Keep side effects visible in action names such as `load`, `submit`, `authorize`.
- Do not perform tenant initialization in arbitrary composables; only startup/bootstrap code initializes tenant state.
- Do not make composables global state containers when a Pinia store is the correct owner.

---

## Data Fetching

C-end:

- All business network calls go through the project request wrapper over `uni.request`.
- The request wrapper injects `X-Tenant-Id` from `tenantStore` and auth token from `authStore`.
- Upload and download helpers must reuse the same tenant/auth header preparation.
- 401 is handled by auth flow; 403 is treated as a tenant/permission sentinel and should be surfaced/reportable.

Admin:

- Use cool-admin-vue service/eps conventions where available.
- Menus and permissions are loaded from backend `permmenu` and drive route/menu rendering.
- Do not bypass backend permission and tenant checks with frontend-only filters.

Server state should generally be reloaded on page entry or action completion. Add caching only when the invalidation rule is obvious.

---

## Naming Conventions

- `useTenant*` is reserved for tenant-aware helpers and must never expose a setter for tenant id to business code.
- `useCart*` works with current-tenant buckets via the cart store.
- `useAdmin*` helpers are admin-only and must not be imported by C-end code.
- `useMp*` or `useWeixin*` helpers are mini-program-specific and should remain C-end only.

---

## Common Mistakes

- Do not put `VITE_TENANT_ID` reads throughout the app. Read it in config/startup, initialize `tenantStore`, then consume the store.
- Do not let API functions accept arbitrary `tenantId` from callers for normal C-end business requests.
- Do not create a generic cross-platform abstraction for H5/App during PR0/PR1; MVP is WeChat mini-program only.
