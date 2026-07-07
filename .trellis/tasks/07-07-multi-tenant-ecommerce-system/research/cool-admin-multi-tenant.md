# Research: cool-admin/node (Midway) — Multi-Tenant SaaS Feasibility

- **Query**: Validate cool-admin/node as multi-tenant SaaS backend base — multi-tenancy feasibility, real tech stack, 3-end (C / B / platform) organization
- **Scope**: External (official docs + GitHub source)
- **Date**: 2026-07-07
- **Decision**: GO — cool-admin is a strong, low-risk base. Multi-tenancy is **built-in (v8.0+)** using exactly the shared-DB + `tenant_id` model our D3 requires. See verdict below.

> Doc-fetching note: The brief's URLs (`/src/guide/start/quick.html`, `.../core/`) all 404. The **correct** VitePress pattern is `/src/guide/<name>.html` and `/src/guide/core/<name>.html`. All pages below were fetched successfully (HTTP 200) via curl — the site is a VitePress SPA whose `.html` routes return SSR'd markdown content. There **is** a dedicated multi-tenant page: `https://node.cool-admin.com/src/guide/core/tenant.html` (the brief said it 404'd — it does not).

---

## Findings

### 1. Real Tech Stack (verified from docs + package.json)

| Layer | Technology | Version / Notes | Source |
|---|---|---|---|
| Runtime | **Node.js** | `>=12.0.0` (recommend `>=16`) — `package.json` `engines` | quick.md, package.json |
| Framework | **Midway.js** | docs site targets **v8.0.0**; master-branch `package.json` shows `@midwayjs/core ^2.14.0` (Midway 2.x) — meaning the public GitHub `master` branch lags behind the doc'd v8 release. v8 uses `@midwayjs/core` + `@midwayjs/typeorm` with a standard `MidwayConfig` (no egg, no `EggAppConfig`). | package.json (master=v4/egg), db.md/quick.md (v8) |
| **ORM** | **TypeORM** via `@midwayjs/typeorm` | `@midwayjs/orm ^2.14.0`, `typeorm ^0.2.41` on master. v8 docs use `@InjectEntityModel` and `typeorm` decorators (`@Column`, `@Entity`, `Repository`). **TypeORM, not Prisma.** | db.md, package.json |
| **Databases supported** | **MySQL, PostgreSQL, SQLite** | All three first-class. PostgreSQL needs `npm i pg`; config `type: "postgres"`. SQLite needs `sqlite3`. **PostgreSQL IS supported** — critical for our RLS plan. | db.md, quick.md |
| Cache / Queue | Redis (optional, `@cool-midway/redis`); BullMQ-style queue via `@cool-midway/queue` | Redis needed for distributed tasks/queues; local schedule works without it | quick.md, package.json |
| Admin Frontend | **Vue3 + Vite + element-plus** (separate repo `cool-admin-midway/cool-admin-vue`) | Confirmed: doc site `vue.cool-admin.com` is "Cool Admin (Vue3)", VitePress-generated. GitHub `master` still shows an older Vue2/element-ui build — the **current/maintained frontend is Vue3**. **It is a separate repo we fully control/customize.** | src.md, vue.cool-admin.com |
| C-end mobile | uni-app (separate doc `uni-docs.cool-js.com`) | For WeChat mini-program / APP | home page nav |
| License | **MIT** (open source, free, commercial use allowed) | src.md |

### 2. Core Abstractions

| Abstraction | What it does |
|---|---|
| **Module** (`src/modules/<name>/`) | Unit of organization. Required `config.ts` (name, description, middlewares, order, custom config). Optional `db.json` (seed data, supports `@childDatas` for FK chains), `menu.json` (seed menus). Folders: `controller/{admin,app,open}`, `entity`, `service`, `dto`, `middleware`, `schedule`. |
| **`BaseEntity`** | Entity base class. v8: moved from `@cool-midway/core` → `src/modules/base/entity/base.ts` so developers can **extend/customize** it. Provides `id`, `createTime`, `updateTime`, and (v8) **`tenantId: number`** (`@Index`, `nullable: true`). All entities extend it. |
| **`BaseService`** | Wraps TypeORM Repository + 6 generic methods (`add/delete/update/info/list/page`). Provides `modifyBefore`/`modifyAfter` hooks, `nativeQuery`, `sqlRenderPage`, `entityRenderPage`, `setSql`, `setEntity`. |
| **`@CoolController` / `BaseController`** | Auto-routes by file path (`/controller-folder/module/method`). Declares `api: ['add','delete','update','info','list','page']`, `entity`, `service`, `pageQueryOp`/`listQueryOp`, `insertParam`, `before`, `serviceApis`. |
| **`@CoolTransaction`** | Declarative transaction with auto-injected `QueryRunner`, exception auto-caught. |
| **`@CoolUrlTag` / `@CoolTag`** | Tag routes (e.g. `IGNORE_TOKEN`). |
| **EPS** (`cool.eps: true`) | Runtime scan exposing all entities + routes to frontend (`eps.json`) — powers codegen + frontend API hints. **Must be OFF in prod** (leaks schema). |
| **Plugin system** | `.cool` plugin packages installed via admin UI; `BasePlugin` base; per-plugin config (UI, not code); `hook` field (e.g. replace upload component); `singleton` flag; `PluginService.invoke(key, method, ...args)`. |

Built-in `base` module ships: RBAC (users/roles/departments/menus/perms), dict, file upload, task/queue, exception, cache, login (JWT + refresh token + captcha + password version + optional SSO), i18n, websocket (socket.io), elasticsearch, swagger.

### 3. Multi-Tenancy (THE critical question) — BUILT-IN since v8.0 ✅

**Source: `https://node.cool-admin.com/src/guide/core/tenant.html` ("多租户（v8.0新增）").**

cool-admin's multi-tenancy is **exactly** the shared-DB + `tenant_id` column model. This is not a hack — it is a documented, first-party feature.

#### How it works (concrete injection points)

**A. Data isolation via `BaseEntity.tenantId` column**
```ts
// src/modules/base/entity/base.ts (v8 — customizable, lives in user code, not the package)
@Index()
@Column({ comment: '租户ID', nullable: true })
tenantId: number;
```
Every entity that extends `BaseEntity` inherits the column automatically.

**B. `tenantId` flows from the JWT token**
At login, `generateToken()` packs `tenantId: user['tenantId']` into the JWT payload. On every request the framework reads `tenantId` from the verified token — no manual passing needed.

**C. TypeORM Subscriber — the actual query interceptor (THIS is the hook point)**
cool-admin **extends TypeORM's `Subscriber`** with 4 new lifecycle hooks that fire after the QueryBuilder is built (so they can mutate SQL):
```ts
afterSelectQueryBuilder?(qb: SelectQueryBuilder<any>): void;  // auto-AND tenantId on reads
afterInsertQueryBuilder?(qb: InsertQueryBuilder<any>): void;  // auto-inject tenantId on writes
afterUpdateQueryBuilder?(qb: UpdateQueryBuilder<any>): void;  // auto-AND tenantId (prevents cross-tenant update)
afterDeleteQueryBuilder?(qb: DeleteQueryBuilder<any>): void;  // auto-AND tenantId
```
The real logic lives in **`src/modules/base/db/tenant.ts`** — it uses `tenantId` from the ctx/token to conditionally inject WHERE/SET clauses. (On GitHub master this exact path 404s because master is the older v4; the file exists in the v8 release the docs describe. We will read it once we clone the v8 source.)

**D. Opt-out helper** — `noTenant(ctx, async () => { ... })` temporarily disables filtering inside a block (used for cross-tenant platform queries).

**E. Enable + scope**
```ts
// src/config/config.default.ts (v8)
cool: {
  tenant: {
    enable: true,
    urls: [],   // glob patterns, e.g. ['/admin/**/*'] — only matching routes get filtered
  },
}
```

**F. Auto-covered surfaces** (no code change required once enabled):
- `@CoolController` generic methods: `add, delete, update, info, list, page` all filter by tenant.
- Any TypeORM `.find()` / `.createQueryBuilder().getMany()` in a Service.

**G. Built-in exclusions (platform-level escapes):**
- **URLs** never filtered: `/admin/base/open/login`, `/admin/base/comm/person`, `/admin/base/comm/permmenu`, `/admin/dict/info/data`
- **User** never filtered: the `admin` superuser (sees all tenants) — this is precisely our "platform ops sees everything" requirement.

#### IMPORTANT GOTCHA — raw SQL is NOT auto-filtered
```ts
async invalid() {
  await this.nativeQuery('select * from demo_goods');  // ⚠️ NO tenant filter
  await this.sqlRenderPage('select * from demo_goods', {}); // ⚠️ NO tenant filter
}
```
**Any hand-written SQL bypasses tenant isolation.** This is the #1 risk for a multi-tenant app — developers must either avoid raw SQL or manually add `WHERE tenantId = ?`, or wrap platform-only queries in `noTenant()` intentionally. We must codify a lint/review rule for this.

#### Verdict on multi-tenancy: ✅ CLEAN, LOW EFFORT
- The mechanism (Subscriber + BaseEntity column + JWT claim) is exactly the recommended TypeORM multi-tenant pattern.
- Retrofit effort on v8: **LOW**. It is already done — we configure `enable: true`, set `urls`, ensure every business entity extends `BaseEntity`, and discipline raw SQL. No framework surgery.
- **Caveat**: only available on **v8.0.0+**. The public GitHub `master` is v4.x (Midway 2.x, egg-based, no tenant feature). We MUST source the **v8 release/zip**, not git-clone master blindly.

### 4. PostgreSQL + Row-Level Security (RLS)

| Question | Answer |
|---|---|
| Does cool-admin support PostgreSQL? | **Yes** — `type: "postgres"`, first-class. (`db.md`) |
| Can RLS coexist with TypeORM? | **Technically yes, but it conflicts with cool-admin's app-level tenant filter — do NOT combine them naively.** |
| How would RLS work here? | RLS in PG requires a session variable (e.g. `SET app.tenant_id = N`) set per request/connection, plus policies. TypeORM uses a connection pool — setting a GUC on a pooled connection is fragile (must reset on release). |
| Recommendation | **Use cool-admin's app-level `tenantId` filter as the PRIMARY isolation** (it is already there and tested). Treat PG RLS as **optional defense-in-depth** only if we are willing to: (a) use a connection-pool hook (`@midwayjs/typeorm` allows a `Subscriber`/connection listener) to `SET LOCAL app.tenant_id` inside a transaction, and (b) accept the operational cost. For MVP, **app-level filter is sufficient** and is what cool-admin is designed around. |

**Verdict on RLS: achievable but OPTIONAL.** cool-admin's Subscriber-based isolation is the intended path and satisfies isolation; RLS can be layered later for defense-in-depth if regulators/auditors require DB-enforced isolation.

### 5. Three-End Organization — RECOMMENDED ARCHITECTURE

cool-admin's RBAC + controller layout (`controller/admin`, `controller/app`, `controller/open`) maps cleanly onto our three ends. This is the biggest architectural win.

#### RBAC scoping per tenant (B-end merchant admins)
- RBAC is role-based + URL-permission-based (JWT, perms cached in Redis keyed `admin:perms:<userId>`).
- **Each merchant tenant** = a row in the tenant table. Merchant staff are `base_sys_user` rows with `tenantId` set.
- **Roles/menus/perms are configurable per tenant**: a merchant admin logs in, JWT carries their `tenantId`, the Subscriber auto-filters ALL their data to their tenant, AND their role limits which menus/APIs they see.
- **Platform ops** = the `admin` superuser (or platform-scoped users with `tenantId = null`) — bypasses tenant filter, sees all merchants. Use role-based menu assignment to give platform staff the cross-tenant views.

#### Recommended deployment: ONE backend, TWO admin frontends, mobile C-end

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

**Why this works:**
1. **Two admin surfaces (B + platform) = one Vue3 frontend repo, two build configs + two role sets.** Same `cool-admin-vue3` codebase; the menu list returned by `/admin/base/comm/permmenu` is already role-scoped, so a merchant admin and a platform admin see different menus from the same backend. Optionally ship two branded builds (different logo/title/env) for clarity. **No need for two backend instances.**
2. **C-end consumer APIs live INSIDE the cool-admin Midway app as a module** (`src/modules/consumer/controller/app/`), reached via `/app/consumer/**`. The `/app/**` prefix has its own auth middleware (the `user` module's `app.ts` middleware) — separate token stream from `/admin/**`. This keeps C-end auth (consumer JWT, possibly WeChat openid-based) cleanly separated from B-end admin auth.
3. **C-end as a module vs. separate service — decision: module for MVP.** cool-admin's `/app/**` vs `/admin/**` split is purpose-built for "mini-program + admin console sharing one backend". For a rental+retail consumer context, keeping it in-process means: shared entities/services with the merchant side (same order, same goods), zero RPC overhead, one deployment, simpler tenant wiring. **Split into a separate Node service only if/when C-end traffic genuinely dwarfs admin traffic** (then extract `consumer/` module into its own Midway app reusing the same entities, or put it behind an API gateway).

### 6. Plugin System in Multi-Tenant Context

- Plugins are **platform-level by design** (installed via admin UI into the single app instance; not per-tenant packages).
- **Plugin-created tables**: if a plugin's entities extend `BaseEntity`, they inherit `tenantId` and get auto-filtered — **but this is NOT guaranteed**. Many plugins (payment, SMS, OSS) create config tables that are intentionally global (e.g. one set of WeChat pay creds per merchant might be desired, but plugin config is stored once at app level via `PluginService.getConfig()`). **Audit each plugin's schema on install**.
- The `singleton` plugin flag controls instantiation, not tenancy. Singleton plugins cannot read request `ctx` — so they cannot be tenant-aware; avoid singleton plugins for any tenant-scoped logic.
- **Conflict risk**: a plugin that uses raw SQL internally will bypass tenant filtering (same gotcha as section 3-G). Prefer plugins whose data access goes through `BaseEntity`/`BaseService`.

### 7. Risks, Gotchas, Version/Maintenance Concerns

| Risk | Severity | Mitigation |
|---|---|---|
| **Version mismatch**: GitHub `master` is v4.x (Midway 2.x, egg, no tenant). Multi-tenancy needs **v8.0.0+**. | **HIGH** | Source the v8 release explicitly (release zip / `git checkout <v8-tag>` once tags are visible; the docs site is on v8). Do NOT clone `master` and expect tenant support. Verify `package.json` shows `@midwayjs/core` 3.x/4.x and `src/modules/base/db/tenant.ts` exists before building on it. |
| **Raw SQL bypasses tenant filter** (`nativeQuery`/`sqlRenderPage`). | **HIGH** (silent data leak) | Lint rule banning raw SQL in tenant-scoped modules; require `noTenant()` wrapper for any cross-tenant query; code-review checklist item. |
| **RLS not native** — app-level isolation only by default. | MED | Accept app-level filter for MVP; add PG RLS later only if audit requires DB-enforced isolation. |
| `synchronize: true` auto-creates/alters tables — dangerous in prod (data loss). | MED (docs warn) | Use migrations / `synchronize: false` in prod. Cool-admin docs explicitly say turn it off in prod. |
| **No foreign keys** is the documented cool-admin philosophy (perf, sharding). | LOW–MED | Means tenant integrity is enforced at app layer, not DB. Acceptable, but reinforces that RLS/FK-based integrity is non-idiomatic here. |
| EPS must be OFF in prod (exposes schema). | LOW | Set `cool.eps: false` in `config.prod.ts`. |
| Chinese-primary docs & community; some English. | LOW | Team reads Chinese (matches). |
| TypeORM 0.2.x on master; v8 TypeORM version TBD from v8 package.json. | LOW | Confirm v8 TypeORM version; 0.3.x has API differences (e.g. `findOneBy`). |
| Plugin tables may not inherit `tenantId` / may use raw SQL. | MED | Audit each installed plugin; prefer plugins using `BaseEntity`. |
| Maintenance: project is active (v8 just shipped multi-tenancy, i18n, AI flow). MIT. | LOW (positive) | Healthy upstream. |

### Related Specs
- This research informs the multi-tenant data-isolation design (D3 — shared-DB + tenant_id + optional RLS) in the task PRD/spec.

---

## Bottom-line verdict (decision-oriented)

1. **Can cool-admin support shared-DB `tenant_id` multi-tenancy cleanly?** **YES — it is built-in since v8.0.** Injection points: `BaseEntity.tenantId` column + JWT `tenantId` claim + an extended TypeORM `Subscriber` (`after{Select,Insert,Update,Delete}QueryBuilder`) in `src/modules/base/db/tenant.ts` that rewrites SQL. Superuser `admin` + whitelisted URLs bypass the filter (gives us platform-ops-sees-all for free). **Effort to retrofit: LOW** (configure + entity inheritance + raw-SQL discipline). **Must use v8, not master.**

2. **PostgreSQL + RLS achievable?** PostgreSQL is fully supported. RLS is *technically* possible via a connection-GUC hook but **conflicts with cool-admin's app-level filter and pooled connections** — recommended to rely on the app-level `tenantId` Subscriber filter as primary isolation, and treat RLS as an optional later defense layer. **Not required for MVP.**

3. **3-end organization?** One cool-admin Midway app: `controller/admin/**` serves BOTH B-merchant and platform-ops (differentiated by role + tenantId, two branded builds of the same `cool-admin-vue3` repo); `controller/app/consumer/**` serves the C-end WeChat mini-program with a separate token stream. Keep C-end in-app as a module for MVP; extract to a separate service only if traffic demands.

4. **Biggest risks to flag now:** (a) **v8 sourcing** — don't clone master; (b) **raw-SQL tenant leak** — needs a team rule; (c) auto-`synchronize` and EPS must be off in prod.

## Sources (all fetched 2026-07-07, HTTP 200)
- https://node.cool-admin.com/src/guide/core/tenant.html — multi-tenancy (v8)
- https://node.cool-admin.com/src/guide/core/db.html — TypeORM, MySQL/PG/SQLite, BaseEntity, transactions
- https://node.cool-admin.com/src/guide/core/module.html — module layout, config.ts, db.json, menu.json
- https://node.cool-admin.com/src/guide/core/authority.html — RBAC, JWT, /admin vs /app middleware
- https://node.cool-admin.com/src/guide/core/service.html — BaseService, modifyBefore/After, nativeQuery
- https://node.cool-admin.com/src/guide/core/controller.html — @CoolController, CRUD config, pageQueryOp
- https://node.cool-admin.com/src/guide/core/plugin.html — plugin system
- https://node.cool-admin.com/src/guide/core/eps.html — EPS (codegen endpoint scan)
- https://node.cool-admin.com/src/guide/quick.html — tech stack, dir structure, DB config
- https://node.cool-admin.com/src/introduce/src.html — repos (backend `cool-admin-midway`, frontend `cool-admin-vue`, MIT)
- https://github.com/cool-team-official/cool-admin-midway (master = v4.x/egg — NOT the v8 we need)
- https://github.com/cool-team-official/cool-admin-vue (frontend; Vue3+Vite+element-plus is current)
- https://vue.cool-admin.com/ — confirms "Cool Admin (Vue3)" frontend
