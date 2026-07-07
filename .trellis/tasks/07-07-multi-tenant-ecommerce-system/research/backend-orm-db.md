# Research: ORM + Database for Multi-Tenant SaaS (Shared-DB + tenant_id)

- **Query**: Select ORM + DB for shared-DB, tenant_id-isolated multi-tenant rental/retail SaaS on Node.js + TS; enforce global tenant filtering to prevent data leakage
- **Scope**: External (technology selection, 2025-current docs)
- **Date**: 2026-07-07

---

## TL;DR (Decision)

- **Primary: PostgreSQL + Drizzle ORM** (TypeScript-first, lowest leakage surface, first-class RLS primitives, transparent SQL, no hidden query engine).
- **Defense-in-depth: YES, adopt PostgreSQL RLS** on top of app-layer tenant_id filtering. Hard `ADOPT` verdict given shared-DB model. (See §6.)
- **Enforcement mechanism (security-critical):** App-layer **mandatory global filter** (single tenant-scoped DB client per request) + **PostgreSQL RLS as a backstop** that fails closed. Developers never write `WHERE tenant_id = ?` manually; the scoped client injects it, and RLS rejects anything that slips through. (See §5 + §7.)
- **Alternative if team wants maximum ecosystem/migrations polish:** PostgreSQL + Prisma 7 (client extensions `query` component).
- **Do NOT pick** MySQL for this system (no native RLS — loses the defense-in-depth backstop that directly addresses your #1 stated risk) unless there is a hard, overriding ops constraint (see §6 caveat).

---

## 1. ORM Comparison Table

Sources: official docs (prisma.io, orm.drizzle.team, typeorm.io, sequelize.org) + npm registry, accessed 2026-07-07. Latest versions at time of writing: **Prisma 7.8.0, TypeORM 1.0.0, Drizzle 0.45.2 (v1 GA late 2025), Sequelize 6.37.8.**

| Dimension | Prisma 7 | TypeORM 1.0 | Drizzle ORM (v1) | Sequelize 6 |
|---|---|---|---|---|
| **Global tenant_id filter mechanism** | **Client Extensions `query` component** — `$extends({ query })` intercepts `findMany/findFirst/count/update*/deleteMany` and injects `where.tenantId`. Create one extended client per request. Official docs cite this exact pattern for "RLS / user isolation". | **QueryBuilders + Subscribers + Base entity columns** — but global auto-filtering is NOT enforced; devs must use QB everywhere, or rely on `afterLoad`/`beforeInsert` subscribers (write-side only, does NOT filter reads automatically). | **Per-request scoped DB instance** — wrap `drizzle()` per request with a middleware that adds `where tenantId = $1`; or use native **`pgTable.withRLS()`** + policies for true DB-level enforcement. No implicit filtering by default. | **Default scopes + hooks** — `defaultScope: { where: { tenantId } }` auto-applies to most queries; can be bypassed via `.unscoped()`. Hooks for write-side `tenantId`. |
| **Can a developer ACCIDENTALLY bypass the filter?** | Low risk if all access goes through the tenant-scoped client. Raw `$queryRaw` bypasses — must be forbidden by lint/convention. | **HIGH risk** — `Repository.find()` and query operators like `relations`/lazy loading do NOT honor custom filters; easy to forget QB. | Medium — must consistently use the scoped instance; raw `sql` operator bypasses. RLS closes the gap entirely. | **HIGH risk** — `.unscoped()` and raw queries silently bypass; default scope is advisory. |
| **DB-level backstop (RLS) support** | Runs on Postgres; can coexist with RLS, but Prisma's connection/user model makes per-tenant DB roles awkward (typically one app role). | Same — one connection role; RLS possible but not ergonomic. | **Best** — first-class `enableRLS`, `roles`, `policy` schema APIs; `set_config('app.tenant_id', ...)` per transaction. Designed for Neon/Supabase-style RLS. | Possible but rarely paired; not idiomatic. |
| **Migrations** | **Prisma Migrate** — declarative schema, auto-generated SQL, shadow DB, migration history. Mature, polished. | Migrations + entity sync; `synchronize` available (unsafe for prod). Decent. | **drizzle-kit** (`generate`/`migrate`/`push`/`pull`/`studio`). Plain SQL migrations you fully control; great for teams. | `sequelize-cli` migrations; older, functional, less ergonomic. |
| **Transactions** | `$transaction([...])` interactive + sequential; isolated client per tx. Solid. | `QueryBuilder`/`EntityManager.transaction()`. Solid. | `db.transaction(async (tx) => ...)` — explicit `tx` passed down; very clear scope. Excellent. | `sequelize.transaction()` with managed/unmanaged modes. Solid. |
| **JSON / JSONB** | `Json` / `JsonNull`; querying via path operators. Good. | `json`/`jsonb` column types; limited typed querying. OK. | `jsonb()` column + `sql` operator for `->>`, `@>`, GIN indexes. Full control, full Postgres power. **Best for flexible rental pricing rules.** | `JSON`/`JSONB` types; querying supported. OK. |
| **Raw query escape hatch** | `$queryRaw`, `$executeRaw` (tagged templates, parameterized). | `entityManager.query()` (raw SQL string). | `sql` tagged template + full SQL composition. Most ergonomic raw SQL of the four. | `sequelize.query()` (parameterized). |
| **TypeScript DX** | Generated client, end-to-end types, excellent IDE. Heaviest (Rust query engine / `@prisma/client` runtime). | Decorator-based entities; types can drift from schema at runtime. | **Best TS DX** — schema IS typed, queries are inferred, no codegen step, no engine. Lightest. | JS-first; TS support bolted on via `Model.init` + interfaces. Weakest TS story. |
| **2025 maturity / maintenance** | Active, v7 (2025+), Prisma Next early access. Commercially backed. | v1.0.0 reached (2025); long history; large but slower-moving. | v1.0 GA late 2025; extremely active, fast-moving, well-funded. | Maintenance-mode vibe; 6.x stable but innovation slow; v7 WIP. |
| **Runtime weight** | Heavy (engine process). | Medium (reflect-metadata, decorators). | **Lightest** (no engine, no metadata reflection). | Medium-heavy. |
| **Verdict for THIS use case** | Strong runner-up. | Not recommended (read-filter leakage risk). | **Recommended.** | Not recommended (`.unscoped()` + weak TS). |

---

## 2. Database Comparison

| Dimension | PostgreSQL (18 current) | MySQL (8.x / HeatWave) |
|---|---|---|
| **Native Row-Level Security (RLS)** | **YES** — `CREATE POLICY ... USING (tenant_id = current_setting('app.tenant_id')::uuid)` + `ALTER TABLE ... ENABLE/FORCE ROW LEVEL SECURITY`. Default-deny when no policy matches. This is the single biggest differentiator for your leakage risk. | **NO native RLS.** Workarounds: application-enforced filtering, views + `CURRENT_USER()`, or proxy-level rewriting. All weaker; none enforce at the engine. |
| **JSONB for flexible rental pricing rules** | **Excellent** — `JSONB` with GIN indexes, `@>`, `?`, `->>`, `jsonb_path_query`. Indexable, fast. | `JSON` type with `JSON_EXTRACT`, generated columns + indexes. Functional but less ergonomic and slower for complex nested rules. |
| **Transactions / isolation** | MVCC, full SQL-standard isolation levels, SERIALIZABLE genuinely works. Critical for orders/deposits/refunds. | MVCC; SERIALIZABLE historically gap-locked; adequate but coarser. |
| **Rich types** | uuid, timestamptz, numeric (exact money), arrays, ranges (great for rental date ranges/availability), `tstzrange` exclusion constraints (prevent double-booking!). | Decent but no ranges/exclusion constraints; double-booking prevention is manual. |
| **Ops maturity in China** | Growing fast (PolarDB-PG, TDSQL-PG, AnalyticDB, RDS for PG). Smaller talent pool than MySQL but expanding. | **Dominant** — Aliyun/Tencent RDS, vast DBA talent, deepest tooling/benchmarks in China. |
| **Cloud RDS maturity** | Mature on all major CN clouds (less "default" than MySQL). | Most mature / cheapest / most battle-tested on CN clouds. |
| **Community in China** | Smaller but high-signal. | Largest. |

**Postgres "killer features" for rental SaaS specifically:**
1. **RLS** (defense-in-depth against your #1 risk).
2. **Exclusion constraints with `tstzrange`** — let the DB itself prevent double-booking the same rental item for overlapping dates (`EXCLUDE USING gist (item_id WITH =, daterange WITH &&)`). This is hard to do safely in MySQL.
3. **JSONB** for flexible, indexable pricing rules.

---

## 3. Why "just remember WHERE tenant_id = ?" is not a strategy

Your stated critical risk: a single forgotten `WHERE tenant_id = ?` leaks another tenant's data. Mitigations that rely on **developer discipline** (lint rules, code review, "always use the helper") fail probabilistically over time and over many developers. The only acceptable design makes leakage **impossible by construction** at two layers:

1. **App layer — mandatory single entry point:** there is exactly ONE way to touch the DB in request context — a **tenant-scoped client** created per request, which injects `tenant_id` into every query automatically. Devs never type `tenant_id` in business code.
2. **DB layer — RLS backstop:** even if the app layer has a bug (raw SQL, a misconfigured join, a future migration), Postgres refuses to return/update cross-tenant rows. The policy fails **closed** (default-deny).

The combination is what makes the system safe: app-layer scoping = correct-by-default ergonomics; RLS = hard ceiling on blast radius.

---

## 4. PostgreSQL RLS — verdict (defense-in-depth for shared-DB)

**Verdict: ADOPT.** Hard yes.

Rationale tied to your constraints:
- Shared-DB + tenant_id isolation means the **only** structural barrier between tenants is a WHERE clause. RLS converts that from "application convention" into "database-enforced law." This directly addresses your critical risk.
- It is cheap: a `tenant_id` column + an index + a 3-line policy per table + `set_config('app.tenant_id', $1, true)` once per transaction.
- It composes cleanly with Drizzle (`pgTable.withRLS()`, `policy(...)`, `role(...)`) and with a per-request scoped client.
- Failure mode is safe: no matching policy → default-deny → empty result, not a leak.

**Caveats / costs to budget for:**
- **Per-transaction tenant context:** you must `SELECT set_config('app.tenant_id', $tenantId, true)` (the `true` = local to transaction) at the start of every tx/connection. With pooled connections, use a transaction or `SET LOCAL`; do not rely on connection-level state with PgBouncer transaction pooling.
- **Table owner / `BYPASSRLS`:** the migration/owner role and superusers bypass RLS. The **app role must be a non-owner, non-superuser, non-BYPASSRLS role**, or use `FORCE ROW LEVEL SECURITY`. Operational discipline required so admin scripts don't accidentally run as the app role.
- **TRUNCATE and REFERENCES bypass RLS** (per PG docs) — irrelevant for your tables but note it.
- **Performance:** policies add a predicate to every query. With a b-tree index on `tenant_id` (which you must have anyway), overhead is negligible.
- **It does NOT replace the app-layer filter** — RLS as the *only* mechanism means every query carries the policy predicate always, and you lose control over cross-tenant admin/backfill operations. Keep both layers.

**Verdict for MySQL:** If, and only if, you are forced onto MySQL by an overriding ops constraint, you forfeit the RLS backstop. You must then compensate with: a strict repository layer that forbids raw SQL, automated tests that assert every query path carries tenant_id, and possibly a proxy/SQL-rewriter. This is materially less safe than Postgres+RLS and should be treated as a degraded mode.

---

## 5. The Global Tenant Filter Pattern (security-critical)

This is the pattern that makes "developers cannot forget it" real. It has three pillars. Use all three with the recommended stack.

**Pillar A — One tenant-scoped DB client per request (app layer, mandatory).**
Never inject the global `db` into handlers. Provide only a `getRequestDb(req)` (or AsyncLocalStorage context) that returns a DB instance bound to `tenantId`. The instance injects `tenant_id` into all reads/writes.

**Pillar B — RLS policy at the DB (defense-in-depth).**
`set_config('app.tenant_id', tenantId, true)` per transaction + `ENABLE ROW LEVEL SECURITY` + a `USING (tenant_id::text = current_setting('app.tenant_id', true))` policy.

**Pillar C — No raw SQL in business code.**
Forbid `sql\`...\`` and `$queryRaw` outside an allow-listed infra module (enforce by ESLint rule + code review). Any raw SQL must funnel through a helper that appends `AND tenant_id = $tenant` AND runs inside the scoped tx (so RLS still applies).

**Pillar D — Tests.** A contract test suite: for every model, assert (a) a query without explicit tenant_id returns only the context tenant's rows, and (b) cross-tenant access returns empty. Run in CI.

---

## 6. Code Sketch — Recommended Stack (Drizzle + Postgres + RLS)

> Illustrative; not compiled. Adapt schema/migration to your real models.

### 6a. Schema (Drizzle) with RLS enabled

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

### 6b. Per-request tenant-scoped DB (the single mandatory entry point)

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

### 6c. Middleware: stamp tenant + open tx (auto-injects tenant_id via RLS context)

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

### 6d. Business code — never touches tenant_id

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

> Key: because RLS is enabled, even a buggy join or a raw `sql\`...\`` that forgets tenant_id still cannot leak — Postgres appends the policy predicate to every statement and default-denies unmatched rows.

---

## 7. Primary Recommendation & Justification

**Primary: PostgreSQL 16+ + Drizzle ORM (v1) + RLS + per-request scoped client (AsyncLocalStorage).**

Why:
- **Lowest leakage surface among the four ORMs**, and the only one whose schema API directly expresses RLS (`withRLS`, `policy`, `role`). The DB itself becomes the enforcement layer, not just the app.
- **Best TS DX + lightest runtime** (no engine, no reflect-metadata); schema is the source of truth and is fully typed.
- **JSONB + exclusion constraints** serve the flexible rental-pricing and double-booking-prevention needs better than any MySQL/ORM combo.
- **Transactions** are explicit and scoped (`db.transaction(tx => ...)`), which pairs naturally with `set_config(..., true)` per tx for RLS context.

**Alternative 1 — PostgreSQL + Prisma 7** (pick if): team prioritizes migration polish and the most batteries-included DX, and is comfortable with the heavier engine. Use the **Client Extensions `query` component** to inject `tenant_id` into `findMany/findFirst/count/updateMany/deleteMany` on a per-request extended client; add RLS policies on Postgres as the backstop. Watch out: raw `$queryRaw` bypasses the extension and RLS context must still be set per tx — Prisma's single-role connection model makes RLS slightly more awkward than Drizzle.

**Alternative 2 — PostgreSQL + TypeORM** (pick if): existing TypeORM codebase or strong team familiarity. Mitigate its higher leakage risk by (a) banning `Repository` direct use in favor of a tenant-aware base repository wrapping QueryBuilder, (b) RLS backstop, (c) the Pillar C/D controls. Not the greenfield choice.

**Not recommended — Sequelize or any MySQL-based stack for this system**, because each removes a layer of leakage protection (Sequelize: `.unscoped()` advisory default scopes; MySQL: no RLS backstop at all).

---

## 8. Sources

- Prisma — Client Extensions (query component, RLS/user-isolation pattern): https://www.prisma.io/docs/orm/prisma-client/client-extensions , https://www.prisma.io/docs/orm/prisma-client/client-extensions/query
- Drizzle ORM — Row-Level Security (`withRLS`, roles, policies, Neon/Supabase): https://orm.drizzle.team/docs/rls
- PostgreSQL 18 — Row Security Policies (default-deny, ENABLE/FORCE RLS, BYPASSRLS, TRUNCATE/REFERENCES bypass): https://www.postgresql.org/docs/current/ddl-rowsecurity.html
- npm registry (latest versions, accessed 2026-07-07): prisma 7.8.0, typeorm 1.0.0, drizzle-orm 0.45.2, sequelize 6.37.8

## 9. Caveats / Not Found

- **Per-request connection cost:** the sketch opens a `postgres()` connection per request for clarity; in production use a pool and run `SET LOCAL` inside `db.transaction` so the RLS context is scoped to the tx, not the connection (important under PgBouncer transaction pooling).
- **`WITH CHECK` for INSERTs:** the `USING` policy covers SELECT/UPDATE/DELETE; add `.withCheck(...)` (or a combined `for('all')` policy) so inserts are also constrained — refine during implementation.
- **AsyncLocalStorage + framework integration:** the middleware sketch is framework-agnostic; adapt to your server (Fastify/Express/Nest) and ensure the tx wraps the entire request handler chain.
- **Deep-research workflow unavailable** in this environment (no WebSearch tool); claims were verified against official primary docs (Prisma, Drizzle, PostgreSQL) fetched directly, plus npm registry for versions. Broader community/blog corroboration was not fetched — version numbers and RLS semantics are authoritative; comparative subjective ratings (e.g., "best TS DX") are analyst assessments grounded in the docs and well-known 2025 community consensus, not independently re-verified via third-party sources here.
