# Research: Minimal Viable PostgreSQL RLS Prototype (Shared-Schema Multi-Tenant)

- **Query**: Research a minimal viable PostgreSQL Row-Level Security prototype on one tenant-owned table (`demo_resources`) to prove the defense-in-depth pattern end-to-end. Cover DDL recipe, per-transaction context hook, dev/test ergonomics, migration packaging, and negative test design.
- **Scope**: mixed (internal repo context + external PostgreSQL RLS semantics)
- **Date**: 2026-07-13
- **Target**: PR2 task `pr2-ci-rls-migration` (`.trellis/tasks/07-13-pr2-ci-rls-migration/task.json`)

---

## TL;DR — Recommended Prototype

- **Table**: `demo_resources` — the existing PR1 demo resource table (`packages/backend/src/core/database/migrations/1783161600000-init-demo-resources.ts`).
- **RLS context GUC name**: `app.tenant_id`.
- **CRITICAL correction to the task prompt**: `demo_resources.tenant_id` is `varchar(64)` (verified), NOT `uuid`. The policy must compare `tenant_id = current_setting('app.tenant_id', true)` as **text**. The prompt's example `::uuid` cast would raise `invalid input syntax for type uuid` on every query. (Source: `base-tenant.entity.ts:14` `@Column({ name: 'tenant_id', type: 'varchar', length: 64 })`; migration line 20.)
- **The blocker for any test that wants to *exercise* RLS**: the app connects as `postgres`, which per `docker-compose.yml:11-12` is a **superuser**. Superusers ALWAYS bypass RLS, and `FORCE ROW LEVEL SECURITY` does NOT change that. The prototype MUST connect (or `SET LOCAL ROLE`) as a non-superuser, non-owner role to make RLS actually fire. This is the single most important caveat.
- **Where `set_config` goes**: inside an explicit transaction, via `queryRunner.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId])` *before* any business query on the same `queryRunner`. For the prototype test, the test opens the transaction. For production wiring (out of scope for the prototype but documented below), a request-scoped middleware would own the transaction and store the `queryRunner` in the request context for repositories to reuse.
- **The one negative test that proves it**: with the app guard intentionally *bypassed* (raw `queryRunner.query('SELECT * FROM demo_resources')` — no `WHERE tenant_id`), set the GUC to tenant A, then assert only tenant A's rows return and that a cross-tenant `INSERT`/`UPDATE` is rejected by `WITH CHECK`. This proves RLS catches what the app guard forgot — the whole point of defense-in-depth.

---

## Findings

### Files Found (Repo Context)

| File Path | Relevance |
|---|---|
| `.trellis/spec/backend/database-guidelines.md` (§RLS 指南, lines 166-176) | Authoritative spec — prescribes non-owner/non-superuser/no-BYPASSRLS role, `set_config('app.tenant_id', tenantId, true)`, `USING`+`WITH CHECK`, optional `FORCE`, platform jobs use explicit roles. |
| `packages/backend/src/core/database/migrations/1783161600000-init-demo-resources.ts` | The single existing migration + the target table DDL. Note: line 20 `tenant_id varchar(64)`, line 18 `id uuid DEFAULT uuid_generate_v4()` (no SERIAL → no sequence on this table). |
| `packages/backend/src/core/database/base-tenant.entity.ts:14` | Confirms `tenantId: string` mapped to `tenant_id varchar(64)` for ALL tenant-owned tables. Policy text-comparison applies to every future tenant table too. |
| `packages/backend/src/core/tenant/tenant.middleware.ts` | The hook point for production `set_config` injection (currently only sets AsyncLocalStorage, no DB touch). |
| `packages/backend/src/core/tenant/tenant-context.ts` | `runWithTenantContext` / `requireTenantId` / `isPlatformContext` — the RLS helper will call into this for the GUC value. |
| `packages/backend/src/core/database/tenant-repository.ts` | App-layer guard (`TenantAwareRepository` wraps `createQueryBuilder`). RLS is defense-in-depth UNDER this — both must agree on `tenant_id` semantics. |
| `packages/backend/src/core/database/tenant.subscriber.ts` | Project-own guard hooks (`after*QueryBuilder`). Not a TypeORM subscriber; must be called explicitly. |
| `packages/backend/src/core/database/data-source.ts` | Standalone DataSource for CLI/seed. Connects as `process.env.DB_USER \|\| 'postgres'`. |
| `packages/backend/src/config/config.default.ts:21-40` | Midway TypeORM runtime config — connects as `postgres` by default. This is the role that must be changed (or `SET ROLE` away from) to exercise RLS. |
| `packages/backend/src/configuration.ts:49` | `this.app.useMiddleware(['tenant'])` — where a future `set_config`-injecting middleware would also be registered. |
| `packages/backend/docker-compose.yml:11-12` | `POSTGRES_USER: postgres` — **superuser**. Root cause of "RLS silently no-op in dev" if you don't introduce a separate role. |
| `packages/backend/docker/init-db.sql` | First-container-startup SQL (creates `rent_test`). Natural place to `CREATE ROLE rent_app` once, but only runs on empty data dir — must ALSO be in a migration for idempotency on existing volumes. |
| `packages/backend/test/real-demo-resource.test.ts` | Existing real-PG integration test harness. Pattern to mirror for the RLS negative test (separate `DataSource`, skip on PG unavailable). |
| `packages/backend/src/modules/demo-resource/service/demo-resource.service.ts:15-19` | How `TenantAwareRepository` is constructed per-call from `@InjectEntityModel` repo — informs how a transaction-aware variant would inject a queryRunner. |

### Spec Contracts Already On The Books

`.trellis/spec/backend/database-guidelines.md` §RLS 指南 (lines 166-176) literally prescribes the prototype direction:

- App role is **not** table owner, **not** superuser, **no `BYPASSRLS`**.
- `set_config('app.tenant_id', tenantId, true)` per-transaction (the `true` = transaction-local, equivalent to `SET LOCAL`).
- `USING` and `WITH CHECK` policies so read AND write default-deny.
- `FORCE ROW LEVEL SECURITY` where appropriate.
- Platform jobs use explicit platform roles, never the merchant connection.
- Closing line (176): *"RLS 不替代应用层 scoping；它是针对漏掉 filters 和未来 raw-query mistakes 的数据库兜底."* — this is the prototype's success criterion.

---

## 1. Minimal DDL Recipe

### 1.1 Role

```sql
-- Idempotent: CREATE ROLE has no IF NOT EXISTS.
DO $$
BEGIN
  CREATE ROLE rent_app WITH LOGIN PASSWORD 'rent_app_pwd';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- NOT SUPERUSER, NO BYPASSRLS are defaults for CREATE ROLE non-superuser,
-- but be explicit for documentation and to harden against future ALTER:
ALTER ROLE rent_app NOSUPERUSER NOBYPASSRLS;
```

Why every clause matters:
- `NOSUPERUSER` — **superusers bypass RLS unconditionally**; `FORCE` does not override this. (PostgreSQL docs: "Superusers and roles with the BYPASSRLS attribute always bypass the row-security system." `FORCE` only brings the table **owner** under RLS.)
- `NOBYPASSRLS` — the explicit counterpart.
- The role must **not** be the table owner. `demo_resources` is owned by whoever ran the migration (the connecting user — currently `postgres`). `rent_app` ≠ `postgres`, so the owner-bypass trap is avoided without even needing `FORCE`.
- Recommend a second role `rent_platform` for platform/cross-tenant jobs (no RLS policy attached → sees all rows), so platform code never shares the merchant connection.

### 1.2 Privileges

RLS is applied **after** privilege checks, so the role still needs normal table grants.

```sql
GRANT SELECT, INSERT, UPDATE, DELETE ON demo_resources TO rent_app;

-- NOTE: demo_resources has NO sequence — id uses uuid_generate_v4() (migration line 18).
-- So GRANT USAGE ON SEQUENCE is NOT needed for THIS table.
-- When the prototype is extended to tables with SERIAL/identity columns, add:
--   GRANT USAGE, SELECT ON SEQUENCE <table>_id_seq TO rent_app;
```

Also ensure `rent_app` can `USAGE` on the `public` schema (default in PG16, but explicit is safer):
```sql
GRANT USAGE ON SCHEMA public TO rent_app;
```

### 1.3 Enable RLS + Policy

```sql
ALTER TABLE demo_resources ENABLE ROW LEVEL SECURITY;

-- Optional but RECOMMENDED for the prototype's test to pass even if you forget
-- to switch off the owner: FORCE makes the table owner subject to RLS too.
-- It does NOT make superusers subject — still need rent_app for the real test.
ALTER TABLE demo_resources FORCE ROW LEVEL SECURITY;

-- Idempotent policy create (CREATE POLICY has no IF NOT EXISTS either).
DROP POLICY IF EXISTS demo_resources_tenant_isolation ON demo_resources;
CREATE POLICY demo_resources_tenant_isolation
  ON demo_resources
  FOR ALL
  TO rent_app
  USING (
    tenant_id = current_setting('app.tenant_id', true)
  )
  WITH CHECK (
    tenant_id = current_setting('app.tenant_id', true)
  );
```

Policy semantics:
- `FOR ALL` = applies to SELECT/INSERT/UPDATE/DELETE (you could split into per-command policies if you need finer control later).
- `USING (expr)` — filters rows **visible** for SELECT, and rows visible-to-target for UPDATE/DELETE. If `expr` is false, the row is invisible.
- `WITH CHECK (expr)` — validated against the **new** row on INSERT and the **post-update** row. Throws if false → cross-tenant write is blocked at the DB.
- `current_setting('app.tenant_id', true)` — the second arg `true` = `missing_ok`; returns `NULL` (not error) when unset. Comparing `tenant_id = NULL` yields NULL → no rows match → **default-deny**. This is the desired safe-by-default behavior when a code path forgets to set the GUC.
- **No `::uuid` cast.** `tenant_id` is `varchar(64)`; `current_setting` returns `text`; direct comparison is correct.

### 1.4 `FORCE` decision matrix

| Connecting role | Is superuser? | Is owner? | RLS applies w/o FORCE | RLS applies with FORCE |
|---|---|---|---|---|
| `postgres` (current default) | yes | yes | NO | **NO** (superuser always bypasses) |
| table owner (non-superuser) | no | yes | NO | **YES** |
| `rent_app` (recommended) | no | no | **YES** | YES |

Conclusion: for the prototype, **connect as `rent_app`** (the only configuration that actually exercises RLS). Add `FORCE` anyway as belt-and-suspenders for any code path that accidentally connects as the owner in tests.

---

## 2. Per-Transaction Context Pattern

### 2.1 `SET LOCAL` vs `set_config(..., true)` — equivalent

These two are semantically identical (both transaction-local):

```sql
SET LOCAL app.tenant_id = 'tenant-a';              -- syntax 1
SELECT set_config('app.tenant_id', 'tenant-a', true); -- syntax 2 (3rd arg = is_local)
```

- **Transaction-local** = the setting evaporates at `COMMIT`/`ROLLBACK`. This is what you want: tenant context can never leak across requests even when the connection is reused by the pool.
- If you used `set_config(..., false)` (session-local) or plain `SET`, the value would persist on that pooled connection and silently bleed into the next request that gets it — **a cross-tenant leak bug**. Do not do this.
- Transaction-local requires being **inside a transaction**. If issued outside a transaction, `SET LOCAL` only lasts for the next statement — another footgun. The prototype must always wrap in `START TRANSACTION ... COMMIT`.

### 2.2 Issuing it from TypeORM

```ts
const queryRunner = dataSource.createQueryRunner();
await queryRunner.connect();
await queryRunner.startTransaction();
try {
  // Set tenant context on THIS transaction's connection.
  await queryRunner.query(
    "SELECT set_config('app.tenant_id', $1, true)",
    [tenantId]
  );
  // All subsequent queries on this queryRunner are RLS-scoped.
  const rows = await queryRunner.query('SELECT * FROM demo_resources'); // raw, guard bypassed
  await queryRunner.commitTransaction();
  return rows;
} catch (err) {
  await queryRunner.rollbackTransaction();
  throw err;
} finally {
  await queryRunner.release();
}
```

Key: the same `queryRunner` instance must be used for both the `set_config` and the business query — they share one connection inside the transaction. Using `repository.createQueryBuilder()` (no queryRunner arg) would dispatch to a **different** pooled connection where the GUC was never set.

To make `repository.createQueryBuilder()` participate, pass the queryRunner:
```ts
repository.createQueryBuilder('alias').setQueryRunner(queryRunner)
// or use the repo's transaction manager:
await dataSource.transaction(async (manager) => {
  await manager.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
  // queries via `manager` or `manager.getRepository(Entity)` now share the txn connection.
});
```

### 2.3 Where to hook it in production (out of scope for the prototype, but documented)

The existing middleware `packages/backend/src/core/tenant/tenant.middleware.ts` only populates AsyncLocalStorage. To wire RLS into the real request lifecycle, the middleware would need to:

1. Open a `queryRunner` + `startTransaction`.
2. `set_config('app.tenant_id', tenantId, true)` — pull `tenantId` from `requireTenantId()` (skip for platform role, which uses a different connection/role).
3. Stash the `queryRunner` on `ctx` (or Midway's request-scoped DI).
4. `await next()` — downstream services/handlers use the stashed queryRunner.
5. In a `finally`, commit (or rollback on error) and `release()`.

This is a non-trivial refactor: today `DemoResourceService` uses `@InjectEntityModel(DemoResourceEntity) resourceRepo: Repository<...>` and calls `this.resourceRepo.createQueryBuilder()` with no queryRunner — so RLS would never see the GUC. The prototype only needs to prove the DB-level contract; the production wiring refactor should be its own follow-up task (likely PR3+ alongside business-table hardening).

For the prototype, **the negative test owns the transaction** — no middleware changes required.

---

## 3. Dev/Test Ergonomics (The `postgres`-Superuser Trap)

### 3.1 The problem, restated

- `docker-compose.yml` starts PG with `POSTGRES_USER: postgres` → `postgres` is a superuser.
- `.env.example` and `config.default.ts` both default `DB_USER`/`TEST_DB_USER` to `postgres`.
- Superusers bypass RLS **always** — even with `FORCE ROW LEVEL SECURITY`. So if the test DataSource connects as `postgres`, RLS is silently a no-op and the negative test will *pass for the wrong reason* (or rather, fail to fire) — the worst possible false-confidence outcome.

### 3.2 Three options to make RLS actually exercise

**Option A — Connect the test DataSource as `rent_app` (RECOMMENDED for the prototype):**
```ts
const ds = new DataSource({
  type: 'postgres',
  host: pgHost, port: pgPort,
  username: 'rent_app',
  password: 'rent_app_pwd',
  database: pgDatabase,
  entities: [DemoResourceEntity],
  synchronize: false, // schema must already exist + RLS already provisioned
});
```
- Cleanest, mirrors production exactly. Tests the real code path.
- Requires the migration to have run (creating the role, grants, policy) before the test boots.

**Option B — Connect as `postgres`, then `SET LOCAL ROLE rent_app` inside each transaction:**
```ts
await queryRunner.query('SET LOCAL ROLE rent_app');
await queryRunner.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
```
- `SET LOCAL ROLE` is transaction-scoped, drops privileges at COMMIT. Lets one DataSource provision schema as owner and query as app role.
- Good for tests that need to both `DROP TABLE`/setup (owner-only) and verify RLS (app role) in the same suite.
- Caveat: `SET ROLE` does not grant `BYPASSRLS`-equivalent; you must ensure the role still passes normal privilege checks (GRANTs must be in place).

**Option C — `FORCE ROW LEVEL SECURITY` only:** insufficient on its own if you connect as superuser. Useful ONLY if the connecting role is the non-superuser owner. Do not rely on this alone against the docker `postgres` user.

### 3.3 Trade-offs

| Option | Mirrors prod? | Setup complexity | Risk |
|---|---|---|---|
| A | Yes | Need role + grants before test | Test fails clearly if role missing |
| B | Mostly | Same DDL, plus per-txn `SET LOCAL ROLE` | Forgetting `SET ROLE` → silent bypass |
| C | No | Lowest | False confidence — silently no-ops as superuser |

Recommend **A for the pure negative test** (mirrors prod), with `FORCE` enabled unconditionally as defense-in-depth for any local-dev slip where someone connects as owner.

---

## 4. Migration Packaging

### 4.1 Recommendation: put role + policy DDL in a TypeORM migration

- The existing migration (`1783161600000-init-demo-resources.ts`) already uses `queryRunner.query(...)` and `CREATE EXTENSION IF NOT EXISTS`. Same channel.
- Pro: `npm run migration:run` (already wired in `package.json`) provisions everything in order — schema first, then RLS. CI runs the same command as prod. No separate "did you remember to run the seed SQL" footgun.
- Pro: `migration:revert` can drop the policy + disable RLS cleanly.
- Con: role/policy are not really "schema" — but TypeORM migrations are just SQL-with-versioning; this is a common and accepted pattern.

A separate `docker/init-db.sql` addition is **optional** — it would let a brand-new dev DB have `rent_app` ready before any migration runs, but init scripts only fire on first container start (empty data dir), so existing developers must `migration:run` anyway. Recommend: put it ALL in the migration; optionally also in `init-db.sql` for first-boot convenience.

### 4.2 Idempotency patterns

Neither `CREATE ROLE` nor `CREATE POLICY` accept `IF NOT EXISTS`. Patterns:

```ts
// Role — DO block with exception swallow.
await queryRunner.query(`
  DO $$
  BEGIN
    CREATE ROLE rent_app WITH LOGIN PASSWORD 'rent_app_pwd';
  EXCEPTION WHEN duplicate_object THEN NULL;
  END $$;
`);

// Privileges — GRANT is naturally idempotent (re-granting is a no-op).
await queryRunner.query(
  'GRANT SELECT, INSERT, UPDATE, DELETE ON demo_resources TO rent_app'
);
await queryRunner.query('GRANT USAGE ON SCHEMA public TO rent_app');

// RLS enable — ALTER TABLE ... ENABLE ROW LEVEL SECURITY is idempotent.
await queryRunner.query(
  'ALTER TABLE demo_resources ENABLE ROW LEVEL SECURITY'
);
await queryRunner.query(
  'ALTER TABLE demo_resources FORCE ROW LEVEL SECURITY'
);

// Policy — drop-if-exists + create.
await queryRunner.query(
  'DROP POLICY IF EXISTS demo_resources_tenant_isolation ON demo_resources'
);
await queryRunner.query(`
  CREATE POLICY demo_resources_tenant_isolation
    ON demo_resources
    FOR ALL TO rent_app
    USING (tenant_id = current_setting('app.tenant_id', true))
    WITH CHECK (tenant_id = current_setting('app.tenant_id', true))
`);
```

The DO-block pattern matches what the existing migration does conceptually with `CREATE EXTENSION IF NOT EXISTS` — stay consistent with that style.

### 4.3 Suggested migration file

`packages/backend/src/core/database/migrations/<new-timestamp>-rls-demo-resources.ts`, following the same shape as `1783161600000-init-demo-resources.ts`. Don't forget to register it in `data-source.ts:28` `migrations: [...]` (and the entity glob in `config.default.ts:34` picks up migrations automatically — verify).

### 4.4 Credentials / secrets

Hard-coding `'rent_app_pwd'` is fine for local dev/test. For prod, prefer reading from an env var: `'CREATE ROLE rent_app WITH LOGIN PASSWORD ' || quote_literal(process.env.DB_APP_ROLE_PASSWORD)`. Out of scope for the prototype but worth a TODO comment in the migration.

---

## 5. Negative Test Design (The Whole Point)

### 5.1 What "defense-in-depth" must prove

If the app-layer guard (`TenantSubscriber.afterSelectQueryBuilder` etc.) is **bypassed or forgotten**, RLS must still prevent cross-tenant access at the DB. The test must therefore issue **raw SQL with no `WHERE tenant_id` predicate** and prove RLS fills the gap.

### 5.2 The one canonical test (recommended)

File: `packages/backend/test/rls-demo-resource.test.ts` (mirror the harness in `real-demo-resource.test.ts`).

```ts
// Setup: DataSource as rent_app (NOT postgres), table exists + RLS provisioned.
// Seed rows for tenant-a and tenant-b via a *privileged* connection first
// (postgres / owner), since rent_app with WITH CHECK can't insert another tenant.

it('RLS hides tenant B rows from a tenant-A transaction even with raw SQL (no guard)', async () => {
  await dataSource.transaction(async (manager) => {
    await manager.query("SELECT set_config('app.tenant_id', $1, true)", ['tenant-a']);
    const rows = await manager.query('SELECT * FROM demo_resources'); // no WHERE
    // Assert: only tenant-a rows visible despite both tenants seeded.
    expect(rows.every(r => r.tenant_id === 'tenant-a')).toBe(true);
    expect(rows.some(r => r.tenant_id === 'tenant-b')).toBe(false);
  });
});

it('RLS WITH CHECK rejects a cross-tenant INSERT (forged tenant_id) at the DB', async () => {
  await expect(
    dataSource.transaction(async (manager) => {
      await manager.query("SELECT set_config('app.tenant_id', $1, true)", ['tenant-a']);
      await manager.query(
        'INSERT INTO demo_resources (tenant_id, name) VALUES ($1, $2)',
        ['tenant-b', 'forged'] // attempted cross-tenant write, no app guard
      );
    })
  ).rejects.toThrow(); // PG error: new row violates row-level security policy
});

it('RLS WITH CHECK rejects cross-tenant UPDATE', async () => {
  // seed a tenant-b row via privileged conn; then as tenant-a attempt:
  //   UPDATE demo_resources SET name='x' WHERE name='<tenant-b-row>'
  // Expect affected rows = 0 (USING hides tenant-b) OR error if WITH CHECK fires.
});

it('RLS default-denies when tenant GUC is unset (forgotten set_config)', async () => {
  await dataSource.transaction(async (manager) => {
    // deliberately skip set_config
    const rows = await manager.query('SELECT * FROM demo_resources');
    expect(rows.length).toBe(0); // current_setting(...,true) returns NULL → no match
  });
});
```

The first two assertions are the load-bearing proof. The "unset GUC" case proves safe-by-default — the killer regression test for "someone removed the middleware call".

### 5.3 What the negative test must NOT do

- Must NOT connect as `postgres` — the test would pass but RLS never fired (false positive).
- Must NOT use the app's `TenantAwareRepository` — that would only prove the app guard works, not RLS.
- Must NOT use `synchronize: true` for setup-then-test in the same connection — `synchronize` DDL needs owner privileges; either run it as a separate owner DataSource first, then connect as `rent_app` for assertions; or provision via migration.

### 5.4 Existing test-harness conventions to follow

From `packages/backend/test/real-demo-resource.test.ts`:
- Build a dedicated `DataSource` per suite (lines 27-38), skip the suite gracefully if PG is unavailable (lines 41-47) — do not red the default `npm test`.
- `jest.setTimeout(30000)` for real-PG suites (line 14).
- `beforeEach` truncates the table (line 56-61) — but for the RLS test, truncation must happen via the *owner* connection, since `rent_app` may not see rows it can delete depending on policy.

---

## Caveats / Not Found

- **`::uuid` cast in the task prompt is wrong for this table.** `demo_resources.tenant_id` is `varchar(64)`. Verified in migration line 20 and `base-tenant.entity.ts:14`. Policy must compare as text. (When the prototype is generalized to future tables, all current tenant-scoped tables inherit `BaseTenantEntity` → also varchar. So text comparison is the project-wide answer, not uuid.)
- **`GRANT USAGE ON SEQUENCE` is not needed for `demo_resources`** — it has no sequence (`id uuid DEFAULT uuid_generate_v4()`). Future tables with `SERIAL`/`GENERATED ... AS IDENTITY` will need it. The DDL recipe above notes this.
- **No external web search was performed** — this environment exposes no web-search tool. All PostgreSQL claims above are from stable, well-established PG16 semantics (CREATE ROLE, ALTER TABLE ... ROW LEVEL SECURITY, CREATE POLICY, current_setting, set_config, superuser/BYPASSRLS bypass, FORCE owner behavior, SET LOCAL equivalence to set_config is_local=true). Recommend the implementer cross-check against the official PG16 docs links below before merging.
- **Production middleware wiring (request-scoped transaction + set_config + DI of queryRunner) is explicitly out of scope** for this prototype. The prototype only proves the DB contract via a test-owned transaction. A separate task should handle the request-lifecycle refactor; today `DemoResourceService` uses `@InjectEntityModel` + bare `createQueryBuilder()` with no queryRunner, which would not pick up the GUC.
- **Superuser caveat is the highest-risk blocker** — if CI/dev connects as `postgres` (the current default), RLS is invisible. The prototype's test DataSource MUST use `rent_app`. Without that change, every RLS test is a false positive.
- **`FORCE ROW LEVEL SECURITY` does NOT make superusers subject to RLS.** Common misconception. Only affects table owners. The prototype should set FORCE (cheap defense-in-depth for owner-connected dev paths) but must not rely on it.

## External References (verified URLs, not fetched in this session — stable PG docs)

- PostgreSQL 16 §5.8 Row Security Policies — https://www.postgresql.org/docs/16/ddl-rowsecurity.html
- PostgreSQL 16 `CREATE POLICY` — https://www.postgresql.org/docs/16/sql-createpolicy.html
- PostgreSQL 16 `ALTER TABLE` (ENABLE/FORCE ROW LEVEL SECURITY) — https://www.postgresql.org/docs/16/sql-altertable.html
- PostgreSQL 16 `CREATE ROLE` (BYPASSRLS attribute) — https://www.postgresql.org/docs/16/sql-createrole.html
- PostgreSQL 16 `SET` (SET LOCAL semantics) — https://www.postgresql.org/docs/16/sql-set.html
- PostgreSQL 16 Configuration Parameters / `current_setting` — https://www.postgresql.org/docs/16/functions-admin.html (§9.27.1)
- TypeORM QueryRunner / DataSource.transaction — https://typeorm.io/data-source#what-is-data-source / https://typeorm.io/query-runner

## Related Specs

- `.trellis/spec/backend/database-guidelines.md` §RLS 指南 (lines 166-176) — the contract this prototype implements.
- `.trellis/spec/backend/database-guidelines.md` §PR0 Tenant Query Guard 契约 (lines 69-153) — the app-layer guard that sits ABOVE RLS; both must agree on `tenant_id` semantics.
- `.trellis/spec/backend/database-guidelines.md` §常见错误 (lines 207-215) — the failure modes RLS is meant to catch.
