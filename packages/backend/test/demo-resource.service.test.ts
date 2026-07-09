import { BusinessError } from '../src/core/errors/business-error';
import { runWithTenantContext } from '../src/core/tenant/tenant-context';
import { DemoResourceService } from '../src/modules/demo-resource/service/demo-resource.service';

/**
 * 纯隔离回归：用 mock QueryBuilder 验证 DemoResourceService 经 TenantAwareRepository
 * 显式调用了 PR0 TenantSubscriber.after*QueryBuilder（guard 从「骨架」转为「生效」）。
 * 不依赖真实 PG；real-PG 覆盖见 real-demo-resource.test.ts。
 */
type QBKind = 'select' | 'insert' | 'update' | 'delete';

interface AndWhere {
  fragment: string;
  params: Record<string, unknown>;
}

class MockQueryBuilder {
  alias: string;
  kind: QBKind;
  andWheres: AndWhere[] = [];
  wheres: AndWhere[] = [];
  orderByCalls: Array<[string, string]> = [];
  valueSet: unknown;
  setResult: unknown;
  constructor(alias = '', kind: QBKind = 'select', private readonly repo: FakeRepo) {
    this.alias = alias;
    this.kind = kind;
  }

  // TenantSubscriber 通过 expressionMap.valuesSet 读取 insert values。
  get expressionMap() {
    return { valuesSet: this.valueSet };
  }

  andWhere(fragment: string, params?: Record<string, unknown>) {
    this.andWheres.push({ fragment, params: params || {} });
    return this;
  }
  where(fragment: string, params?: Record<string, unknown>) {
    this.wheres.push({ fragment, params: params || {} });
    return this;
  }
  values(value: unknown) {
    this.valueSet = value;
    return this;
  }
  set(value: unknown) {
    this.setResult = value;
    return this;
  }
  insert() {
    this.kind = 'insert';
    return this;
  }
  update() {
    this.kind = 'update';
    return this;
  }
  delete() {
    this.kind = 'delete';
    return this;
  }
  into() {
    return this;
  }
  orderBy(column: string, direction = 'DESC') {
    this.orderByCalls.push([column, direction]);
    return this;
  }
  addOrderBy(column: string, direction = 'DESC') {
    this.orderByCalls.push([column, direction]);
    return this;
  }
  async getMany() {
    return this.repo.manyReturn;
  }
  async getOne() {
    return this.repo.oneReturn;
  }
  async execute() {
    return {
      affected: this.repo.executeAffected,
      identifiers: this.repo.executeIdentifiers,
      raw: {},
    };
  }
}

class FakeRepo {
  metadata = { tableName: 'demo_resources' };
  manyReturn: unknown[] = [];
  oneReturn: unknown = null;
  executeAffected = 0;
  executeIdentifiers: Array<Record<string, unknown>> = [];
  createdQBs: MockQueryBuilder[] = [];
  createQueryBuilder(alias?: string) {
    const qb = new MockQueryBuilder(alias ?? '', 'select', this);
    this.createdQBs.push(qb);
    return qb;
  }
}

function createService() {
  const repo = new FakeRepo();
  const service = new DemoResourceService();
  service.resourceRepo = repo as any;
  return { service, repo };
}

const sampleRow = {
  id: 'id-1',
  tenantId: 'tenant-a',
  name: 'Tenant A sample',
  description: '',
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
};

describe('DemoResourceService tenant isolation (pure, guard wired)', () => {
  it('merchant list applies the tenant select guard predicate', async () => {
    const { service, repo } = createService();
    repo.manyReturn = [sampleRow];

    const rows = await runWithTenantContext(
      { role: 'merchant', tenantId: 'tenant-a' },
      () => service.listForTenant()
    );

    expect(rows).toEqual([sampleRow]);
    const selectQB = repo.createdQBs[0];
    expect(selectQB.andWheres).toContainEqual({
      fragment: 'demo_resources.tenantId = :tenantId',
      params: { tenantId: 'tenant-a' },
    });
  });

  it('merchant list without tenant context throws', async () => {
    const { service } = createService();

    await expect(service.listForTenant()).rejects.toThrow(
      /Tenant (context|id) is required/
    );
  });

  it('merchant get returns the row only when it belongs to the tenant', async () => {
    const { service, repo } = createService();
    repo.oneReturn = sampleRow;

    const row = await runWithTenantContext(
      { role: 'merchant', tenantId: 'tenant-a' },
      () => service.getForTenant('id-1')
    );
    expect(row).toEqual(sampleRow);

    // guard 仍然追加了 tenant predicate（即便 service 已按 id 过滤）。
    expect(repo.createdQBs[0].andWheres).toContainEqual({
      fragment: 'demo_resources.tenantId = :tenantId',
      params: { tenantId: 'tenant-a' },
    });
  });

  it('merchant get on a cross-tenant row resolves to 404 (no existence leak)', async () => {
    const { service, repo } = createService();
    repo.oneReturn = null;

    await expect(
      runWithTenantContext(
        { role: 'merchant', tenantId: 'tenant-a' },
        () => service.getForTenant('id-from-tenant-b')
      )
    ).rejects.toMatchObject<Partial<BusinessError>>({
      code: 'DEMO_RESOURCE_NOT_FOUND',
      status: 404,
    });
  });

  it('merchant create forces the context tenant id and ignores the body tenantId', async () => {
    const { service, repo } = createService();
    repo.oneReturn = { ...sampleRow, name: 'Created' };
    repo.executeIdentifiers = [{ id: 'new-id' }];

    const created = await runWithTenantContext(
      { role: 'merchant', tenantId: 'tenant-a' },
      () =>
        service.createForTenant({
          name: ' Created ',
          description: ' demo ',
          tenantId: 'tenant-b',
        } as any)
    );

    expect(created).toMatchObject({ tenantId: 'tenant-a', name: 'Created' });
    const insertQB = repo.createdQBs.find(qb => qb.kind === 'insert');
    expect(insertQB).toBeTruthy();
    // afterInsertQueryBuilder 必须以上下文租户覆盖请求体里的 tenantId。
    expect((insertQB as MockQueryBuilder).valueSet).toMatchObject({
      tenantId: 'tenant-a',
      name: 'Created',
      description: 'demo',
    });
  });

  it('merchant create without a name rejects with 400', async () => {
    const { service } = createService();

    await expect(
      runWithTenantContext(
        { role: 'merchant', tenantId: 'tenant-a' },
        () => service.createForTenant({ name: '   ' } as any)
      )
    ).rejects.toMatchObject<Partial<BusinessError>>({
      code: 'DEMO_RESOURCE_NAME_REQUIRED',
      status: 400,
    });
  });

  it('merchant create without tenant context throws', async () => {
    const { service } = createService();

    await expect(service.createForTenant({ name: 'x' })).rejects.toThrow(
      /Tenant (context|id) is required/
    );
  });

  it('merchant update applies the tenant write guard (affected>0)', async () => {
    const { service, repo } = createService();
    repo.executeAffected = 1;
    repo.oneReturn = { ...sampleRow, name: 'Updated' };

    const updated = await runWithTenantContext(
      { role: 'merchant', tenantId: 'tenant-a' },
      () => service.updateForTenant('id-1', { name: 'Updated' })
    );

    expect(updated).toMatchObject({ name: 'Updated' });
    const updateQB = repo.createdQBs.find(qb => qb.kind === 'update');
    expect((updateQB as MockQueryBuilder).andWheres).toContainEqual({
      fragment: 'tenantId = :tenantId',
      params: { tenantId: 'tenant-a' },
    });
  });

  it('merchant update on a cross-tenant row yields affected=0 -> 404', async () => {
    const { service, repo } = createService();
    repo.executeAffected = 0;

    await expect(
      runWithTenantContext(
        { role: 'merchant', tenantId: 'tenant-a' },
        () => service.updateForTenant('id-from-tenant-b', { name: 'X' })
      )
    ).rejects.toMatchObject<Partial<BusinessError>>({
      code: 'DEMO_RESOURCE_NOT_FOUND',
      status: 404,
    });
  });

  it('merchant delete applies the tenant write guard (affected>0)', async () => {
    const { service, repo } = createService();
    repo.executeAffected = 1;

    await runWithTenantContext(
      { role: 'merchant', tenantId: 'tenant-a' },
      () => service.deleteForTenant('id-1')
    );

    const deleteQB = repo.createdQBs.find(qb => qb.kind === 'delete');
    expect((deleteQB as MockQueryBuilder).andWheres).toContainEqual({
      fragment: 'tenantId = :tenantId',
      params: { tenantId: 'tenant-a' },
    });
  });

  it('merchant delete on a cross-tenant row yields affected=0 -> 404', async () => {
    const { service, repo } = createService();
    repo.executeAffected = 0;

    await expect(
      runWithTenantContext(
        { role: 'merchant', tenantId: 'tenant-a' },
        () => service.deleteForTenant('id-from-tenant-b')
      )
    ).rejects.toMatchObject<Partial<BusinessError>>({
      code: 'DEMO_RESOURCE_NOT_FOUND',
      status: 404,
    });
  });

  it('platform list reads across tenants without a tenant predicate', async () => {
    const { service, repo } = createService();
    repo.manyReturn = [
      { ...sampleRow, tenantId: 'tenant-a' },
      { ...sampleRow, tenantId: 'tenant-b', name: 'Tenant B sample' },
    ];

    const rows = await runWithTenantContext({ role: 'platform' }, () =>
      service.listForPlatform()
    );

    expect(rows.map(row => row.tenantId).sort()).toEqual([
      'tenant-a',
      'tenant-b',
    ]);
    // 平台态：guard 有意不追加 tenant predicate。
    expect(repo.createdQBs[0].andWheres).toEqual([]);
  });

  it('platform list from a merchant context is rejected with 403', async () => {
    const { service } = createService();

    await expect(
      runWithTenantContext(
        { role: 'merchant', tenantId: 'tenant-a' },
        () => service.listForPlatform()
      )
    ).rejects.toMatchObject<Partial<BusinessError>>({
      code: 'PLATFORM_ONLY',
      status: 403,
    });
  });
});
