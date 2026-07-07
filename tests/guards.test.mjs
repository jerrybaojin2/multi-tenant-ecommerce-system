import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { checkProdConfigText } from '../scripts/check-prod-config.mjs';
import { isVersionAtLeast, verifyCoolAdminCandidate } from '../scripts/verify-cool-admin-v8.mjs';

test('midway version guard accepts v3 and v4 ranges', () => {
  assert.equal(isVersionAtLeast('^3.0.0', [3, 0, 0]), true);
  assert.equal(isVersionAtLeast('4.1.0', [3, 0, 0]), true);
  assert.equal(isVersionAtLeast('^2.14.0', [3, 0, 0]), false);
});

test('cool-admin candidate guard accepts required v8 integration markers', async () => {
  const root = await createCandidate({
    midwayVersion: '^3.15.0',
    tenantFile: true,
    baseEntity: `
      import { Column } from 'typeorm';
      export class BaseEntity {
        @Column({ nullable: true })
        tenantId: number;
      }
    `
  });

  const result = await verifyCoolAdminCandidate(root);
  assert.equal(result.ok, true, result.errors.join('\n'));
});

test('cool-admin candidate guard rejects old midway and missing tenant marker', async () => {
  const root = await createCandidate({
    midwayVersion: '^2.14.0',
    tenantFile: false,
    baseEntity: 'export class BaseEntity {}'
  });

  const result = await verifyCoolAdminCandidate(root);
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /@midwayjs\/core must be >=3\.0\.0/);
  assert.match(result.errors.join('\n'), /Missing src\/modules\/base\/db\/tenant\.ts/);
  assert.match(result.errors.join('\n'), /does not contain tenantId/);
});

test('cool-admin candidate guard rejects tenantId without a column decorator', async () => {
  const root = await createCandidate({
    midwayVersion: '^3.15.0',
    tenantFile: true,
    baseEntity: `
      import { Column } from 'typeorm';
      export class BaseEntity {
        @Column()
        name: string;
        tenantId: number;
      }
    `
  });

  const result = await verifyCoolAdminCandidate(root);
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /tenantId does not appear to use a TypeORM @Column decorator/);
});

test('production config guard requires synchronize false and eps false', () => {
  const good = checkProdConfigText(`
    export default {
      typeorm: { dataSource: { default: { synchronize: false } } },
      cool: { eps: false }
    };
  `);
  assert.equal(good.ok, true, good.errors.join('\n'));

  const bad = checkProdConfigText(`
    export default {
      typeorm: { dataSource: { default: { synchronize: true } } },
      cool: { eps: true }
    };
  `);
  assert.equal(bad.ok, false);
  assert.match(bad.errors.join('\n'), /synchronize must be false/);
  assert.match(bad.errors.join('\n'), /cool\.eps must be false/);
});

test('production config guard only accepts eps under cool config', () => {
  const result = checkProdConfigText(`
    export default {
      typeorm: { dataSource: { default: { synchronize: false } } },
      other: { eps: false },
      cool: { tenant: { enable: true } }
    };
  `);

  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /missing cool\.eps:false production guard/);
});

async function createCandidate({ midwayVersion, tenantFile, baseEntity }) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'cool-admin-candidate-'));
  await writeFile(
    path.join(root, 'package.json'),
    JSON.stringify({ dependencies: { '@midwayjs/core': midwayVersion } }, null, 2)
  );

  const tenantDir = path.join(root, 'src', 'modules', 'base', 'db');
  const entityDir = path.join(root, 'src', 'modules', 'base', 'entity');
  await mkdir(tenantDir, { recursive: true });
  await mkdir(entityDir, { recursive: true });

  if (tenantFile) {
    await writeFile(path.join(tenantDir, 'tenant.ts'), 'export class TenantSubscriber {}\n');
  }
  await writeFile(path.join(entityDir, 'base.ts'), baseEntity);
  return root;
}
