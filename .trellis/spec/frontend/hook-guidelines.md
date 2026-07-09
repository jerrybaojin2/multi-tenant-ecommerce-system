# Composable 指南

> Composables 和有状态 helpers 如何使用。

---

## 概览

使用 Vue composables 复用前端逻辑。命名为 `useXxx`，并保持框架适配：

- C-end composables 可以调用 uni APIs 和 Pinia stores。
- Admin 侧使用 Next.js/React helpers 和后端 API client；不要把业务流程放进 Next.js API routes。
- Shared pure logic 应是 typed utility，而不是 composable。

---

## 自定义 Composable 模式

适合的候选：

- `useTenantRequest`：处理 request preconditions、status 和 normalized errors。
- `useRentBuyMode`：处理本地 product detail mode switching。
- `useRentalTimeline`：派生 rental progress display state。
- `useSubscribeMessage`：处理 mini-program subscription-message authorization。

规则：

- 返回 refs/computed values 和显式 actions。
- 让 side effects 体现在 action names 中，例如 `load`、`submit`、`authorize`。
- 不要在任意 composables 中执行租户初始化；只有启动/bootstrap 代码初始化租户状态。
- 当 Pinia store 才是正确 owner 时，不要把 composables 做成 global state containers。

---

## 数据获取

C-end：

- 所有 business network calls 都通过项目基于 `uni.request` 的 request wrapper。
- Request wrapper 从 `tenantStore` 注入 `X-Tenant-Id`，并从 `authStore` 注入 auth token。
- Upload 和 download helpers 必须复用同一套 tenant/auth header preparation。
- 401 由 auth flow 处理；403 被视为 tenant/permission sentinel，并应可展示/可上报。

Admin：

- 使用 Next.js server/client component 边界时，API client 仍调用 Midway.js 后端。
- Menus 和 permissions 从后端加载，并驱动 route/menu rendering。
- 不要用纯前端 filters 绕过后端权限和 tenant checks。

服务端状态通常应在 page entry 或 action completion 时重新加载。只有 invalidation rule 清楚时才添加 caching。

---

## 命名约定

- `useTenant*` 保留给 tenant-aware helpers，绝不能向 business code 暴露 tenant id setter。
- `useCart*` 通过 cart store 操作 current-tenant buckets。
- `useAdmin*` helpers 仅用于 admin，不得被 C-end code 导入。
- `useMp*` 或 `useWeixin*` helpers 面向 mini-program，应保持 C-end only。

---

## 常见错误

- 不要在整个 app 中到处读取 `VITE_TENANT_ID`。在 config/startup 中读取它，初始化 `tenantStore`，然后消费 store。
- 不要让 API functions 在普通 C 端业务请求中接受调用方传入的任意 `tenantId`。
- 不要在 PR0/PR1 创建面向 H5/App 的通用 cross-platform abstraction；MVP 仅为 WeChat mini-program。
