const { EntitySchema } = require('typeorm');

module.exports = new EntitySchema({
  name: 'DemoGoods',
  tableName: 'demo_goods',
  columns: {
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
    tenantId: {
      type: Number,
      name: 'tenant_id',
      nullable: true,
    },
  },
});
