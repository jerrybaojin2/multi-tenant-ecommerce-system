# PR1 三端 Walking Skeleton

## Goal

打通后端（Midway）、C 端（uni-app 微信小程序）、Admin（Next.js）三端的最小可运行骨架，在真实 tenant-scoped demo resource 上端到端验证多租户隔离，**接线 PR0 未生效的租户 guard**，并在 PR3 业务表固化前锁定 ORM/迁移栈。

## What I already know

### 范围（来自 `07-07/research/mvp-pr-breakdown.md` PR1）
- 后端：在 `/admin/merchant/**`、`/admin/platform/**`、`/app/consumer/**` 后建真实 tenant-scoped demo resource
- C 端：uni-app Vue3 骨架 + tenant-aware 请求封装 + 一个 demo 页
- Admin：Next.js 登录壳、路由壳、角色感知菜单占位
- storefront template registry：PR1 只记录边界与规范，不做完整模板编辑器

### 现状（auto-context）
- 后端 `packages/backend`：Midway.js 3.20.3 + `@midwayjs/typeorm` + typeorm 0.3.20 + pg；src 有 config/core/modules/configuration
- C 端 `packages/app-c`、Admin `packages/admin`：骨架已存在（git `40bbbb1`）
- PR0（`bb3ca39`）已实现：租户上下文 helper、tenant middleware、tenant-scoped base entity、TenantSubscriber guard（**但未接线生效**）、生产守护

### 关键发现（research）
- PR0 `TenantSubscriber.after*QueryBuilder` 是项目自有 guard 名，**非 TypeORM 标准钩子**，当前未被自动调用也未由 helper 调用 → PR0 隔离机制是"未生效骨架"（`database-guidelines.md:75,118-119,152`）
- PR0 TypeORM 投入极小：1 entity / 1 repo 注入 / 4 文件 import

## Research References
- [`research/orm-stack-selection.md`](research/orm-stack-selection.md) — 推荐继续 TypeORM 0.3.x；guard 未生效需接线；PR3 前可再评估 Drizzle
- `07-07/research/storefront-template-architecture.md` — storefront registry 边界
- `07-07/research/mvp-pr-breakdown.md` — PR1 范围与验收

## Decision (ADR-lite)

**Context**：PR3 业务表固化前是 ORM 切换的最后窗口。07-07 原始主选 Drizzle，但 PR0 已用 `@midwayjs/typeorm`（Midway 官方唯一 ORM 组件），且投入极小。

**Decision**：PR1 继续用 TypeORM 0.3.x + `@midwayjs/typeorm`。在本 PR 内接线 PR0 guard 使其生效、落地第一条 migration + seed。

**Consequences**：
- ✅ Midway 官方集成零成本；PR1 聚焦三端骨架，不背数据层重构
- ✅ RLS 兜底与 ORM 无关（纯 PG policy + `set_config`），未来不被绑死
- ⚠️ 读侧 tenant 过滤靠 tenant-aware repository helper 纪律 + lint + 测试兜底（最大泄漏面）
- ⚠️ TypeORM 0.3 处于维护模式（1.0 已发），未来 0.3→1.0 可能一次迁移
- **切换触发条件**：若 PR3 业务表大量需要 JSONB 灵活计价 / tstzrange 防重订等 PG 专属能力，且 0.3 维护态成瓶颈，则该时点评估切 Drizzle（迁移面仍可控：4 文件 + config + 约定）

## Open Questions
（已全部收敛）

## 已决策
- ✅ ORM/迁移栈：继续 TypeORM 0.3.x + `@midwayjs/typeorm`（见 ADR；PR3 前可再评估 Drizzle）
- ✅ 子任务拆分：拆三端 — `07-09-pr1-backend`（先行）/ `07-09-pr1-c-frontend` / `07-09-pr1-admin-frontend`

## Requirements
- 三端骨架端到端跑通；C 端请求注入已校验租户上下文（X-Tenant-Id）
- **接线 PR0 TenantSubscriber guard**：新增 tenant-aware repository helper，显式调用 `after*QueryBuilder`，让 guard 从"骨架"变"生效"
- **落地第一条 TypeORM migration**（建 `demo_resources` + `tenant_id` index）
- **加 seed**（至少 2 个租户的 demo 数据，支撑三端 demo）
- 商家上下文只能看本租户 demo 数据；平台角色可跨租户（走显式平台服务 + 角色守护）
- storefront template registry 边界文档化（PR1 只骨架/规范）
- Admin 技术栈决策记录到 PRD 与前端 spec

## Acceptance Criteria
- [ ] 三端可本地启动并互通
- [ ] **guard 生效**：tenant-scoped write 缺 context 抛错；伪造 tenantId 被覆盖；跨租户 update/delete affected=0；platform 跨租户读走显式服务
- [ ] 隔离回归覆盖 demo resource 的 list/detail/update/delete（pure isolation + real PG）
- [ ] 第一条 migration 存在且可跑；prod `synchronize:false`
- [ ] `npm run check` / backend build / lint 通过

## Definition of Done
- 测试覆盖租户隔离（guard 生效）
- lint / typecheck / CI green
- storefront registry 边界与 Admin 技术栈记录更新

## Technical Approach
- ORM：TypeORM 0.3.x + `@midwayjs/typeorm`（见 ADR）
- 后端：tenant-aware repository helper 包装 QueryBuilder + 调用 `TenantSubscriber.after*QueryBuilder`；platform 路径走显式 platform service（不加 tenant predicate）
- C 端：uni-app 请求封装注入 X-Tenant-Id，调 `/app/consumer/**` demo resource
- Admin：Next.js 登录壳 + 角色菜单，调 `/admin/merchant/**`、`/admin/platform/**`

## Out of Scope
- 完整 storefront 模板编辑器（PR8）
- 业务表（商品/订单/库存，PR3+）
- H5 端（二期）
- 切换 ORM 到 Drizzle/Prisma（保留触发条件，见 ADR）

## Technical Notes
- PR0 commit: `bb3ca39`；前端骨架 commit: `40bbbb1`
- guard 契约：`database-guidelines.md:69-152`
- RLS 指南：`database-guidelines.md:166-176`（迁移到位后启用，PR1 可不实现）
