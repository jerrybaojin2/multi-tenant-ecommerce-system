import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { checkProdConfigText } from '../scripts/check-prod-config.mjs';
import {
  isVersionAtLeast,
  verifyBackendArchitecture,
} from '../scripts/verify-backend-architecture.mjs';

test('midway version guard accepts v3 and v4 ranges', () => {
  assert.equal(isVersionAtLeast('^3.0.0', [3, 0, 0]), true);
  assert.equal(isVersionAtLeast('4.1.0', [3, 0, 0]), true);
  assert.equal(isVersionAtLeast('^2.14.0', [3, 0, 0]), false);
});

test('backend architecture guard accepts self-built Midway backend markers', async () => {
  const root = await createBackendCandidate({
    midwayVersion: '^3.20.3',
    dependencies: {},
    tenantContext: 'import { AsyncLocalStorage } from "node:async_hooks"; export const s = new AsyncLocalStorage();',
    configuration: 'import { Configuration } from "@midwayjs/core"; export class MainConfiguration {}',
  });

  const result = await verifyBackendArchitecture(root);
  assert.equal(result.ok, true, result.errors.join('\n'));
});

test('backend architecture guard rejects cool-admin runtime dependency', async () => {
  const root = await createBackendCandidate({
    midwayVersion: '^3.20.3',
    dependencies: { '@cool-midway/core': '^8.0.7' },
    tenantContext: 'import { AsyncLocalStorage } from "node:async_hooks"; export const s = new AsyncLocalStorage();',
    configuration: 'export class MainConfiguration {}',
  });

  const result = await verifyBackendArchitecture(root);
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /must not depend on cool-admin runtime packages/);
});

test('backend architecture guard rejects missing tenant context', async () => {
  const root = await createBackendCandidate({
    midwayVersion: '^3.20.3',
    dependencies: {},
    tenantContext: 'export const tenant = {};',
    configuration: 'export class MainConfiguration {}',
  });

  const result = await verifyBackendArchitecture(root);
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /must use AsyncLocalStorage/);
});

test('production config guard requires synchronize false and dev metadata false', () => {
  const good = checkProdConfigText(`
    export default {
      typeorm: { dataSource: { default: { synchronize: false } } },
      appMeta: { exposeDevMetadata: false }
    };
  `);
  assert.equal(good.ok, true, good.errors.join('\n'));

  const bad = checkProdConfigText(`
    export default {
      typeorm: { dataSource: { default: { synchronize: true } } },
      appMeta: { exposeDevMetadata: true }
    };
  `);
  assert.equal(bad.ok, false);
  assert.match(bad.errors.join('\n'), /synchronize must be false/);
  assert.match(bad.errors.join('\n'), /appMeta\.exposeDevMetadata must be false/);
});

test('production config guard only accepts dev metadata flag under appMeta', () => {
  const result = checkProdConfigText(`
    export default {
      typeorm: { dataSource: { default: { synchronize: false } } },
      other: { exposeDevMetadata: false },
      appMeta: {}
    };
  `);

  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /missing appMeta\.exposeDevMetadata:false production guard/);
});

async function createBackendCandidate({
  midwayVersion,
  dependencies,
  tenantContext,
  configuration,
}) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'midway-backend-candidate-'));
  await writeFile(
    path.join(root, 'package.json'),
    JSON.stringify(
      {
        dependencies: {
          '@midwayjs/core': midwayVersion,
          ...dependencies,
        },
      },
      null,
      2
    )
  );

  await mkdir(path.join(root, 'src', 'core', 'tenant'), { recursive: true });
  await mkdir(path.join(root, 'src', 'core', 'database'), { recursive: true });
  await mkdir(path.join(root, 'src', 'config'), { recursive: true });

  await writeFile(path.join(root, 'src', 'configuration.ts'), configuration);
  await writeFile(path.join(root, 'src', 'core', 'tenant', 'tenant-context.ts'), tenantContext);
  await writeFile(path.join(root, 'src', 'core', 'tenant', 'tenant.middleware.ts'), 'export class TenantMiddleware {}\n');
  await writeFile(path.join(root, 'src', 'core', 'database', 'tenant.subscriber.ts'), 'export class TenantSubscriber {}\n');
  await writeFile(path.join(root, 'src', 'config', 'config.prod.ts'), 'export default {};\n');
  return root;
}
