import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { checkRawSql } from '../scripts/check-raw-sql.mjs';

// 用 mkdtemp 造临时 backend/src 树（镜像 tests/guards.test.mjs 的 fixture 模式），
// 直接调 checkRawSql(tmpDir) 断言 {ok, errors}。

test('raw-sql guard rejects bare .query( in tenant module', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'raw-sql-bare-'));
  await mkdir(path.join(root, 'modules', 'order', 'service'), { recursive: true });
  await writeFile(
    path.join(root, 'modules', 'order', 'service', 'order.service.ts'),
    "export class OrderService {\n  findAll(repo) { return repo.query('SELECT * FROM orders'); }\n}\n"
  );

  const result = await checkRawSql(root);
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /\.query\(/);
});

test('raw-sql guard skips queryRunner.query() inside migrations/', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'raw-sql-migration-'));
  await mkdir(path.join(root, 'core', 'database', 'migrations'), { recursive: true });
  await writeFile(
    path.join(root, 'core', 'database', 'migrations', '1234-init.ts'),
    "export class Init1234 {\n  async up(qr) { await qr.query('CREATE TABLE x (id int)'); }\n  async down(qr) { await qr.query('DROP TABLE x'); }\n}\n"
  );

  const result = await checkRawSql(root);
  assert.equal(result.ok, true, result.errors.join('\n'));
});

test('raw-sql guard skips data-source.ts and *.subscriber.ts', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'raw-sql-infra-'));
  await mkdir(path.join(root, 'core', 'database'), { recursive: true });
  await writeFile(
    path.join(root, 'core', 'database', 'data-source.ts'),
    "export const ds = { query(sql: string) { return (globalThis as any).pg.query(sql); } };\n"
  );
  await writeFile(
    path.join(root, 'core', 'database', 'tenant.subscriber.ts'),
    "export class TenantSubscriber { afterLoad(e: any) { return (this as any).em.query('SELECT 1'); } }\n"
  );

  const result = await checkRawSql(root);
  assert.equal(result.ok, true, result.errors.join('\n'));
});

test('raw-sql guard allows platform-only marker under modules/platform/**', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'raw-sql-platform-'));
  await mkdir(path.join(root, 'modules', 'platform', 'service'), { recursive: true });
  await writeFile(
    path.join(root, 'modules', 'platform', 'service', 'report.service.ts'),
    "export class ReportService {\n  // raw-sql: platform-only cross-tenant revenue aggregation\n  aggregate(ds) { return ds.query('SELECT tenant_id, SUM(amount) FROM orders'); }\n}\n"
  );

  const result = await checkRawSql(root);
  assert.equal(result.ok, true, result.errors.join('\n'));
});

test('raw-sql guard rejects marker in non-platform module', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'raw-sql-badmarker-'));
  await mkdir(path.join(root, 'modules', 'order', 'service'), { recursive: true });
  await writeFile(
    path.join(root, 'modules', 'order', 'service', 'order.service.ts'),
    "export class OrderService {\n  // raw-sql: platform-only attempted smuggling\n  bad(repo) { return repo.query('SELECT * FROM orders'); }\n}\n"
  );

  const result = await checkRawSql(root);
  assert.equal(result.ok, false);
  // 标记在非允许路径产出独立错误，且原 .query( 仍记违规。
  assert.match(result.errors.join('\n'), /not in platform\/rls allowlist/);
  assert.match(result.errors.join('\n'), /\.query\(/);
});

test('raw-sql guard passes clean QueryBuilder code', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'raw-sql-clean-'));
  await mkdir(path.join(root, 'modules', 'order', 'service'), { recursive: true });
  await writeFile(
    path.join(root, 'modules', 'order', 'service', 'order.service.ts'),
    "export class OrderService {\n  findAll(repo) {\n    return repo.createQueryBuilder('order').where('order.tenant_id = :tid', { tid: 1 }).getMany();\n  }\n}\n"
  );

  const result = await checkRawSql(root);
  assert.equal(result.ok, true, result.errors.join('\n'));
});

test('raw-sql guard rejects .query( in platform path when marker is missing', async () => {
  // platform 路径不是无条件豁免：缺标记照样违规。
  const root = await mkdtemp(path.join(os.tmpdir(), 'raw-sql-nomarker-'));
  await mkdir(path.join(root, 'modules', 'platform', 'service'), { recursive: true });
  await writeFile(
    path.join(root, 'modules', 'platform', 'service', 'report.service.ts'),
    "export class ReportService {\n  aggregate(ds) { return ds.query('SELECT * FROM orders'); }\n}\n"
  );

  const result = await checkRawSql(root);
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /\.query\(/);
});
