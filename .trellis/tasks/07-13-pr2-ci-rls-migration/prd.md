# PR2: CI/Raw SQL 守护 + 迁移骨架 + RLS 原型

## Goal

PR1 三端骨架已交付（commit `37fdc15`）。PR2 在业务表固化（PR3 商品模型）之前，把多租户安全防御从「应用层 guard」推进到「CI 静态守护 + 迁移驱动 + 数据库层 RLS 兜底」三层：用静态守护禁止租户作用域代码写 raw SQL、固化迁移工作流与 auto-sync 边界、并在单张租户表上跑通 PostgreSQL RLS 原型，证明即使应用层漏掉 predicate，数据库仍默认拒绝越权读写。

依据：`.trellis/tasks/07-07-multi-tenant-ecommerce-system/research/mvp-pr-breakdown.md` §PR2；契约细则见 `.trellis/spec/backend/database-guidelines.md`。

## What I already know（已勘察，2026-07-13）

- **ORM 现状**：`@midwayjs/typeorm` + `typeorm@^0.3.20`。租户隔离靠项目自有 guard `TenantSubscriber`（`after*QueryBuilder` 钩子，**非** TypeORM `EntitySubscriberInterface`），由 `TenantAwareRepository`（`packages/backend/src/core/database/tenant-repository.ts`）显式调用。已有 merchant/consumer（`list/getByScope/createScoped/updateScoped/deleteScoped`）与 platform（`listAllForPlatform/getByIdForPlatform`）两套方法。
- **迁移现状**：PR1 已落第一条 migration `1783161600000-init-demo-resources.ts`（建 `demo_resources` 表，`tenant_id varchar(64)`、uuid 主键、created_at/updated_at、tenant_id 索引）。独立 `data-source.ts` 供 CLI（`migration:run/revert`）。prod 配置 `synchronize:false` + `allowExecuteMigrations:true` + `migrationsRun:true`。
- **auto-sync 边界**：`config.local.ts` 本地 `synchronize:true` / `exposeDevMetadata:true`；prod 由 `scripts/check-prod-config.mjs` 守护禁止。规则已隐式存在，PR2 需文档化。
- **守护机制约定**：仓库用**自定义 Node 脚本** `scripts/*.mjs`（`verify-backend-architecture.mjs`、`check-prod-config.mjs`、`check-docker.mjs`），接入根 `npm run check`（= guard:backend-architecture && test && guard:prod-config && check:frontends）与 backend `npm run check`。**无 ESLint**，lint 用 `mwts`。
- **RLS 指南已在 spec**：`database-guidelines.md` §RLS 指南 已写明 app role（非 owner / 非 superuser / 无 BYPASSRLS）、`set_config('app.tenant_id', tenantId, true)`、USING + WITH CHECK、`FORCE ROW LEVEL SECURITY`、平台作业走显式平台角色。
- **租户上下文注入点**：`tenant.middleware.ts` 从可信请求头（`x-tenant-id`/`x-platform-role`）经 `runWithTenantContext` 注入 `AsyncLocalStorage`。
- **测试基座**：根 `tests/`（`guards.test.mjs`、`tenant-isolation.test.mjs`、`real-tenant.test.mjs`，用 `node --test`）。Docker PG `backend-rentPG-1` @ 127.0.0.1:5432，`rent_dev`/`rent_test`。

## Open Questions（待用户定）

1. **[BLOCKING] ORM/迁移栈**：继续 TypeORM vs 切 Drizzle/Prisma。研究已完成（`research/orm-rls-choice.md`），候选方案见下 §候选方案。**唯一需用户拍板的决策**。

## 已解决（研究落定，待写入 Requirements）

2. ~~RLS 原型深度~~ → **选 (A) 窄原型**：用测试拥有的 transaction 证明 DB 契约（non-owner role + policy + 负例）。原因（`research/rls-prototype.md`）：`DemoResourceService` 现用 `@InjectEntityModel` + 裸 `createQueryBuilder()` 无 queryRunner，中间件发的 `set_config` 到不了查询连接；请求生命周期集成留给独立后续任务。
3. ~~Raw SQL 守护机制~~ → **自定义 `scripts/check-raw-sql.mjs`**：贴合现有三个 guard 脚本约定（`{ok,errors,details}` + `stripComments` + `node:test`），allowlist 用路径受限标记 `// raw-sql: platform-only <reason>`；SQL 字符串拼接检测留 v2。基线已干净（`.query(` 仅在 migration）。

## 候选方案（ORM 栈）— 研究结论：推荐 A

**Approach A: 继续 TypeORM 0.3.x**（✅ 推荐）

- 依据：RLS 与 ORM 无关——三者都能在事务内 `set_config('app.tenant_id',$1,true)`，TypeORM 经 `QueryRunner.query()` 在 `dataSource.transaction()` 内完成；PR2 单表原型手写 `CREATE POLICY` 零额外成本。
- `after*QueryBuilder` guard 深度依赖 TypeORM 私有 `QueryBuilder.expressionMap.valuesSet` + alias `andWhere`——**不能移植只能重写**（换 Drizzle=每请求 scoped db 注入 `where.tenantId`；换 Prisma=Client Extension `query` component）。
- 07-09 研究的「切 ORM 几乎不损失能力」前提**已失效**：PR1 已把 guard 接线 + 26 真实 PG 测试 + 真实 migration + service 注入，切换代价比当时点显著上升。
- 风险：`@midwayjs/typeorm` 把仓库钉在 typeorm 0.3.x；TypeORM 1.0 需等 Midway 官方跟进（记为"切换触发条件"）。

**Approach B: 切 Drizzle**

- 优势在 PR3+ 多表规模化时的 schema 级 RLS 建模；PR2 单表原型兑现不了。
- 代价：重写 guard + 手搓 Midway 集成（无官方绑定）+ 迁移现有 migration/测试。

**Approach C: 切 Prisma**

- 与本仓库「应用层 guard + RLS 兜底」双层模型冲突：Client Extension 与 `TenantSubscriber` 角色重叠；Prisma schema 不建模 RLS policy，DDL 仍要手写 raw SQL migration——RLS 维度相对 TypeORM 无净收益。

> 真正的切换触发条件（写入决策）：① Midway 官方长期不跟进 TypeORM 1.0 且 0.3.x 停维；② PR3+ 多表时 Drizzle schema 级 RLS 收益超过重写 guard 成本。两者都未到，PR2 不切。

## Decision (ADR-lite)

- **Context**：PR2 是业务表固化（PR3 商品模型）前切换 ORM 的最后窗口；需决定是否在 PR2 切换到 Drizzle/Prisma。
- **Decision**：**继续 TypeORM 0.3.x**（用户 2026-07-13 确认）。
- **Consequences**：PR2 在 TypeORM 上交付全部价值。切换触发条件留作未来再评估：① Midway 官方长期不跟进 TypeORM 1.0 且 0.3.x 停维；② PR3+ 多表时 Drizzle schema 级 RLS 收益超过重写 guard 成本。详见 `research/orm-rls-choice.md`。

## Requirements（final）

- **R1 raw SQL 静态守护**：新增 `scripts/check-raw-sql.mjs`，扫描 `packages/backend/src/**/*.ts`（排除 `**/migrations/**`、`data-source.ts`、`*.subscriber.ts`），检测 `.query(` 调用；allowlist 用路径受限标记 `// raw-sql: platform-only <reason>`（仅 `modules/platform/**` 与 `core/database/rls.ts` 生效，他处有标记也 FAIL）；接入根 `check`（新增 `guard:raw-sql` 步骤）与 backend `check`。SQL 字符串拼接检测**留 v2**。
- **R2 迁移 / auto-sync 边界文档化**：在 spec 明确「仅 local/test 允许 `synchronize`，prod 永不」（`check-prod-config` 已守 prod 侧）；记录 migration 工作流（`migration:run/revert` + `data-source.ts`）。
- **R3 RLS 单表原型**：新增 migration 建 non-superuser/non-owner/无 BYPASSRLS 角色 `rent_app`（幂等 `DO $$ ... EXCEPTION`），授予 `demo_resources` 必要权限；`ALTER TABLE demo_resources ENABLE ROW LEVEL SECURITY` + `FORCE ROW LEVEL SECURITY`；`CREATE POLICY` 用 **text 比较** `tenant_id = current_setting('app.tenant_id', true)`（**不是 `::uuid`**），含 `USING` + `WITH CHECK`。在 `data-source.ts` 注册新 migration 类。
- **R4 RLS 负例测试**：用测试拥有的 DataSource（连 `rent_test`，以 `rent_app` 身份或 `SET LOCAL ROLE rent_app`）在 transaction 内 `set_config('app.tenant_id', tenantA, true)`，证明：租户 B 行不可见（SELECT）、跨租户 INSERT/UPDATE 被 `WITH CHECK` 拒绝、GUC 未设时默认拒绝。PG 不可用时带清晰 skip hint（沿用 `real-tenant.test.mjs` 模式）。
- **R5 生产守护回归**：保持 `synchronize:false` / `exposeDevMetadata:false` 接入根检查不回退（AC2 回归保护）。
- **R6 spec 更新**：`database-guidelines.md` 增加 raw SQL 守护章节、auto-sync 边界明确化、RLS 原型落地说明、修正 `::uuid` → text 比较。

## Acceptance Criteria（final，对齐 mvp-pr-breakdown §PR2 验收）

- [ ] AC1 故意放置的 raw SQL fixture（`repository.query` / `dataSource.query`）会让 `npm run guard:raw-sql`（进而 `npm run check`）失败；`migrations/` 与 approved 标记路径不误报。
- [ ] AC2 prod 配置出现 `synchronize:true` 或缺 `exposeDevMetadata:false` 时 `guard:prod-config` 失败（PR0 已实现，PR2 回归保护）。
- [ ] AC3 RLS DDL migration 在 `rent_test` 上可幂等执行（连跑两次不报错）。
- [ ] AC4 RLS 负例：以 non-superuser `rent_app` 身份、`set_config` 为租户 A，无法 SELECT/UPDATE/DELETE 租户 B 的行；GUC 未设时默认拒绝。
- [ ] AC5 raw SQL guard 自身有 `node --test` 单测（沿 `tests/guards.test.mjs` 模式，含正例/反例/标记放行/误报）。
- [ ] AC6 全量 `npm run check` 绿（含三端）。

## Definition of Done

- R1–R6 全部落地，AC1–AC6 全绿。
- 新增 guard 脚本 + root 单测；RLS migration + 真实 PG 负例测试。
- spec 更新（`database-guidelines.md`）。
- lint / typecheck / `npm run check` 全绿。
- 本地 commit（沿用 `[AI-Assisted]` 前缀）。

## Implementation Plan（agent team 并行）

- **Stream A（raw SQL 守护）**：`scripts/check-raw-sql.mjs` + `tests/raw-sql-guard.test.mjs`（或并入 `tests/guards.test.mjs`）+ 根 `package.json` 增 `guard:raw-sql` 并接入 `check` + backend `check`。拥有文件：`scripts/check-raw-sql.mjs`、`tests/raw-sql-guard.test.mjs`、根 `package.json`、`packages/backend/package.json`。
- **Stream B（RLS 原型）**：新 migration（`rent_app` role + policy + FORCE RLS，text 比较）+ 注册到 `data-source.ts` + `tests/rls-prototype.test.mjs`（真实 PG 负例）。拥有文件：`packages/backend/src/core/database/migrations/<ts>-demo-resources-rls.ts`、`data-source.ts`、`tests/rls-prototype.test.mjs`。
- **收口（主代理）**：更新 `database-guidelines.md`（raw SQL 守护 + auto-sync 边界 + RLS 落地 + uuid→text 修正）；跑全量 `npm run check`；自修；commit。

## Expansion（diverge → converge，已折进范围）

- **Future**：RLS 随 PR3+ 逐表铺（每张租户表一条 policy migration）；请求生命周期 `set_config` 集成（改 `DemoResourceService` 用 queryRunner）= 独立后续任务（**out of scope**）；raw SQL 字符串拼接检测 v2（**out of scope**）。
- **Related**：三层防御对齐——lint 层（raw SQL guard）+ 运行期角色层（`requirePlatformContext()`）+ DB 层（RLS）。allowlist 标记的运行期同伴守护（role check + 403 测试）由 review checklist + 测试保证，不在 guard 脚本内。
- **Edge**（已被研究捕获，写入 R3/R4）：超级用户绕过 RLS（测试必须 non-superuser）；`::uuid` cast 报错（用 text）；幂等 DDL（`DO $$ EXCEPTION` / `DROP POLICY IF EXISTS`）；GUC 未设默认拒绝（负例覆盖）；PG 不可用清晰 skip。

## Out of Scope（explicit）

- 全表 RLS 覆盖（仅 `demo_resources` 单表原型）。
- 请求生命周期 `set_config` 集成（独立后续任务——需重构 service 用 queryRunner）。
- ORM 切换（PR2 继续 TypeORM；切换单独立任务）。
- ESLint 全量引入（自定义脚本已足够）。
- SQL 字符串拼接检测（v2）。
- CI 平台接线（本 PR 只保证本地 `npm run check`）。

## Research References（已完成）

- `research/orm-rls-choice.md` — 结论 keep TypeORM；RLS 与 ORM 无关；guard 不可移植；07-09「切换低成本」前提已失效。
- `research/raw-sql-guard.md` — 结论自定义 `scripts/check-raw-sql.mjs`；路径受限 `// raw-sql: platform-only` 标记；基线干净；拼接检测留 v2。
- `research/rls-prototype.md` — DDL recipe + set_config；**超级用户绕过 RLS**（测试必须 non-superuser）；**text 比较**（非 uuid）；请求生命周期集成留后续。

## Technical Notes

- `demo_resources.tenant_id` 是 `varchar(64)`（所有租户表继承 `BaseTenantEntity`）→ RLS policy 按 **text** 比较 `current_setting('app.tenant_id', true)`，不能 `::uuid`。
- **app 现以 `postgres` 超级用户连库**（`docker-compose.yml`/`.env.example`/`config.default.ts`）→ 超级用户总绕过 RLS，FORCE 也压不住；RLS 测试必须用非超级用户 `rent_app`（`SET LOCAL ROLE` 或独立 DataSource）。
- `data-source.ts` 只能导出**单个** DataSource 实例（TypeORM CLI 限制），entities/migrations 必须用类引用数组；新 migration 类要在 `migrations: []` 注册。
- `TenantSubscriber` 不得放入 `dataSource.subscribers`。
- 现有 guard 脚本约定：`OK ...` / `FAIL ...` 输出 + `process.exitCode = 1`；去注释后判定（复用 `stripComments`）。
- 测试约定：`node --test`，PG 不可用时清晰 skip（见 `tests/real-tenant.test.mjs`）；环境变量 `TEST_DB_*` 指向 `rent_test`。
- 相关文件：`scripts/*.mjs`、`tests/*.test.mjs`、`packages/backend/src/core/database/{data-source.ts,migrations/}`、`packages/backend/src/config/config.{default,local,prod}.ts`、`.trellis/spec/backend/database-guidelines.md`、`AGENTS.md`。
