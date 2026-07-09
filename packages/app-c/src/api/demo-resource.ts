import { tenantRequest } from '../utils/request';
import type { DemoResourceListResponse } from '../types/demo-resource';

/**
 * C 端 demo resource（只读）。对齐 backend consumer controller：
 *   GET /app/consumer/demo-resources/   -> { code:0, data:{ items: DemoResource[] } }（本租户）
 *   GET /app/consumer/demo-resources/:id -> { code:0, data:{ item: DemoResource } }（本租户）
 *
 * `tenantRequest` 已解开 `ApiResult<T>` 信封，`response.data` 即内层 payload
 * （`{items}`/`{item}`），故此处直接取 `.items`。普通业务请求不接受调用方传入的
 * tenantId；tenantId 由 request wrapper 注入（type-safety.md）。
 */

/** 列表：返回当前租户的 demo resource（只读）。 */
export async function listConsumerDemoResources() {
  const response = await tenantRequest<DemoResourceListResponse>({
    url: '/app/consumer/demo-resources/',
  });
  return response.data.items;
}
