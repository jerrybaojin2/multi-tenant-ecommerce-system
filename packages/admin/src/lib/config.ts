export interface AdminConfig {
  apiBaseUrl: string;
  merchantTenantId: string;
}

export const adminConfig: AdminConfig = {
  apiBaseUrl: process.env.NEXT_PUBLIC_API_BASE_URL || 'http://127.0.0.1:8001',
  merchantTenantId: process.env.NEXT_PUBLIC_MERCHANT_TENANT_ID || 'tenant-a',
};
