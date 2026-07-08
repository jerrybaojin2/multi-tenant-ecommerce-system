class TenantSubscriberForTest {
  constructor({ enabled = true, tenantId = undefined } = {}) {
    this.enabled = enabled;
    this._tenantId = tenantId;
  }

  getTenantId() {
    return this._tenantId;
  }

  afterSelectQueryBuilder(queryBuilder) {
    if (!this.enabled) return;
    const tenantId = this.getTenantId();
    if (tenantId) {
      queryBuilder.andWhere(
        `${queryBuilder.alias ? queryBuilder.alias + '.' : ''}tenantId = :tenantId`,
        { tenantId }
      );
    }
  }

  afterInsertQueryBuilder(queryBuilder) {
    if (!this.enabled) return;
    const tenantId = this.getTenantId();
    if (tenantId) {
      const values = queryBuilder.expressionMap.valuesSet;
      if (Array.isArray(values)) {
        queryBuilder.values(values.map(item => ({ ...item, tenantId })));
      } else if (values && typeof values === 'object') {
        queryBuilder.values({ ...values, tenantId });
      }
    }
  }

  afterUpdateQueryBuilder(queryBuilder) {
    if (!this.enabled) return;
    const tenantId = this.getTenantId();
    if (tenantId) {
      queryBuilder.andWhere('tenantId = :tenantId', { tenantId });
    }
  }

  afterDeleteQueryBuilder(queryBuilder) {
    if (!this.enabled) return;
    const tenantId = this.getTenantId();
    if (tenantId) {
      queryBuilder.andWhere('tenantId = :tenantId', { tenantId });
    }
  }
}

module.exports = { TenantSubscriberForTest };
