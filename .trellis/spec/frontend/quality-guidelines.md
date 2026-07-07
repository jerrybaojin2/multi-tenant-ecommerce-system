# Quality Guidelines

> Frontend quality standards and review checks.

---

## Overview

Frontend changes must preserve multi-tenant isolation assumptions, mini-program constraints, and cool-admin-vue conventions. Prefer small, verifiable changes over broad abstractions.

---

## Forbidden Patterns

- Direct `uni.request`, `uni.uploadFile`, or `uni.downloadFile` in business pages/components without the shared tenant/auth header wrapper.
- C-end business code manually setting `X-Tenant-Id`, passing arbitrary tenant ids, or mutating `tenantStore`.
- Unbucketed cart state such as `CartItem[]` without `Record<tenantId, CartItem[]>`.
- Runtime hot-plugin claims or implementations for the C-end mini-program. C-end plugin features must be build-time uni subpackages.
- Using uni-app x, Vue 2, Vuex, axios-in-mini-program, or abandoned UI libraries unless a later PRD explicitly revises the stack.
- Admin hard-coded role/menu/permission branching that bypasses backend `permmenu`.
- Browser-only DOM, `window`, `document`, `localStorage`, Node APIs, or unsupported CSS assumptions in C-end code.

---

## Required Patterns

- C-end uses uni-app Vue 3 + Vite + TypeScript + wot-design-uni + Pinia.
- C-end MVP targets only WeChat mini-program (`MP-WEIXIN`).
- Every C-end business request injects `X-Tenant-Id` from read-only tenant state.
- Admin uses cool-admin-vue 8.x and builds with `VITE_BRAND=merchant|platform`.
- Admin menu, permission, and route visibility are backend-driven.
- Plugin admin pages may be compiled into the admin bundle and activated by backend menu/config; C-end plugin pages are static subpackages selected by build.

---

## Testing Requirements

Once frontend code exists:

- Run the relevant lint and typecheck commands before reporting done.
- For C-end request/store work, add unit tests around tenant header injection and cart bucket operations where the project test stack supports it.
- For admin brand work, verify both `merchant` and `platform` builds or at least the mode-specific config resolution.
- For mini-program UI flows, run the WeChat mini-program build command and inspect generated output for missing pages/subpackages.

Documentation-only spec updates must at least run a readback check for placeholders and required hard-rule phrases.

---

## Code Review Checklist

- Is tenant context initialized once from `VITE_TENANT_ID` and then read-only?
- Do all C-end request paths, including upload/download, apply tenant and auth headers?
- Is cart data bucketed by tenant id and mode-aware for rent/sale?
- Does the C-end change avoid H5/App assumptions during MVP?
- Does admin visibility come from backend menu/perms rather than frontend-only role checks?
- Are plugin claims accurate for the target surface: admin compiled routes vs C-end build-time subpackages?
- Are types explicit enough to prevent rent/sale and tenant-id mixups?
