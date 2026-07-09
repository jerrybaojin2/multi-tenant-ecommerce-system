import { defineStore } from 'pinia';
import { appConfig, assertAppConfig } from '../config';

export interface TenantState {
  tenantId: string;
  appName: string;
  initialized: boolean;
}

/**
 * 租户上下文 store：持有当前 tenant metadata，业务代码只读。
 *
 * 硬规则（state-management.md / hook-guidelines.md）：
 *   - tenantId 来自编译期 `VITE_TENANT_ID`，仅由启动/bootstrap 写入。
 *   - 业务 pages / composables / api / request wrapper 不得调用 initialize()，也不得设置 tenantId。
 *   - scene/share 参数只与编译期 tenant id 验证，不静默覆盖。
 *
 * 唯一写入点：`initialize()`，由 `utils/tenant.ts` 的 startup resolver 调用。
 */
export const useTenantStore = defineStore('tenant', {
  state: (): TenantState => ({
    tenantId: '',
    appName: appConfig.appName,
    initialized: false,
  }),
  actions: {
    initialize() {
      // 启动期断言配置存在，避免业务请求读到空 tenantId。
      assertAppConfig();
      this.tenantId = appConfig.tenantId;
      this.appName = appConfig.appName;
      this.initialized = true;
    },
  },
});
