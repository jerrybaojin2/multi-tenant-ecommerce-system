import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import test from 'node:test';

const require = createRequire(import.meta.url);
const backendNodeModules = path.join(
  process.cwd(),
  'packages',
  'backend',
  'node_modules'
);

let typeorm;
let pg;
try {
  typeorm = require(path.join(backendNodeModules, 'typeorm'));
  pg = require(path.join(backendNodeModules, 'pg'));
} catch (error) {
  test('real tenant isolation: backend dependencies are installed', () => {
    assert.fail(
      `Cannot load typeorm/pg from packages/backend/node_modules. Run npm install in packages/backend first. ${error.message}`
    );
  });
}

const { DataSource } = typeorm || {};
const fixtureModule = await import(
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
).catch(() => ({}));

const TenantSubscriberForTest =
  fixtureModule.TenantSubscriberForTest ||
  fixtureModule.default?.TenantSubscriberForTest;

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
).then(module => module.default || module);

const pgHost = process.env.TEST_DB_HOST || process.env.DB_HOST || '127.0.0.1';
const pgPort = Number(process.env.TEST_DB_PORT || process.env.DB_PORT || 5432);
const pgUser = process.env.TEST_DB_USER || process.env.DB_USER || 'postgres';
const pgPassword =
  process.env.TEST_DB_PASSWORD || process.env.DB_PASSWORD || 'postgres';
const pgDatabase = process.env.TEST_DB_NAME || 'rent_test';

async function probePg() {
  if (!DataSource || !pg) {
    return { available: false, reason: 'typeorm/pg not loaded' };
  }
  const ds = new DataSource({
    type: 'postgres',
    host: pgHost,
    port: pgPort,
    username: pgUser,
    password: pgPassword,
    database: pgDatabase,
    entities: [demoEntity],
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

async function buildSchema(ds) {
  const queryRunner = ds.createQueryRunner();
  await queryRunner.query('DROP TABLE IF EXISTS demo_goods CASCADE');
  await queryRunner.release();
  await ds.synchronize();
}

function createGuard(role, tenantId) {
  return role === 'platform'
    ? new TenantSubscriberForTest({ enabled: true, tenantId: undefined })
    : new TenantSubscriberForTest({ enabled: true, tenantId });
}

function guardSelect(queryBuilder, context) {
  createGuard(context.role, context.tenantId).afterSelectQueryBuilder(
    queryBuilder
  );
  return queryBuilder;
}

function guardInsert(queryBuilder, context) {
  createGuard(context.role, context.tenantId).afterInsertQueryBuilder(
    queryBuilder
  );
  return queryBuilder;
}

function guardUpdate(queryBuilder, context) {
  createGuard(context.role, context.tenantId).afterUpdateQueryBuilder(
    queryBuilder
  );
  return queryBuilder;
}

function guardDelete(queryBuilder, context) {
  createGuard(context.role, context.tenantId).afterDeleteQueryBuilder(
    queryBuilder
  );
  return queryBuilder;
}

const probe = await probePg();
const skipReason = probe.available
  ? false
  : `PostgreSQL is unavailable (${probe.reason}). Start it with "cd packages/backend; docker compose up -d" to create ${pgDatabase}, or set TEST_DB_* to an available PostgreSQL database.`;

test('TenantSubscriberForTest fixture loads', () => {
  assert.ok(TenantSubscriberForTest, 'fixture did not load');
});

test(
  'real PostgreSQL: merchant select is tenant scoped',
  { skip: skipReason || undefined },
  async () => {
    const ds = probe.dataSource;
    await buildSchema(ds);
    const repo = ds.getRepository('DemoGoods');
    await repo.save([
      { name: 'tenant-a-goods', stock: 10, tenantId: 1 },
      { name: 'tenant-b-goods', stock: 20, tenantId: 2 },
    ]);

    const tenantOneRows = await guardSelect(repo.createQueryBuilder('goods'), {
      role: 'merchant',
      tenantId: 1,
    }).getMany();
    assert.deepEqual(
      tenantOneRows.map(row => row.name),
      ['tenant-a-goods']
    );

    const tenantTwoRows = await guardSelect(repo.createQueryBuilder('goods'), {
      role: 'merchant',
      tenantId: 2,
    }).getMany();
    assert.deepEqual(
      tenantTwoRows.map(row => row.name),
      ['tenant-b-goods']
    );
  }
);

test(
  'real PostgreSQL: insert guard forces the current tenant id',
  { skip: skipReason || undefined },
  async () => {
    const ds = probe.dataSource;
    await buildSchema(ds);
    const repo = ds.getRepository('DemoGoods');

    await guardInsert(
      repo
        .createQueryBuilder()
        .insert()
        .values({ name: 'forged', stock: 1, tenantId: 2 }),
      { role: 'merchant', tenantId: 1 }
    ).execute();

    const allRows = await guardSelect(repo.createQueryBuilder('goods'), {
      role: 'platform',
    }).getMany();
    const forged = allRows.find(row => row.name === 'forged');
    assert.ok(forged, 'inserted row exists');
    assert.equal(forged.tenantId, 1);
  }
);

test(
  'real PostgreSQL: update and delete guards prevent cross-tenant writes',
  { skip: skipReason || undefined },
  async () => {
    const ds = probe.dataSource;
    await buildSchema(ds);
    const repo = ds.getRepository('DemoGoods');
    await repo.save([
      { name: 'a', stock: 10, tenantId: 1 },
      { name: 'b', stock: 20, tenantId: 2 },
    ]);

    const updateResult = await guardUpdate(
      repo
        .createQueryBuilder()
        .update()
        .set({ stock: 999 })
        .where('name = :name', { name: 'b' }),
      { role: 'merchant', tenantId: 1 }
    ).execute();
    assert.equal(updateResult.affected, 0);

    const deleteResult = await guardDelete(
      repo.createQueryBuilder().delete().where('name = :name', { name: 'b' }),
      { role: 'merchant', tenantId: 1 }
    ).execute();
    assert.equal(deleteResult.affected, 0);

    const tenantBRow = await guardSelect(
      repo.createQueryBuilder('goods').where('goods.name = :name', {
        name: 'b',
      }),
      { role: 'platform' }
    ).getOne();
    assert.equal(tenantBRow?.stock, 20);
  }
);

test(
  'real PostgreSQL: platform role can read across tenants',
  { skip: skipReason || undefined },
  async () => {
    const ds = probe.dataSource;
    await buildSchema(ds);
    const repo = ds.getRepository('DemoGoods');
    await repo.save([
      { name: 'a', stock: 10, tenantId: 1 },
      { name: 'b', stock: 20, tenantId: 2 },
      { name: 'global', stock: 0, tenantId: null },
    ]);

    const rows = await guardSelect(repo.createQueryBuilder('goods'), {
      role: 'platform',
    }).getMany();
    assert.deepEqual(
      rows.map(row => row.name).sort(),
      ['a', 'b', 'global']
    );
  }
);

test.after(async () => {
  if (probe.dataSource?.isInitialized) {
    await probe.dataSource.destroy();
  }
});
