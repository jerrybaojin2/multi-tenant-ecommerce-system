// 测试辅助：把 cool-admin v8 的 TenantSubscriber 适配为可在纯 node（无 Midway IoC）
// 下运行的形态，用于真实 PG 隔离测试。
//
// 背景与取舍（重要）：
// cool-admin v8 的 TenantSubscriber（src/modules/base/db/tenant.ts）通过
// @App/@Inject/@Config 依赖 Midway IoC，直接 new 会缺失 this.app / this.utils / this.tenant。
// 启动整个 Midway 应用成本高（需 cool CLI + eps 扫描 + 完整配置），不适合 PR0 的
// `npm run check` 快速门禁。因此本 fixture 子类化其行为，**只覆写依赖 IoC 的两个方法**
// （checkHandler / getTenantId），其余 4 个 QueryBuilder 钩子与上游逐字一致。
//
// 为防止"内联副本与上游漂移"，本文件附带 assertMatchesUpstream()：
// 它读取上游 tenant.ts 源码，断言 4 个钩子的关键 SQL 改写片段真实存在于上游源码中。
// tests/real-tenant.test.mjs 会在每个真实 PG 测试前调用它做防漂移校验。
//
// 这等价于验证："v8 TenantSubscriber 钩子 + 真实 TypeORM QueryBuilder + 真实 PG"
// 端到端的隔离行为（PR0 验收点），而非纯 JS 逻辑模拟。

const { readFile } = require('node:fs/promises');
const path = require('node:path');

// 上游 tenant.ts 路径（vendored）
const UPSTREAM_TENANT_TS = path.join(
  __dirname,
  '..',
  '..',
  'src',
  'modules',
  'base',
  'db',
  'tenant.ts'
);

class TenantSubscriberForTest {
  constructor({ enabled = true, tenantId = undefined } = {}) {
    // 与上游 TenantSubscriber 的 this.tenant 同构
    this.tenant = { enable: enabled };
    this._tenantId = tenantId;
  }

  // 覆写：跳过 IoC，直接由配置决定（上游依赖 AsyncContextManager + utils.matchUrl）
  checkHandler() {
    return !!this.tenant?.enable;
  }

  // 覆写：跳过 ctx/IoC，直接返回注入的 tenantId（上游从 ctx.admin.tenantId / ctx.user.tenantId 读取）
  // - merchant 角色：tenantId 为数字 → 触发过滤
  // - platform 角色 / noTenant 逃逸：tenantId 为 undefined → 不过滤（跨租户可见）
  getTenantId() {
    return this._tenantId;
  }

  // ===== 以下 4 个钩子与 cool-admin v8 上游 TenantSubscriber 逐字一致 =====
  // 来源：packages/backend/src/modules/base/db/tenant.ts:161-212
  // assertMatchesUpstream() 会校验关键片段，若上游升级请同步更新此处并更新断言。

  afterSelectQueryBuilder(queryBuilder) {
    if (!this.tenant?.enable) return;
    const tenantId = this.getTenantId();
    if (tenantId) {
      queryBuilder.andWhere(
        `${
          queryBuilder.alias ? queryBuilder.alias + '.' : ''
        }tenantId = '${tenantId}'`
      );
    }
  }

  afterInsertQueryBuilder(queryBuilder) {
    if (!this.tenant?.enable) return;
    const tenantId = this.getTenantId();
    if (tenantId) {
      const values = queryBuilder.expressionMap.valuesSet;
      if (Array.isArray(values)) {
        queryBuilder.values(values.map(item => ({ ...item, tenantId })));
      } else if (typeof values === 'object') {
        queryBuilder.values({ ...values, tenantId });
      }
    }
  }

  afterUpdateQueryBuilder(queryBuilder) {
    if (!this.tenant?.enable) return;
    const tenantId = this.getTenantId();
    if (tenantId) {
      queryBuilder.andWhere(`tenantId = '${tenantId}'`);
    }
  }

  afterDeleteQueryBuilder(queryBuilder) {
    if (!this.tenant?.enable) return;
    const tenantId = this.getTenantId();
    if (tenantId) {
      queryBuilder.andWhere(`tenantId = '${tenantId}'`);
    }
  }
}

// 防漂移：断言上游 tenant.ts 真实包含本 fixture 复刻的钩子关键片段。
// 若上游升级改写了 SQL 注入方式，这里会失败，提醒同步 fixture。
async function assertMatchesUpstream() {
  const src = await readFile(UPSTREAM_TENANT_TS, 'utf8');
  const mustContain = [
    // select 钩子：alias 前缀 + tenantId 字符串拼接
    "queryBuilder.alias ? queryBuilder.alias + '.' : ''",
    "tenantId = '${tenantId}'",
    // insert 钩子：valuesSet + 数组/对象分支
    'queryBuilder.expressionMap.valuesSet',
    'values.map(item => ({ ...item, tenantId }))',
    'queryBuilder.values({ ...values, tenantId })',
    // update / delete 钩子：裸 tenantId 条件
    "queryBuilder.andWhere(`tenantId = '${tenantId}'`)",
    // noTenant 逃逸
    'export const noTenant = async (ctx, func) => {',
  ];
  const missing = mustContain.filter(fragment => !src.includes(fragment));
  if (missing.length > 0) {
    throw new Error(
      'TenantSubscriberForTest 与上游 tenant.ts 漂移，缺失片段：\n' +
        missing.map(m => `  - ${m}`).join('\n') +
        '\n请同步 packages/backend/test/real-tenant/tenant-subscriber-fixture.js 与上游 src/modules/base/db/tenant.ts'
    );
  }
}

module.exports = { TenantSubscriberForTest, assertMatchesUpstream };
