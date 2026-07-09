import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const requiredFiles = [
  'src/App.vue',
  'src/main.ts',
  'src/pages.json',
  'src/manifest.json',
  'src/config/index.ts',
  'src/stores/tenant.ts',
  'src/stores/auth.ts',
  'src/utils/request.ts',
  'src/api/demo-resource.ts',
  'src/pages/demo/index.vue',
];

const missing = requiredFiles.filter(file => !fs.existsSync(path.join(root, file)));
if (missing.length) {
  throw new Error(`app-c skeleton missing files: ${missing.join(', ')}`);
}

const requestText = fs.readFileSync(path.join(root, 'src/utils/request.ts'), 'utf8');
if (!requestText.includes('uni.request')) {
  throw new Error('tenant request wrapper must be the only direct uni.request entry');
}
if (!requestText.includes("'X-Tenant-Id'")) {
  throw new Error('tenant request wrapper must inject X-Tenant-Id');
}

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return walk(entryPath);
    }
    return entry.isFile() ? [entryPath] : [];
  });
}

const directRequestFiles = walk(path.join(root, 'src'))
  .filter(file => file !== path.join(root, 'src/utils/request.ts'))
  .filter(file => fs.readFileSync(file, 'utf8').includes('uni.request'));

if (directRequestFiles.length) {
  throw new Error(
    `business code must not call uni.request directly: ${directRequestFiles
      .map(file => path.relative(root, file))
      .join(', ')}`
  );
}

const pageText = fs.readFileSync(path.join(root, 'src/pages/demo/index.vue'), 'utf8');
if (!pageText.includes('/api/demo-resource')) {
  throw new Error('demo page must call the demo resource API module');
}

const apiText = fs.readFileSync(path.join(root, 'src/api/demo-resource.ts'), 'utf8');
if (!apiText.includes('/app/consumer/demo-resources/')) {
  throw new Error('demo API must call the Midway consumer demo resource route');
}

console.log('app-c skeleton OK');
