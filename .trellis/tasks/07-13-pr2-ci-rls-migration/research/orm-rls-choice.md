# Research: ORM/迁移栈选择（TypeORM vs Drizzle vs Prisma）——以 PostgreSQL RLS 为视角

- **Query**: PR2 是业务表固化（PR3 商品/SKU 模型）前最后一个干净切换窗口。是否应该从现状 TypeORM 0.3.x 切到 Drizzle 或 Prisma？评估维度：(1) 维护态与多租户实战记录；(2) 每事务注入租户上下文给 RLS 的能力（`SET LOCAL` / `set_config('app.tenant_id', $1, true)`）；(3) 迁移工具链与 RLS policy DDL 契合度；(4) 与 Midway.js 3.x 的集成成本；(5) 从现状 TypeORM 基线迁移的代价（尤其是 `after*QueryBuilder` 租户 guard 模式）。
- **Scope**: mixed（内部代码/测试/spec 已实测 + 外部 ORM/RLS 知识，承接 07-07 与 07-09 两份既有研究）
- **Date**: 2026-07-13

---

## 摘要（决策）

- **推荐：PR2 继续 TypeORM 0.3.x + `@midwayjs/typeorm`，在 TypeORM 上交付 RLS 原型。不切换 Drizzle/Prisma。**
- 一句话理由：**RLS 本身与 ORM 无关**（纯 PostgreSQL `CREATE POLICY` + `set_config('app.tenant_id', $1, true)`），三个 ORM 都能在事务内注入 RLS 上下文；而 PR1 之后切换代价已显著上升（guard 已接线 + 26 个真实 PG 测试 + 真实 migration + service 已用 `@InjectEntityModel`），Drizzle/Prisma 又都缺少 Midway 官方绑定。PR2 的实际交付物（raw SQL 守护脚本 + 单表 RLS 原型）在 TypeORM 上零损耗，Drizzle 的 schema 级 RLS 原语（`withRLS()`/`policy()`）只在 PR3+ 多业务表规模化时才兑现价值。
- **关键判断纠偏**：PRD 把 PR2 框定为「最后干净窗口」是对的，但「窗口」不等于「必须切」。真正会让人想切 Drizzle 的诱因（`tstzrange` exclusion 防重订、JSONB 灵活计价、schema 级 RLS）都是 PR3+ 才出现的需求，PR2 的单表 RLS 原型根本不触及它们。在 RLS 维度，三者等价；在 Midway 集成维度，TypeORM 唯一有官方绑定。

---

## Findings

### 0. 现状基线（2026-07-13 实测，PR1 已交付）

PR1 已合并（commit `37fdc15`）。与 07-09 研究时点的「guard 未接线、0 migration」相比，TypeORM 投入面已**实际生效并测试覆盖**：

| 维度 | 实测 | 文件:行 |
|---|---|---|
| `@Entity` 实体 | 1 | `modules/demo-resource/entity/demo-resource.entity.ts` |
| `BaseTenantEntity`（`@PrimaryGeneratedColumn('uuid')` + `tenant_id` + `created_at`/`updated_at`） | 1 | `core/database/base-tenant.entity.ts:9-22` |
| 项目自有 guard `TenantSubscriber`（`afterSelectQueryBuilder`/`afterInsertQueryBuilder`/`afterUpdateQueryBuilder`/`afterDeleteQueryBuilder`） | 已存在且**已被显式调用** | `core/database/tenant.subscriber.ts:13-58` |
| `TenantAwareRepository`（包装 `Repository<T>` + `QueryBuilder`，显式调用 guard） | merchant/consumer 5 方法 + platform 2 方法 | `core/database/tenant-repository.ts:30-158` |
| 真实 TypeORM migration | 1（`demo_resources` 表 + uuid-ossp + tenant_id 索引） | `core/database/migrations/1783161600000-init-demo-resources.ts:10-38` |
| 独立 CLI DataSource | 1（`synchronize:false`，单 DataSource export 契约） | `core/database/data-source.ts:20-31` |
| `@midwayjs/typeorm` 组件注册 | `configuration.ts` imports `orm` | `src/configuration.ts:2,23` |
| service 注入 | `@InjectEntityModel()` + `Repository` | `modules/demo-resource/service/demo-resource.service.ts` |
| prod 配置 | `synchronize:false` + `allowExecuteMigrations:true` + `migrationsRun:true` | `config/config.prod.ts:4-22` |
| 租户上下文（`AsyncLocalStorage<TenantContext>`，role 解析） | 已存在，**与 ORM 解耦** | `core/tenant/tenant-context.ts:13-45`、`core/tenant/tenant.middleware.ts` |
| 测试 | 真实 PG 测试套件（PRD §What I already know 称 26 个真实 PG 测试绿） | `packages/backend/test/real-demo-resource.test.ts`、`packages/backend/test/real-tenant/`、`tests/real-tenant.test.mjs`、`tests/tenant-isolation.test.mjs` |
| Drizzle / Prisma | **均未安装**，业务代码零引用 | `packages/backend/package.json:6-19`；全仓 grep 无命中 |
| RLS 实现 | **零**（仅 spec 有指南） | grep `row.level\|RLS\|set_config\|FORCE ROW LEVEL\|BYPASSRLS` 命中仅 spec 文档 |

**与 07-09 研究的关键差异（直接影响本次决策）**：07-09 当时论证「切 ORM 几乎不损失已实现的运行期能力」，依据是「PR0 guard 未被任何 helper 调用、是未生效骨架」。**这个前提在 PR1 之后已失效**——guard 已被 `TenantAwareRepository` 接线并经真实 PG 测试验证。因此现状切换代价不再是「4 个文件 + 未接线的骨架」，而是「已生效的 guard + 已绿的真实 PG 测试断言 + 真实 migration + 已注入的 service」。

---

### 1. 维护态与多租户实战记录（2026）

> 版本号与维护态判断承接 07-07 研究（`07-07-multi-tenant-ecommerce-system/research/backend-orm-db.md:21-35`）与 07-09 研究（§2、§4 表）。本会话无联网检索，未独立复核当日最新版本号；下方为基于官方文档与 2025 社区共识的分析判断。

**TypeORM 0.3.x（本仓库锁 `^0.3.20`）**
- 0.3.x 处于**维护模式**：TypeORM 1.0 已于 2025 发布，0.3 线以 bugfix 为主，节奏慢。
- **关键绑定约束**：`@midwayjs/typeorm@3.20.x` 构建在 typeorm 0.3.x 之上。升 TypeORM 1.0 需等 Midway 官方组件跟进，否则 DI/config 链断裂。这把本仓库「钉」在 0.3.x。
- 多租户实战：广泛使用，但**全局读过滤非自动**——`Repository.find()`、`relations`、lazy loading 都不遵守自定义 filter，泄漏面大。这正是本仓库自建 `TenantAwareRepository` 强制走 `QueryBuilder` 的根本原因（`tenant-repository.ts:30-158` 把 list/get/create/update/delete 全部收口到包装后的 QB）。

**Drizzle ORM（v1 GA late 2025）**
- 极活跃、资金充足、发展快。无 query engine、无 reflect-metadata，runtime 最轻，schema 即类型。
- 多租户 + RLS 是**一等公民**：`pgTable.withRLS()`、`policy()`、`role()` 直接在 schema 表达 RLS（07-07 研究 §6a 有代码草图）。为 Neon/Supabase 式 RLS 设计。
- 在 Midway.js 上**无成熟社区样板**（07-09 研究 §Caveats 明确「未找到」first-party 文档）。

**Prisma（v7，2025+；Prisma Next early access）**
- 活跃、商业支持。迁移工具链（Prisma Migrate：声明式 schema + shadow DB + history）三者中最成熟、打磨度最高。
- 多租户：**Client Extensions `query` component** 是官方文档点名的「RLS / user isolation」模式（`$extends({ query })` 拦截 `findMany/count/updateMany/deleteMany` 注入 `where.tenantId`）。raw `$queryRaw` 绕过 extension。
- 运行时最重（Rust query engine 进程）。在 Midway.js 上同样**无官方绑定**。
- **Prisma schema 不原生表达 RLS policy**——Prisma Migrate 不建模 RLS，policy DDL 要靠 migration 里的 raw SQL 补（见 §3）。

---

### 2. 每事务注入 RLS 租户上下文的能力（核心维度）

RLS 的唯一运行期要求（spec `database-guidelines.md:166-176` 已锁定）：每个事务起始执行 `SELECT set_config('app.tenant_id', $1, true)`（第三参 `true` = `is_local`，事务级，PgBouncer transaction pooling 下安全）。**这一步与 ORM 无关**，差别只在三个 ORM 用什么 API 把它塞进事务。

#### TypeORM —— `QueryRunner` 在 `dataSource.transaction(...)` 内

```ts
// 可行，boilerplate 略多但完全 workable
const qr = dataSource.createQueryRunner();
await qr.connect();
await qr.startTransaction();
try {
  // 事务级 RLS 上下文：true = 仅本事务生效
  await qr.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
  // 后续所有经 qr.manager 的查询都受 RLS policy 约束
  const repo = qr.manager.getRepository(DemoResourceEntity);
  await repo.find();
  await qr.commitTransaction();
} finally {
  await qr.release();
}
```

- 与 `@midwayjs/typeorm` 的接合点：组件注入 DataSource/EntityManager（具体装饰器名以 `@midwayjs/typeorm` 文档为准，运行期能力确定存在）；`TenantAwareRepository` 当前走的是 `repository.createQueryBuilder()` 路径，要挂 RLS 需新增一个「请求级 `QueryRunner` provider」并把 repo 方法切到 `qr.manager`。**这是 PR2 RLS 原型（方案 B 全链路）的核心改动面，与 ORM 选型无关**——换 Drizzle/Prisma 同样要改这一层。
- RLS 兜底**与应用层 guard 并存**：`TenantSubscriber.after*QueryBuilder` 仍生效（追加 `tenantId = :tenantId` predicate），RLS 是漏网时的数据库兜底。两层独立。

#### Drizzle —— `db.transaction(tx => ...)`，最顺手

```ts
await db.transaction(async (tx) => {
  await tx.execute(sql`SELECT set_config('app.tenant_id', ${tenantId}, true)`);
  // tx 内所有查询自动 RLS-scoped；业务代码完全不写 tenant_id
  return tx.select().from(demoResources);
});
```

- tx 显式作用域，与每 tx `set_config(..., true)` 天然配合；schema 里 `withRLS()` + `policy()` 让 RLS 成为声明式事实。
- 配合现有 `AsyncLocalStorage<TenantContext>`：middleware 内开 tx、`set_config`、把 `tx` 放进 context，业务侧 `getTenantDb()` 取 `tx`（07-07 研究 §6b/6c 草图）。

#### Prisma —— `$transaction` + `$executeRaw`，可行但别扭

```ts
await prisma.$transaction(async (tx) => {
  await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
  // tx.findMany(...) 受 RLS 约束
  return tx.demoResource.findMany();
});
```

- 能做，但 Prisma 的**单 app role 连接模型**让 per-tenant RLS 比 Drizzle 别扭（07-07 研究 §7 备选 1、07-09 研究 §3 Approach C Cons）。
- Client Extensions 的 `query` component 做的是**应用层过滤**（注入 `where.tenantId`），这与 RLS（数据库层）是**竞争而非互补**——若同时开，应用层已过滤则 RLS 永不触发兜底，反而弱化了「RLS 作为漏网兜底」的价值。本仓库已用 `TenantSubscriber` 做应用层过滤，再加 Prisma Client Extension 会重复一层。

**§2 结论**：三者都能做事务级 RLS 上下文。TypeORM 的 `QueryRunner` 路径稍多 boilerplate，但**对本仓库无功能损失**——RLS 的价值（漏网时数据库兜底、default-deny）在三个 ORM 上完全等价。Drizzle 最优雅，Prisma 因 Client Extension 与 RLS 角色重叠反而最不契合本仓库的「应用层 guard + RLS 兜底」双层模型。

---

### 3. 迁移工具链与 RLS policy DDL 契合度

| 维度 | TypeORM 0.3.x（现状） | Drizzle | Prisma |
|---|---|---|---|
| 风格 | SQL-in-TS（手写或 `migration:generate`） | 声明式 schema → `drizzle-kit generate` 出 plain SQL | 声明式 schema + Prisma Migrate（shadow DB） |
| 现有 RLS DDL 落位 | `queryRunner.query('CREATE POLICY ...')`、`ALTER TABLE ... ENABLE ROW LEVEL SECURITY` —— 与现有 `CREATE TABLE` 同一 `MigrationInterface.up` 路径（见 `1783161600000-init-demo-resources.ts:13-31` 已用的 `queryRunner.query`） | `withRLS()`/`policy()`/`role()` 写在 schema，`drizzle-kit generate` 自动产 RLS DDL | **Prisma schema 不建模 RLS**——policy DDL 必须手写 raw SQL migration，Prisma Migrate 不覆盖 |
| 迁移成熟度 | 中 | 好（plain SQL，完全可控） | 最成熟 |
| 本仓库现状 | **已在用**：`data-source.ts` CLI runner + `migrationsRun:true` + `allowExecuteMigrations:true`（`config.prod.ts:5-19`） | 需新建 `drizzle-kit` 工作流 | 需新建 `prisma migrate` 工作流 + shadow DB |

**关键**：RLS policy DDL 在 TypeORM migration 里就是多几行 `queryRunner.query('CREATE POLICY demo_tenant_isolation ON demo_resources FOR ALL TO app_role USING (tenant_id = current_setting(\'app.tenant_id\', true)) WITH CHECK (...)')` + `ALTER TABLE demo_resources ENABLE ROW LEVEL SECURITY`。这与 PR1 已经写的 `CREATE EXTENSION` / `CREATE TABLE` / `CREATE INDEX` 是**同一个 API、同一个文件**。PR2 的 RLS 原型在 TypeORM 上零额外工具成本。Drizzle 的 schema 级 RLS 原语更优雅，但只在**多表规模化**时才省事；PR2 单表原型，手写 DDL 反而更直观可控。

---

### 4. 与 Midway.js 3.x 的集成成本

| 维度 | TypeORM | Drizzle | Prisma |
|---|---|---|---|
| 官方组件 | **`@midwayjs/typeorm`**（`configuration.ts:2,23` 已用） | 无 | 无 |
| DI / 配置 / 生命周期 | 现成：`@InjectEntityModel`、`config.typeorm.dataSource`、组件 `onStarter` 钩子 | **全部自建**：`@Provide()` provider 暴露 `getTenantDb()`、middleware 注入、DataSource 生命周期、与 Midway config 体系对接 | **全部自建**：Prisma Client singleton + 每请求 `$extends` + 生命周期对接 Midway |
| 现有约定改写面 | 无 | 改 `configuration.ts`、3 个 config、`configuration` 的 imports；删 `@midwayjs/typeorm` | 同左 |
| 团队样板 / 社区先例 | 官方文档 + 本仓库 README/cursor rules/snippets/spec 全部已基于此 | 07-09 研究 §Caveats：「Drizzle/Prisma 在 Midway.js 上的成熟集成样板，未找到权威 first-party 文档」 | 同左 |

**本仓库已有可复用、与 ORM 解耦的脚手架**：`AsyncLocalStorage<TenantContext>`（`tenant-context.ts:13-45`）+ role 解析 middleware。这意味着即便切 Drizzle/Prisma，租户上下文那一半不用动；但 ORM 与 Midway 的 DI/config/生命周期绑定那一半必须从零写，且无社区样板可抄。

---

### 5. 从 TypeORM 基线迁移的代价（重点：`after*QueryBuilder` guard）

#### 5.1 guard 模式不能「移植」，只能「重写」

`TenantSubscriber`（`tenant.subscriber.ts`）深度依赖 TypeORM 的 `QueryBuilder` 形状：
- `afterSelectQueryBuilder` 用 `queryBuilder.alias` + `andWhere('${alias}.tenantId = :tenantId', ...)`（`:13-25`）。
- `afterInsertQueryBuilder` 直接改 `queryBuilder.expressionMap.valuesSet`（单条/数组两种分支），强制覆盖 `tenantId`（`:27-43`）。`expressionMap.valuesSet` 是 TypeORM 私有内部结构。
- `TenantAwareRepository` 把每个方法都建 `createQueryBuilder()` 并强转后调 guard（`tenant-repository.ts:37-116`）。

这套 guard **是 TypeORM QueryBuilder 专属形状**，换 ORM 不是「换接口名」，而是「换隔离范式」：
- **Drizzle** 等价物 = 每请求 scoped `db`，在 `pgTable` select/insert/update 上由 middleware 或 client wrapper 注入 `where tenantId = $1` / 强制 `values.tenantId`。没有 QueryBuilder 概念，guard 逻辑要重新设计。
- **Prisma** 等价物 = Client Extensions `$extends({ query })`，在 `findMany/findFirst/count/updateMany/deleteMany` 上注入 `where.tenantId`、在 `create/createMany` 上覆盖 `data.tenantId`。范式不同，guard 要按 extension API 重写。
- 平台态豁免（`tenantIdForRead/Write` 在 `isPlatformContext()` 时返回 `undefined` 不加 predicate）也要在新范式里重新表达。

#### 5.2 需要改写/删除的文件清单（实测）

ORM 耦合、切栈必改：
- `core/database/base-tenant.entity.ts`（`@PrimaryGeneratedColumn` 等 decorator → Drizzle `pgTable` / Prisma `model`）
- `core/database/tenant.subscriber.ts`（整个 guard 重写，见 §5.1）
- `core/database/tenant-repository.ts`（`Repository<T>` + `QueryBuilder` 包装 → Drizzle scoped db / Prisma extension client）
- `core/database/data-source.ts`（`new DataSource` + `MigrationInterface` → `drizzle-kit` / `prisma migrate` runner）
- `core/database/migrations/1783161600000-init-demo-resources.ts`（`MigrationInterface` + `queryRunner.query` → 目标 ORM migration 格式）
- `modules/demo-resource/entity/demo-resource.entity.ts`（`@Entity`）
- `modules/demo-resource/service/demo-resource.service.ts`（`@InjectEntityModel` + `Repository`）
- `src/configuration.ts`（`imports: [orm]` → 自建 provider 注册）
- `config/config.default.ts`、`config/config.local.ts`、`config/config.prod.ts`（`typeorm.dataSource` 配置块 → 新 ORM 配置；同时重写 `guard:prod-config` 对 `synchronize:false` 的文本断言，见下）

与 ORM 解耦、零成本保留（**不**是切换成本）：
- `core/tenant/tenant-context.ts`、`core/tenant/tenant.middleware.ts`（`AsyncLocalStorage` + role 解析）
- `core/errors/business-error.ts`、filters
- root `tests/guards.test.mjs`、`tests/tenant-isolation.test.mjs`（纯隔离语义，不碰 DB）

#### 5.3 测试与守护脚本的重写代价（容易被低估）

- **真实 PG 测试套件**（`real-demo-resource.test.ts`、`real-tenant/`、`real-tenant.test.mjs`，PRD 称 26 个绿）：这些断言走 TypeORM `QueryBuilder` 路径验证 guard 行为（select scoping、insert tenant override、update/delete write scoping、platform cross-tenant read）。切 ORM 后，断言对象（`createQueryBuilder` / `expressionMap.valuesSet` 覆盖）不存在，**断言要按新 ORM 的查询/写入 API 重写**，不是改 import。
- **`scripts/check-prod-config.mjs`** 用 regex 断言 `config.prod.ts` 里 `synchronize:false`。切 Drizzle（无 `synchronize` 概念）或 Prisma（`db push` 是另一回事）后，这条守护要重新定义语义——「永不 auto-sync schema」在 Prisma 下对应禁止 `prisma db push` 在 prod、在 Drizzle 下对应只用 `migrate` 不用 `push`。
- **spec**（`database-guidelines.md` §PR0 guard 契约、§Query 模式、§迁移）大量描述 TypeORM `QueryBuilder` / `Repository.find()` 禁用，切栈要整体改写。
- README、`.cursor/rules/db.mdc`、`.vscode/entity.code-snippets` 全基于 TypeORM。

#### 5.4 切换代价随 PR 推进而增长

07-09 研究曾判定「迁移面仍是这 4 个文件 + 配置 + 约定，代价可控」。PR1 之后这个判断需要更新：文件数仍是 ~7-9 个，但**每个文件的「已生效 + 已测试」属性**让重写代价从「改骨架」升级为「改已验证的运行期逻辑 + 重写其测试断言」。PR3（商品/SKU 模型）之后会再多 N 个 entity/service/migration，代价进一步上升。**这是 PR2 作为「最后干净窗口」的真实含义**——但如摘要所述，窗口存在不等于应该此刻跳。

---

## 推荐：KEEP TypeORM（PR2 不切换）

**理由（绑定本仓库约束）：**

1. **RLS 与 ORM 无关**——三个 ORM 都能在事务内 `set_config('app.tenant_id', $1, true)`（§2）。TypeORM 经 `QueryRunner.query(...)` 在 `dataSource.transaction(...)` 内完成，boilerplate 略多但零功能损失。PR2 RLS 原型的安全价值在三者上**完全等价**。把 RLS 当作切 ORM 的理由是误判：RLS policy 是 PostgreSQL DDL，不是 ORM 能力。

2. **切换代价在 PR1 后显著上升**（§0、§5）——guard 已接线并经 26 个真实 PG 测试覆盖、真实 migration 已落、service 已用 `@InjectEntityModel`。07-09「几乎不损失已实现能力」的前提已失效。切 Drizzle/Prisma = 重写 guard（§5.1，非移植）+ 重写真实 PG 测试断言 + 重写 migration + 重写 3 个 config + 改 spec/守护脚本。

3. **Midway 官方绑定是硬约束**（§4）——`@midwayjs/typeorm` 现成 DI/config/lifecycle；Drizzle/Prisma 都要自建 provider/middleware/config 对接，且无 Midway 社区样板（07-09 §Caveats「未找到」）。PR2 是安全交付 PR，不该背数据层重构 + 自研 ORM 集成的双重风险。

4. **Drizzle 的 RLS/schema 优势在 PR2 不兑现**——`withRLS()`/`policy()` 的省事效果只在多业务表规模化（PR3+）时显现；PR2 是单表 RLS 原型，手写 `CREATE POLICY` 在 TypeORM migration 里就是几行 `queryRunner.query(...)`，与现有 `CREATE TABLE` 同 API（§3）。Drizzle 真正的杀手锏是 `tstzrange` exclusion 防重订 + JSONB 灵活计价，这些是 PR3+ 需求，不是 PR2 需求。

5. **Prisma 与本仓库双层模型冲突**（§2）——Client Extension 做应用层过滤，与 `TenantSubscriber` 应用层 guard 角色重叠；而 Prisma schema 不建模 RLS policy（§3），RLS DDL 仍要手写 raw SQL migration。在 RLS 维度，Prisma 相对 TypeORM 无净收益，却要付最重 runtime + 自建集成代价。

### 现在切 vs 推迟的风险对比

| | 现在切（PR2） | 推迟（保持 TypeORM） |
|---|---|---|
| PR2 交付物（raw SQL 守护 + 单表 RLS 原型） | 被数据层重构 + 自研 Midway 集成拖累，安全交付延期 | 在 TypeORM 上零摩擦交付，`QueryRunner` + `set_config` 即可 |
| RLS 运维经验（app role / FORCE RLS / PgBouncer tx pooling 下的 `set_config(..., true)`） | 在新 ORM + 自建集成上同时学，故障面叠加 | 在已稳定的 TypeORM 上先跑通单表，把 ops 模型（non-owner role、`BYPASSRLS` 禁用、`FORCE ROW LEVEL SECURITY`）验证清楚 |
| 切换触发条件评估 | 缺数据：还不知道 PR3 商品模型是否真需要 `tstzrange`/JSONB killer features | PR3 模型确定后再评估，有真实 RLS 运维数据支撑决策 |
| 切换面大小 | ~7-9 文件 + 26 测试断言 + 3 config + spec/脚本 | 同样 ~7-9 文件（entity/service/migration 数随 PR3 增长），但届时已有 RLS 原型可移植 |

### 保留的切换触发条件（写入 PRD 决策日志，承接 07-09 §5）

满足以下任一，在**该时点**单独立任务评估切 Drizzle（不放在 PR2）：
1. PR3 商品/SKU 模型**确实**大量需要 `tstzrange` exclusion（租赁防重订）或复杂 JSONB 计价规则，且 TypeORM 0.3 的 PG 专属类型 DX 成为瓶颈。
2. `@midwayjs/typeorm` 长期不跟进 TypeORM 1.0，且 0.3.x 安全/关键 bug 停修。
3. RLS 原型上线后发现 TypeORM `QueryRunner` 事务模型与请求级 RLS context 集成存在结构性障碍（目前预判无，但 PR2 原型会给出实证）。

届时迁移面仍是 §5.2 的 ~7-9 文件 + 真实 PG 测试断言，且届时已有 TypeORM 版 RLS policy 可直接移植到新 ORM 的 migration——代价可控。

---

## Related Specs

- `.trellis/spec/backend/database-guidelines.md:46-67` —— Query 模式：禁用 `repository.query`/`dataSource.query`/字符串 SQL；例外四条件。
- `.trellis/spec/backend/database-guidelines.md:73-152` —— PR0 guard 契约：`after*QueryBuilder` 是项目自有钩子（非 TypeORM `EntitySubscriberInterface`），必须由 helper 显式调用；`TenantSubscriber` 不得入 `dataSource.subscribers`。
- `.trellis/spec/backend/database-guidelines.md:166-176` —— RLS 指南：non-owner/non-superuser/no-`BYPASSRLS` app role、`set_config('app.tenant_id', tenantId, true)`、USING + WITH CHECK、`FORCE ROW LEVEL SECURITY`、RLS 不替代应用层 scoping。
- `.trellis/spec/backend/database-guidelines.md:189-195` —— 迁移与 schema 变更规则（永不依赖 auto-sync）。
- `.trellis/spec/backend/quality-guidelines.md:19,52,59` —— raw SQL 拦截 + PR2 deadline。
- `.trellis/spec/backend/directory-structure.md:36-41` —— 预留 `core/database/rls.ts`（未来 `set_config` 基础设施 helper）。

## Related Prior Research（本仓库内）

- `.trellis/tasks/07-07-multi-tenant-ecommerce-system/research/backend-orm-db.md` —— 原始 ORM 对比（主选 Drizzle + PG + RLS），§6 代码草图、§7 备选 1（Prisma）/备选 2（TypeORM）。本文件在其上叠加 RLS-视角与 PR1 后现状。
- `.trellis/tasks/archive/2026-07/07-09-pr1-walking-skeleton/research/orm-stack-selection.md` —— PR1 决策（keep TypeORM），§1 现状投入表、§5 推荐与切换触发条件。本文件更新其「guard 未接线」前提。
- `.trellis/tasks/07-13-pr2-ci-rls-migration/research/raw-sql-guard.md` —— 同任务 sibling 研究：raw SQL 静态守护机制（推荐自定义 `.mjs` guard），与本文档的 TypeORM 决策一致。
- `.trellis/tasks/07-13-pr2-ci-rls-migration/prd.md` —— PR2 PRD，§Open Questions Q1（本文档回答）、Q2（RLS 原型深度，待 `rls-prototype.md`）。

## External References

> 本会话无联网检索工具。以下为三方 ORM/PG 官方文档的稳定链接，引用前请在 PR 描述中复核。

- PostgreSQL Row Security Policies（default-deny、ENABLE/FORCE RLS、BYPASSRLS、TRUNCATE/REFERENCES bypass、`set_config` 的 `is_local` 语义）— https://www.postgresql.org/docs/current/ddl-rowsecurity.html
- TypeORM Migrations（`QueryRunner.query()` 是 migration 的 raw-SQL 正典入口）— https://typeorm.io/migrations
- TypeORM QueryBuilder（`TenantSubscriber` guard 依赖的 `expressionMap.valuesSet` / alias / `andWhere`）— https://typeorm.io/query-builder
- Drizzle ORM Row-Level Security（`withRLS`/`policy`/`role`，Neon/Supabase 风格）— https://orm.drizzle.team/docs/rls
- Drizzle transactions（`db.transaction(tx => ...)` 显式作用域）— https://orm.drizzle.team/docs/transactions
- Prisma Client Extensions（`query` component，官方点名的 RLS/user-isolation 模式）— https://www.prisma.io/docs/orm/prisma-client/client-extensions/query
- Prisma `$transaction`（interactive，与 `$executeRaw` 配合设 RLS context）— https://www.prisma.io/docs/orm/prisma-client/queries/transactions
- 来源版本（07-07 实测，未本会话复核）：Prisma 7.8.0 / TypeORM 1.0.0（本仓库锁 0.3.20）/ Drizzle 0.45.2

## Caveats / Not Found

- **本会话无联网检索**：ORM 版本号、维护态、2026 多租户实战记录均承接 07-07 与 07-09 两份既有研究（同样无联网），未独立复核当日最新版本。`@midwayjs/typeorm` 是否已跟进 TypeORM 1.0、Drizzle/Prisma 是否出现新的 Midway 社区绑定——这两点若要写入 PR 描述，需在能联网的环境补充核验。但这两点只影响「触发条件」的触发时机，不影响「PR2 不切」的核心结论（结论建立在 RLS 与 ORM 无关 + 已生效 guard 重写代价上，与版本号无关）。
- **`@midwayjs/typeorm` 注入 DataSource 的精确装饰器**：本文件描述的是 TypeORM 层面的 `QueryRunner` API（权威），以及「`@midwayjs/typeorm` 提供 DataSource 访问」的运行期能力。具体装饰器名（是否为 `@InjectDataSource()` 或经 `@InjectEntityModel` 取底层 DataSource）未从 `@midwayjs/typeorm` 源码核验；PR2 RLS 原型方案 B（全链路 `QueryRunner` 集成）落地时需先确认此接合点。
- **PR2 RLS 原型深度（PRD Q2）**：方案 A（仅证明 policy 对 non-owner role 生效，测试内手动 `set_config`）vs 方案 B（全链路 middleware 注入请求级 `QueryRunner` 并 `set_config`）的取舍，属 `research/rls-prototype.md` 职责，本文档不展开。但无论 A/B，都不影响「保持 TypeORM」结论——B 的 `QueryRunner` 集成改动面与 ORM 选型无关。
- **未评估 Kysely / Sequelize**：PRD 明确选项为 TypeORM/Drizzle/Prisma 三选一；Sequelize 因 `.unscoped()` + TS 弱已在 07-07 研究排除，Kysely 不在 PRD 选项内。
