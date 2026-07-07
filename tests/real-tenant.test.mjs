// PR0 核心验收：真实多租户隔离测试（替代纯 JS isolation-simulator）。
//
// 验证链路：真实 TypeORM DataSource + 真实 PostgreSQL（cool_test 库）
//           + cool-admin v8 TenantSubscriber 钩子逻辑
//           + EntitySchema（tenant_id 物理列，等价于 BaseEntity.tenantId）。
//
// 测试用例（PRD D3 / 验收点"多租户隔离经自动化测试验证"）：
//   - tenant A 的记录对 tenant B 不可见（select）
//   - tenant A 不能 CRUD tenant B 的记录（update/delete 返回 0 影响 / 不越界）
//   - insert 时 Subscriber 钩子强制注入当前 tenantId（防前端伪造 tenantId）
//   - platform 角色（tenantId=undefined）跨租户可见（平台运营特权 / noTenant 逃逸）
//
// 隔离 SKIP 策略：本测试需要可用的 PostgreSQL（cool_test 库）。
// 若环境无 PG（如本机未装 docker / 无原生 PG），本套件**优雅跳过而非失败**，
// 并打印明确提示。这与 isolation-simulator（纯逻辑，永远跑）互补：
//   - tests/tenant-isolation.test.mjs —— 业务隔离语义（快、无依赖、CI 必跑）
//   - tests/real-tenant.test.mjs      —— 真实 PG + Subscriber（需 PG，本地/CI 有 PG 时跑）

import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import test from 'node:test';

const require = createRequire(import.meta.url);
const BACKEND_NM = path.join(
  process.cwd(),
  'packages',
  'backend',
  'node_modules'
);

// 显式从 vendored backend 的 node_modules 加载，避免根目录无依赖。
let typeorm;
let pg;
try {
  typeorm = require(path.join(BACKEND_NM, 'typeorm'));
  pg = require(path.join(BACKEND_NM, 'pg'));
} catch (error) {
  test('real tenant isolation: dependencies missing', { skip: false }, () => {
    assert.fail(
      '无法加载 packages/backend/node_modules 下的 typeorm/pg。请先在 packages/backend 运行 `npm install`。原始错误：' +
        error.message
    );
  });
}

const { DataSource } = typeorm || {};
const { TenantSubscriberForTest, assertMatchesUpstream } = await import(
  pathToFileURL(
    path.join(
      process.cwd(),
      'packages',
      'backend',
      'test',
      'real-tenant',
      'tenant-subscriber-fixture.js'
    )
  ).href
).catch(() => ({ TenantSubscriberForTest: null, assertMatchesUpstream: null }));

const demoEntity = await import(
  pathToFileURL(
    path.join(
      process.cwd(),
      'packages',
      'backend',
      'test',
      'real-tenant',
      'demo-entity.js'
    )
  ).href
).then(m => m.default || m);

// PG 连接参数：优先 TEST_DB_*，回退到 docker-compose 默认。
const pgHost = process.env.TEST_DB_HOST || process.env.DB_HOST || '127.0.0.1';
const pgPort = Number(process.env.TEST_DB_PORT || process.env.DB_PORT || 5432);
const pgUser = process.env.TEST_DB_USER || process.env.DB_USER || 'postgres';
const pgPassword =
  process.env.TEST_DB_PASSWORD || process.env.DB_PASSWORD || 'postgres';
const pgDatabase = process.env.TEST_DB_NAME || 'cool_test';

// 探测 PG 是否可用 + 库是否存在。返回 { available, reason, dataSource? }。
async function probePg() {
  if (!DataSource) {
    return { available: false, reason: 'typeorm 未加载' };
  }
  const ds = new DataSource({
    type: 'postgres',
    host: pgHost,
    port: pgPort,
    username: pgUser,
    password: pgPassword,
    database: pgDatabase,
    entities: [demoEntity],
    subscribers: [new TenantSubscriberForTest({ enabled: true, tenantId: undefined })],
    synchronize: false,
    dropSchema: false,
    poolSize: 4,
  });
  try {
    await ds.initialize();
    return { available: true, dataSource: ds };
  } catch (error) {
    return {
      available: false,
      reason: `${error.code || error.name}: ${error.message}`,
    };
  }
}

// 用一个干净的、带 demo_goods 表的 DataSource 重建 schema。
async function buildSchema(ds) {
  // cool_test 库可能为空或表结构过期；直接 drop 再 sync（仅测试库，安全）。
  const qr = ds.createQueryRunner();
  await qr.query(
    `DROP TABLE IF EXISTS ${ds.manager.connection.options.entityPrefix || ''}demo_goods CASCADE`
  );
  await qr.release();
  await ds.synchronize();
}

// 辅助：在指定 tenantId 上下文下跑一次"请求作用域"操作。
// 这里通过为每次操作新建一个绑定了对应 TenantSubscriber 实例的 query 来模拟。
// 真实运行时由 Midway AsyncContextManager 在请求级注入 tenantId。
async function scopedQuery(ds, { role, tenantId }, work) {
  // 临时替换 dataSource 的 subscribers 为对应角色
  const opts = ds.options;
  const subscriberForTenant =
    role === 'platform'
      ? new TenantSubscriberForTest({ enabled: true, tenantId: undefined })
      : new TenantSubscriberForTest({ enabled: true, tenantId });
  // 通过 manager 的 query builder 触发钩子：钩子挂在 dataSource.subscribers，
  // 运行时改 subscribers 数组即可切换"当前请求"的 tenantId。
  const orig = opts.subscribers;
  opts.subscribers = [subscriberForTenant];
  try {
    return await work(ds);
  } finally {
    opts.subscribers = orig;
  }
}

const probe = DataSource && pg ? await probePg() : { available: false, reason: 'typeorm/pg 未加载' };

const SKIP_REASON = probe.available
  ? false
  : `真实 PG 不可用（${probe.reason}）。启动方法：在 packages/backend 运行 \`docker compose up -d\` 创建 cool_test 库，或设置 TEST_DB_* 环境变量指向可用的 PostgreSQL。纯逻辑隔离测试见 tests/tenant-isolation.test.mjs。`;

// 防漂移校验：始终跑（无需 PG），保证 fixture 与上游 tenant.ts 一致。
test('TenantSubscriberForTest 钩子与上游 tenant.ts 一致（防漂移）', async () => {
  if (!assertMatchesUpstream) {
    assert.fail('fixture 未加载');
  }
  await assertMatchesUpstream();
});

test('真实 PG：merchant 仅能 select 本租户记录', { skip: SKIP_REASON || undefined }, async () => {
  const ds = probe.dataSource;
  await buildSchema(ds);
  const repo = ds.getRepository('DemoGoods');
  // 直接写库（绕过 Subscriber，模拟"已存在的两租户数据"）
  await repo.save([
    { name: 'tenant-a-goods', stock: 10, tenantId: 1 },
    { name: 'tenant-b-goods', stock: 20, tenantId: 2 },
  ]);

  await scopedQuery(ds, { role: 'merchant', tenantId: 1 }, async () => {
    const rows = await repo.createQueryBuilder().getMany();
    assert.deepEqual(
      rows.map(r => r.name),
      ['tenant-a-goods'],
      'tenant A 只应看到自己的记录'
    );
  });

  await scopedQuery(ds, { role: 'merchant', tenantId: 2 }, async () => {
    const rows = await repo.createQueryBuilder().getMany();
    assert.deepEqual(
      rows.map(r => r.name),
      ['tenant-b-goods'],
      'tenant B 只应看到自己的记录'
    );
  });
});

test('真实 PG：insert 钩子强制注入当前 tenantId（防前端伪造）', {
  skip: SKIP_REASON || undefined,
}, async () => {
  const ds = probe.dataSource;
  await buildSchema(ds);
  const repo = ds.getRepository('DemoGoods');

  await scopedQuery(ds, { role: 'merchant', tenantId: 1 }, async () => {
    // 故意尝试写入 tenantId=2（伪造），Subscriber 钩子应覆盖为 1
    await repo
      .createQueryBuilder()
      .insert()
      .values({ name: 'forged', stock: 1, tenantId: 2 })
      .execute();
  });

  // platform 视角核查：新行 tenantId 应为 1（被钩子强制），不存在 tenantId=2 的 forged
  await scopedQuery(ds, { role: 'platform' }, async () => {
    const all = await repo.createQueryBuilder().getMany();
    const forged = all.find(r => r.name === 'forged');
    assert.ok(forged, '新行应存在');
    assert.equal(forged.tenantId, 1, 'Subscriber 钩子应把伪造的 tenantId=2 改写为当前租户 1');
  });
});

test('真实 PG：update/delete 跨租户返回 0 影响（不可 CRUD 他租户）', {
  skip: SKIP_REASON || undefined,
}, async () => {
  const ds = probe.dataSource;
  await buildSchema(ds);
  const repo = ds.getRepository('DemoGoods');
  await repo.save([
    { name: 'a', stock: 10, tenantId: 1 },
    { name: 'b', stock: 20, tenantId: 2 },
  ]);

  // tenant A 试图 update tenant B 的行（按 id）
  await scopedQuery(ds, { role: 'merchant', tenantId: 1 }, async () => {
    const bRow = await repo
      .createQueryBuilder()
      .where('name = :n', { n: 'b' })
      .getOne(); // 钩子会 AND tenantId=1，所以查不到 b
    assert.equal(bRow, null, 'tenant A 通过条件查询不应能定位到 tenant B 的行');

    const res = await repo
      .createQueryBuilder()
      .update()
      .set({ stock: 999 })
      .where('name = :n', { n: 'b' })
      .execute();
    assert.equal(res.affected, 0, 'tenant A 不应能更新 tenant B 的行');
  });

  // tenant A 试图 delete tenant B 的行
  await scopedQuery(ds, { role: 'merchant', tenantId: 1 }, async () => {
    const res = await repo
      .createQueryBuilder()
      .delete()
      .where('name = :n', { n: 'b' })
      .execute();
    assert.equal(res.affected, 0, 'tenant A 不应能删除 tenant B 的行');
  });

  // 验证 tenant B 的行仍完好
  await scopedQuery(ds, { role: 'platform' }, async () => {
    const b = await repo.createQueryBuilder().where('name = :n', { n: 'b' }).getOne();
    assert.ok(b, 'tenant B 的行应仍存在');
    assert.equal(b.stock, 20, 'tenant B 的行未被改动');
  });
});

test('真实 PG：platform 角色（tenantId=undefined）跨租户可见（noTenant 逃逸）', {
  skip: SKIP_REASON || undefined,
}, async () => {
  const ds = probe.dataSource;
  await buildSchema(ds);
  const repo = ds.getRepository('DemoGoods');
  await repo.save([
    { name: 'a', stock: 10, tenantId: 1 },
    { name: 'b', stock: 20, tenantId: 2 },
    { name: 'global', stock: 0, tenantId: null }, // 平台级数据
  ]);

  await scopedQuery(ds, { role: 'platform' }, async () => {
    const rows = await repo.createQueryBuilder().getMany();
    const names = rows.map(r => r.name).sort();
    assert.deepEqual(
      names,
      ['a', 'b', 'global'],
      'platform 角色应跨租户可见全部记录（含 tenantId=null 的平台级数据）'
    );
  });
});

// 测试套结束清理
test.after?.(async () => {
  if (probe.dataSource && probe.dataSource.isInitialized) {
    await probe.dataSource.destroy();
  }
});
