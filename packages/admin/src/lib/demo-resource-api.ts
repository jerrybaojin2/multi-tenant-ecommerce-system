import { apiRequest, jsonBody } from './api-client';
import {
  Brand,
  CreateDemoResourceInput,
  DemoResource,
  DemoResourceDeleteResponse,
  DemoResourceItemResponse,
  DemoResourceListResponse,
  UpdateDemoResourceInput,
} from './types';

// 路径常量与 backend controller 契约一致：
//   /admin/merchant/demo-resources（本租户 CRUD）
//   /admin/platform/demo-resources（跨租户只读，走显式平台服务）
// `apiRequest` 已解开 `ApiResult<T>` 信封，下方 unwrap 辅助只对内层 payload 取字段。
const MERCHANT_BASE = '/admin/merchant/demo-resources/';
const PLATFORM_BASE = '/admin/platform/demo-resources/';

const unwrapItem = (response: DemoResourceItemResponse) => response.item;
const unwrapItems = (response: DemoResourceListResponse) => response.items;

/**
 * 商家端 demo resource：本租户 CRUD。
 * X-Tenant-Id 由 apiRequest 注入；backend 会用当前租户覆盖请求体里的 tenantId，
 * 跨租户 update/delete 会被 guard 收敛为 affected=0（backend 抛 404）。
 */
export const merchantDemoResourceApi = {
  list(): Promise<DemoResource[]> {
    return apiRequest<DemoResourceListResponse>(
      'merchant',
      MERCHANT_BASE
    ).then(unwrapItems);
  },
  get(id: string): Promise<DemoResource> {
    return apiRequest<DemoResourceItemResponse>(
      'merchant',
      `${MERCHANT_BASE}${id}`
    ).then(unwrapItem);
  },
  create(input: CreateDemoResourceInput): Promise<DemoResource> {
    return apiRequest<DemoResourceItemResponse>('merchant', MERCHANT_BASE, {
      method: 'POST',
      ...jsonBody(input),
    }).then(unwrapItem);
  },
  update(id: string, input: UpdateDemoResourceInput): Promise<DemoResource> {
    return apiRequest<DemoResourceItemResponse>(
      'merchant',
      `${MERCHANT_BASE}${id}`,
      { method: 'PATCH', ...jsonBody(input) }
    ).then(unwrapItem);
  },
  remove(id: string): Promise<void> {
    return apiRequest<DemoResourceDeleteResponse>(
      'merchant',
      `${MERCHANT_BASE}${id}`,
      { method: 'DELETE' }
    ).then(() => undefined);
  },
};

/**
 * 平台端 demo resource：跨租户只读。
 * 路由前缀 /admin/platform 在 backend 自动判定 role=platform，走显式平台服务（不加 tenant predicate）。
 */
export const platformDemoResourceApi = {
  list(): Promise<DemoResource[]> {
    return apiRequest<DemoResourceListResponse>(
      'platform',
      PLATFORM_BASE
    ).then(unwrapItems);
  },
  get(id: string): Promise<DemoResource> {
    return apiRequest<DemoResourceItemResponse>(
      'platform',
      `${PLATFORM_BASE}${id}`
    ).then(unwrapItem);
  },
};

/** 按 surface 选择 demo resource API（便于泛型工具复用）。 */
export function demoResourceApiFor(surface: Brand) {
  return surface === 'platform'
    ? platformDemoResourceApi
    : merchantDemoResourceApi;
}
