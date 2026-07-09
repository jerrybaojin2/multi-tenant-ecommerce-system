export interface AppConfig {
  apiBaseUrl: string;
  tenantId: string;
  appName: string;
}

export const appConfig: AppConfig = {
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8001',
  tenantId: import.meta.env.VITE_TENANT_ID,
  appName: import.meta.env.VITE_APP_NAME || '租赁平台',
};

export function assertAppConfig(config = appConfig): void {
  if (!config.tenantId) {
    throw new Error('VITE_TENANT_ID is required before the first C-end request');
  }
}
