# 目录结构

> uni-app C-end 与 Next.js admin 的前端代码如何组织。

---

## 概览

保持 C 端和 admin 前端分离，因为它们有不同运行时约束：

- C 端使用 uni-app pages、`pages.json`、mini-program subpackages、`uni.request` 和 wot-design-uni。
- Admin 使用 Next.js App Router、后端驱动菜单和按 surface 区分的商家/平台页面。

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

使用 Next.js App Router：

```text
src/
  app/
    login/
      page.tsx
    merchant/
      demo-resources/
        page.tsx
    platform/
      demo-resources/
        page.tsx
  components/
  lib/
```

规则：

- 不要在 `src/app/api` 中实现业务流程；管理端业务请求必须调用 Midway.js 后端。
- `merchant` 与 `platform` surface 可以共享 layout/component，但权限和菜单以后端返回为准。
- `.env` 设置 `NEXT_PUBLIC_API_BASE_URL` 和必要的本地开发租户标识。
- 品牌差异来自 config/theme/static assets 和后端 menu data，避免在 pages 中分散硬编码角色判断。

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
