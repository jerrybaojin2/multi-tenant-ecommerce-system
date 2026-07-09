import { adminConfig } from './config';
import { ApiErrorBody, ApiRequestError, ApiResult, Brand } from './types';

/**
 * 按 surface 构造可信请求头。
 * - merchant：注入 X-Tenant-Id（本租户作用域），由 backend tenant middleware 解析。
 * - platform：/admin/platform 路由前缀已在 backend 自动判定 role=platform；X-Platform-Role 仅作显式标注。
 *
 * PR0/PR1 阶段 backend 用可信请求头承载租户身份（鉴权后续接入），demo 阶段无登录态/token。
 *
 * 响应信封：后端成功响应统一为 `ApiResult<T> = { code: 0, data: T }`；本函数解开后
 * 返回内层 payload T。错误（HTTP 非 2xx）抛 ApiRequestError（携带 backend code 与 status）。
 */
function buildHeaders(
  surface: Brand,
  extra: Record<string, string> = {}
): Record<string, string> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (surface === 'platform') {
    headers['X-Platform-Role'] = 'true';
  } else {
    headers['X-Tenant-Id'] = adminConfig.merchantTenantId;
  }
  return { ...headers, ...extra };
}

function headersToRecord(headers: HeadersInit | undefined): Record<string, string> {
  if (!headers) return {};
  if (Array.isArray(headers)) {
    const record: Record<string, string> = {};
    for (let i = 0; i + 1 < headers.length; i += 2) {
      record[String(headers[i])] = String(headers[i + 1]);
    }
    return record;
  }
  if (headers instanceof Headers) {
    const record: Record<string, string> = {};
    headers.forEach((value, key) => {
      record[key] = value;
    });
    return record;
  }
  return { ...headers };
}

/**
 * 低层 typed fetch：按 surface 注入头，解开 `ApiResult<T>` 信封后返回内层 payload。
 * 失败（HTTP 非 2xx）抛 ApiRequestError（携带 backend code 与 status）。
 * 服务端组件与客户端组件共用同一入口；业务请求禁止绕过此处直接 fetch backend。
 */
export async function apiRequest<T>(
  surface: Brand,
  path: string,
  init?: RequestInit
): Promise<T> {
  const { headers: extraHeaders, ...rest } = init ?? {};
  const response = await fetch(`${adminConfig.apiBaseUrl}${path}`, {
    ...rest,
    headers: buildHeaders(surface, headersToRecord(extraHeaders)),
    cache: 'no-store',
  });

  if (!response.ok) {
    throw await toApiError(response);
  }

  // 解开成功信封 { code: 0, data: T }，返回内层 payload。
  const envelope = (await response.json()) as ApiResult<T>;
  if (envelope && typeof envelope === 'object' && envelope.code === 0) {
    return envelope.data;
  }
  // 防御：2xx 但非标准成功信封（不应发生），按错误处理。
  throw new ApiRequestError(
    String(envelope?.code ?? 'BAD_ENVELOPE'),
    envelope?.message ?? `响应格式异常（${response.status}）`,
    response.status
  );
}

async function toApiError(response: Response): Promise<ApiRequestError> {
  const status = response.status;
  let code = `HTTP_${status}`;
  let message = `请求失败（${status}）`;
  try {
    const body = (await response.json()) as ApiErrorBody;
    if (body?.code) code = body.code;
    if (body?.message) message = body.message;
  } catch {
    // 非 JSON 响应，保留默认 code/message。
  }
  return new ApiRequestError(code, message, status);
}

/** JSON body 帮助函数：设置 Content-Type 并序列化。 */
export function jsonBody(body: unknown): RequestInit {
  return {
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}
