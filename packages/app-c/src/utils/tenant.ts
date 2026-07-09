import { assertAppConfig } from '../config';
import { useTenantStore } from '../stores/tenant';

/**
 * 租户上下文启动解析器（directory-structure.md: `utils/tenant.ts`）。
 *
 * 这是整个应用唯一允许执行「租户初始化 / 校验」的位置（hook-guidelines.md）：
 *   - 编译期 `VITE_TENANT_ID` 在此（经 config）读取一次，写入 `tenantStore`，之后业务只读。
 *   - 业务请求统一通过 `requireTenantId()` 取当前租户，不得散落读取 env 或手设 header。
 *
 * MVP 仅面向 MP-WEIXIN。scene / 小程序码参数的验证留待后续 PR
 * （PRD Open Questions 🔸：PR1 仅信任编译期 tenant id，不静默覆盖），
 * 故本文件 PR1 只暴露 startup 初始化 + 业务读两个入口。
 */

/**
 * 启动期初始化租户 store。仅在 App.vue 的 onLaunch 调用一次。
 * 业务代码（pages / composables / api / request wrapper）不得调用此方法。
 */
export function initTenantStore(): void {
  assertAppConfig();
  const tenantStore = useTenantStore();
  if (!tenantStore.initialized) {
    tenantStore.initialize();
  }
}

/**
 * 读取当前租户 id，供 request wrapper 注入 `X-Tenant-Id`。
 * 未初始化即抛错，避免业务请求在缺少租户上下文时静默发出。
 */
export function requireTenantId(): string {
  const tenantStore = useTenantStore();
  if (!tenantStore.initialized || !tenantStore.tenantId) {
    throw new Error('tenant context not initialized before request');
  }
  return tenantStore.tenantId;
}
