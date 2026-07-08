import { AsyncLocalStorage } from 'node:async_hooks';

export type ActorRole = 'consumer' | 'merchant' | 'platform';

export interface TenantContext {
  tenantId?: string;
  userId?: string;
  role: ActorRole;
  requestId?: string;
}

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
    throw new Error('Tenant id is required for tenant-scoped operation');
  }
  return context.tenantId;
}

export function isPlatformContext(): boolean {
  return getTenantContext()?.role === 'platform';
}
