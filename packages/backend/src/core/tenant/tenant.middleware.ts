import { IMiddleware, Middleware, Provide } from '@midwayjs/core';
import { Context, NextFunction } from '@midwayjs/koa';
import { randomUUID } from 'node:crypto';
import { runWithTenantContext, ActorRole } from './tenant-context';

@Middleware()
@Provide('tenant')
export class TenantMiddleware implements IMiddleware<Context, NextFunction> {
  resolve() {
    return async (ctx: Context, next: NextFunction) => {
      const role = resolveRole(ctx.path);
      const tenantHeader = ctx.get('x-tenant-id');
      const platformHeader = ctx.get('x-platform-role');
      // PR0 先用可信请求头承载租户身份，后续接入鉴权后由认证上下文派生。
      const tenantId =
        role === 'platform' || platformHeader === 'true'
          ? undefined
          : tenantHeader || undefined;

      return runWithTenantContext(
        {
          role,
          tenantId,
          userId: ctx.get('x-user-id') || undefined,
          requestId: ctx.get('x-request-id') || randomUUID(),
        },
        next
      );
    };
  }

  static getName(): string {
    return 'tenant';
  }
}

function resolveRole(path: string): ActorRole {
  // 路由前缀是当前运行时区分消费端、商户端和平台端的边界。
  if (path.startsWith('/admin/platform')) {
    return 'platform';
  }
  if (path.startsWith('/admin')) {
    return 'merchant';
  }
  return 'consumer';
}
