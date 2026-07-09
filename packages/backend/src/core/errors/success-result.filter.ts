import { IFilter, Match } from '@midwayjs/core';
import { Context } from '@midwayjs/koa';

/**
 * 全局成功响应包装 filter：把 controller 的成功返回值统一包成
 * `{ code: 0, data: <原返回> }`，对齐 frontend/type-safety.md §API 契约 的 ApiResult<T>。
 *
 * 仅作用于成功路径：本 filter 经 @Match 注册到 result-filter 链，Midway 只在
 * controller 正常返回时调用 match()（见 @midwayjs/core baseFramework 的
 * `try { result = await next(); runResultFilter(...) } catch { runErrorFilter(...) }`
 * 分支）。错误走 catch 分支，仍由 AppErrorFilter 收敛为 `{ code, message }`，
 * 不会经过本 filter，因此不会被二次包装。
 *
 * 三端契约（成功 / 错误）：
 *   成功：`{ code: 0, data: T }`（T 为原 controller 返回值，如 `{items}`/`{item}`/`{ok:true}`）
 *   错误：`{ code: <业务码>, message: string }`（AppErrorFilter，HTTP 状态码不变）
 *
 * 详见 error-handling.md §API 错误响应 / frontend type-safety.md §API 契约。
 */
@Match(true)
export class SuccessResultFilter implements IFilter<Context, unknown, unknown> {
  match(result: unknown) {
    return { code: 0, data: result };
  }
}
