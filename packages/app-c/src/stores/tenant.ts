import { defineStore } from 'pinia';
import { appConfig, assertAppConfig } from '../config';

export interface TenantState {
  tenantId: string;
  appName: string;
  initialized: boolean;
}

export const useTenantStore = defineStore('tenant', {
  state: (): TenantState => ({
    tenantId: '',
    appName: appConfig.appName,
    initialized: false,
  }),
  actions: {
    initialize() {
      assertAppConfig();
      this.tenantId = appConfig.tenantId;
      this.appName = appConfig.appName;
      this.initialized = true;
    },
  },
});

export function initTenantStore(): void {
  const tenantStore = useTenantStore();
  if (!tenantStore.initialized) {
    tenantStore.initialize();
  }
}
