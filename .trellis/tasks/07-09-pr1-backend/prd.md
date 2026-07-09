# PR1 后端 demo resource + guard 接线

## Goal
在 `/admin/merchant`、`/admin/platform`、`/app/consumer` 三路由后建真实 tenant-scoped demo resource，**接线 PR0 未生效的 TenantSubscriber guard**，落地第一条 migration + seed，为 c-frontend / admin-frontend 提供 API 契约。

## 范围
- 新增 tenant-aware repository helper：包装 QueryBuilder 并显式调用 PR0 `TenantSubscriber.after*QueryBuilder`，让 guard 从「骨架」变「生效」
- demo resource（CRUD）：consumer/merchant 走租户隔离；platform 走显式 platform service（不加 tenant predicate）
- 第一条 TypeORM migration：建 `demo_resources` + `tenant_id` index
- seed：至少 2 个租户的 demo 数据
- 保留 prod `synchronize:false`

## 依赖
- PR0（`bb3ca39`）：租户上下文 / middleware / base entity / subscriber 骨架（未接线）

## 验收
- [ ] guard 生效：缺 context 抛错；伪造 tenantId 被覆盖；跨租户 update/delete affected=0；platform 跨租户读走显式服务
- [ ] 隔离回归覆盖 list/detail/update/delete（pure isolation + real PG）
- [ ] migration 存在可跑；seed 可执行
- [ ] `npm run check` / build / lint 通过

## 参考
- 父 PRD：`../07-09-pr1-walking-skeleton/prd.md`
- guard 契约：`.trellis/spec/backend/database-guidelines.md:69-152`
- ORM 决策：`../07-09-pr1-walking-skeleton/research/orm-stack-selection.md`
