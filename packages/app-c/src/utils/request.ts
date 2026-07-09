import { appConfig } from '../config';
import { useAuthStore } from '../stores/auth';
import { requireTenantId } from './tenant';

/**
 * 业务请求 wrapper：基于 `uni.request`，从 `tenantStore`（经 requireTenantId）注入
 * `X-Tenant-Id`，并从 `authStore` 注入可选 auth token。
 *
 * 硬规则（quality-guidelines.md / hook-guidelines.md）：
 *   - business code 不得直接调用 `uni.request` / `uni.uploadFile` / `uni.downloadFile`，
 *     一律走本文件的 tenant-aware wrapper。
 *   - business code 不得手设 `X-Tenant-Id` 或传入任意 tenantId。
 *
 * demo 阶段无 auth：token 为空时不带 Authorization；后端仅凭 `X-Tenant-Id` 识别租户
 * （backend core/tenant/tenant.middleware.ts：consumer role 由 X-Tenant-Id 头承载）。
 *
 * 响应信封：后端成功响应统一为 `ApiResult<T> = { code: 0, data: T }`
 * （backend core/errors/success-result.filter.ts，契约见 frontend/type-safety.md §API 契约）。
 * 本 wrapper 解开信封：成功时 `data` 为内层 T（如 `{items}`/`{item}`），api client 直接取字段。
 * 失败时（HTTP 非 2xx）后端异常 filter 返回 `{ code: <业务码>, message }`
 * （backend core/errors/error.filter.ts），透传为 RequestError 的 code/message。
 */

export interface RequestOptions<TBody = unknown> {
  url: string;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  data?: TBody;
  header?: Record<string, string>;
}

/**
 * 后端成功响应统一信封（与 frontend/type-safety.md §API 契约 一致）。
 * 仅 `code === 0` 表示成功，业务 payload 在 `data` 内。
 */
export interface ApiResult<TData> {
  code: number;
  data: TData;
  message?: string;
}

/** 业务请求响应：`data` 为解开信封后的业务 payload（内层 T）。 */
export interface ApiResponse<TData> {
  data: TData;
  statusCode: number;
}

/** 业务请求统一头：注入 X-Tenant-Id 与可选 auth token。upload/download 复用同一份。 */
export interface TenantHeaders {
  [key: string]: string;
}

export function buildTenantHeaders(): TenantHeaders {
  const token = useAuthStore().token;
  return {
    'X-Tenant-Id': requireTenantId(),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

/**
 * 业务请求错误。透传后端异常 filter 的稳定 code（如 DEMO_RESOURCE_NOT_FOUND）
 * 与客户端安全 message。
 */
export class RequestError extends Error {
  code: string;
  statusCode: number;
  constructor(message: string, code: string, statusCode: number) {
    super(message);
    this.name = 'RequestError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

interface BackendErrorBody {
  code?: unknown;
  message?: unknown;
}

function toRequestError(statusCode: number, body: unknown): RequestError {
  const fallback = `Request failed with status ${statusCode}`;
  if (body && typeof body === 'object') {
    const { code, message } = body as BackendErrorBody;
    return new RequestError(
      typeof message === 'string' ? message : fallback,
      typeof code === 'string' ? code : 'REQUEST_FAILED',
      statusCode
    );
  }
  return new RequestError(fallback, 'REQUEST_FAILED', statusCode);
}

export function tenantRequest<TData, TBody = unknown>(
  options: RequestOptions<TBody>
): Promise<ApiResponse<TData>> {
  return new Promise((resolve, reject) => {
    uni.request({
      url: `${appConfig.apiBaseUrl}${options.url}`,
      method: options.method || 'GET',
      data: options.data as string | AnyObject | ArrayBuffer | undefined,
      header: {
        ...buildTenantHeaders(),
        ...(options.header || {}),
      },
      success(response) {
        if (response.statusCode < 200 || response.statusCode >= 300) {
          reject(toRequestError(response.statusCode, response.data));
          return;
        }
        // 解开 ApiResult 信封：2xx 即成功，取内层 data 作为业务 payload。
        const envelope = response.data as ApiResult<TData>;
        if (envelope && typeof envelope === 'object' && envelope.code === 0) {
          resolve({
            data: envelope.data,
            statusCode: response.statusCode,
          });
          return;
        }
        // 防御：2xx 但非标准成功信封（不应发生），按失败处理。
        reject(toRequestError(response.statusCode, response.data));
      },
      fail(error) {
        reject(
          new RequestError(error.errMsg || 'request failed', 'REQUEST_FAILED', 0)
        );
      },
    });
  });
}

export interface UploadOptions {
  url: string;
  filePath: string;
  /** 文件字段名，默认 `file`。 */
  name?: string;
  formData?: Record<string, string>;
}

export interface UploadResult {
  data: unknown;
  statusCode: number;
}

/** Upload wrapper：复用同一套 tenant/auth header 准备（hook-guidelines.md）。 */
export function tenantUpload(options: UploadOptions): Promise<UploadResult> {
  return new Promise((resolve, reject) => {
    uni.uploadFile({
      url: `${appConfig.apiBaseUrl}${options.url}`,
      filePath: options.filePath,
      name: options.name || 'file',
      formData: options.formData,
      header: buildTenantHeaders(),
      success(response) {
        if (response.statusCode < 200 || response.statusCode >= 300) {
          let parsed: unknown = response.data;
          if (typeof response.data === 'string') {
            try {
              parsed = JSON.parse(response.data);
            } catch {
              parsed = response.data;
            }
          }
          reject(toRequestError(response.statusCode, parsed));
          return;
        }
        resolve({ data: response.data, statusCode: response.statusCode });
      },
      fail(error) {
        reject(new RequestError(error.errMsg || 'upload failed', 'UPLOAD_FAILED', 0));
      },
    });
  });
}

export interface DownloadOptions {
  url: string;
}

export interface DownloadResult {
  tempFilePath: string;
  statusCode: number;
}

/** Download wrapper：复用同一套 tenant/auth header 准备（hook-guidelines.md）。 */
export function tenantDownload(options: DownloadOptions): Promise<DownloadResult> {
  return new Promise((resolve, reject) => {
    uni.downloadFile({
      url: `${appConfig.apiBaseUrl}${options.url}`,
      header: buildTenantHeaders(),
      success(response) {
        if (response.statusCode < 200 || response.statusCode >= 300) {
          reject(
            new RequestError(
              `Download failed with status ${response.statusCode}`,
              'DOWNLOAD_FAILED',
              response.statusCode
            )
          );
          return;
        }
        resolve({
          tempFilePath: response.tempFilePath,
          statusCode: response.statusCode,
        });
      },
      fail(error) {
        reject(new RequestError(error.errMsg || 'download failed', 'DOWNLOAD_FAILED', 0));
      },
    });
  });
}
