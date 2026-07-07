import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const REQUIRED_MIDWAY = [3, 0, 0];

export async function verifyCoolAdminCandidate(candidatePath) {
  if (!candidatePath) {
    throw new Error('Missing candidate path. Use --candidate <path> or COOL_ADMIN_PATH.');
  }

  const root = path.resolve(candidatePath);
  const packageJsonPath = path.join(root, 'package.json');
  const tenantPath = path.join(root, 'src', 'modules', 'base', 'db', 'tenant.ts');
  const baseEntityPath = path.join(root, 'src', 'modules', 'base', 'entity', 'base.ts');
  const errors = [];
  const details = [];

  const packageJson = await readJson(packageJsonPath, errors);
  const midwaySpec = packageJson ? findDependency(packageJson, '@midwayjs/core') : null;
  if (!midwaySpec) {
    errors.push('package.json does not declare @midwayjs/core.');
  } else if (!isVersionAtLeast(midwaySpec, REQUIRED_MIDWAY)) {
    errors.push(`@midwayjs/core must be >=3.0.0, found ${midwaySpec}.`);
  } else {
    details.push(`@midwayjs/core ${midwaySpec}`);
  }

  if (await exists(tenantPath)) {
    details.push('src/modules/base/db/tenant.ts exists');
  } else {
    errors.push('Missing src/modules/base/db/tenant.ts.');
  }

  const baseEntity = await readText(baseEntityPath, errors);
  if (baseEntity) {
    if (!/\btenantId\b/.test(baseEntity)) {
      errors.push('BaseEntity does not contain tenantId.');
    } else {
      details.push('BaseEntity contains tenantId');
    }

    if (!hasTenantIdColumn(baseEntity)) {
      errors.push('BaseEntity tenantId does not appear to use a TypeORM @Column decorator.');
    }
  }

  return {
    ok: errors.length === 0,
    root,
    errors,
    details
  };
}

function findDependency(packageJson, name) {
  for (const group of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
    if (packageJson[group]?.[name]) {
      return packageJson[group][name];
    }
  }
  return null;
}

export function isVersionAtLeast(spec, required) {
  const version = parseVersionSpec(spec);
  if (!version) {
    return false;
  }

  for (let index = 0; index < required.length; index += 1) {
    if (version[index] > required[index]) {
      return true;
    }
    if (version[index] < required[index]) {
      return false;
    }
  }
  return true;
}

function parseVersionSpec(spec) {
  if (typeof spec !== 'string') {
    return null;
  }
  if (/workspace:|file:|link:|\*/.test(spec)) {
    return null;
  }

  const match = spec.match(/(\d+)(?:\.(\d+|x))?(?:\.(\d+|x))?/i);
  if (!match) {
    return null;
  }

  return [match[1], match[2], match[3]].map(part => {
    if (!part || part.toLowerCase() === 'x') {
      return 0;
    }
    return Number(part);
  });
}

function hasTenantIdColumn(content) {
  return /@Column\s*\([^)]*\)\s*(?:\r?\n\s*@\w+(?:\([^)]*\))?\s*)*\r?\n\s*(?:public|protected|private)?\s*(?:readonly\s+)?tenantId\b/s.test(content);
}

async function readJson(filePath, errors) {
  const text = await readText(filePath, errors);
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text.replace(/^\uFEFF/, ''));
  } catch (error) {
    errors.push(`Invalid JSON in ${filePath}: ${error.message}`);
    return null;
  }
}

async function readText(filePath, errors) {
  try {
    return await readFile(filePath, 'utf8');
  } catch (error) {
    errors.push(`Cannot read ${filePath}: ${error.message}`);
    return null;
  }
}

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function parseArgs(argv) {
  const candidateIndex = argv.indexOf('--candidate');
  if (candidateIndex !== -1) {
    return argv[candidateIndex + 1];
  }
  const positional = argv.find(value => !value.startsWith('-'));
  if (positional) {
    return positional;
  }
  // 默认指向 vendored cool-admin v8（packages/backend）。
  return process.env.COOL_ADMIN_PATH || 'packages/backend';
}

async function runCli() {
  try {
    const result = await verifyCoolAdminCandidate(parseArgs(process.argv.slice(2)));
    for (const detail of result.details) {
      console.log(`OK ${detail}`);
    }
    if (!result.ok) {
      for (const error of result.errors) {
        console.error(`FAIL ${error}`);
      }
      process.exitCode = 1;
    }
  } catch (error) {
    console.error(`FAIL ${error.message}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await runCli();
}
