# Research: PR1 ORM/迁移栈选型（TypeORM 0.3.x vs Drizzle vs Prisma）

- **Query**: 多租户租售 SaaS（Midway.js 3.20.3 + PostgreSQL + tenant_id + 应用层租户上下文 + 未来 RLS 兜底），PR1 在 PR3 业务表固化前锁定 ORM/迁移栈，对比 TypeORM 0.3.x（现状）vs Drizzle vs Prisma
- **Scope**: mixed（内部代码 inspect + 外部技术选型）
- **Date**: 2026-07-09

---

## 摘要（决策）

- **推荐：PR1 继续用 TypeORM 0.3.x + `@midwayjs/typeorm`，但在本 PR 内把 tenant guard 真正接线（让它生效），并落地第一条 TypeORM migration + seed。**
- 一句话理由：现状 TypeORM 投入极小（1 entity / 1 repo 注入 / 4 文件 import，且 PR0 guard 尚未实际接线），切换到 Drizzle/Prisma 必须自建 Midway 官方集成缺失的 DI/配置/事务层，而 PR1 的目标是“三端 walking skeleton 端到端跑通”，不是重构数据层；在 PR3 业务表真正固化前，TypeORM 仍是阻力最小路径，RLS 兜底与 ORM 无关（纯 PG policy）。
- 若未来业务表大量使用 JSONB 计价规则 / `tstzrange` 防重订等 PG 专属能力，再在 PR3 前评估切 Drizzle（见 §4 备选 A）。

---

## Findings

### 1. 现状 TypeORM 投入规模（实测 `packages/backend/src`）

| 维度 | 实测 | 文件 |
|---|---|---|
| `@Entity` 实体数 | **1** | `modules/demo-resource/entity/demo-resource.entity.ts` |
| `@InjectEntityModel` repository 注入 | **1** | `modules/demo-resource/service/demo-resource.service.ts:14-15` |
| `from 'typeorm'` import 文件 | **4** | `core/database/base-tenant.entity.ts`、`core/database/tenant.subscriber.ts`、`modules/demo-resource/entity/demo-resource.entity.ts`、`modules/demo-resource/service/demo-resource.service.ts` |
| `@midwayjs/typeorm` import 文件 | 2 | `configuration.ts`（组件注册）、`demo-resource.service.ts`（`InjectEntityModel`） |
| TypeORM 配置点 | 3 | `config/config.default.ts:21-38`、`config/config.local.ts:4-11`（`synchronize:true`）、`config/config.prod.ts:4-17`（`synchronize:false`） |
| Migration 文件 | **0**（项目内无，仅 node_modules 内库自带） | 无 `src/**/migration*/` |
| `synchronize` | dev/local = true，prod = false | `config.local.ts:7` / `config.prod.ts:13` |
| 装包情况 | typeorm 0.3.20、`@midwayjs/typeorm` 3.20.24、pg 8.13.1；**drizzle / prisma 均未安装** | `package.json` + `node_modules` 实测 |

**关键发现（影响迁移成本计算）**：PR0 的 `TenantSubscriber`（`core/database/tenant.subscriber.ts`）定义了 `afterSelectQueryBuilder / afterInsertQueryBuilder / afterUpdateQueryBuilder / afterDeleteQueryBuilder`，但**这些不是 TypeORM 标准 `EntitySubscriberInterface` 钩子**，因此**当前并未被 TypeORM 自动调用，也没有被任何 tenant-aware repository helper 显式调用**。详见 spec `.trellis/spec/backend/database-guidelines.md:118-152`（明确把“假装这些方法会被 TypeORM 自动调用”列为反例）。结论：**PR0 的 TypeORM 隔离机制目前是“未生效的骨架”**，切 ORM 几乎不损失已实现的运行期隔离能力——但同时也意味着 PR1 必须先把 guard 真正接线（无论选哪个 ORM）。

### 2. 现状多租户隔离机制（与 ORM 解耦的部分）

下列机制**与具体 ORM 无关**，切 ORM 时零成本保留：

| 机制 | 位置 | ORM 依赖 |
|---|---|---|
| `AsyncLocalStorage<TenantContext>` | `core/tenant/tenant-context.ts:13-45` | 无 |
| 角色解析（路径前缀 → consumer/merchant/platform） | `core/tenant/tenant.middleware.ts:37-46` | 无 |
| 请求租户上下文 middleware（Midway `@Middleware`） | `core/tenant/tenant.middleware.ts` | 仅依赖 Midway core，不依赖 ORM |
| `BusinessError` | `core/errors/business-error.ts` | 无 |
| 生产守护 `guard:prod-config`（`synchronize:false`、`exposeDevMetadata:false`） | root `tests/`，spec `database-guidelines.md:111-112,124` | 仅校验配置字符串，与 ORM 实现无关 |
| 架构守护 `guard:backend-architecture`（禁 `@cool-midway/*`） | root `tests/` | 与 ORM 无关 |

真正与 ORM 耦合、切栈需重写的部分仅 4 个文件（见 §1 表），且其中 2 个（subscriber / base entity）当前未生效。

---

## 3. Feasible Approaches（含 How / Pros / Cons）

### Approach A — 继续用 TypeORM 0.3.x + `@midwayjs/typeorm`（推荐）

**How**
- PR1 内：(1) 写第一个 TypeORM migration（建 `demo_resources` 表 + tenant_id index）；(2) 新增一个 tenant-aware repository helper（包 `QueryBuilder` 并显式调用 PR0 的 `TenantSubscriber.after*QueryBuilder` 方法，让 guard 从“骨架”变“生效”）；(3) 加 seed；(4) 保留 `@InjectEntityModel` + `Repository` 写法。
- 迁移工具：TypeORM CLI（`dataSource` 路径已具备）或 `migration:generate`；`synchronize:false` 在 prod/local-test 全开，仅 dev 临时 true。

**Pros**
- **Midway 官方集成零成本**：`@midwayjs/typeorm` 是官方组件，`InjectEntityModel` DI、`configuration.ts` imports、`config.typeorm.dataSource` 全是现成约定（见 `configuration.ts:2,22`、`config.default.ts:21`）。Drizzle/Prisma 都需自建这套。
- **迁移工作量最小**：现有 1 entity / 1 service 不动，只增量加 migration + 接线 guard。
- 现有 `.cursor/rules/db.mdc`、`.cursor/rules/service.mdc`、`.vscode/entity.code-snippets`、README、spec 全部已基于 TypeORM 写好，团队约定/脚手架零切换。
- RLS 兜底与 ORM 无关（纯 PG `CREATE POLICY` + `set_config('app.tenant_id')`），未来在 TypeORM 的 transaction 内 `query('SELECT set_config(...)')` 即可启用，spec `database-guidelines.md:166-176` 已规划该路径。

**Cons**
- **读侧全局过滤靠纪律**：`Repository.find()` 不自动带 tenant 过滤，必须强制走包装 QB 的 helper（spec `database-guidelines.md:116` 已要求“tenant-aware repository/helper 显式包装”）。这是多租户最大泄漏面——需用 helper 约定 + lint + 测试兜住。
- TypeORM 0.3.x 处于**维护模式**（TypeORM 1.0 已于 2025 发布，0.3 线以修复为主，节奏慢）。未来 0.3 → 1.0 可能是一次迁移成本。
- TS 类型可能与运行期 schema 漂移（decorator 与 DB 真实列靠 `synchronize`/migration 人肉对齐）。
- JSONB / PG ranges / exclusion constraints（租赁计价、防重订）的 DX 弱于 Drizzle。

### Approach B — 切 Drizzle ORM（v1 GA late 2025）

**How**
- `npm i drizzle-orm postgres drizzle-kit`；删 typeorm / @midwayjs/typeorm。
- 自建 Midway 集成：写一个 `@Provide()` provider，在请求 middleware 内用现有 `AsyncLocalStorage<TenantContext>` 打开一个 scoped `drizzle()` instance（每请求一个，或在 tx 内 `SET LOCAL`）；业务代码通过 `getTenantDb()` 拿到唯一入口。schema 用 `pgTable`。
- 迁移：`drizzle-kit generate`（声明式 schema → plain SQL migration）+ `migrate`。

**Pros**
- **多租户 + RLS 一等公民**：`pgTable.withRLS()`、`policy()`、`role()` 在 schema 里直接表达 RLS；与 `set_config('app.tenant_id', $1, true)` 每 tx 设置天然配合（07-07 研究 §6 有代码草图）。这是三者中泄漏面最低的设计。
- **最佳 TS DX + 最轻 runtime**：schema 即类型，无 codegen、无 engine、无 reflect-metadata。`db.transaction(tx => ...)` 显式作用域，与 RLS context 绑定 tx 干净。
- **JSONB / exclusion constraints / ranges** 全控，最适合未来灵活计价规则与防重订（PG killer features）。
- 07-07 研究的原始主选就是 Drizzle（`07-07/research/backend-orm-db.md:11`）。

**Cons**
- **无官方 Midway 集成**：`@midwayjs/typeorm` 的 DI / config / lifecycle 全要自建。需自己写：provider 暴露 `getTenantDb`、middleware 注入、DataSource 生命周期、与 Midway config 体系对接。这是 PR1 最大的额外成本——而 PR1 目标是三端骨架跑通，不是数据层重构。
- Drizzle v1 GA 较新（2025 末），团队/社区在 Midway 上集成 Drizzle 的成熟样板少。
- 需重写现有 4 个文件 + 1 service + 1 entity + 3 个 config + README + 全部 cursor rules / snippets / spec 中的 TypeORM 约定。

### Approach C — 切 Prisma (v7)

**How**
- `npm i prisma @prisma/client`；`prisma migrate dev` 生成 schema。
- 自建 Midway 集成（同 B，无官方组件）：用 Client Extensions `$extends({ query })` 在 per-request extended client 上向 `findMany/count/updateMany/deleteMany` 注入 `where.tenantId`。
- 迁移：Prisma Migrate（声明式 + shadow DB + history，三者中迁移工具链最成熟）。

**Pros**
- **迁移工具链最成熟**：Prisma Migrate（声明式 schema、shadow DB、自动生成 SQL、history）打磨度最高。
- 端到端类型 + 生成 client，IDE 体验好。
- Client Extensions `query` component 是官方记录的“RLS / user isolation” tenant-filter 模式。

**Cons**
- **运行时最重**（Rust query engine 进程）。
- **无官方 Midway 集成**，同 B 需自建 DI/config/provider。
- raw `$queryRaw` 绕过 extension；Prisma 单 role connection 模型让 per-tenant PG RLS 比 Drizzle 别扭（07-07 研究 §7 备选 1）。
- 现有 TypeORM 投入全部丢弃，且重写量与 B 相当（甚至因 client codegen 体系，约定面更大）。

---

## 4. 维度对比（针对本项目）

| 维度 | TypeORM 0.3.x（现状） | Drizzle ORM | Prisma |
|---|---|---|---|
| Midway 官方集成 | ✅ `@midwayjs/typeorm` 现成 | ❌ 自建 | ❌ 自建 |
| tenant_id 全局读过滤 | ⚠️ 靠 QB helper 纪律（现未接线） | ✅ per-request scoped db + 可选 RLS | ✅ Client Extension query |
| PG RLS 支持顺手度 | 中（tx 内 set_config，可做） | ✅ 最优（schema 一等公民） | 中（单 role 别扭） |
| 迁移工具链 | 中（migrations + generate） | 好（drizzle-kit，plain SQL） | ✅ 最成熟 |
| 类型安全 / DX | 中（decorator，可能漂移） | ✅ 最佳（schema 即类型） | 好（生成 client） |
| 运行时重量 | 中（reflect-metadata） | ✅ 最轻 | 重（engine） |
| 维护态 | 0.3 维护模式（1.0 已发） | v1 GA，活跃 | 活跃，商业支持 |
| 从现状迁移成本 | ✅ 最低（增量） | 高（自建集成+重写4文件） | 高（自建集成+重写+codegen） |
| 未来 JSONB/计价/防重订 DX | 弱 | ✅ 最强 | 中 |

数据来源：07-07 研究 §1 对比表（已通过官方 docs + npm 版本验证，访问 2026-07-07）+ 本次代码实测。三者最新版本（07-07 实测）：Prisma 7.8.0、TypeORM 1.0.0（本仓库锁 0.3.20）、Drizzle 0.45.2。

---

## 5. 推荐与理由

**推荐 Approach A（继续 TypeORM 0.3.x + `@midwayjs/typeorm`）。**

理由：PR1 的目标是“三端 walking skeleton 端到端跑通 + 锁定 ORM/迁移栈”。锁定时点的真实约束是——

1. **现状 TypeORM 投入极小**（1 entity / 1 repo / 4 import），且 PR0 guard 尚未实际接线，切 ORM 几乎不保住任何已生效的运行期能力，反而要自建 Midway 集成。
2. **Midway 官方集成是硬约束**：`@midwayjs/typeorm` 现成 DI/config/lifecycle，而 Drizzle/Prisma 都要自建 provider + middleware + config 对接，PR1 不该背这个重构。
3. **PR1 是 PR3 业务表固化前的最后切换窗口**——但“窗口”不等于“必须切”。当前阻力最小路径是继续 TypeORM，把 guard 接线 + 落地第一条 migration + seed，先让三端跑通。
4. **RLS 兜底与 ORM 无关**（纯 PG policy + `set_config`），未来在 TypeORM tx 内即可启用，spec 已规划该路径，不会被 TypeORM 绑死。

**保留的切换触发条件**（写入 PRD 作为决策日志）：若 PR3 业务表大量需要 JSONB 灵活计价 / `tstzrange` 防重订等 PG 专属能力，且 TypeORM 0.3 维护态成为瓶颈，则在该时点评估切 Drizzle（Approach B）。届时迁移面仍是这 4 个文件 + 配置 + 约定，代价可控。

### PR1 在 Approach A 下的落地清单（供 implement 参考，非本 research 职责）
- 落地第一条 TypeORM migration（建 `demo_resources` + `tenant_id` index）。
- 新增 tenant-aware repository helper，显式调用 PR0 `TenantSubscriber.after*QueryBuilder`，让 guard 生效。
- 加 seed（至少 2 个租户的 demo 数据，支撑三端 demo）。
- 保留 `synchronize:false`（prod），并补 tenant 隔离回归（list/create/update/delete，覆盖 §AC）。

---

## Related Specs

- `.trellis/spec/backend/database-guidelines.md:73-152` — PR0 query guard 契约；**关键**：明确 `after*QueryBuilder` 非 TypeORM 标准钩子，未被自动调用。
- `.trellis/spec/backend/database-guidelines.md:166-176` — RLS 指南（迁移到位后启用，与 ORM 无关）。
- `.trellis/spec/backend/database-guidelines.md:189-194` — 迁移与 schema 变更规则。
- `.trellis/spec/backend/directory-structure.md:38,92` — `migrations/` 目录约定，`core/database/**` 职责。
- `.trellis/spec/backend/quality-guidelines.md:19,36,57` — raw SQL 拦截 + RLS 默认拒绝。
- `.trellis/tasks/07-07-multi-tenant-ecommerce-system/research/backend-orm-db.md` — 原始 ORM 对比（主选 Drizzle），本次在其上叠加现状代码实测与 Midway 集成约束。

## External References

- Prisma Client Extensions（tenant/RLS 隔离模式）— https://www.prisma.io/docs/orm/prisma-client/client-extensions
- Drizzle ORM Row-Level Security（`withRLS`/`policy`/`role`）— https://orm.drizzle.team/docs/rls
- PostgreSQL Row Security Policies（default-deny、ENABLE/FORCE RLS、BYPASSRLS）— https://www.postgresql.org/docs/current/ddl-rowsecurity.html
- 来源版本（07-07 实测）：Prisma 7.8.0 / TypeORM 1.0.0（本仓库锁 0.3.20）/ Drizzle 0.45.2

## Caveats / Not Found

- 本环境无 WebSearch 工具，无法独立复核 2026-07-09 当日最新版本号；版本号采用 07-07 研究的实测值（primary docs + npm registry）。ORM 维护态、TS DX 评分属于分析性判断，基于官方文档与 2025 社区共识，未经第三方资料独立复核（同 07-07 研究 §9 说明）。
- “TypeORM 0.3 维护模式 / 1.0 已发”为 07-07 实测结论；若需精确确认 0.3.20 的 EOL/支持窗口，需在能联网的环境补充核验。
- Drizzle/Prisma 在 **Midway.js** 上的成熟集成样板，本次未找到权威 first-party 文档（Midway 官方组件列表仅含 typeorm/sequelizer/mongoose），属“未找到”，强化了 B/C 的“自建集成”成本判断。
