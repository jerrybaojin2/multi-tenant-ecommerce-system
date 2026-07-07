# Directory Structure

> How frontend code is organized for the uni-app C-end and cool-admin-vue admin.

---

## Overview

Keep the C-end and admin frontends separate because they have different runtime constraints:

- C-end uses uni-app pages, `pages.json`, mini-program subpackages, `uni.request`, and wot-design-uni.
- Admin uses cool-admin-vue modules/plugins, Vue Router, backend-driven menus, and brand-specific builds.

Do not mix admin abstractions into C-end code. Do not design C-end code around runtime route/component loading; WeChat mini-program pages must be statically registered.

---

## C-End Layout

Recommended C-end layout:

```text
src/
  App.vue
  main.ts
  pages.json
  manifest.json
  env.d.ts
  config/
    index.ts              # compile-time constants: tenantId, apiBase, app name, theme
  utils/
    request.ts            # uni.request wrapper with X-Tenant-Id and auth interceptors
    tenant.ts             # startup tenant resolver and scene validation
  stores/
    tenant.ts             # read-only current tenant context
    auth.ts               # token and user session
    cart.ts               # Record<tenantId, CartItem[]>
    rental.ts             # rental flow draft/temporary state
  api/
    goods.ts
    order.ts
    rental.ts
    pay.ts
  components/
    goods-card.vue
    rent-buy-switch.vue
    sku-picker.vue
  pages/                  # main package pages and tabBar pages
  subpackages/
    order/
    rental/
    activity/
  static/                 # tenant/brand assets selected by build configuration
```

Rules:

- Main package contains only launch, tabBar, login, and shared components needed immediately.
- Rental fulfillment, order detail, activity/marketing, and optional tenant features live in `subpackages/`.
- C-end plugins are represented as subpackages selected at build time by tenant/package configuration.
- `pages.json` is the route registry. Do not introduce vue-router into the C-end mini-program.

---

## Admin Layout

Use cool-admin-vue 8.x conventions:

```text
src/
  config/                 # brand, theme, app config from env
  modules/
    base/
    merchant/             # merchant-only modules, enable by VITE_BRAND
    platform/             # platform-only modules, enable by VITE_BRAND
  plugins/
    <plugin-name>/
      config.ts
      service/
      views/
      pages/
      components/
      locales/
```

Rules:

- Build with `vite build --mode merchant` or `vite build --mode platform`.
- `.env.merchant` and `.env.platform` set `VITE_BRAND`, `VITE_NAME`, API base, and theme values.
- Brand-specific module enablement belongs in module/plugin `config.ts`; avoid scattering `if brand` checks across views.
- Menus and permissions come from the backend `permmenu` flow. Frontend routes should follow returned menu data and view paths.
- If plugin admin pages are routed by backend `viewPath`, make sure the route glob includes both `modules/*` and `plugins/*` views when implementation reaches that PR.

---

## Naming Conventions

- Vue SFC files use kebab-case: `goods-card.vue`, `rent-buy-switch.vue`.
- Pinia stores use domain names: `tenant.ts`, `cart.ts`, `auth.ts`.
- Composables use `use-*.ts`: `use-tenant-request.ts`, `use-rental-timeline.ts`.
- API clients are grouped by backend domain: `goods.ts`, `order.ts`, `pay.ts`.
- Types use domain files under `types/` or colocated `*.types.ts` when only one module consumes them.

---

## Module Organization

- Put shared UI in `components/` only when at least two pages use it.
- Keep page-only components beside the page or subpackage when they are not reusable.
- Keep business calculations in composables or pure utilities, not inside templates.
- Keep tenant, auth, cart, and rental state in separate stores. Tenant and cart must remain decoupled.
