# PR1 Walking Skeleton — 进度记录

> 更新于 2026-07-09 会话。三端骨架 + envelope 统一**实现完成、验证全绿，尚未 commit**（working tree 留改动，用户要求自己 review/commit）。

## 完成状态

### ✅ backend（`packages/backend`，任务 `07-09-pr1-backend`）
- **guard 接线**：`TenantAwareRepository` 显式调 PR0 `TenantSubscriber.after*QueryBuilder`（select/insert/update/delete），guard 从「骨架」变「生效」。
- **第一条 TypeORM migration**：`1783161600000-init-demo-resources`（`demo_resources` + `IDX_demo_resources_tenant_id`），CLI 可跑，幂等。
- **prod config**：`synchronize:false` + `migrationsRun:true` + `allowExecuteMigrations:true`（绕过 midway 剥离 migrations 的坑）。
- **seed**：`rent_dev` 灌 2 租户 4 行（tenant-a / tenant-b）。
- **filter**：`AppErrorFilter`（错误 `{code,message}`）+ `SuccessResultFilter`（`@Match`，成功 `{code:0,data:T}`）。
- **验证**：26 test（含真实 PG 隔离回归）+ check/build/lint 全绿；真实 HTTP curl 验证隔离生效。
- **曾修 1 个 bug**：`data-source.ts` 重复 DataSource 导出（named + default）→ typeorm CLI 报错，删 default 导出解决。

### ✅ c-frontend（`packages/app-c`，任务 `07-09-pr1-c-frontend`）
- `tenantStore`（`VITE_TENANT_ID=tenant-a` 初始化，业务只读）+ request wrapper（`buildTenantHeaders` 注入 `X-Tenant-Id`，request/upload/download 复用）。
- demo 页：`GET /app/consumer/demo-resources` 渲染本租户 items。
- **就地修骨架 bug**：`@dcloudio/*@^3.0.0` → 精确 `3.0.0-alpha-5020120260706001`（uni-app Vue3 栈无 3.0.0 稳定版）；补 `vite.config.ts` + `sass`。
- 验证：check / typecheck / `build:mp-weixin` 全绿。

### ✅ admin（`packages/admin`，任务 `07-09-pr1-admin-frontend`）
- 登录壳（demo 无真鉴权）+ 双品牌路由（`app/merchant`、`app/platform`）+ 角色菜单占位（`AdminMenuItem` 契约 + `validateMenuItems` + demo-menu provider）。
- merchant（`X-Tenant-Id`）/ platform（`X-Platform-Role:true`）demo 接通；merchant CRUD + platform 跨租户只读。
- 验证：check / tsc / `next build`（7 路由）全绿。

### ✅ envelope 统一（跨三包，harness task #4）
- backend `SuccessResultFilter`（`@Match`）→ 成功 `{code:0,data:T}`；错误保持 `{code,message}`。
- app-c（`request.ts`）/ admin（`api-client.ts`）解包 `ApiResult.data`。
- 三端重验证全绿 + 真实 HTTP 验证 envelope 正确、错误不二次包装。

## API 契约（冻结）
- 端口 **8001**。`DemoResource = {id, tenantId, name, description, createdAt, updatedAt}`。
- 成功 `{code:0, data:T}`；错误 `{code:<业务码>, message}`（HTTP 状态码不变）。
- consumer/merchant 路由需 `X-Tenant-Id`；platform 路径 `/admin/platform` 自动 role=platform（或 `X-Platform-Role:true`）。
- 路由：`/app/consumer/demo-resources`（只读）、`/admin/merchant/demo-resources`（CRUD）、`/admin/platform/demo-resources`（跨租户只读）。

## 关键决策（本次会话）
- ORM：继续 TypeORM 0.3.x（父 PRD ADR）。
- envelope：backend 加全局 wrapper 统一 `ApiResult<T>`（用户拍板）。
- pnpm：升 `packageManager` 到 pnpm@9（用户拍板，**install 待执行**）。
- storefront registry：PR1 不补空占位，推迟 PR3+/PR8（用户拍板）。
- scene 参数验证：PR1 仅信任编译期 tenant id，推迟后续。
- demo 鉴权：PR0 用可信请求头（`X-Tenant-Id`/`X-Platform-Role`），无 token；登录壳占位。

## 待办（未完成，需用户发话）
- [ ] **pnpm@9**：改根 `package.json` `packageManager` → pnpm@9 + `corepack pnpm install` 生成 `pnpm-lock.yaml`（吃资源，待用户空闲）。
- [ ] **commit**：working tree 全部改动未 commit（用户要求不自动 commit）；commit 前先清理噪声。
- [ ] **清理噪声**：`packages/admin/.next/`、`packages/admin/package-lock.json`、`packages/admin/tsconfig.tsbuildinfo`（加 .gitignore 或删）。
- [ ] **trellis finish-work**：commit 后跑 `/trellis:finish-work`。
- [ ] 根 `package.json` pnpm 版本矛盾（`packageManager pnpm@7.33.6` vs `engines >=9`）—— 由上面 pnpm@9 升级解决。

## 环境
- Docker Desktop 会话内自动拉起（之前未运行）。PG 容器 `backend-rentPG-1`（postgres:16，127.0.0.1:5432，`rent_dev`/`rent_test`，postgres/postgres）。
- 三端 `node_modules` 用 npm 装的（环境无 pnpm），CI/正式应 pnpm 重装。

## 改动统计
约 43 文件 / +1300 行，全在 working tree（未 commit）。
