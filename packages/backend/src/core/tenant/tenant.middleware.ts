import { IMiddleware, Middleware } from '@midwayjs/core';
import { Context, NextFunction } from '@midwayjs/koa';
import { randomUUID } from 'node:crypto';
import { runWithTenantContext, ActorRole } from './tenant-context';

@Middleware()
export class TenantMiddleware implements IMiddleware<Context, NextFunction> {
  resolve() {
    return async (ctx: Context, next: NextFunction) => {
      const role = resolveRole(ctx.path);
      const tenantHeader = ctx.get('x-tenant-id');
      const platformHeader = ctx.get('x-platform-role');
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
  if (path.startsWith('/admin/platform')) {
    return 'platform';
  }
  if (path.startsWith('/admin')) {
    return 'merchant';
  }
  return 'consumer';
}
