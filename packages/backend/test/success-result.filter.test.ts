import { SuccessResultFilter } from '../src/core/errors/success-result.filter';

/**
 * 成功响应包装 filter 单测：验证 SuccessResultFilter.match 把任意 controller
 * 成功返回值包成统一信封 `{ code: 0, data: <原返回> }`。
 *
 * 成功信封与错误信封互补（见 error.filter.test.ts 的 `{code,message}`），
 * 二者由 Midway baseFramework 的 try/catch 分支隔离：成功走 match()，
 * 错误走 catch()，不会交叉。本测只断言成功路径的形状。
 */
describe('SuccessResultFilter', () => {
  it('wraps a controller success return value into the ApiResult envelope', () => {
    const filter = new SuccessResultFilter();
    const payload = { items: [{ id: 'a' }, { id: 'b' }] };
    expect(filter.match(payload)).toEqual({ code: 0, data: payload });
  });

  it('preserves the original payload shape inside data (no field loss)', () => {
    const filter = new SuccessResultFilter();
    const payload = { item: { id: 'x', name: 'demo', tenantId: 'tenant-a' } };
    const wrapped = filter.match(payload);
    expect(wrapped.code).toBe(0);
    expect(wrapped.data).toBe(payload);
    expect((wrapped.data as { item: { id: string } }).item.id).toBe('x');
  });

  it('wraps falsy / empty payloads consistently (ok:true, null, undefined)', () => {
    const filter = new SuccessResultFilter();
    expect(filter.match({ ok: true })).toEqual({ code: 0, data: { ok: true } });
    expect(filter.match(null)).toEqual({ code: 0, data: null });
    expect(filter.match(undefined)).toEqual({ code: 0, data: undefined });
  });

  it('never produces an error-shaped body ({code:<string>,message}) on success', () => {
    const filter = new SuccessResultFilter();
    const wrapped = filter.match({ items: [] }) as Record<string, unknown>;
    expect(wrapped.code).toBe(0);
    expect(wrapped).not.toHaveProperty('message');
  });
});
