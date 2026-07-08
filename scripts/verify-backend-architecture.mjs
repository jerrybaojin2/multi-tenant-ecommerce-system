import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const REQUIRED_MIDWAY = [3, 0, 0];
const FORBIDDEN_DEPENDENCY_PREFIXES = ['@cool-midway/'];

export async function verifyBackendArchitecture(candidatePath = 'packages/backend') {
  const root = path.resolve(candidatePath);
  const errors = [];
  const details = [];
  const packageJson = await readJson(path.join(root, 'package.json'), errors);

  const midwaySpec = packageJson ? findDependency(packageJson, '@midwayjs/core') : null;
  if (!midwaySpec) {
    errors.push('backend package does not declare @midwayjs/core.');
  } else if (!isVersionAtLeast(midwaySpec, REQUIRED_MIDWAY)) {
    errors.push(`@midwayjs/core must be >=3.0.0, found ${midwaySpec}.`);
  } else {
    details.push(`@midwayjs/core ${midwaySpec}`);
  }

  const forbiddenDeps = packageJson ? findForbiddenDependencies(packageJson) : [];
  if (forbiddenDeps.length > 0) {
    errors.push(`backend package must not depend on cool-admin runtime packages: ${forbiddenDeps.join(', ')}.`);
  } else {
    details.push('no cool-admin runtime dependencies');
  }

  const requiredFiles = [
    'src/index.ts',
    'src/configuration.ts',
    'src/core/tenant/tenant-context.ts',
    'src/core/tenant/tenant.middleware.ts',
    'src/core/database/tenant.subscriber.ts',
    'src/config/config.prod.ts'
  ];
  for (const relativePath of requiredFiles) {
    if (await exists(path.join(root, relativePath))) {
      details.push(`${relativePath} exists`);
    } else {
      errors.push(`Missing ${relativePath}.`);
    }
  }

  const configuration = await readText(path.join(root, 'src/configuration.ts'), errors);
  if (configuration && /@cool-midway|cool-admin|@cool\//i.test(configuration)) {
    errors.push('configuration.ts still references cool-admin runtime code.');
  }

  const tenantContext = await readText(path.join(root, 'src/core/tenant/tenant-context.ts'), errors);
  if (tenantContext && !/AsyncLocalStorage/.test(tenantContext)) {
    errors.push('tenant-context.ts must use AsyncLocalStorage for request tenant context.');
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

function findForbiddenDependencies(packageJson) {
  const found = [];
  for (const group of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
    for (const name of Object.keys(packageJson[group] || {})) {
      if (FORBIDDEN_DEPENDENCY_PREFIXES.some(prefix => name.startsWith(prefix))) {
        found.push(name);
      }
    }
  }
  return found;
}

export function isVersionAtLeast(spec, required) {
  const version = parseVersionSpec(spec);
  if (!version) {
    return false;
  }
  for (let index = 0; index < required.length; index += 1) {
    if (version[index] > required[index]) return true;
    if (version[index] < required[index]) return false;
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
  return positional || process.env.BACKEND_PATH || 'packages/backend';
}

async function runCli() {
  try {
    const result = await verifyBackendArchitecture(parseArgs(process.argv.slice(2)));
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
