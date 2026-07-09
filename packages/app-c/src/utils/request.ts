import { appConfig } from '../config';
import { useAuthStore } from '../stores/auth';
import { useTenantStore } from '../stores/tenant';

export interface RequestOptions<TBody = unknown> {
  url: string;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  data?: TBody;
}

export interface ApiResponse<TData> {
  data: TData;
  statusCode: number;
}

export function tenantRequest<TData, TBody = unknown>(
  options: RequestOptions<TBody>
): Promise<ApiResponse<TData>> {
  const tenantStore = useTenantStore();
  const authStore = useAuthStore();

  if (!tenantStore.initialized) {
    tenantStore.initialize();
  }

  return new Promise((resolve, reject) => {
    uni.request({
      url: `${appConfig.apiBaseUrl}${options.url}`,
      method: options.method || 'GET',
      data: options.data,
      header: {
        'X-Tenant-Id': tenantStore.tenantId,
        ...(authStore.token ? { Authorization: `Bearer ${authStore.token}` } : {}),
      },
      success(response) {
        if (response.statusCode < 200 || response.statusCode >= 300) {
          reject(new Error(`Request failed with status ${response.statusCode}`));
          return;
        }

        resolve({
          data: response.data as TData,
          statusCode: response.statusCode,
        });
      },
      fail(error) {
        reject(error);
      },
    });
  });
}
