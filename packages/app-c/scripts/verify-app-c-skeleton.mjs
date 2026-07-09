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
  'src/utils/tenant.ts',
  'src/utils/request.ts',
  'src/api/demo-resource.ts',
  'src/pages/demo/index.vue',
];

const missing = requiredFiles.filter(file => !fs.existsSync(path.join(root, file)));
if (missing.length) {
  throw new Error(`app-c skeleton missing files: ${missing.join(', ')}`);
}

// utils/tenant.ts 必须是唯一的启动解析入口（startup-owned writes）。
const tenantUtilText = fs
  .readFileSync(path.join(root, 'src/utils/tenant.ts'), 'utf8')
  .toString();
if (!tenantUtilText.includes('initTenantStore')) {
  throw new Error('utils/tenant.ts must expose initTenantStore (startup resolver)');
}
if (!tenantUtilText.includes('requireTenantId')) {
  throw new Error('utils/tenant.ts must expose requireTenantId for request wrapper');
}

// request wrapper 必须是唯一直接调用 uni.request 的位置，并注入 X-Tenant-Id。
const requestText = fs.readFileSync(path.join(root, 'src/utils/request.ts'), 'utf8');
if (!requestText.includes('uni.request')) {
  throw new Error('tenant request wrapper must be the only direct uni.request entry');
}
if (!requestText.includes("'X-Tenant-Id'")) {
  throw new Error('tenant request wrapper must inject X-Tenant-Id');
}
if (!requestText.includes('buildTenantHeaders')) {
  throw new Error(
    'request wrapper must expose buildTenantHeaders shared by request/upload/download'
  );
}
// upload/download 必须复用同一套 header 准备，而不是各自重写。
if (!requestText.includes('uni.uploadFile') || !requestText.includes('uni.downloadFile')) {
  throw new Error('request wrapper must provide tenantUpload/tenantDownload helpers');
}
if (
  (requestText.match(/buildTenantHeaders\(\)/g) || []).length < 3
) {
  throw new Error(
    'request, tenantUpload and tenantDownload must all reuse buildTenantHeaders()'
  );
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

// business code 不得直接调用 uni.request（upload/download 由 wrapper 内部使用，允许）。
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

// 业务代码不得手设 X-Tenant-Id（只能在 utils/request.ts 的 buildTenantHeaders 内出现）。
const manualTenantHeaderFiles = walk(path.join(root, 'src'))
  .filter(file => file !== path.join(root, 'src/utils/request.ts'))
  .filter(file => fs.readFileSync(file, 'utf8').includes("'X-Tenant-Id'"));
if (manualTenantHeaderFiles.length) {
  throw new Error(
    `business code must not set X-Tenant-Id manually: ${manualTenantHeaderFiles
      .map(file => path.relative(root, file))
      .join(', ')}`
  );
}

// App.vue 必须从 utils/tenant 启动初始化（不在 store 里散落调用）。
const appText = fs.readFileSync(path.join(root, 'src/App.vue'), 'utf8');
if (!appText.includes("from './utils/tenant'")) {
  throw new Error('App.vue must init tenant via utils/tenant (startup resolver)');
}

const pageText = fs.readFileSync(path.join(root, 'src/pages/demo/index.vue'), 'utf8');
if (!pageText.includes('/api/demo-resource')) {
  throw new Error('demo page must call the demo resource API module');
}
// demo 页只读 tenantStore，不得自行调用 initialize()。
if (pageText.includes('.initialize()')) {
  throw new Error(
    'demo page must not call tenantStore.initialize() (startup-owned; use utils/tenant)'
  );
}

const apiText = fs.readFileSync(path.join(root, 'src/api/demo-resource.ts'), 'utf8');
if (!apiText.includes('/app/consumer/demo-resources/')) {
  throw new Error('demo API must call the Midway consumer demo resource route');
}

console.log('app-c skeleton OK');
