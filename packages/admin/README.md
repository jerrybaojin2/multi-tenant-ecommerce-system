# @miniapp-rent/admin

Next.js 管理后台，覆盖商家后台和平台运营后台。

## Stack Decision

PR1 决策：管理后台使用 **Next.js + TypeScript**。后端业务流程仍全部位于
`packages/backend` 的 Midway.js 服务中，admin 只调用后端 API，不实现 Next.js
API routes。

## Current Status

当前是 walking-skeleton：

- `/login`：登录壳，真实认证后续接 Midway.js。
- `/merchant/demo-resources`：商家后台 demo resource 页面。
- `/platform/demo-resources`：平台运营 demo resource 页面。
- `src/lib/demo-resource-api.ts`：调用 Midway.js 的 admin demo resource API。
