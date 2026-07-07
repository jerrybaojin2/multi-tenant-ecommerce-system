// 测试辅助：用 TypeORM EntitySchema 定义一张租户隔离的 demo 表。
//
// 为什么用 EntitySchema 而非 v8 的 BaseEntity（@Entity 装饰器）：
// BaseEntity 的 @Column 装饰器在运行时需要 reflect-metadata + TS 编译，
// 而本测试要能在纯 `node` 下直接跑（PR0 的 `npm run check` 触发）。
// EntitySchema 是 TypeORM 官方支持的、无装饰器的等价描述方式，
// 表现的物理列（含 tenant_id）与 @Entity 完全一致——验证的是
// cool-admin v8 TenantSubscriber 钩子对 QueryBuilder 的 SQL 改写，
// 这与实体是用 @Entity 还是 EntitySchema 定义无关。
//
// 表名/列名遵循 cool-admin v8 物理命名：snake_case，tenant_id 列。
// 详见 .trellis/spec/backend/database-guidelines.md（BaseEntity.tenantId -> tenant_id）。

const { EntitySchema } = require('typeorm');

const columns = {
  id: {
    type: Number,
    primary: true,
    generated: 'increment',
    name: 'id',
  },
  name: {
    type: String,
    name: 'name',
    nullable: false,
  },
  stock: {
    type: Number,
    name: 'stock',
    default: 0,
  },
  // 关键：与 BaseEntity.tenantId 对应的物理列 tenant_id。
  // cool-admin v8 多租户隔离完全依赖此列（PRD D3）。
  tenantId: {
    type: Number,
    name: 'tenant_id',
    nullable: true,
  },
};

module.exports = new EntitySchema({
  name: 'DemoGoods',
  tableName: 'demo_goods',
  columns,
});
