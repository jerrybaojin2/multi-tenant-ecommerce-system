# PR1 C端 uni-app 接通

## Goal
在现有 `packages/app-c` uni-app 骨架上，实现 tenant-aware 请求封装（注入 X-Tenant-Id），接通 `/app/consumer/**` demo resource，提供一个 demo 页验证 C 端租户上下文。

## 范围
- 请求封装：注入已校验租户上下文（X-Tenant-Id / app token）
- demo 页：调 `/app/consumer/demo-resource`，展示本租户数据
- 复用 storefront registry 边界规范（PR1 只骨架/规范，不做模板编辑器）

## 依赖
- `07-09-pr1-backend`：`/app/consumer/**` demo resource API 契约（先行）

## 验收
- [ ] C 端请求携带已校验租户上下文
- [ ] demo 页只展示本租户 demo 数据
- [ ] uni-app 可本地启动、调通后端

## Open Questions

> 区分「spec 已定（实现遵循，不再讨论）」与「待 backend 契约 / 待拍板」。

### spec 已定（实现时遵循）
- ✅ 租户上下文来源：`tenantStore` 从编译期 `VITE_TENANT_ID` 初始化，业务只读（`frontend/index.md`、`state-management.md`、`hook-guidelines.md`）。
- ✅ 注入方式：C 端业务请求一律由 request wrapper 从 `tenantStore` 注入 `X-Tenant-Id`、从 `authStore` 注入 auth token；business code 不得直接 `uni.request` 或手设 tenant id（`quality-guidelines.md`、`hook-guidelines.md`）。
- ✅ scene/小程序码参数：只与编译期 tenant id 做验证，不静默覆盖（`state-management.md`、`hook-guidelines.md`）。
- ✅ 响应 envelope：`ApiResult<T>`，API client 返回 typed data、禁 `any`（`type-safety.md`）。

### 待 backend 契约（阻塞前端落地）
- ⏳ `/app/consumer/demo-resource` 请求/响应契约：path / method / 字段、是否分页，待 `07-09-pr1-backend` demo resource 定稿。
- ⏳ demo-resource 是否要求 auth token：PR1 demo 阶段后端是否校验登录态，还是仅校验 `X-Tenant-Id`？影响前端 PR1 是否需要实现登录壳 / `authStore` 取 token，还是 demo 先走无 auth 路径。

### 范围确认（倾向判定，待拍板）
- 🔸 scene 参数验证：PR1 demo 是否需要实现小程序场景值与 `VITE_TENANT_ID` 的校验，还是 demo 阶段直接信任编译期 tenant id（场景验证推迟后续 PR）？倾向：PR1 仅信任编译期 tenant id，场景验证留后续。

## 参考
- 父 PRD：`../07-09-pr1-walking-skeleton/prd.md`
- 前端规范：`.trellis/spec/frontend/`
- storefront 边界：`07-07/research/storefront-template-architecture.md`
