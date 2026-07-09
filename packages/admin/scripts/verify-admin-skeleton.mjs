import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const requiredFiles = [
  'next.config.mjs',
  'tsconfig.json',
  'src/app/layout.tsx',
  'src/app/page.tsx',
  'src/app/login/page.tsx',
  'src/app/merchant/demo-resources/page.tsx',
  'src/app/platform/demo-resources/page.tsx',
  'src/components/admin-shell.tsx',
  'src/components/demo-resource-table.tsx',
  'src/lib/demo-resource-api.ts',
];

const missing = requiredFiles.filter(file => !fs.existsSync(path.join(root, file)));
if (missing.length) {
  throw new Error(`admin skeleton missing files: ${missing.join(', ')}`);
}

const packageJson = JSON.parse(
  fs.readFileSync(path.join(root, 'package.json'), 'utf8')
);
if (!packageJson.dependencies?.next) {
  throw new Error('admin package must use Next.js');
}

if (fs.existsSync(path.join(root, 'src/app/api'))) {
  throw new Error('admin must not implement backend business logic in Next API routes');
}

const apiClient = fs.readFileSync(path.join(root, 'src/lib/demo-resource-api.ts'), 'utf8');
for (const requiredText of [
  '/admin/merchant/demo-resources/',
  '/admin/platform/demo-resources/',
  'X-Tenant-Id',
  'X-Platform-Role',
]) {
  if (!apiClient.includes(requiredText)) {
    throw new Error(`admin API client missing ${requiredText}`);
  }
}

console.log('admin skeleton OK');
