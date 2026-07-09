import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 第一条 TypeORM migration：创建 demo_resources 表 + tenant_id 索引。
 *
 * 该表是 PR1 三端 walking skeleton 的 tenant-scoped demo 资源载体，
 * 与 `DemoResourceEntity` 对应；prod 通过 migration（而非 synchronize）建表。
 * 见 database-guidelines.md §迁移与数据库结构变更。
 */
export class InitDemoResources1783161600000 implements MigrationInterface {
  name = 'InitDemoResources1783161600000';

  async up(queryRunner: QueryRunner): Promise<void> {
    // uuid_generate_v4() 需要 uuid-ossp 扩展；幂等创建，避免全新库上失败。
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
    await queryRunner.query(
      `CREATE TABLE "demo_resources" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "tenant_id" varchar(64) NOT NULL,
        "name" varchar(80) NOT NULL,
        "description" varchar(240) NOT NULL DEFAULT '',
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_demo_resources" PRIMARY KEY ("id")
      )`
    );
    // 高频按租户过滤的列必须建索引（tenant + 查询维度）。
    await queryRunner.query(
      'CREATE INDEX "IDX_demo_resources_tenant_id" ON "demo_resources" ("tenant_id")'
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX "IDX_demo_resources_tenant_id"');
    await queryRunner.query('DROP TABLE "demo_resources"');
    // 不回滚 uuid-ossp 扩展：其它表可能依赖它。
  }
}
