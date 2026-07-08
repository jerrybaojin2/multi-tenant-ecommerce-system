# 状态管理

> 前端状态如何管理。

---

## 概览

使用 Pinia 管理全局客户端状态。本地 UI 状态放在 components/pages 中，服务端状态放在 API responses/composables 中，租户、认证与购物车状态放在专用 stores 中。

PR0/PR1 硬规则：

- `tenantStore` 从 `VITE_TENANT_ID` 初始化。
- 业务代码将 `tenantStore` 视为只读。
- C-end cart 是 `Record<tenantId, CartItem[]>`。
- C-end requests 从 `tenantStore` 读取 tenant id，并注入 `X-Tenant-Id`。

---

## Store 分类

C-end stores：

```text
stores/
  tenant.ts     # current tenant context; startup-owned writes only
  auth.ts       # token/user session
  cart.ts       # buckets: Record<tenantId, CartItem[]>
  rental.ts     # rental checkout/return/renewal temporary state
```

Admin stores：

- 对 user、app、menu、route、permission 和 process state 使用 cool-admin-vue base stores。
- 只有当 state 被多个 views 复用，且不能留在 URL/query/local component state 中时，才添加 domain stores。

---

## 租户 Store 规则

`tenantStore` 拥有当前 tenant metadata：

- `tenantId`：来自 `import.meta.env.VITE_TENANT_ID`。
- 可选 display data：merchant name、logo、theme、current mini-program app id。
- initialization status 和 startup validation result。

只有启动/bootstrap 代码可以初始化或验证租户状态。业务 pages 和 composables 可以读取租户状态，但在 PR0/PR1 中不得设置或切换它。

Scene/share parameters 可以与编译期 tenant id 做验证，但不能静默覆盖它。

---

## Cart Store 规则

购物车状态结构：

```ts
type CartItem = {
  goodsId: string
  skuId: string
  qty: number
  mode: 'rent' | 'sale'
  rentTermId?: string
  depositSnapshot?: number
  priceSnapshot: number
  addedAt: number
}

type CartState = {
  buckets: Record<string, CartItem[]>
}
```

规则：

- 增加、更新、删除操作只作用于 `buckets[currentTenantId]`。
- 购物车持久化保留 tenant id 维度。
- 切换租户不是 MVP 功能，但数据模型必须保持与未来 tenant buckets 兼容。
- 结算只读取当前 tenant bucket 中选中的 items。MVP 可以限制一次结算仅支持单一 mode（`rent` 或 `sale`）。

---

## 服务端状态规则

- 默认不要把完整服务端列表镜像进 Pinia。
- 只存储持久会话状态、drafts，或跨多个 pages 复用的数据。
- 变更后重新加载服务端列表，除非有清晰的乐观更新规则。
- Admin 菜单/权限状态属于现有 cool-admin-vue menu/permission flow。

---

## 常见错误

- 不要耦合 `tenantStore` 和 `cartStore`；cart 必须按 tenant id 分桶。
- 不要持久化未限定 tenant 的 cart arrays。
- 不要让 business code 从 route/query/scene parameters 设置 tenant id。
- 不要把 frontend permission state 当作安全边界。
