# 研究：cool-admin/node（Midway）— 多租户 SaaS 可行性

> **当前状态说明（2026-07-09）**：本文仅保留为历史研究参考。当前目标架构已经调整为自研 Midway.js 主后端 + PostgreSQL，C 端小程序使用 uni-app，管理后台使用 Next.js；不使用 cool-admin v8 运行时或 cool-admin-vue 作为目标实现。

- **查询**：验证 cool-admin/node 作为多租户 SaaS 后端基座的可行性 — 多租户能力、真实技术栈、三端（C / B / 平台）组织方式。
- **范围**：外部（官方文档 + GitHub 源码）
- **日期**：2026-07-07
- **决策**：GO — cool-admin 是强基座，风险低。多租户能力 **内置（v8.0+）**，使用的正是 D3 需要的共享 DB + `tenant_id` 模型。见下方结论。

> 文档抓取备注：brief 中的 URL（`/src/guide/start/quick.html`、`.../core/`）全部 404。**正确**的 VitePress 模式是 `/src/guide/<name>.html` 和 `/src/guide/core/<name>.html`。下列页面均通过 curl 成功抓取（HTTP 200）— 该站是 VitePress SPA，`.html` 路由会返回 SSR markdown 内容。确实存在专门的多租户页面：`https://node.cool-admin.com/src/guide/core/tenant.html`（brief 说它 404，但实际不是）。

---

## 发现

### 1. 真实技术栈（从 docs + package.json 验证）

| 层 | 技术 | 版本 / 备注 | 来源 |
|---|---|---|---|
| Runtime | **Node.js** | `>=12.0.0`（推荐 `>=16`）— `package.json` `engines` | quick.md, package.json |
| Framework | **Midway.js** | 文档站面向 **v8.0.0**；master 分支 `package.json` 显示 `@midwayjs/core ^2.14.0`（Midway 2.x）— 意味着公开 GitHub `master` 分支落后于文档中的 v8 版本。v8 使用 `@midwayjs/core` + `@midwayjs/typeorm` 和标准 `MidwayConfig`（无 egg、无 `EggAppConfig`）。 | package.json（master=v4/egg）、db.md/quick.md（v8） |
| **ORM** | **TypeORM** via `@midwayjs/typeorm` | master 上是 `@midwayjs/orm ^2.14.0`、`typeorm ^0.2.41`。v8 文档使用 `@InjectEntityModel` 和 `typeorm` decorators（`@Column`、`@Entity`、`Repository`）。**是 TypeORM，不是 Prisma。** | db.md, package.json |
| **支持数据库** | **MySQL、PostgreSQL、SQLite** | 三者一等支持。PostgreSQL 需要 `npm i pg`；配置 `type: "postgres"`。SQLite 需要 `sqlite3`。**PostgreSQL 受支持** — 对 RLS 计划关键。 | db.md, quick.md |
| Cache / Queue | Redis（可选，`@cool-midway/redis`）；通过 `@cool-midway/queue` 的 BullMQ-style queue | 分布式任务/队列需要 Redis；本地 schedule 可无 Redis | quick.md, package.json |
| Admin Frontend | **Vue3 + Vite + element-plus**（独立 repo `cool-admin-midway/cool-admin-vue`） | 已确认：文档站 `vue.cool-admin.com` 是 “Cool Admin (Vue3)”，由 VitePress 生成。GitHub `master` 仍显示旧 Vue2/element-ui 构建 — **当前/维护中的前端是 Vue3**。**它是独立 repo，可完全控制/定制。** | src.md, vue.cool-admin.com |
| C 端移动 | uni-app（独立文档 `uni-docs.cool-js.com`） | 用于微信小程序 / APP | 首页导航 |
| License | **MIT**（开源、免费、允许商用） | src.md |

### 2. 核心抽象

| 抽象 | 作用 |
|---|---|
| **Module**（`src/modules/<name>/`） | 组织单元。必需 `config.ts`（name、description、middlewares、order、custom config）。可选 `db.json`（种子数据，支持 `@childDatas` 做 FK 链）、`menu.json`（菜单种子）。目录：`controller/{admin,app,open}`、`entity`、`service`、`dto`、`middleware`、`schedule`。 |
| **`BaseEntity`** | 实体基类。v8：从 `@cool-midway/core` 移到 `src/modules/base/entity/base.ts`，开发者可**扩展/定制**。提供 `id`、`createTime`、`updateTime`，以及（v8）**`tenantId: number`**（`@Index`、`nullable: true`）。所有实体继承它。 |
| **`BaseService`** | 包装 TypeORM Repository + 6 个通用方法（`add/delete/update/info/list/page`）。提供 `modifyBefore`/`modifyAfter` hooks、`nativeQuery`、`sqlRenderPage`、`entityRenderPage`、`setSql`、`setEntity`。 |
| **`@CoolController` / `BaseController`** | 按文件路径自动路由（`/controller-folder/module/method`）。声明 `api: ['add','delete','update','info','list','page']`、`entity`、`service`、`pageQueryOp`/`listQueryOp`、`insertParam`、`before`、`serviceApis`。 |
| **`@CoolTransaction`** | 声明式事务，自动注入 `QueryRunner`，异常自动捕获。 |
| **`@CoolUrlTag` / `@CoolTag`** | 给路由打 tag（如 `IGNORE_TOKEN`）。 |
| **EPS**（`cool.eps: true`） | 运行时扫描并暴露所有实体 + 路由给前端（`eps.json`），驱动 codegen + 前端 API hints。**生产必须关闭**（会泄漏 schema）。 |
| **Plugin system** | `.cool` 插件包通过 admin UI 安装；`BasePlugin` 基类；每插件配置（UI 中维护，不写代码）；`hook` 字段（如替换上传组件）；`singleton` flag；`PluginService.invoke(key, method, ...args)`。 |

内置 `base` 模块包含：RBAC（用户/角色/部门/菜单/perms）、dict、文件上传、task/queue、exception、cache、login（JWT + refresh token + captcha + password version + 可选 SSO）、i18n、websocket（socket.io）、elasticsearch、swagger。

### 3. 多租户（关键问题）— v8.0 起内置 ✅

**来源：`https://node.cool-admin.com/src/guide/core/tenant.html`（“多租户（v8.0新增）”）。**

cool-admin 的多租户正是**共享 DB + `tenant_id` column** 模型。这不是 hack，而是有文档的一等功能。

#### 工作方式（具体注入点）

**A. 通过 `BaseEntity.tenantId` column 做数据隔离**
```ts
// src/modules/base/entity/base.ts (v8 — customizable, lives in user code, not the package)
@Index()
@Column({ comment: '租户ID', nullable: true })
tenantId: number;
```
每个继承 `BaseEntity` 的实体都会自动继承该 column。

**B. `tenantId` 从 JWT token 流转**
登录时，`generateToken()` 将 `tenantId: user['tenantId']` 写入 JWT payload。每个请求中框架从已验证 token 读取 `tenantId` — 无需手工传递。

**C. TypeORM Subscriber — 真正的 query interceptor（关键 hook 点）**
cool-admin **扩展 TypeORM 的 `Subscriber`**，新增 4 个生命周期 hook，在 QueryBuilder 构建完成后触发（因此能修改 SQL）：
```ts
afterSelectQueryBuilder?(qb: SelectQueryBuilder<any>): void;  // auto-AND tenantId on reads
afterInsertQueryBuilder?(qb: InsertQueryBuilder<any>): void;  // auto-inject tenantId on writes
afterUpdateQueryBuilder?(qb: UpdateQueryBuilder<any>): void;  // auto-AND tenantId (prevents cross-tenant update)
afterDeleteQueryBuilder?(qb: DeleteQueryBuilder<any>): void;  // auto-AND tenantId
```
真实逻辑位于 **`src/modules/base/db/tenant.ts`** — 从 ctx/token 中取 `tenantId` 并按条件注入 WHERE/SET clauses。（GitHub master 上该路径 404，因为 master 是旧 v4；该文件存在于文档描述的 v8 release 中。拿到 v8 源码后需要再读。）

**D. Opt-out helper** — `noTenant(ctx, async () => { ... })` 在一个 block 内临时关闭过滤（用于跨租户平台查询）。

**E. 启用 + 范围**
```ts
// src/config/config.default.ts (v8)
cool: {
  tenant: {
    enable: true,
    urls: [],   // glob patterns, e.g. ['/admin/**/*'] — only matching routes get filtered
  },
}
```

**F. 自动覆盖范围**（启用后无需改代码）：
- `@CoolController` generic methods：`add, delete, update, info, list, page` 全部按租户过滤。
- 任意 Service 中的 TypeORM `.find()` / `.createQueryBuilder().getMany()`。

**G. 内置排除（平台级 escape）：**
- 永不被过滤的 URLs：`/admin/base/open/login`、`/admin/base/comm/person`、`/admin/base/comm/permmenu`、`/admin/dict/info/data`
- 永不被过滤的 User：`admin` superuser（看所有租户）— 正好满足“platform ops sees everything”。

#### 重要坑点 — raw SQL 不会自动过滤
```ts
async invalid() {
  await this.nativeQuery('select * from demo_goods');  // ⚠️ NO tenant filter
  await this.sqlRenderPage('select * from demo_goods', {}); // ⚠️ NO tenant filter
}
```
**任何手写 SQL 都会绕过租户隔离。** 这是多租户 app 的 #1 风险 — 开发者必须避免 raw SQL，或手工添加 `WHERE tenantId = ?`，或对平台专用查询有意包在 `noTenant()` 中。必须把它固化成 lint/review 规则。

#### 多租户结论：✅ 干净、低工作量
- 机制（Subscriber + BaseEntity column + JWT claim）正是推荐的 TypeORM 多租户模式。
- v8 上改造工作量：**低**。它已实现 — 配置 `enable: true`、设置 `urls`、确保每个业务 entity 继承 `BaseEntity`、约束 raw SQL 即可。无需框架手术。
- **注意点**：仅 **v8.0.0+** 可用。公开 GitHub `master` 是 v4.x（Midway 2.x、egg-based、无 tenant feature）。必须明确获取 **v8 release/zip**，不要盲目 git-clone master。

### 4. PostgreSQL + Row-Level Security（RLS）

| 问题 | 答案 |
|---|---|
| cool-admin 支持 PostgreSQL 吗？ | **是** — `type: "postgres"`，一等支持。（`db.md`） |
| RLS 能与 TypeORM 共存吗？ | **技术上可以，但会与 cool-admin 的应用层 tenant filter 冲突 — 不要天真组合。** |
| 这里 RLS 如何工作？ | PG 的 RLS 需要每 request/connection 设置 session variable（如 `SET app.tenant_id = N`）并定义 policies。TypeORM 使用 connection pool — 在 pooled connection 上设置 GUC 很脆弱（释放时必须重置）。 |
| 推荐 | **以 cool-admin 的应用层 `tenantId` filter 作为主隔离**（它已内置且经过设计）。只有当我们愿意：（a）使用 connection-pool hook（`@midwayjs/typeorm` 可用 `Subscriber`/connection listener）在 transaction 内 `SET LOCAL app.tenant_id`，并且（b）接受运维成本时，才把 PG RLS 作为**可选纵深防御**。MVP 中**应用层 filter 足够**，这也是 cool-admin 的设计路径。 |

**RLS 结论：可实现但可选。** cool-admin 的 Subscriber-based isolation 是预期路径并满足隔离；若监管/审计要求 DB-enforced isolation，RLS 可后续叠加。

### 5. 三端组织 — 推荐架构

cool-admin 的 RBAC + controller layout（`controller/admin`、`controller/app`、`controller/open`）与我们的三端清晰映射。这是最大的架构收益。

#### 每租户 RBAC scope（B 端商家管理员）
- RBAC 基于角色 + URL 权限（JWT，perms 缓存在 Redis key `admin:perms:<userId>`）。
- **每个商家租户** = tenant 表一行。商家员工是带 `tenantId` 的 `base_sys_user` 行。
- **Roles/menus/perms 可按租户配置**：商家管理员登录后，JWT 携带 `tenantId`，Subscriber 自动将所有数据过滤到本租户，同时角色限制可见菜单/API。
- **平台运营** = `admin` superuser（或 `tenantId = null` 的平台作用域用户）— 绕过租户 filter，看所有商家。用角色菜单分配给平台员工跨租户视图。

#### 推荐部署：一个后端、两个 admin 前端、一个移动 C 端

```
┌─────────────────────────────────────────────────────────────┐
│  ONE cool-admin Midway app  (shared codebase, shared DB)     │
│  src/modules/                                                │
│    base/        (RBAC, dict, file, tenant infra)             │
│    merchant/    (B-end merchant self-service business)       │
│      controller/admin/   ← B-end + platform admin APIs       │
│      controller/app/     ← (optional) merchant mini-program  │
│      controller/open/    ← public (no auth)                  │
│    platform/    (platform-ops-only cross-tenant APIs)        │
│      controller/admin/   ← guarded by platform role          │
│    consumer/    (C-end rental+retail)                        │
│      controller/app/     ← C-end mini-program APIs (/app/**) │
│      controller/open/    ← public C-end (no auth)            │
│    ...domain modules (order, goods, payment, etc.)           │
└─────────────────────────────────────────────────────────────┘
        ▲                ▲                          ▲
        │                │                          │
  [Admin Frontend]  [Admin Frontend]         [C-end mini-program]
  cool-admin-vue3   cool-admin-vue3          uni-app (WeChat)
  BUILD=merchant    BUILD=platform            calls /app/consumer/**
  same codebase,   same codebase,            (tenantId from C-end user
  menu set per      platform-only menus       login token — consumers
  merchant role     visible (superuser)       belong to a merchant tenant)
```

**为什么可行：**
1. **两个 admin surface（B + platform）= 一个 Vue3 前端 repo，两套 build configs + 两套 role sets。** 同一份 `cool-admin-vue3` 代码；`/admin/base/comm/permmenu` 返回的菜单列表本就按角色裁剪，因此商家 admin 与平台 admin 从同一后端看到不同菜单。可选择发两套品牌化 build（不同 logo/title/env）。**不需要两个后端实例。**
2. **C 端 consumer APIs 作为模块放在 cool-admin Midway app 内**（`src/modules/consumer/controller/app/`），通过 `/app/consumer/**` 访问。`/app/**` 前缀有自己的 auth middleware（`user` 模块的 `app.ts` middleware）— 与 `/admin/**` 的 token 流隔离。这样 C 端 auth（consumer JWT，可能基于 WeChat openid）与 B 端 admin auth 干净分离。
3. **C 端做模块还是独立服务 — MVP 结论：模块。** cool-admin 的 `/app/**` vs `/admin/**` 切分就是为“小程序 + admin console 共用一个后端”设计的。租赁+零售 consumer context 放进进程内意味着：与商家侧共享 entities/services（同 order、同 goods）、零 RPC、一个部署、更简单的租户接线。**只有当 C 端流量明显压过 admin 流量时**，再拆成独立 Node service（把 `consumer/` module 抽成独立 Midway app 复用同 entities，或放到 API gateway 后）。

### 6. 多租户上下文中的插件系统

- 插件**按设计是平台级**（通过 admin UI 安装到单一 app 实例；不是每租户独立包）。
- **插件创建的表**：如果插件 entities 继承 `BaseEntity`，它们继承 `tenantId` 并自动过滤 — **但这不保证**。许多插件（支付、SMS、OSS）创建的配置表可能有意全局（例如每商家一套微信支付 creds 是期望的，但 plugin config 在 app 层只存一份，通过 `PluginService.getConfig()` 读取）。**安装每个插件都要审计 schema**。
- `singleton` plugin flag 控制实例化，不控制租户。Singleton plugins 不能读取请求 `ctx`，所以不能 tenant-aware；任何租户作用域逻辑避免使用 singleton plugins。
- **冲突风险**：内部使用 raw SQL 的插件会绕过租户过滤（与第 3-G 节同坑）。优先使用数据访问走 `BaseEntity`/`BaseService` 的插件。

### 7. 风险、坑点、版本/维护关注

| 风险 | 严重度 | 缓解 |
|---|---|---|
| **版本不匹配**：GitHub `master` 是 v4.x（Midway 2.x、egg、无 tenant）。多租户需要 **v8.0.0+**。 | **高** | 明确获取 v8 release（release zip / tags 可见后 `git checkout <v8-tag>`）；文档站是 v8。不要 clone `master` 后期待有 tenant support。构建前确认 `package.json` 显示 `@midwayjs/core` 3.x/4.x 且 `src/modules/base/db/tenant.ts` 存在。 |
| **Raw SQL 绕过租户 filter**（`nativeQuery`/`sqlRenderPage`）。 | **高**（静默数据泄漏） | Lint rule 禁止 tenant-scoped modules 中的 raw SQL；任何跨租户 query 必须使用 `noTenant()` wrapper；code-review checklist。 |
| **RLS 非原生** — 默认仅应用层隔离。 | 中 | MVP 接受应用层 filter；只有审计要求 DB-enforced isolation 时再加 PG RLS。 |
| `synchronize: true` 自动建/改表 — 生产危险（数据丢失）。 | 中（docs 已警告） | 使用 migrations / 生产 `synchronize: false`。Cool-admin 文档明确说生产关闭。 |
| 文档化理念是 **No foreign keys**（性能、分片）。 | 低–中 | 租户完整性在应用层而非 DB 强制。可接受，但进一步说明 RLS/FK-based integrity 不是其惯用路径。 |
| EPS 生产必须关闭（暴露 schema）。 | 低 | 在 `config.prod.ts` 设置 `cool.eps: false`。 |
| 中文优先文档与社区；英文有一些。 | 低 | 团队读中文（匹配）。 |
| master 上 TypeORM 0.2.x；v8 TypeORM 版本待从 v8 package.json 确认。 | 低 | 确认 v8 TypeORM version；0.3.x 有 API 差异（如 `findOneBy`）。 |
| 插件表可能未继承 `tenantId` / 可能使用 raw SQL。 | 中 | 审计每个已安装插件；优先使用 `BaseEntity` 的插件。 |
| 维护：项目活跃（v8 刚发布多租户、i18n、AI flow）。MIT。 | 低（正面） | 上游健康。 |

### 相关 specs
- 本研究为任务 PRD/spec 中的多租户数据隔离设计（D3 — shared-DB + tenant_id + optional RLS）提供依据。

---

## 结论（面向决策）

1. **cool-admin 能否干净支持 shared-DB `tenant_id` 多租户？** **可以 — v8.0 起内置。** 注入点：`BaseEntity.tenantId` column + JWT `tenantId` claim + 扩展 TypeORM `Subscriber`（`after{Select,Insert,Update,Delete}QueryBuilder`）位于 `src/modules/base/db/tenant.ts`，会重写 SQL。Superuser `admin` + whitelisted URLs 绕过 filter（免费获得 platform-ops-sees-all）。**改造工作量：低**（配置 + entity 继承 + raw-SQL 纪律）。**必须用 v8，不是 master。**

2. **PostgreSQL + RLS 可实现吗？** PostgreSQL 完整支持。RLS 通过 connection-GUC hook **技术可行**，但会与 cool-admin 的应用层 filter 和 pooled connections 冲突 — 推荐以应用层 `tenantId` Subscriber filter 作为主隔离，RLS 作为后续可选防御层。**MVP 不需要。**

3. **三端组织？** 一个 cool-admin Midway app：`controller/admin/**` 同时服务 B 商家和平台运营（由 role + tenantId 区分，同一个 `cool-admin-vue3` repo 两套品牌 build）；`controller/app/consumer/**` 服务 C 端微信小程序，使用独立 token 流。MVP 把 C 端留在 app 内作为模块；只有流量要求时才拆独立服务。

4. **现在最需要标出的风险：**（a）**v8 sourcing** — 不要 clone master；（b）**raw-SQL tenant leak** — 需要团队规则；（c）auto-`synchronize` 和 EPS 生产必须关闭。

## 来源（均于 2026-07-07 抓取，HTTP 200）
- https://node.cool-admin.com/src/guide/core/tenant.html — multi-tenancy（v8）
- https://node.cool-admin.com/src/guide/core/db.html — TypeORM、MySQL/PG/SQLite、BaseEntity、transactions
- https://node.cool-admin.com/src/guide/core/module.html — module layout、config.ts、db.json、menu.json
- https://node.cool-admin.com/src/guide/core/authority.html — RBAC、JWT、/admin vs /app middleware
- https://node.cool-admin.com/src/guide/core/service.html — BaseService、modifyBefore/After、nativeQuery
- https://node.cool-admin.com/src/guide/core/controller.html — @CoolController、CRUD config、pageQueryOp
- https://node.cool-admin.com/src/guide/core/plugin.html — plugin system
- https://node.cool-admin.com/src/guide/core/eps.html — EPS（codegen endpoint scan）
- https://node.cool-admin.com/src/guide/quick.html — tech stack、dir structure、DB config
- https://node.cool-admin.com/src/introduce/src.html — repos（backend `cool-admin-midway`、frontend `cool-admin-vue`、MIT）
- https://github.com/cool-team-official/cool-admin-midway（master = v4.x/egg — **不是**需要的 v8）
- https://github.com/cool-team-official/cool-admin-vue（frontend；Vue3+Vite+element-plus 是当前版本）
- https://vue.cool-admin.com/ — 确认 “Cool Admin (Vue3)” frontend
