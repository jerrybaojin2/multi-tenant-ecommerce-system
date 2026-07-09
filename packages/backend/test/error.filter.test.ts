import { AppErrorFilter } from '../src/core/errors/error.filter';
import { BusinessError } from '../src/core/errors/business-error';

/**
 * 错误响应 filter 单测：验证 AppErrorFilter.catch 把领域异常收敛为
 * 客户端安全的 `{ code, message }`（HTTP 状态码不变）。
 *
 * 这是统一响应信封的「错误」一半；成功的互补一半（`{code:0, data}`）
 * 由 SuccessResultFilter 负责，见 success-result.filter.test.ts。
 * 二者经 Midway baseFramework 的 try/catch 分支隔离，互不包装。
 */
function createCtx() {
  const log = jest.fn();
  return {
    status: 0,
    body: undefined as unknown,
    logger: { error: log },
  } as any;
}

describe('AppErrorFilter', () => {
  it('maps a BusinessError to its declared status and a client-safe body', () => {
    const ctx = createCtx();
    const filter = new AppErrorFilter();

    filter.catch(
      new BusinessError('DEMO_RESOURCE_NOT_FOUND', 'missing', 404),
      ctx
    );

    expect(ctx.status).toBe(404);
    expect(ctx.body).toEqual({
      code: 'DEMO_RESOURCE_NOT_FOUND',
      message: 'missing',
    });
  });

  it('defaults BusinessError to 400 when no status is provided', () => {
    const ctx = createCtx();
    const filter = new AppErrorFilter();

    filter.catch(new BusinessError('DEMO_RESOURCE_NAME_REQUIRED', 'bad'), ctx);

    expect(ctx.status).toBe(400);
  });

  it('collapses unexpected errors to 500 without leaking internals', () => {
    const ctx = createCtx();
    const filter = new AppErrorFilter();

    filter.catch(new Error('boom: pg connection string is ...'), ctx);

    expect(ctx.status).toBe(500);
    expect(ctx.body).toEqual({
      code: 'INTERNAL_ERROR',
      message: 'Internal server error',
    });
    expect(ctx.logger.error).toHaveBeenCalled();
  });
});
