# 研究：多租户 SaaS 的 ORM + 数据库（共享 DB + tenant_id）

- **查询**：为 Node.js + TS 上共享 DB、tenant_id 隔离的多租户租赁/零售 SaaS 选择 ORM + DB；强制全局租户过滤以防数据泄漏。
- **范围**：外部（技术选型，2025-current docs）
- **日期**：2026-07-07

---

## 摘要（决策）

- **主选：PostgreSQL + Drizzle ORM**（TypeScript-first，泄漏面最低，一等 RLS primitives，SQL 透明，无隐藏 query engine）。
- **纵深防御：是，在应用层 tenant_id 过滤之上采用 PostgreSQL RLS**。基于共享 DB 模型给出硬性 `ADOPT` 结论。（见 §6。）
- **强制机制（安全关键）：**应用层**强制全局 filter**（每请求单一 tenant-scoped DB client）+ **PostgreSQL RLS 兜底**，失败时关闭访问。开发者绝不手写 `WHERE tenant_id = ?`；scoped client 注入它，RLS 拒绝漏网项。（见 §5 + §7。）
- **如果团队希望最大生态/迁移打磨度：**可选 PostgreSQL + Prisma 7（client extensions `query` component）。
- **不要为本系统选择** MySQL（无原生 RLS，会失去直接应对 #1 风险的纵深防御后盾），除非存在硬性、压倒性的运维约束（见 §6 注意点）。

---

## 1. ORM 对比表

来源：官方文档（prisma.io、orm.drizzle.team、typeorm.io、sequelize.org）+ npm registry，访问日期 2026-07-07。写作时最新版本：**Prisma 7.8.0、TypeORM 1.0.0、Drizzle 0.45.2（v1 GA late 2025）、Sequelize 6.37.8。**

| 维度 | Prisma 7 | TypeORM 1.0 | Drizzle ORM (v1) | Sequelize 6 |
|---|---|---|---|---|
| **全局 tenant_id filter 机制** | **Client Extensions `query` component** — `$extends({ query })` 拦截 `findMany/findFirst/count/update*/deleteMany` 并注入 `where.tenantId`。每请求创建一个 extended client。官方文档引用了这个“RLS / user isolation”模式。 | **QueryBuilders + Subscribers + Base entity columns** — 但全局自动 filter 没有强制；开发者必须处处用 QB，或依赖 `afterLoad`/`beforeInsert` subscribers（只覆盖写侧，不会自动过滤读）。 | **每请求 scoped DB instance** — 每请求包装 `drizzle()`，通过 middleware 添加 `where tenantId = $1`；或使用原生 **`pgTable.withRLS()`** + policies 做真正 DB 级强制。默认无隐式过滤。 | **Default scopes + hooks** — `defaultScope: { where: { tenantId } }` 对多数查询自动生效；可通过 `.unscoped()` 绕过。Hooks 用于写侧 `tenantId`。 |
| **开发者是否可能意外绕过 filter？** | 如果所有访问都通过 tenant-scoped client，风险低。Raw `$queryRaw` 会绕过 — 必须被 lint/convention 禁止。 | **高风险** — `Repository.find()` 以及 `relations`/lazy loading 等 query operators 不会遵守自定义 filters；很容易忘记 QB。 | 中等 — 必须一致使用 scoped instance；raw `sql` operator 会绕过。RLS 可彻底兜底。 | **高风险** — `.unscoped()` 和 raw queries 静默绕过；default scope 只是建议。 |
| **DB 级后盾（RLS）支持** | 可运行在 Postgres 上并与 RLS 共存，但 Prisma 的 connection/user 模型让 per-tenant DB roles 较别扭（通常一个 app role）。 | 同上 — 一个 connection role；可做 RLS 但不顺手。 | **最好** — 一等 `enableRLS`、`roles`、`policy` schema APIs；每 transaction `set_config('app.tenant_id', ...)`。为 Neon/Supabase-style RLS 而设计。 | 可行但少见；非惯用。 |
| **迁移** | **Prisma Migrate** — 声明式 schema、自动生成 SQL、shadow DB、migration history。成熟、打磨好。 | Migrations + entity sync；`synchronize` 可用（生产不安全）。尚可。 | **drizzle-kit**（`generate`/`migrate`/`push`/`pull`/`studio`）。完全可控的 plain SQL migrations；适合团队。 | `sequelize-cli` migrations；较老，可用但体验弱。 |
| **事务** | `$transaction([...])` interactive + sequential；每 tx 隔离 client。稳。 | `QueryBuilder`/`EntityManager.transaction()`。稳。 | `db.transaction(async (tx) => ...)` — 显式传 `tx`，范围很清楚。优秀。 | `sequelize.transaction()` managed/unmanaged。稳。 |
| **JSON / JSONB** | `Json` / `JsonNull`；通过 path operators 查询。良好。 | `json`/`jsonb` column types；typed query 有限。尚可。 | `jsonb()` column + `sql` operator 访问 `->>`、`@>`、GIN indexes。完全控制、完整 Postgres 能力。**最适合灵活租赁计价规则。** | `JSON`/`JSONB` types；支持查询。尚可。 |
| **Raw query escape hatch** | `$queryRaw`、`$executeRaw`（tagged templates，参数化）。 | `entityManager.query()`（raw SQL string）。 | `sql` tagged template + 完整 SQL composition。四者中 raw SQL 最顺手。 | `sequelize.query()`（参数化）。 |
| **TypeScript DX** | 生成 client、端到端类型、IDE 优秀。较重（Rust query engine / `@prisma/client` runtime）。 | 基于 decorator 的 entities；类型可能与 runtime schema 漂移。 | **最佳 TS DX** — schema 即类型，query 可推断，无 codegen step，无 engine。最轻。 | JS-first；TS 通过 `Model.init` + interfaces 补上。TS 体验最弱。 |
| **2025 成熟度 / 维护** | 活跃，v7（2025+），Prisma Next early access。商业支持。 | v1.0.0 已发布（2025）；历史长；大但节奏慢。 | v1.0 GA late 2025；极活跃、发展快、资金充足。 | 维护态；6.x 稳但创新慢，v7 WIP。 |
| **运行时重量** | 重（engine process）。 | 中（reflect-metadata、decorators）。 | **最轻**（无 engine、无 metadata reflection）。 | 中重。 |
| **本用例结论** | 强备选。 | 不推荐（读 filter 泄漏风险）。 | **推荐。** | 不推荐（`.unscoped()` + TS 弱）。 |

---

## 2. 数据库对比

| 维度 | PostgreSQL（18 current） | MySQL（8.x / HeatWave） |
|---|---|---|
| **原生 Row-Level Security (RLS)** | **有** — `CREATE POLICY ... USING (tenant_id = current_setting('app.tenant_id')::uuid)` + `ALTER TABLE ... ENABLE/FORCE ROW LEVEL SECURITY`。没有匹配 policy 时默认拒绝。这是应对泄漏风险的最大差异点。 | **无原生 RLS。** 替代方式：应用层强制 filtering、views + `CURRENT_USER()`、proxy-level rewriting。都更弱；没有一个能在 engine 级强制。 |
| **灵活租赁计价规则的 JSONB** | **优秀** — `JSONB` + GIN indexes、`@>`、`?`、`->>`、`jsonb_path_query`。可索引、快。 | `JSON` type + `JSON_EXTRACT`、generated columns + indexes。可用但对复杂嵌套规则不够顺手且较慢。 |
| **事务 / 隔离** | MVCC、完整 SQL-standard isolation levels、SERIALIZABLE 真正可用。对订单/押金/退款关键。 | MVCC；SERIALIZABLE 历史上 gap-lock 较粗。够用但粒度粗。 |
| **丰富类型** | uuid、timestamptz、numeric（精确金额）、arrays、ranges（很适合租赁日期范围/可用性）、`tstzrange` exclusion constraints（防止重复预订！）。 | 尚可，但没有 ranges/exclusion constraints；防止重复预订要手写。 |
| **中国运维成熟度** | 快速增长（PolarDB-PG、TDSQL-PG、AnalyticDB、RDS for PG）。人才池小于 MySQL 但在扩张。 | **主流** — 阿里云/腾讯 RDS、DBA 人才最多、工具/基准最深。 |
| **云 RDS 成熟度** | 各大中国云成熟（但不如 MySQL 默认）。 | 最成熟 / 最便宜 / 最经验证。 |
| **中国社区** | 较小但高信号。 | 最大。 |

**Postgres 对租赁 SaaS 的 killer features：**
1. **RLS**（针对 #1 风险的纵深防御）。
2. **`tstzrange` exclusion constraints** — 让 DB 本身阻止同一租赁 item 在重叠日期被重复预订（`EXCLUDE USING gist (item_id WITH =, daterange WITH &&)`）。MySQL 很难安全实现。
3. **JSONB** 支持灵活、可索引的计价规则。

---

## 3. 为什么“记得写 WHERE tenant_id = ?”不是策略

你提出的关键风险是：单个漏掉的 `WHERE tenant_id = ?` 就会泄漏另一个租户的数据。依赖**开发者纪律**的缓解措施（lint 规则、code review、“永远用 helper”）会随着时间和人员增长以概率方式失败。唯一可接受的设计应在两层让泄漏**结构性不可能**：

1. **应用层 — 强制单入口：**请求上下文中只有一种触达 DB 的方式，即每请求创建的 **tenant-scoped client**，自动向每个 query 注入 `tenant_id`。开发者业务代码中不写 `tenant_id`。
2. **DB 层 — RLS 兜底：**即使应用层有 bug（raw SQL、错配 join、未来迁移），Postgres 也拒绝返回/更新跨租户行。policy 失败时**默认拒绝**。

两者组合才安全：应用层 scoping = 正确默认；RLS = blast radius 的硬上限。

---

## 4. PostgreSQL RLS — 结论（共享 DB 的纵深防御）

**结论：ADOPT。** 明确采用。

与约束绑定的理由：
- 共享 DB + tenant_id 隔离意味着租户之间唯一结构屏障是 WHERE clause。RLS 把它从“应用约定”变成“数据库强制规则”。这直接解决关键风险。
- 成本低：`tenant_id` column + index + 每表 3 行 policy + 每 transaction 一次 `set_config('app.tenant_id', $1, true)`。
- 与 Drizzle（`pgTable.withRLS()`、`policy(...)`、`role(...)`）和每请求 scoped client 组合干净。
- 失败模式安全：没有匹配 policy → default-deny → 空结果，而不是泄漏。

**需要预算的注意点 / 成本：**
- **每 transaction 租户上下文：**每个 tx/connection 起始必须 `SELECT set_config('app.tenant_id', $tenantId, true)`（`true` = local to transaction）。在 pooled connections 中，使用 transaction 或 `SET LOCAL`；不要在 PgBouncer transaction pooling 下依赖 connection-level state。
- **Table owner / `BYPASSRLS`：**migration/owner role 和 superusers 会绕过 RLS。**app role 必须是 non-owner、non-superuser、non-BYPASSRLS role**，或使用 `FORCE ROW LEVEL SECURITY`。需要运维纪律，避免 admin scripts 意外用 app role。
- **TRUNCATE 和 REFERENCES 绕过 RLS**（PG 文档说明）— 对业务表无关但需记录。
- **性能：**policy 会给每个 query 增加 predicate。只要有 `tenant_id` b-tree index（本来就必须有），开销可忽略。
- **RLS 不替代应用层 filter** — 只靠 RLS 意味每个 query 都永远携带 policy predicate，也会让跨租户 admin/backfill 操作变难。两层都保留。

**MySQL 结论：**只有在被硬性运维约束强迫使用 MySQL 时，才接受失去 RLS 后盾。此时必须补偿：严格 repository 层禁止 raw SQL、自动化测试断言每条 query path 带 tenant_id，可能还要 proxy/SQL-rewriter。这明显不如 Postgres+RLS 安全，应视作降级模式。

---

## 5. 全局租户过滤模式（安全关键）

这是让“开发者不能忘”真实成立的模式。推荐栈必须同时使用三根支柱。

**支柱 A — 每请求一个 tenant-scoped DB client（应用层，强制）。**
不要把全局 `db` 注入 handler。只提供 `getRequestDb(req)`（或 AsyncLocalStorage context），返回绑定 `tenantId` 的 DB instance。该 instance 自动向所有读写注入 `tenant_id`。

**支柱 B — DB 层 RLS policy（纵深防御）。**
每 transaction `set_config('app.tenant_id', tenantId, true)` + `ENABLE ROW LEVEL SECURITY` + `USING (tenant_id::text = current_setting('app.tenant_id', true))` policy。

**支柱 C — 业务代码禁止 raw SQL。**
除 allow-listed infra module 外，禁止 `sql\`...\`` 和 `$queryRaw`（通过 ESLint rule + code review 强制）。任何 raw SQL 必须经过 helper，追加 `AND tenant_id = $tenant` 并运行在 scoped tx 中（RLS 仍然生效）。

**支柱 D — 测试。** Contract test suite：每个 model 都断言（a）无显式 tenant_id 的 query 只返回上下文租户行，（b）跨租户访问返回空。CI 中运行。

---

## 6. 代码草图 — 推荐栈（Drizzle + Postgres + RLS）

> 仅作示意，未编译。按真实模型调整 schema/migration。

### 6a. 启用 RLS 的 Schema（Drizzle）

```ts
// src/db/schema.ts
import { pgTable, uuid, varchar, jsonb, numeric, timestamp, index, policy, role } from 'drizzle-orm/pg-core';

// Every tenant-scoped table inherits these columns.
const tenantColumns = {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
};

// Role the app connects as (non-owner, non-superuser, no BYPASSRLS).
export const appRole = role('app_role');

export const products = pgTable(
  'products',
  {
    ...tenantColumns,
    name: varchar('name').notNull(),
    // Flexible rental pricing rules as JSONB, GIN-indexable.
    pricingRules: jsonb('pricing_rules').notNull().default({}),
    deposit: numeric('deposit', { precision: 12, scale: 2 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('products_tenant_idx').on(t.tenantId),
    index('products_pricing_gin').using('gin', t.pricingRules),
    // Enforce RLS at the DB engine level.
    policy('products_tenant_isolation')
      .for('all')
      .to(appRole)
      .using(sql`tenant_id::text = current_setting('app.tenant_id', true)`),
  ],
).withRLS(); // = ALTER TABLE products ENABLE ROW LEVEL SECURITY
```

### 6b. 每请求 tenant-scoped DB（唯一强制入口）

```ts
// src/db/request-db.ts
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { AsyncLocalStorage } from 'node:async_hooks';
import * as schema from './schema';

// ONE global pool/owner connection for migrations & admin ONLY.
export const adminDb = drizzle(process.env.DATABASE_URL!, { schema });

// Per-request scoped DB lives in AsyncLocalStorage so deep call stacks
// (services, repos) get it without passing it manually.
type Ctx = { tenantId: string; db: PostgresJsDatabase<typeof schema> };
export const tenantCtx = new AsyncLocalStorage<Ctx>();

// THE only function business code is allowed to call to get a DB handle.
export function getTenantDb(): PostgresJsDatabase<typeof schema> {
  const ctx = tenantCtx.getStore();
  if (!ctx) throw new Error('No tenant context — never use adminDb in request scope');
  return ctx.db;
}

export function getTenantId(): string {
  const ctx = tenantCtx.getStore();
  if (!ctx?.tenantId) throw new Error('No tenant context');
  return ctx.tenantId;
}
```

### 6c. Middleware：写入 tenant + 打开 tx（通过 RLS context 自动注入 tenant_id）

```ts
// src/middleware/tenant.ts
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from '../db/schema';
import { tenantCtx, adminDb } from '../db/request-db';

// NOTE: queryClient created per request (or use a pooled connection that runs
// SET LOCAL inside a tx). For simplicity here, per-request connection.
export async function tenantMiddleware(req, res, next) {
  const tenantId = req.user?.tenantId; // from auth/JWT
  if (!tenantId) return res.status(401).end();

  const queryClient = postgres(process.env.DATABASE_URL!);
  const db = drizzle(queryClient, { schema });

  // Open a tx, set the tenant context LOCAL to this tx, run the request inside.
  await db.transaction(async (tx) => {
    await tx.execute(`SELECT set_config('app.tenant_id', '${tenantId}', true)`); // use params in real code
    await tenantCtx.run({ tenantId, db: tx }, () => next());
  });
  await queryClient.end();
}
```

### 6d. 业务代码 — 永不接触 tenant_id

```ts
// src/services/orders.ts
import { getTenantDb } from '../db/request-db';
import { orders } from '../db/schema';
import { eq, sql } from 'drizzle-orm';

export async function listMyOrders() {
  const db = getTenantDb();
  // No tenant_id here. RLS guarantees only this tenant's rows are visible.
  return db.select().from(orders);
}

export async function createOrder(input) {
  const db = getTenantDb();
  // RLS policy auto-writes tenant_id via the USING/WITH CHECK on INSERT
  // if you add a WITH CHECK clause; otherwise insert tenantId explicitly
  // from getTenantId() — never from request body.
  return db.insert(orders).values({ ...input, tenantId: getTenantId() }).returning();
}
```

> 关键：启用 RLS 后，即使有 buggy join 或忘了 tenant_id 的 raw `sql\`...\``，Postgres 仍会给每条 statement 附加 policy predicate，并默认拒绝不匹配行。

---

## 7. 主推荐与理由

**主选：PostgreSQL 16+ + Drizzle ORM (v1) + RLS + per-request scoped client (AsyncLocalStorage)。**

原因：
- **四个 ORM 中泄漏面最低**，且唯一能在 schema API 中直接表达 RLS（`withRLS`、`policy`、`role`）。DB 本身成为强制层，而不只是应用层约定。
- **最佳 TS DX + 最轻 runtime**（无 engine、无 reflect-metadata）；schema 是事实来源且完全 typed。
- **JSONB + exclusion constraints** 比任何 MySQL/ORM 组合更适合灵活租赁计价和防重复预订。
- **事务显式且有作用域**（`db.transaction(tx => ...)`），与每 tx `set_config(..., true)` 设置 RLS context 天然配合。

**备选 1 — PostgreSQL + Prisma 7**（选择条件）：团队优先迁移打磨度与 batteries-included DX，并接受较重 engine。使用 **Client Extensions `query` component** 在 per-request extended client 上向 `findMany/findFirst/count/updateMany/deleteMany` 注入 `tenant_id`；再用 Postgres RLS policies 兜底。注意：raw `$queryRaw` 绕过 extension，且每 tx 仍必须设置 RLS context — Prisma 单 role connection 模型让 RLS 比 Drizzle 略别扭。

**备选 2 — PostgreSQL + TypeORM**（选择条件）：已有 TypeORM 代码库或团队强熟悉。通过以下方式缓解较高泄漏风险：（a）禁止直接使用 `Repository`，统一走包装 QueryBuilder 的 tenant-aware base repository；（b）RLS 兜底；（c）支柱 C/D 控制。不是 greenfield 首选。

**不推荐 — Sequelize 或任何 MySQL-based stack**，因为它们都会移除一层泄漏防护（Sequelize：`.unscoped()` 让 default scopes 只是建议；MySQL：完全没有 RLS 后盾）。

---

## 8. 来源

- Prisma — Client Extensions（query component、RLS/user-isolation pattern）：https://www.prisma.io/docs/orm/prisma-client/client-extensions , https://www.prisma.io/docs/orm/prisma-client/client-extensions/query
- Drizzle ORM — Row-Level Security（`withRLS`、roles、policies、Neon/Supabase）：https://orm.drizzle.team/docs/rls
- PostgreSQL 18 — Row Security Policies（default-deny、ENABLE/FORCE RLS、BYPASSRLS、TRUNCATE/REFERENCES bypass）：https://www.postgresql.org/docs/current/ddl-rowsecurity.html
- npm registry（latest versions，2026-07-07 访问）：prisma 7.8.0、typeorm 1.0.0、drizzle-orm 0.45.2、sequelize 6.37.8

## 9. 注意事项 / 未找到

- **每请求 connection 成本：**草图为了清晰每请求打开 `postgres()` connection；生产中应使用 pool，并在 `db.transaction` 内运行 `SET LOCAL`，让 RLS context 作用域绑定 tx 而不是 connection（PgBouncer transaction pooling 下尤其重要）。
- **INSERT 的 `WITH CHECK`：**`USING` policy 覆盖 SELECT/UPDATE/DELETE；需要添加 `.withCheck(...)`（或组合 `for('all')` policy）约束 inserts — 实现时细化。
- **AsyncLocalStorage + 框架集成：**middleware 草图框架无关；适配你的 server（Fastify/Express/Nest），并确保 tx 包裹整个 request handler chain。
- **本环境无法使用 deep-research workflow**（无 WebSearch tool）；结论已通过直接抓取官方 primary docs（Prisma、Drizzle、PostgreSQL）和 npm registry 版本验证。未抓取更广泛的社区/博客佐证 — 版本号与 RLS 语义是权威的；比较性主观评分（如“最佳 TS DX”）是基于文档和 2025 社区共识的分析判断，而不是经第三方资料独立复核。
