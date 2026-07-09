/**
 * DemoResource 契约，对齐后端 `demo_resources` 表 / consumer controller。
 *
 * 字段来源：packages/backend/src/modules/demo-resource/entity/demo-resource.entity.ts
 *   - id: uuid
 *   - tenantId: varchar(64)（物理列 tenant_id）
 *   - name: varchar(80)
 *   - description: varchar(240, default '')
 *   - createdAt / updatedAt: 后端为 Date，经 JSON 序列化为 ISO 字符串。
 *
 * 响应信封：后端成功响应统一为 `ApiResult<T> = { code: 0, data: T }`
 * （backend core/errors/success-result.filter.ts）。下方 `DemoResourceListResponse`
 * 是信封内层 T（即 controller 原返回值）；request wrapper（utils/request.ts）已解开信封，
 * api client 直接拿到 `response.data` = `{items}`。
 */
export interface DemoResource {
  id: string;
  tenantId: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * C 端列表响应：`GET /app/consumer/demo-resources/` 成功信封内层 payload
 * （即 `ApiResult<DemoResourceListResponse>.data`）。
 */
export interface DemoResourceListResponse {
  items: DemoResource[];
}
