import 'reflect-metadata';
import { DemoResourceEntity } from '../../modules/demo-resource/entity/demo-resource.entity';
import { AppDataSource } from './data-source';

/**
 * demo seed：为至少 2 个租户写入 demo 资源，支撑三端 walking skeleton 演示。
 *
 * seed 是基础设施脚本（非租户作用域请求代码），直接走 repository 写入并显式指定 tenantId，
 * 不经过 TenantSubscriber guard（guard 只作用于请求作用域的 QueryBuilder 路径）。
 * 前置条件：表已存在（先执行 `npm run migration:run` 或在 dev 下由 synchronize 自动建表）。
 */
async function main(): Promise<void> {
  const dataSource = await AppDataSource.initialize();
  try {
    const repo = dataSource.getRepository(DemoResourceEntity);
    await repo.clear();
    const rows = await repo.save([
      {
        tenantId: 'tenant-a',
        name: 'Tenant A · Demo Alpha',
        description: 'First demo resource for tenant A',
      },
      {
        tenantId: 'tenant-a',
        name: 'Tenant A · Demo Beta',
        description: 'Second demo resource for tenant A',
      },
      {
        tenantId: 'tenant-b',
        name: 'Tenant B · Demo Gamma',
        description: 'First demo resource for tenant B',
      },
      {
        tenantId: 'tenant-b',
        name: 'Tenant B · Demo Delta',
        description: 'Second demo resource for tenant B',
      },
    ]);
    console.log(
      `[seed] demo_resources: inserted ${rows.length} rows across 2 tenants (tenant-a, tenant-b)`
    );
  } finally {
    await dataSource.destroy();
  }
}

main().catch(error => {
  console.error('[seed] failed:', error);
  process.exit(1);
});
