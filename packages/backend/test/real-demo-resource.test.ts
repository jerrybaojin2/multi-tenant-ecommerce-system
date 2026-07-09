import { DataSource } from 'typeorm';
import { TenantAwareRepository } from '../src/core/database/tenant-repository';
import { runWithTenantContext } from '../src/core/tenant/tenant-context';
import { DemoResourceEntity } from '../src/modules/demo-resource/entity/demo-resource.entity';

/**
 * 真实 PostgreSQL 回归：对 demo_resources + TenantAwareRepository + TenantSubscriber
 * 端到端验证租户隔离 guard 在真实 PG 上的行为。覆盖 list/get/create/update/delete + platform。
 *
 * 缺 PG 时整体跳过（每条用例早返回并打印原因），不污染默认 `npm test` 绿通道。
 * 启动 PG：`cd packages/backend; docker compose up -d`（创建 rent_dev + rent_test），
 * 或设置 TEST_DB_* / DB_* 指向可用 PostgreSQL。
 */
jest.setTimeout(30000);

const pgHost = process.env.TEST_DB_HOST || process.env.DB_HOST || '127.0.0.1';
const pgPort = Number(process.env.TEST_DB_PORT || process.env.DB_PORT || 5432);
const pgUser = process.env.TEST_DB_USER || process.env.DB_USER || 'postgres';
const pgPassword =
  process.env.TEST_DB_PASSWORD || process.env.DB_PASSWORD || 'postgres';
const pgDatabase = process.env.TEST_DB_NAME || 'rent_test';

let dataSource: DataSource | null = null;
let skipReason = '';

beforeAll(async () => {
  const ds = new DataSource({
    type: 'postgres',
    host: pgHost,
    port: pgPort,
    username: pgUser,
    password: pgPassword,
    database: pgDatabase,
    entities: [DemoResourceEntity],
    synchronize: true,
    dropSchema: true,
    logging: false,
  });
  try {
    dataSource = await ds.initialize();
  } catch (error) {
    skipReason = `${error?.code || error?.name || 'Error'}: ${error?.message}`;
    // eslint-disable-next-line no-console
    console.warn(
      `[real-demo-resource] PostgreSQL unavailable (${pgHost}:${pgPort}/${pgDatabase}), skipping real-PG tests. ${skipReason}.`
    );
  }
});

afterAll(async () => {
  if (dataSource && dataSource.isInitialized) {
    await dataSource.destroy();
  }
});

beforeEach(async () => {
  if (!dataSource) {
    return;
  }
  await dataSource.getRepository(DemoResourceEntity).clear();
});

function requireDb(): DataSource {
  if (!dataSource) {
    // PG 不可用时跳过：jest 仍计为 passed，避免在无 DB 环境红测。
    throw new Error('skipped: postgresql unavailable');
  }
  return dataSource;
}

function scoped() {
  return new TenantAwareRepository(
    requireDb().getRepository(DemoResourceEntity)
  );
}

describe('demo resource tenant isolation (real PostgreSQL)', () => {
  it('merchant list only returns the current tenant rows', async () => {
    if (!dataSource) {
      return;
    }
    await runWithTenantContext({ role: 'merchant', tenantId: 'tenant-a' }, () =>
      scoped().createScoped({ name: 'A1', description: 'a' })
    );
    await runWithTenantContext({ role: 'merchant', tenantId: 'tenant-b' }, () =>
      scoped().createScoped({ name: 'B1', description: 'b' })
    );

    const tenantARows = await runWithTenantContext(
      { role: 'merchant', tenantId: 'tenant-a' },
      () => scoped().list()
    );
    expect(tenantARows.map(row => row.name)).toEqual(['A1']);
  });

  it('merchant get on a cross-tenant row returns null', async () => {
    if (!dataSource) {
      return;
    }
    const created = await runWithTenantContext(
      { role: 'merchant', tenantId: 'tenant-b' },
      () => scoped().createScoped({ name: 'B-only', description: '' })
    );

    const cross = await runWithTenantContext(
      { role: 'merchant', tenantId: 'tenant-a' },
      () => scoped().getByScope(created.id)
    );
    expect(cross).toBeNull();
  });

  it('insert guard forces the current tenant id (forged body tenantId overridden)', async () => {
    if (!dataSource) {
      return;
    }
    const created = await runWithTenantContext(
      { role: 'merchant', tenantId: 'tenant-a' },
      () =>
        scoped().createScoped({
          name: 'forged',
          description: '',
          tenantId: 'tenant-b',
        } as any)
    );
    expect(created.tenantId).toBe('tenant-a');

    const platformRows = await runWithTenantContext(
      { role: 'platform' },
      () => scoped().listAllForPlatform()
    );
    expect(platformRows.find(row => row.name === 'forged')?.tenantId).toBe(
      'tenant-a'
    );
  });

  it('update guard blocks cross-tenant writes (affected=0)', async () => {
    if (!dataSource) {
      return;
    }
    const tenantBRow = await runWithTenantContext(
      { role: 'merchant', tenantId: 'tenant-b' },
      () => scoped().createScoped({ name: 'b-target', description: '' })
    );

    const affected = await runWithTenantContext(
      { role: 'merchant', tenantId: 'tenant-a' },
      () => scoped().updateScoped(tenantBRow.id, { name: 'hijacked' })
    );
    expect(affected).toBe(0);

    const untouched = await runWithTenantContext(
      { role: 'platform' },
      () => scoped().getByIdForPlatform(tenantBRow.id)
    );
    expect(untouched?.name).toBe('b-target');
  });

  it('delete guard blocks cross-tenant deletes (affected=0)', async () => {
    if (!dataSource) {
      return;
    }
    const tenantBRow = await runWithTenantContext(
      { role: 'merchant', tenantId: 'tenant-b' },
      () => scoped().createScoped({ name: 'b-delete', description: '' })
    );

    const affected = await runWithTenantContext(
      { role: 'merchant', tenantId: 'tenant-a' },
      () => scoped().deleteScoped(tenantBRow.id)
    );
    expect(affected).toBe(0);

    const stillThere = await runWithTenantContext(
      { role: 'platform' },
      () => scoped().getByIdForPlatform(tenantBRow.id)
    );
    expect(stillThere?.name).toBe('b-delete');
  });

  it('platform role reads across tenants', async () => {
    if (!dataSource) {
      return;
    }
    await runWithTenantContext({ role: 'merchant', tenantId: 'tenant-a' }, () =>
      scoped().createScoped({ name: 'A', description: '' })
    );
    await runWithTenantContext({ role: 'merchant', tenantId: 'tenant-b' }, () =>
      scoped().createScoped({ name: 'B', description: '' })
    );

    const rows = await runWithTenantContext({ role: 'platform' }, () =>
      scoped().listAllForPlatform()
    );
    expect(rows.map(row => row.tenantId).sort()).toEqual([
      'tenant-a',
      'tenant-b',
    ]);
  });
});
