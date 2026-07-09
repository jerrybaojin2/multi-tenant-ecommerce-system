import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const requiredFiles = [
  'next.config.mjs',
  'tsconfig.json',
  '.env.example',
  'src/app/layout.tsx',
  'src/app/page.tsx',
  'src/app/login/page.tsx',
  'src/app/merchant/demo-resources/page.tsx',
  'src/app/merchant/demo-resources/[id]/page.tsx',
  'src/app/platform/demo-resources/page.tsx',
  'src/app/platform/demo-resources/[id]/page.tsx',
  'src/components/admin-shell.tsx',
  'src/components/demo-resource-table.tsx',
  'src/components/demo-resource-form.tsx',
  'src/components/demo-resource-detail.tsx',
  'src/lib/api-client.ts',
  'src/lib/demo-resource-api.ts',
  'src/lib/types.ts',
  'src/lib/menu/menu-types.ts',
  'src/lib/menu/demo-menu.ts',
];

const missing = requiredFiles.filter(file => !fs.existsSync(path.join(root, file)));
if (missing.length) {
  throw new Error(`admin skeleton missing files: ${missing.join(', ')}`);
}

// 业务流程不得放入 Next.js API routes（见 frontend/index.md、quality-guidelines.md）。
if (fs.existsSync(path.join(root, 'src/app/api'))) {
  throw new Error('admin must not implement backend business logic in Next API routes');
}

const packageJson = JSON.parse(
  fs.readFileSync(path.join(root, 'package.json'), 'utf8')
);
if (!packageJson.dependencies?.next) {
  throw new Error('admin package must use Next.js');
}

// 类型安全：禁用 any；显式 Brand 类型（见 frontend/type-safety.md）。
const typesSrc = fs.readFileSync(path.join(root, 'src/lib/types.ts'), 'utf8');
for (const requiredText of ["export type Brand = 'merchant' | 'platform';", 'description: string;']) {
  if (!typesSrc.includes(requiredText)) {
    throw new Error(`admin types.ts missing required contract: ${requiredText}`);
  }
}

// API 客户端契约：merchant/platform 路径 + 可信请求头。
const libGlob = ['src/lib/api-client.ts', 'src/lib/demo-resource-api.ts']
  .map(rel => fs.readFileSync(path.join(root, rel), 'utf8'))
  .join('\n');
for (const requiredText of [
  '/admin/merchant/demo-resources/',
  '/admin/platform/demo-resources/',
  'X-Tenant-Id',
  'X-Platform-Role',
]) {
  if (!libGlob.includes(requiredText)) {
    throw new Error(`admin API client missing ${requiredText}`);
  }
}

// 后端驱动菜单契约：动态渲染前必须校验 routePath/permissionCode/viewPath。
const menuTypesSrc = fs.readFileSync(
  path.join(root, 'src/lib/menu/menu-types.ts'),
  'utf8'
);
for (const requiredText of [
  'permissionCode',
  'viewPath',
  'routePath',
  'validateMenuItems',
]) {
  if (!menuTypesSrc.includes(requiredText)) {
    throw new Error(`admin menu contract missing ${requiredText}`);
  }
}

// AdminShell 必须从 menu provider 取菜单（不在组件内硬编码 nav 数组）。
const shellSrc = fs.readFileSync(
  path.join(root, 'src/components/admin-shell.tsx'),
  'utf8'
);
if (!shellSrc.includes('getMenuForSurface')) {
  throw new Error('admin shell must consume backend-driven menu via getMenuForSurface');
}

console.log('admin skeleton OK');
