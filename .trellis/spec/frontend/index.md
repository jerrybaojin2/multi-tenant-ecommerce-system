# Frontend Development Guidelines

> Project conventions for the C-end WeChat mini-program and dual-brand admin frontend.

---

## Scope

This project has two frontend surfaces:

- **C-end**: uni-app Vue 3 + Vite + TypeScript, targeting **WeChat mini-program only for PR0/PR1/MVP**. Do not add H5/App abstractions unless a later PRD explicitly brings those targets in.
- **Admin**: cool-admin-vue 8.x (Vue 3.5 + Vite + Pinia + vue-router) built as two brands: `VITE_BRAND=merchant` and `VITE_BRAND=platform`.

Hard rules for all PR0/PR1 frontend work:

- Every C-end business request must inject `X-Tenant-Id` from `tenantStore`.
- `tenantStore` initializes from `VITE_TENANT_ID` and is read-only to business code.
- C-end cart state is `Record<tenantId, CartItem[]>`.
- Admin menus, routes, and permissions are backend-driven; frontend only renders what the backend returns.
- Admin builds use `VITE_BRAND=merchant|platform`; brand differences stay in config, theme, static assets, module enablement, and backend menu data.
- C-end plugins are uni subpackages included at build time. They are not runtime hot plugins.

---

## Guidelines Index

| Guide | Description | Status |
|-------|-------------|--------|
| [Directory Structure](./directory-structure.md) | C-end and admin file layout | Filled |
| [Component Guidelines](./component-guidelines.md) | Vue SFC, wot-design-uni, and admin component patterns | Filled |
| [Hook Guidelines](./hook-guidelines.md) | Composables, request hooks, tenant-aware helpers | Filled |
| [State Management](./state-management.md) | Pinia stores, tenant/cart/auth/server state rules | Filled |
| [Quality Guidelines](./quality-guidelines.md) | Required checks, forbidden frontend patterns, review checklist | Filled |
| [Type Safety](./type-safety.md) | TS strictness, API contracts, runtime validation boundaries | Filled |

---

## Pre-Development Checklist

- Read this index plus the specific guide for the layer being changed.
- For C-end work, confirm the target remains `MP-WEIXIN` and that `VITE_TENANT_ID` is available.
- For admin work, confirm whether the feature belongs to `merchant`, `platform`, or both, and keep visibility backend-driven.
- Search before adding duplicate components, composables, request helpers, stores, or enum-like constants.

## Quality Check

- No frontend spec placeholder text remains.
- C-end request wrappers inject `X-Tenant-Id`; direct `uni.request` is not used in business code.
- Tenant state is read-only outside initialization.
- Admin code does not hard-code role/menu/permission decisions that belong to the backend.
- Typecheck, lint, and the relevant mini-program/admin build command pass once code exists.

**Language**: All spec documentation is written in English.
