import assert from 'node:assert/strict';
import test from 'node:test';
import { TenantScopedStore } from '../backend/tenant/isolation-simulator.mjs';

const tenantOne = { role: 'merchant', tenantId: 1, userId: 101 };
const tenantTwo = { role: 'merchant', tenantId: 2, userId: 201 };
const platform = { role: 'platform', tenantId: null, userId: 1 };

function createStore() {
  return new TenantScopedStore([
    { id: 1, tenantId: 1, name: 'tenant-one-goods', stock: 10 },
    { id: 2, tenantId: 2, name: 'tenant-two-goods', stock: 20 }
  ]);
}

test('tenant users only list their own records', () => {
  const store = createStore();
  assert.deepEqual(store.list(tenantOne).map(record => record.name), ['tenant-one-goods']);
  assert.deepEqual(store.list(tenantTwo).map(record => record.name), ['tenant-two-goods']);
});

test('platform users can list all tenant records', () => {
  const store = createStore();
  assert.deepEqual(store.list(platform).map(record => record.id), [1, 2]);
});

test('cross-tenant id reads return null', () => {
  const store = createStore();
  assert.equal(store.get(tenantOne, 2), null);
  assert.equal(store.get(tenantTwo, 1), null);
});

test('tenant writes are forced to the current tenant', () => {
  const store = createStore();
  const created = store.create(tenantOne, { tenantId: 2, name: 'created-by-tenant-one', stock: 3 });
  assert.equal(created.tenantId, 1);
  assert.equal(store.get(tenantOne, created.id)?.name, 'created-by-tenant-one');
  assert.equal(store.get(tenantTwo, created.id), null);
});

test('updates are tenant-scoped and cannot move a tenant record', () => {
  const store = createStore();
  assert.equal(store.update(tenantOne, 2, { stock: 99 }), null);

  const updated = store.update(tenantOne, 1, { tenantId: 2, stock: 11 });
  assert.equal(updated?.tenantId, 1);
  assert.equal(updated?.stock, 11);
  assert.equal(store.get(tenantTwo, 1), null);
});

test('deletes are tenant-scoped', () => {
  const store = createStore();
  assert.equal(store.delete(tenantOne, 2), false);
  assert.equal(store.get(platform, 2)?.name, 'tenant-two-goods');

  assert.equal(store.delete(tenantOne, 1), true);
  assert.equal(store.get(platform, 1), null);
  assert.equal(store.get(platform, 2)?.name, 'tenant-two-goods');
});
