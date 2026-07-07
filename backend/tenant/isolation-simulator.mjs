export class TenantScopedStore {
  constructor(seedRecords = []) {
    this.records = seedRecords.map(record => ({ ...record }));
    this.nextId = this.records.reduce((max, record) => Math.max(max, record.id), 0) + 1;
  }

  list(context) {
    this.assertReadableContext(context);
    return this.records.filter(record => this.canAccess(context, record)).map(record => ({ ...record }));
  }

  get(context, id) {
    this.assertReadableContext(context);
    const record = this.records.find(item => item.id === id && this.canAccess(context, item));
    return record ? { ...record } : null;
  }

  create(context, payload) {
    this.assertWritableContext(context);
    const tenantId = this.isPlatform(context) ? payload.tenantId : context.tenantId;
    if (tenantId === undefined || tenantId === null) {
      throw new Error('tenantId is required for tenant-scoped records');
    }

    const record = {
      ...payload,
      id: this.nextId++,
      tenantId
    };
    this.records.push(record);
    return { ...record };
  }

  update(context, id, patch) {
    this.assertWritableContext(context);
    const index = this.records.findIndex(record => record.id === id && this.canAccess(context, record));
    if (index === -1) {
      return null;
    }

    const current = this.records[index];
    const tenantId = this.isPlatform(context) && patch.tenantId !== undefined ? patch.tenantId : current.tenantId;
    const next = {
      ...current,
      ...patch,
      id: current.id,
      tenantId
    };
    this.records[index] = next;
    return { ...next };
  }

  delete(context, id) {
    this.assertWritableContext(context);
    const index = this.records.findIndex(record => record.id === id && this.canAccess(context, record));
    if (index === -1) {
      return false;
    }

    this.records.splice(index, 1);
    return true;
  }

  canAccess(context, record) {
    if (this.isPlatform(context)) {
      return true;
    }
    return record.tenantId === context.tenantId;
  }

  isPlatform(context) {
    return context?.role === 'platform' || context?.role === 'admin' || context?.tenantId === null;
  }

  assertReadableContext(context) {
    if (!context || (!this.isPlatform(context) && context.tenantId === undefined)) {
      throw new Error('tenant context is required');
    }
  }

  assertWritableContext(context) {
    this.assertReadableContext(context);
  }
}
