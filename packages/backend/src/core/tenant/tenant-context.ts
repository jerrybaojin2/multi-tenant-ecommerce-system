import { AsyncLocalStorage } from 'node:async_hooks';

export type ActorRole = 'consumer' | 'merchant' | 'platform';

export interface TenantContext {
  tenantId?: string;
  userId?: string;
  role: ActorRole;
  requestId?: string;
}

// 每个请求独立保存租户信息，避免并发请求之间串租户。
const tenantStorage = new AsyncLocalStorage<TenantContext>();

export function runWithTenantContext<T>(
  context: TenantContext,
  callback: () => T
): T {
  return tenantStorage.run(context, callback);
}

export function getTenantContext(): TenantContext | undefined {
  return tenantStorage.getStore();
}

export function requireTenantContext(): TenantContext {
  const context = getTenantContext();
  if (!context) {
    throw new Error('Tenant context is required');
  }
  return context;
}

export function requireTenantId(): string {
  const context = requireTenantContext();
  if (!context.tenantId || context.role === 'platform') {
    // 平台态不允许伪装成租户态执行写入或租户级查询。
    throw new Error('Tenant id is required for tenant-scoped operation');
  }
  return context.tenantId;
}

export function isPlatformContext(): boolean {
  return getTenantContext()?.role === 'platform';
}
