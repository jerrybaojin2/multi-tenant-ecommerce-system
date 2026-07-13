# 数据库指南

> 本项目的数据库模式与约定。

---

## 概览

自建 Midway.js 后端使用 PostgreSQL。主要租户模型是 shared database，并在每个 tenant-owned table 上包含 tenant column。App-layer tenant scoping 是强制要求；迁移具备后，PostgreSQL RLS 是首选 defense-in-depth 层。

数据库契约以安全优先：

- Tenant-scoped tables 包含 `tenant_id` 和匹配的 application-level `tenantId`。
- Tenant context 从可信 auth/request context 解析一次，然后由 repository/client helpers 使用。
- 业务代码不得从 request bodies 接受 `tenantId` 用于 writes。
- PostgreSQL RLS 应对 tenant-owned tables 默认拒绝。
- Raw SQL 会绕过 helper-level safeguards，除非经过明确 review，否则禁止使用。
- Production 永不使用 schema auto-sync。

---

## Entity 与 Table 规则

- 每个 tenant-owned business table 必须包含 `tenant_id`。
- Platform/global configuration tables 只有在有文档说明并由 platform-only services 保护时，才可以不含 tenant。
- 存储 tenant data 的 plugin-like feature tables 也必须包含 `tenant_id`。
- 对 monetary/status columns 优先添加显式 comments，让 admin tooling 和 generated docs 易于理解。
- 只有当结构有意可变时，才把 flexible rental pricing rules 存入 PostgreSQL `jsonb`；查询关键字段应保持 typed columns。
- 实用时，对 rental availability 使用 PostgreSQL ranges/exclusion constraints。

最小 tenant-scoped shape：

```ts
export interface TenantScopedRow {
  id: string;
  tenantId: string;
  createdAt: Date;
  updatedAt: Date;
}
```

物理列应使用 snake_case（`tenant_id`、`created_at`）；TypeScript properties 应使用 camelCase（`tenantId`、`createdAt`）。

---

## Query 模式

每个请求使用一条已批准的 data-access path：

- 从 `core/tenant` 读取 tenant context 的 tenant-aware repository/client helper。
- 面向 order、rental、payment、deposit 和 inventory workflows 的显式 transaction helpers。
- 面向 cross-tenant reads 的 platform-only repository methods，并由 platform role guards 保护。

默认禁止：

- `repository.query(...)`
- `dataSource.query(...)`
- string-built SQL
- 在 request-scoped business services 中直接使用 global DB client
- 对 tenant-owned writes 接受来自 client input 的 `tenantId`

**CI 守护（PR2 落地）**：`scripts/check-raw-sql.mjs` 扫描 `packages/backend/src/**/*.ts`（排除 `migrations/`、`data-source.ts`、`*.subscriber.ts`），检测 `.query(` 调用并接入根 `npm run check`（`guard:raw-sql`）。唯一放行方式：在 `modules/platform/**` 或 `core/database/rls.ts` 下的文件里加 `// raw-sql: platform-only <reason>` 标记（同方法/向上 3 行内）；标记出现在非允许路径会**单独**报错，不能盲目复制到业务代码。该 lint 层与运行期 `requirePlatformContext()` 角色守护、DB 层 RLS 共同构成三层防御。SQL 字符串拼接检测留待 v2。

例外必须同时满足：

- 操作是 platform-only，或确实是 genuinely cross-tenant。
- 方法位于 platform service 或已批准的 infrastructure helper 中。
- 方法名或注释说明为什么有意绕过 tenant filtering。
- 测试证明 merchant/app users 无法访问该路径。

## 场景：PR0 Tenant Query Guard 契约

### 1. 范围 / 触发

- 触发：PR0 在完整 repository helpers 和 migrations 存在前，建立第一个可执行 tenant-isolation contract。
- 范围：tenant-scoped reads 和 writes 使用的 TypeORM `QueryBuilder` paths。
- 重要边界：`afterSelectQueryBuilder`、`afterInsertQueryBuilder`、`afterUpdateQueryBuilder` 和 `afterDeleteQueryBuilder` 是项目自有的 guard method names。它们不是 TypeORM 标准 `EntitySubscriberInterface` 的一部分，因此不要假设 TypeORM 会自动调用它们。

### 2. 签名

- Guard class：`TenantSubscriber`
- Fixture class：`TenantSubscriberForTest`
- Query guard methods：
  - `afterSelectQueryBuilder(queryBuilder: SelectQueryBuilder<unknown>): void`
  - `afterInsertQueryBuilder(queryBuilder: InsertQueryBuilder<unknown>): void`
  - `afterUpdateQueryBuilder(queryBuilder: UpdateQueryBuilder<unknown>): void`
  - `afterDeleteQueryBuilder(queryBuilder: DeleteQueryBuilder<unknown>): void`
- Tenant context helpers：
  - `getTenantContext(): TenantContext | undefined`
  - `requireTenantId(): string`
  - `isPlatformContext(): boolean`

### 3. 契约

- Environment keys：
  - `DB_HOST`、`DB_PORT`、`DB_USER`、`DB_PASSWORD`、`DB_NAME` 用于 local runtime。
  - `TEST_DB_HOST`、`TEST_DB_PORT`、`TEST_DB_USER`、`TEST_DB_PASSWORD`、`TEST_DB_NAME` 用于真实 PostgreSQL tests。
- 默认数据库名称：
  - Runtime dev database：`rent_dev`
  - Real integration-test database：`rent_test`
- Guard behavior：
  - Merchant/consumer select 会为 active tenant id 添加 tenant predicate。
  - Merchant/consumer insert 会用 active tenant id 覆盖 client-supplied `tenantId`。
  - Merchant/consumer update/delete 会添加 tenant predicate。
  - Platform context 有意不添加 tenant predicate；platform service 和 role guards 必须保护该路径。

### 4. 验证与错误矩阵

- tenant-scoped write 缺少 tenant context -> 写入前抛错。
- Merchant 尝试在 insert 中伪造 `tenantId` -> persisted row 使用 current tenant id。
- Merchant 尝试 update/delete 另一个 tenant 的 row -> affected count 为 `0`。
- root tests 期间 PostgreSQL 不可用 -> real tenant tests 带明确 startup hint 跳过，而 pure isolation tests 仍运行。
- Production config 存在 `synchronize:true` -> `guard:prod-config` 失败。
- Production config 缺少 `appMeta.exposeDevMetadata:false` -> `guard:prod-config` 失败。

### 5. 正例、基线与反例

- 正例：service/repository helper 从 `tenant-context` 读取 tenant id，应用 query guard，并且永不信任 request body tenant field。
- 基线：root `tests/tenant-isolation.test.mjs` 在无数据库情况下验证 isolation semantics。
- 反例：只为暴露自定义 `after*QueryBuilder` methods 而实现 `EntitySubscriberInterface`；TypeORM 并未定义这些 methods，build 不应假装它们会自动调用。
- 反例：把 `TenantSubscriber` 添加到 TypeORM `dataSource.subscribers`；TypeORM 会尝试把它实例化为真实 subscriber，但项目 guard methods 不是 TypeORM lifecycle hooks。

### 6. 必需测试

- Root architecture guard 必须拒绝带 `@cool-midway/*` runtime dependencies 的 backend packages。
- Root production config guard 必须断言 `synchronize:false` 和 `appMeta.exposeDevMetadata:false`。
- Pure isolation tests 必须覆盖 list、get、create、update 和 delete tenant boundaries。
- Real PostgreSQL tests 必须覆盖 select scoping、insert tenant override、update/delete write scoping，以及 platform cross-tenant read behavior。

### 7. 错误 vs 正确

#### 错误

```ts
export class TenantSubscriber implements EntitySubscriberInterface {
  afterSelectQueryBuilder(queryBuilder: SelectQueryBuilder<unknown>) {
    queryBuilder.andWhere('tenantId = :tenantId', { tenantId });
  }
}
```

这声称了一个并不包含项目 guard methods 的 TypeORM interface contract。

#### 正确

```ts
export class TenantSubscriber {
  afterSelectQueryBuilder(queryBuilder: SelectQueryBuilder<unknown>) {
    queryBuilder.andWhere('tenantId = :tenantId', { tenantId });
  }
}
```

在 tenant-aware repository/helper 显式包装并调用这些 methods 之前，把它们视为项目自有 guard hooks。

---

## 租户上下文规则

- Admin requests 从已验证的 admin JWT 获取 tenant context。
- C-end app requests 从 app token 和/或验证后的可信 tenant header 获取 tenant context。
- Payment webhooks 没有 user JWT。从可信 provider fields 解析 tenant，例如 `sub_mchid` 或 channel merchant id，然后用显式 tenant context 执行 updates。
- Scheduled jobs 没有 request context。迭代 eligible tenants，并在隔离 context 中运行单个 tenant 的 work。
- Platform operators 只能通过 platform-role-guarded services 执行 cross-tenant queries。

---

## RLS 指南

迁移系统到位后，对 tenant-owned tables 采用 PostgreSQL RLS。PR2 已在 `demo_resources` 上落地单表原型（migration `1783161601000-demo-resources-rls.ts` + `tests/rls-prototype.test.mjs`），后续租户表按同模式逐表铺。

- 使用不是 table owner、不是 superuser、且没有 `BYPASSRLS` 的 app role（原型用 `rent_app`：`NOSUPERUSER NOBYPASSRLS`）。
- 每个 transaction 使用 `set_config('app.tenant_id', tenantId, true)` 设置 tenant context。TypeORM 经 `queryRunner.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId])` 在事务内下发。
- 添加 `USING` 和 `WITH CHECK` policies，使 read/write 都默认拒绝越权访问。
- policy 的 tenant 比较必须与列类型一致：本项目所有 tenant-owned 表的 `tenant_id` 是 `varchar(64)`（继承 `BaseTenantEntity`），policy 用 **text 比较** `tenant_id = current_setting('app.tenant_id', true)`，**不要 `::uuid` cast**（否则每个查询报 `invalid input syntax for type uuid`）。
- 适当使用 `FORCE ROW LEVEL SECURITY`（原型已开启，使非超级用户的 owner 也受限）。
- Platform maintenance jobs 应使用显式 platform roles 或受控 bypass paths，绝不使用普通 merchant request connections。

**两个关键陷阱（已在原型验证）**：

1. **超级用户绕过 RLS**：app 当前以 `postgres` 超级用户连库（`docker-compose.yml`/`config.default.ts`），超级用户**总是**绕过 RLS，`FORCE ROW LEVEL SECURITY` 也压不住。因此 RLS 测试必须以非超级用户身份执行——原型测试在事务内 `SET LOCAL ROLE rent_app`（postgres 超级用户可 `SET ROLE` 到任意角色，`SET LOCAL` 在 commit 时回退，无跨请求泄漏）。**生产接入 RLS 前，运行期连接必须改用非超级用户 app role**（当前请求生命周期尚未集成 `set_config`，见 §待办）。
2. **幂等 DDL**：role 用 `DO $$ ... EXCEPTION WHEN duplicate_object`；policy 用 `DROP POLICY IF EXISTS` + `CREATE POLICY`；`GRANT`/`ALTER TABLE ... ENABLE/FORCE` 天然幂等。`down()` 反转 policy/RLS/grants，**不要** `DROP ROLE`（后续表/migration 会复用）。

RLS 不替代应用层 scoping；它是针对漏掉 filters 和未来 raw-query mistakes 的数据库兜底。

> **PR2 边界**：原型只证明 DB 契约（non-owner role + policy + 负例），未做请求生命周期集成（`DemoResourceService` 现用 `@InjectEntityModel` + 裸 `createQueryBuilder()` 无 queryRunner，中间件发的 `set_config` 到不了查询连接）。全链路 `set_config` 集成 + 运行期连接改 app role 是独立后续任务。

---

## 事务与状态

- 对 order creation、payment callback handling、rental status transitions、inventory reservation、deposit ledger updates 和 profit sharing state 使用 transactions。
- 状态流转必须 idempotent。使用稳定 keys，例如 payment transaction id、out trade no、rental event id 或 provider callback id。
- 对 concurrent order/rental/funds transitions，锁定 aggregate row，或使用清晰的 optimistic locking/idempotency strategy。
- 不要在 controllers 中直接写 financial side effects。Controllers 调用 services；services emit/handle events 并持久化 ledgers。

---

## 迁移与数据库结构变更

- 添加或修改 tables 的 PR，在 backend skeleton 存在后必须包含 migrations。
- 永远不要依赖 ORM auto-sync 变更 production schemas。
- 优先使用 service-level integrity checks，而不是临时的 foreign-key-free conventions。在它们能保护 money、stock 或 rental availability 时使用 database constraints。
- 以 tenant context 索引 tenant-scoped high-volume lookup columns，例如 tenant + status、tenant + order no、tenant + created time。

**auto-sync 边界**：`synchronize` 仅允许 local/test（`config.local.ts` 为 `true`），**prod 永不**（`config.prod.ts` 为 `false`，由 `scripts/check-prod-config.mjs` 守护并接入根 `npm run check`）。prod 建表/改表一律走 migration：`npm run migration:run` / `migration:revert`（经 `packages/backend/src/core/database/data-source.ts` 的独立 DataSource）。该 DataSource 必须只导出**单个** DataSource 实例（TypeORM CLI 限制），entities/migrations 用类引用数组（非 glob）。TypeORM 0.3.x 的迁移跟踪表名为 `migrations`（非 `typeorm_migrations`）。

---

## 命名约定

- 使用稳定、描述性的 table names；避免在 table names 中使用未来可能变化的产品命名。
- TypeScript property names 保持 camelCase，物理列保持 snake_case。
- Monetary values 使用 integer minor units，除非 provider 要求不同约定。
- Status columns 使用 string constants/enums；不要存储 display labels。

---

## 常见错误

- 把 `tenant_id` 当作 frontend 可以选择的字段。
- 在 services 内使用 global DB client，并忘记 tenant context。
- 编写 raw SQL，静默泄漏跨租户数据。
- 在没有 tenant context 的情况下运行 scheduled jobs。
- 处理 payment callbacks 时没有 tenant resolution。
- Production 中仍启用 schema auto-sync。
