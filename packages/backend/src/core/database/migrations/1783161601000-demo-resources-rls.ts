import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 第二条 TypeORM migration：在 demo_resources 单表上跑通 PostgreSQL RLS 原型。
 *
 * 作为应用层 TenantSubscriber guard 之外的数据库层兜底（defense-in-depth）：
 * 即使业务代码漏掉 tenant predicate，数据库仍默认拒绝越权读写。
 * 见 .trellis/spec/backend/database-guidelines.md §RLS 指南、
 * .trellis/tasks/07-13-pr2-ci-rls-migration/research/rls-prototype.md。
 *
 * 关键约束（research/rls-prototype.md 已实测）：
 * - tenant_id 是 varchar(64)（非 uuid，见 base-tenant.entity.ts / 第一条 migration）
 *   → policy 按 **text** 比较 current_setting('app.tenant_id', true)，
 *   绝不能用 ::uuid cast（否则每查询报 invalid input syntax for type uuid）。
 * - 超级用户 / 表 owner / BYPASSRLS 角色总绕过 RLS，FORCE 也压不住超级用户；
 *   故创建非超级用户、非 owner、无 BYPASSRLS 的 app 角色 rent_app 供请求路径使用，
 *   FORCE 仅作为 owner 连接的兜底（让非超级用户 owner 也受 RLS 约束）。
 * - 全部 DDL 幂等：DO $$ EXCEPTION 吞 duplicate_object、DROP POLICY IF EXISTS、
 *   GRANT / ALTER ... ENABLE/FORCE 天然幂等。连接跑两次不报错（AC3）。
 */
export class DemoResourcesRls1783161601000 implements MigrationInterface {
  name = 'DemoResourcesRls1783161601000';

  async up(queryRunner: QueryRunner): Promise<void> {
    // 1) 创建非超级用户 app 角色（请求路径 / RLS 测试用）。
    //    NOBYPASSRLS 显式声明（CREATE ROLE 非 superuser 默认即如此，这里文档化并加固）。
    //    幂等：DO $$ 吞 duplicate_object。
    //    TODO prod: 密码走环境变量 / secret 注入（migration 运行期拿不到运行时 env，
    //    原型阶段硬编码 + 由部署管线在外部 ALTER ROLE 改密）。
    await queryRunner.query(`
      DO $$
      BEGIN
        CREATE ROLE rent_app WITH LOGIN PASSWORD 'rent_app' NOSUPERUSER NOBYPASSRLS;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);

    // 2) 授予 schema + 表权限。
    //    demo_resources.id 用 uuid_generate_v4() 默认值（见第一条 migration），无序列，
    //    故无需 GRANT USAGE ON SEQUENCE；后续表若用 SERIAL/IDENTITY 列需补。
    await queryRunner.query('GRANT USAGE ON SCHEMA public TO rent_app');
    await queryRunner.query(
      'GRANT SELECT, INSERT, UPDATE, DELETE ON demo_resources TO rent_app'
    );

    // 3) 开启 RLS + FORCE。FORCE 让表 owner 也受 RLS 约束（belt-and-suspenders）；
    //    注意 FORCE 仍压不住超级用户 —— 超级用户绕过 RLS 是不可由 DDL 改变的 PG 语义，
    //    这正是请求路径必须连非超级用户 rent_app 的根本原因。
    await queryRunner.query(
      'ALTER TABLE demo_resources ENABLE ROW LEVEL SECURITY'
    );
    await queryRunner.query(
      'ALTER TABLE demo_resources FORCE ROW LEVEL SECURITY'
    );

    // 4) 创建 tenant 隔离 policy（幂等：DROP IF EXISTS 再 CREATE）。
    //    text 比较 tenant_id = current_setting('app.tenant_id', true)：
    //    - 第二参 true = missing_ok，未设 GUC 时返回 NULL（不报错）；
    //    - tenant_id = NULL → 结果 NULL → 无行匹配 → 默认拒绝（safe-by-default）。
    //    USING 过滤 SELECT / UPDATE / DELETE 可见行；WITH CHECK 校验 INSERT 新行与
    //    UPDATE 后的行，跨租户写入直接抛 "new row violates row-level security policy"。
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
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP POLICY IF EXISTS demo_resources_tenant_isolation ON demo_resources'
    );
    await queryRunner.query(
      'ALTER TABLE demo_resources NO FORCE ROW LEVEL SECURITY'
    );
    await queryRunner.query(
      'ALTER TABLE demo_resources DISABLE ROW LEVEL SECURITY'
    );
    await queryRunner.query(
      'REVOKE SELECT, INSERT, UPDATE, DELETE ON demo_resources FROM rent_app'
    );
    await queryRunner.query('REVOKE USAGE ON SCHEMA public FROM rent_app');
    // 不 DROP ROLE rent_app：可能被其它表 / 后续 migration 复用，留库状态干净。
  }
}
