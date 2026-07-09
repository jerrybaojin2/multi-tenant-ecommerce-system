import { adminConfig } from './config';

export interface DemoResource {
  id: string;
  tenantId: string;
  name: string;
  createdAt?: string;
  updatedAt?: string;
}

interface DemoResourceListResponse {
  items: DemoResource[];
}

async function requestDemoResources(path: string, headers: HeadersInit) {
  const response = await fetch(`${adminConfig.apiBaseUrl}${path}`, {
    headers,
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`Demo resource request failed: ${response.status}`);
  }

  const payload = (await response.json()) as DemoResourceListResponse;
  return payload.items;
}

export function getMerchantDemoResources() {
  return requestDemoResources('/admin/merchant/demo-resources/', {
    'X-Tenant-Id': adminConfig.merchantTenantId,
  });
}

export function getPlatformDemoResources() {
  return requestDemoResources('/admin/platform/demo-resources/', {
    'X-Platform-Role': 'true',
  });
}
