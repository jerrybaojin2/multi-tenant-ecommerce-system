// 共享领域类型：Admin 双品牌 surface、demo resource、后端响应 envelope、菜单契约。
// 严禁 any（见 frontend/type-safety.md）。

/** Admin 双品牌 surface：merchant=本租户作用域，platform=跨租户（路由 segment 决定）。 */
export type Brand = 'merchant' | 'platform';

/** Demo resource 实体（对应 backend DemoResourceEntity，继承 BaseTenantEntity）。 */
export interface DemoResource {
  id: string;
  tenantId: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
}

/** 创建请求体（对应 backend CreateDemoResourceDto）。 */
export interface CreateDemoResourceInput {
  name: string;
  description?: string;
}

/** 更新请求体（对应 backend UpdateDemoResourceDto）。 */
export interface UpdateDemoResourceInput {
  name?: string;
  description?: string;
}

// ---- 响应 envelope ----
// 后端成功响应统一为 `ApiResult<T> = { code: 0, data: T }`
// （backend core/errors/success-result.filter.ts，契约见 frontend/type-safety.md §API 契约）。
// 下方 `DemoResource*Response` 即信封内层 T（controller 原返回值）；
// apiRequest（lib/api-client.ts）已解开信封，业务 API 直接拿到 payload。
// 错误仍由 AppErrorFilter 返回 `{ code: <业务码>, message }`（无 data，HTTP 非 2xx）。

/** 后端成功响应统一信封（与 frontend/type-safety.md §API 契约一致）。 */
export interface ApiResult<T> {
  code: number;
  data: T;
  message?: string;
}

/** backend 成功响应 payload：列表（信封内层 T）。 */
export interface DemoResourceListResponse {
  items: DemoResource[];
}

/** backend 成功响应 payload：单项（信封内层 T）。 */
export interface DemoResourceItemResponse {
  item: DemoResource;
}

/** backend 成功响应 payload：删除（信封内层 T）。 */
export interface DemoResourceDeleteResponse {
  ok: boolean;
}

/** backend 错误响应（AppErrorFilter，无 data 字段）。 */
export interface ApiErrorBody {
  code: string;
  message: string;
}

/** 请求失败：携带 backend 错误 code 与 HTTP 状态，供调用方区分 404/403 等。 */
export class ApiRequestError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = 'ApiRequestError';
    this.code = code;
    this.status = status;
  }
}
