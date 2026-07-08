import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const DEFAULT_CONFIGS = [
  'packages/backend/src/config/config.prod.ts',
  'backend/src/config/config.prod.ts',
  'backend/config/config.prod.ts',
  'backend/config/config.prod.example.ts'
];

export async function checkProdConfigFiles(files = DEFAULT_CONFIGS) {
  const existing = [];
  const missing = [];

  for (const file of files) {
    try {
      const content = await readFile(file, 'utf8');
      existing.push(checkProdConfigText(content, file));
    } catch {
      missing.push(file);
    }
  }

  if (files.length > 0 && existing.length === 0) {
    return {
      ok: false,
      checks: [],
      errors: [`No production config found. Checked: ${missing.join(', ')}`]
    };
  }

  const errors = existing.flatMap(result => result.errors);
  return {
    ok: errors.length === 0,
    checks: existing.flatMap(result => result.checks),
    errors
  };
}

export function checkProdConfigText(content, label = 'config') {
  // 去掉注释后再检查，避免示例文字误判为真实生产保护。
  const text = stripComments(content);
  const errors = [];
  const checks = [];
  const synchronizeValues = propertyValues(text, 'synchronize');
  const appMetaConfig = propertyObjectBody(text, 'appMeta');
  // 只接受 appMeta 下的开关，其他同名字段不能代表生产保护。
  const exposeDevMetadataValues = appMetaConfig
    ? propertyValues(appMetaConfig, 'exposeDevMetadata')
    : [];

  if (synchronizeValues.length === 0) {
    errors.push(`${label}: missing synchronize:false production guard.`);
  } else if (synchronizeValues.some(value => value !== 'false')) {
    errors.push(`${label}: synchronize must be false in production.`);
  } else {
    checks.push(`${label}: synchronize:false`);
  }

  if (exposeDevMetadataValues.length === 0) {
    errors.push(`${label}: missing appMeta.exposeDevMetadata:false production guard.`);
  } else if (exposeDevMetadataValues.some(value => value !== 'false')) {
    errors.push(`${label}: appMeta.exposeDevMetadata must be false in production.`);
  } else {
    checks.push(`${label}: appMeta.exposeDevMetadata:false`);
  }

  return {
    ok: errors.length === 0,
    checks,
    errors
  };
}

function propertyValues(text, propertyName) {
  const pattern = new RegExp(`\\b${propertyName}\\s*:\\s*(true|false)\\b`, 'g');
  return [...text.matchAll(pattern)].map(match => match[1]);
}

function propertyObjectBody(text, propertyName) {
  const pattern = new RegExp(`\\b${propertyName}\\s*:\\s*\\{`, 'g');
  const match = pattern.exec(text);
  if (!match) {
    return null;
  }

  const openIndex = match.index + match[0].lastIndexOf('{');
  return braceBody(text, openIndex);
}

function braceBody(text, openIndex) {
  let depth = 0;
  let quote = null;
  let escaped = false;

  for (let index = openIndex; index < text.length; index += 1) {
    const char = text[index];

    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === quote) {
        quote = null;
      }
      continue;
    }

    if (char === '"' || char === "'" || char === '`') {
      quote = char;
      continue;
    }

    if (char === '{') {
      depth += 1;
      continue;
    }

    if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return text.slice(openIndex + 1, index);
      }
    }
  }

  return null;
}

function stripComments(content) {
  return content
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

async function runCli() {
  const files = process.argv.slice(2).map(value => path.normalize(value));
  const result = await checkProdConfigFiles(files.length > 0 ? files : DEFAULT_CONFIGS);
  for (const check of result.checks) {
    console.log(`OK ${check}`);
  }
  if (!result.ok) {
    for (const error of result.errors) {
      console.error(`FAIL ${error}`);
    }
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await runCli();
}
