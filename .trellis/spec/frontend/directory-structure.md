# 目录结构

> uni-app C-end 与 cool-admin-vue admin 的前端代码如何组织。

---

## 概览

保持 C 端和 admin 前端分离，因为它们有不同运行时约束：

- C 端使用 uni-app pages、`pages.json`、mini-program subpackages、`uni.request` 和 wot-design-uni。
- Admin 使用 cool-admin-vue modules/plugins、Vue Router、后端驱动菜单和按品牌构建。

不要把 admin 抽象混入 C 端代码。不要围绕运行时 route/component loading 设计 C 端代码；微信小程序 pages 必须静态注册。

---

## C-End 布局

推荐 C-end layout：

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

规则：

- Main package 只包含 launch、tabBar、login，以及立即需要的 shared components。
- Rental fulfillment、order detail、activity/marketing 和 optional tenant features 放在 `subpackages/` 中。
- C-end plugins 表示为由 tenant/package configuration 在 build time 选择的 subpackages。
- `pages.json` 是路由注册表。不要把 vue-router 引入 C 端小程序。

---

## Admin 布局

使用 cool-admin-vue 8.x conventions：

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

规则：

- 使用 `vite build --mode merchant` 或 `vite build --mode platform` 构建。
- `.env.merchant` 和 `.env.platform` 设置 `VITE_BRAND`、`VITE_NAME`、API base 和 theme values。
- 按品牌启用 module 属于 module/plugin `config.ts`；避免在 views 中分散 `if brand` checks。
- Menus 和 permissions 来自后端 `permmenu` flow。前端路由应遵循返回的 menu data 和 view paths。
- 如果 plugin admin pages 由后端 `viewPath` 路由，当实现进入对应 PR 时，确认 route glob 同时包含 `modules/*` 和 `plugins/*` views。

---

## 命名约定

- Vue SFC files 使用 kebab-case：`goods-card.vue`、`rent-buy-switch.vue`。
- Pinia stores 使用 domain names：`tenant.ts`、`cart.ts`、`auth.ts`。
- Composables 使用 `use-*.ts`：`use-tenant-request.ts`、`use-rental-timeline.ts`。
- API clients 按 backend domain 分组：`goods.ts`、`order.ts`、`pay.ts`。
- Types 放在 `types/` 下的 domain files 中；若只有一个 module 消费，也可共置为 `*.types.ts`。

---

## 模块组织

- 只有至少两个 pages 使用时，才把 shared UI 放入 `components/`。
- 不可复用的 page-only components 放在对应 page 或 subpackage 旁边。
- Business calculations 放在 composables 或 pure utilities 中，不放在 templates 内。
- Tenant、auth、cart 和 rental state 放在独立 stores 中。Tenant 和 cart 必须保持解耦。
