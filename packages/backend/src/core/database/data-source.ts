import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { DemoResourceEntity } from '../../modules/demo-resource/entity/demo-resource.entity';
import { InitDemoResources1783161600000 } from './migrations/1783161600000-init-demo-resources';
import { DemoResourcesRls1783161601000 } from './migrations/1783161601000-demo-resources-rls';

/**
 * 独立 DataSource：供 TypeORM CLI（migration:run / migration:revert）
 * 与 seed 脚本使用，与 @midwayjs/typeorm 运行期 DataSource 相互独立（不同进程）。
 *
 * 注意：TenantSubscriber 不放入 dataSource.subscribers —— 它是项目自有 guard，
 * 非 TypeORM 标准 EntitySubscriberInterface 钩子（见 database-guidelines.md §PR0 契约反例）。
 *
 * 导出格式契约：本文件必须只导出**单个** DataSource instance。
 * TypeORM CLI 的 CommandUtils.loadDataSource 会枚举模块所有 export key，
 * 凡通过 isDataSource 的都计入，多于一个即报 "must contain only one export of DataSource instance"。
 * 因此这里只保留命名导出 AppDataSource，**不要**再 `export default` 同一实例（会变成 2 个 export）。
 * entities / migrations 必须用**类引用数组**，不要用 glob 字符串
 * （CLI DataSource 下 glob 解析路径与运行期不同，易漏载）。
 */
export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 5432),
  username: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_NAME || 'rent_dev',
  entities: [DemoResourceEntity],
  migrations: [InitDemoResources1783161600000, DemoResourcesRls1783161601000],
  synchronize: false,
  logging: process.env.DB_LOG === 'true',
});
