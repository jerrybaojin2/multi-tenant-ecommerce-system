import { Catch, IFilter } from '@midwayjs/core';
import { Context } from '@midwayjs/koa';
import { BusinessError } from './business-error';

/**
 * 全局异常 filter：把领域 BusinessError 映射为对应 HTTP 状态与客户端安全响应，
 * 其它异常统一收敛为 500 并记录完整堆栈，避免向调用方泄漏内部细节。
 *
 * 详见 error-handling.md §API 错误响应 / §租户与安全错误。
 */
@Catch()
export class AppErrorFilter implements IFilter<Context, unknown, unknown> {
  catch(err: Error, ctx: Context) {
    if (err instanceof BusinessError) {
      ctx.status = err.status || 400;
      ctx.body = { code: err.code, message: err.message };
      return;
    }
    ctx.logger?.error?.(err);
    ctx.status = 500;
    ctx.body = { code: 'INTERNAL_ERROR', message: 'Internal server error' };
  }
}
