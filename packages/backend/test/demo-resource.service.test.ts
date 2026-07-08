import { BusinessError } from '../src/core/errors/business-error';
import { runWithTenantContext } from '../src/core/tenant/tenant-context';
import { DemoResourceService } from '../src/modules/demo-resource/service/demo-resource.service';

interface DemoRecord {
  id: string;
  tenantId: string;
  name: string;
  description: string;
  createdAt: Date;
}

class FakeDemoResourceRepository {
  private nextId = 3;

  constructor(private readonly records: DemoRecord[]) {}

  async find(options: { where?: { tenantId?: string } } = {}) {
    const rows = options.where?.tenantId
      ? this.records.filter(row => row.tenantId === options.where.tenantId)
      : this.records;
    return rows.map(row => ({ ...row }));
  }

  create(input: Partial<DemoRecord>) {
    return {
      id: String(this.nextId++),
      createdAt: new Date(),
      description: '',
      ...input,
    } as DemoRecord;
  }

  async save(input: DemoRecord) {
    this.records.push(input);
    return { ...input };
  }
}

function createService() {
  const repo = new FakeDemoResourceRepository([
    {
      id: '1',
      tenantId: 'tenant-a',
      name: 'Tenant A sample',
      description: '',
      createdAt: new Date('2026-01-01T00:00:00Z'),
    },
    {
      id: '2',
      tenantId: 'tenant-b',
      name: 'Tenant B sample',
      description: '',
      createdAt: new Date('2026-01-02T00:00:00Z'),
    },
  ]);
  const service = new DemoResourceService();
  service.resourceRepo = repo as any;
  return service;
}

describe('DemoResourceService', () => {
  it('lists only the active tenant resources for merchant users', async () => {
    const service = createService();

    const rows = await runWithTenantContext(
      { role: 'merchant', tenantId: 'tenant-a' },
      () => service.listForTenant()
    );

    expect(rows.map(row => row.name)).toEqual(['Tenant A sample']);
  });

  it('uses context tenant id when creating resources', async () => {
    const service = createService();

    // 即使请求体夹带其他租户，也必须落到当前上下文租户。
    const created = await runWithTenantContext(
      { role: 'merchant', tenantId: 'tenant-a' },
      () =>
        service.createForTenant({
          name: ' Created by tenant A ',
          description: ' Demo ',
          tenantId: 'tenant-b',
        } as any)
    );

    expect(created).toMatchObject({
      tenantId: 'tenant-a',
      name: 'Created by tenant A',
      description: 'Demo',
    });
  });

  it('lets platform context list all tenant resources', async () => {
    const service = createService();

    // 平台态是唯一允许跨租户读取 demo 资源的上下文。
    const rows = await runWithTenantContext({ role: 'platform' }, () =>
      service.listForPlatform()
    );

    expect(rows.map(row => row.tenantId).sort()).toEqual([
      'tenant-a',
      'tenant-b',
    ]);
  });

  it('rejects platform list from tenant context', async () => {
    const service = createService();

    await expect(
      runWithTenantContext({ role: 'merchant', tenantId: 'tenant-a' }, () =>
        service.listForPlatform()
      )
    ).rejects.toMatchObject<Partial<BusinessError>>({
      code: 'PLATFORM_ONLY',
      status: 403,
    });
  });
});
