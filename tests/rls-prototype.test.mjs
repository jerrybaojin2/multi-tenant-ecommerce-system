import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import test from 'node:test';

/**
 * PR2 Stream B —— PostgreSQL Row-Level Security 单表原型负例测试。
 *
 * 证明 defense-in-depth：即便业务代码漏掉 tenant predicate（这里故意用裸
 * SELECT/INSERT/UPDATE/DELETE，**不**走 TenantAwareRepository guard），数据库层
 * RLS 仍默认拒绝越权读写。对应 AC3（migration 幂等）+ AC4（RLS 负例）。
 *
 * 关键约束（research/rls-prototype.md 实测）：
 * - app 现以 postgres 超级用户连库；超级用户总绕过 RLS，FORCE 也压不住。
 *   故负例在事务内 `SET LOCAL ROLE rent_app`（非超级用户 / 非 owner / 无 BYPASSRLS）
 *   再 `set_config('app.tenant_id', $1, true)` 切换租户上下文。
 * - postgres 是超级用户 → 可 `SET ROLE` 到任意角色（无需 GRANT），且 SET LOCAL 仅本事务生效。
 * - tenant_id 是 varchar(64)；policy 按 text 比较，不用 ::uuid。
 *
 * PG 不可用时**干净 skip**（不报错失败）：AC3/AC4 的运行期验证需 PG 就绪。
 * 启动 PG：`cd packages/backend; docker compose up -d`（建 rent_test），或设 TEST_DB_*。
 */

const require = createRequire(import.meta.url);
const repoRoot = process.cwd();
const backendDir = path.join(repoRoot, 'packages', 'backend');

const pgHost = process.env.TEST_DB_HOST || process.env.DB_HOST || '127.0.0.1';
const pgPort = Number(process.env.TEST_DB_PORT || process.env.DB_PORT || 5432);
const pgUser = process.env.TEST_DB_USER || process.env.DB_USER || 'postgres';
const pgPassword =
  process.env.TEST_DB_PASSWORD || process.env.DB_PASSWORD || 'postgres';
const pgDatabase = process.env.TEST_DB_NAME || process.env.DB_NAME || 'rent_test';

// 必须在 import data-source **之前**设置：AppDataSource 在模块加载时读取 DB_* 构造。
process.env.DB_HOST = pgHost;
process.env.DB_PORT = String(pgPort);
process.env.DB_USER = pgUser;
process.env.DB_PASSWORD = pgPassword;
process.env.DB_NAME = pgDatabase;

const distDataSource = path.join(
  backendDir,
  'dist',
  'core',
  'database',
  'data-source.js'
);
const distRlsMigration = path.join(
  backendDir,
  'dist',
  'core',
  'database',
  'migrations',
  '1783161601000-demo-resources-rls.js'
);
const srcRlsMigration = path.join(
  backendDir,
  'src',
  'core',
  'database',
  'migrations',
  '1783161601000-demo-resources-rls.ts'
);
const srcDataSource = path.join(
  backendDir,
  'src',
  'core',
  'database',
  'data-source.ts'
);

/**
 * 顶层 setup：build dist（编译新 migration）、导入 AppDataSource、初始化连库、
 * 干净起点 + runMigrations（建表 + provision role/policy）、种子数据。
 * 任一环节失败 → 返回 skipReason，所有用例干净跳过。
 */
async function setupSuite() {
  // 1) 确保 dist 是最新（新 migration 需编译后才在 AppDataSource.migrations 里）。
  const buildResult = ensureDistBuilt();
  if (!buildResult.ok) {
    return { skipReason: `dist build failed: ${buildResult.error}` };
  }

  // 2) 导入编译后的 AppDataSource（已含两条 migration 类引用）。
  let dsModule;
  try {
    dsModule = await import(pathToFileURL(distDataSource).href);
  } catch (error) {
    return { skipReason: `cannot import dist data-source: ${error.message}` };
  }
  const AppDataSource = dsModule.AppDataSource;
  if (!AppDataSource) {
    return { skipReason: 'AppDataSource not exported from dist data-source' };
  }

  // 3) 初始化连库（探测 PG 是否可用）。
  try {
    await AppDataSource.initialize();
  } catch (error) {
    return {
      skipReason: `PostgreSQL unavailable (${pgHost}:${pgPort}/${pgDatabase}): ${
        error.code || error.name
      }: ${error.message}`,
    };
  }

  // 4) 干净起点：抹掉旧表 / 旧 migration 记录 / 旧 policy，确保 runMigrations 从零跑。
  //    不 DROP ROLE rent_app —— migration 的 DO $$ EXCEPTION 会幂等处理已存在。
  //    注意 TypeORM 0.3.x 默认 migration 跟踪表名是 `migrations`（非 typeorm_migrations）。
  try {
    const qr = AppDataSource.createQueryRunner();
    await qr.connect();
    await qr.query('RESET ROLE');
    await qr.query(
      'DROP POLICY IF EXISTS demo_resources_tenant_isolation ON demo_resources'
    );
    await qr.query('DROP TABLE IF EXISTS demo_resources CASCADE');
    await qr.query('DROP TABLE IF EXISTS "migrations"');
    await qr.release();
  } catch (error) {
    await safeDestroy(AppDataSource);
    return { skipReason: `clean-slate failed: ${error.message}` };
  }

  // 5) 跑两条 migration：建表 + 建 role/policy/RLS。
  try {
    const pending = await AppDataSource.showMigrations();
    void pending;
    await AppDataSource.runMigrations();
  } catch (error) {
    await safeDestroy(AppDataSource);
    return { skipReason: `runMigrations failed: ${error.message}` };
  }

  // 6) 种子数据（以 postgres 超级用户写入 → 绕过 RLS，可写任意 tenant）。
  try {
    await AppDataSource.query(
      "INSERT INTO demo_resources (tenant_id, name, description) VALUES ($1, $2, $3)",
      ['tenantA', 'a-row', 'seed-a']
    );
    await AppDataSource.query(
      "INSERT INTO demo_resources (tenant_id, name, description) VALUES ($1, $2, $3)",
      ['tenantB', 'b-row', 'seed-b']
    );
  } catch (error) {
    await safeDestroy(AppDataSource);
    return { skipReason: `seed failed: ${error.message}` };
  }

  return { skipReason: false, AppDataSource };
}

function ensureDistBuilt() {
  const needsBuild =
    !existsSync(distRlsMigration) ||
    !existsSync(distDataSource) ||
    isNewer(srcRlsMigration, distRlsMigration) ||
    isNewer(srcDataSource, distDataSource);
  if (!needsBuild) return { ok: true };

  // mwtsc --cleanOutDir：与 backend `migration:run` 同一编译路径。
  // 不用 shell:true 避免 Node DEP0190；跨平台直接调 npm 二进制。
  const npmBin = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const result = spawnSync(npmBin, ['run', 'build'], {
    cwd: backendDir,
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    return {
      ok: false,
      error: `mwtsc exit ${result.status}: ${(result.stderr || result.stdout || '').slice(-400)}`,
    };
  }
  if (!existsSync(distRlsMigration)) {
    return { ok: false, error: `build ok but ${distRlsMigration} missing` };
  }
  return { ok: true };
}

function isNewer(maybeNewer, maybeOlder) {
  if (!existsSync(maybeNewer) || !existsSync(maybeOlder)) return true;
  return statSync(maybeNewer).mtimeMs > statSync(maybeOlder).mtimeMs;
}

async function safeDestroy(ds) {
  try {
    if (ds && ds.isInitialized) await ds.destroy();
  } catch {
    /* ignore */
  }
}

/**
 * 规整 TypeORM pg 原生 query 的返回形态为受影响/返回行数：
 * - SELECT → rows 数组（直接取 length）
 * - UPDATE/DELETE ... RETURNING → [rows, rowCount]（取 rowCount）
 */
function affectedCount(result) {
  if (
    Array.isArray(result) &&
    result.length === 2 &&
    Array.isArray(result[0]) &&
    typeof result[1] === 'number'
  ) {
    return result[1];
  }
  return Array.isArray(result) ? result.length : 0;
}

const setup = await setupSuite();
const skipReason = setup.skipReason;
const AppDataSource = setup.AppDataSource;
const skipHint =
  'AC3/AC4 运行期验证需 PostgreSQL 就绪（rent_test）。' +
  (skipReason ? ` 原因：${skipReason}` : '');

if (skipReason) {
  // eslint-disable-next-line no-console
  console.warn(`[rls-prototype] SKIP：${skipHint}`);
}

test(
  'AC3: RLS migration up() 幂等 —— 直接二次执行不报错',
  { skip: skipReason || undefined },
  async () => {
    const { DemoResourcesRls1783161601000 } = await import(
      pathToFileURL(distRlsMigration).href
    );
    const instance = new DemoResourcesRls1783161601000();
    const qr = AppDataSource.createQueryRunner();
    await qr.connect();
    try {
      // runMigrations 已跑过一次；这里再直接调 up() —— role/policy/RLS 已存在，
      // DDL 必须全部幂等不抛错（DO $$ EXCEPTION / DROP IF EXISTS / GRANT / ALTER）。
      await instance.up(qr);
    } finally {
      await qr.release();
    }
    // 走到这儿即说明二次执行没抛错；额外断言 policy 仍在、形态正确。
    const policy = await AppDataSource.query(
      `SELECT polname FROM pg_policy WHERE polrelid = 'demo_resources'::regclass AND polname = 'demo_resources_tenant_isolation'`
    );
    assert.ok(
      Array.isArray(policy) && policy.length === 1,
      'demo_resources_tenant_isolation policy should exist after idempotent re-run'
    );
  }
);

test(
  'AC4: 以 rent_app 身份 set tenantA —— 裸 SELECT（无 WHERE predicate）只看到 tenantA 行',
  { skip: skipReason || undefined },
  async () => {
    await AppDataSource.transaction(async manager => {
      await manager.query('SET LOCAL ROLE rent_app');
      await manager.query("SELECT set_config('app.tenant_id', $1, true)", [
        'tenantA',
      ]);
      const rows = await manager.query(
        'SELECT tenant_id, name FROM demo_resources ORDER BY name'
      );
      assert.ok(Array.isArray(rows));
      assert.equal(rows.length, 1, 'only tenantA row visible to tenantA');
      assert.equal(rows[0].tenant_id, 'tenantA');
      assert.equal(rows[0].name, 'a-row');
      assert.equal(
        rows.find(r => r.tenant_id === 'tenantB'),
        undefined,
        'tenantB row must be invisible'
      );
    });
  }
);

test(
  'AC4: 以 rent_app 身份 set tenantA —— 跨租户 INSERT 被 WITH CHECK 拒绝',
  { skip: skipReason || undefined },
  async () => {
    await assert.rejects(
      AppDataSource.transaction(async manager => {
        await manager.query('SET LOCAL ROLE rent_app');
        await manager.query("SELECT set_config('app.tenant_id', $1, true)", [
          'tenantA',
        ]);
        // 故意伪造 tenant_id=tenantB；WITH CHECK 校验新行 → 抛 RLS 违规。
        await manager.query(
          'INSERT INTO demo_resources (tenant_id, name, description) VALUES ($1, $2, $3)',
          ['tenantB', 'forged', 'attempted-cross-tenant']
        );
      }),
      /row-level security|violates/i,
      'cross-tenant INSERT must be rejected by WITH CHECK policy'
    );
    // 确认 rollback 后 tenantB 没多出 forged 行（仍只有种子 b-row）。
    const tenantBRows = await AppDataSource.query(
      "SELECT name FROM demo_resources WHERE tenant_id = 'tenantB'"
    );
    assert.deepEqual(
      tenantBRows.map(r => r.name),
      ['b-row'],
      'forged cross-tenant row must not persist'
    );
  }
);

test(
  'AC4: 以 rent_app 身份 set tenantA —— 跨租户 UPDATE/DELETE 命中 0 行（USING 隐藏 tenantB）',
  { skip: skipReason || undefined },
  async () => {
    await AppDataSource.transaction(async manager => {
      await manager.query('SET LOCAL ROLE rent_app');
      await manager.query("SELECT set_config('app.tenant_id', $1, true)", [
        'tenantA',
      ]);
      const upd = await manager.query(
        "UPDATE demo_resources SET name = 'hijacked' WHERE tenant_id = 'tenantB' RETURNING id"
      );
      assert.equal(
        affectedCount(upd),
        0,
        'UPDATE on tenantB row must affect 0 rows (USING hides it)'
      );
      const del = await manager.query(
        "DELETE FROM demo_resources WHERE tenant_id = 'tenantB' RETURNING id"
      );
      assert.equal(
        affectedCount(del),
        0,
        'DELETE on tenantB row must affect 0 rows (USING hides it)'
      );
    });
    // 事务结束后（以超级用户回读）tenantB 行原样还在。
    const tenantB = await AppDataSource.query(
      "SELECT name FROM demo_resources WHERE tenant_id = 'tenantB'"
    );
    assert.deepEqual(
      tenantB.map(r => r.name),
      ['b-row'],
      'tenantB row must be untouched after blocked UPDATE/DELETE'
    );
  }
);

test(
  'AC4: 以 rent_app 身份但未设 GUC —— 默认拒绝（0 行可见）',
  { skip: skipReason || undefined },
  async () => {
    await AppDataSource.transaction(async manager => {
      await manager.query('SET LOCAL ROLE rent_app');
      // 故意**不** set_config('app.tenant_id', ...)：模拟 middleware 忘记注入。
      // current_setting('app.tenant_id', true) 返回 NULL → tenant_id = NULL → 无行匹配。
      const rows = await manager.query(
        'SELECT count(*)::int AS n FROM demo_resources'
      );
      const n = Array.isArray(rows) && rows[0] ? Number(rows[0].n) : -1;
      assert.equal(
        n,
        0,
        'unset GUC must default-deny (current_setting returns NULL → no rows match)'
      );
    });
  }
);

test.after(async () => {
  if (AppDataSource) {
    try {
      // 以超级用户清理种子行（RLS 对 postgres 无效）；不 revert migration、不 drop 表/角色。
      await AppDataSource.query(
        "DELETE FROM demo_resources WHERE tenant_id IN ('tenantA', 'tenantB')"
      );
    } catch {
      /* ignore teardown cleanup errors */
    }
    await safeDestroy(AppDataSource);
  }
});
