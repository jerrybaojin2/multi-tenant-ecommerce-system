import {
  DeleteQueryBuilder,
  InsertQueryBuilder,
  SelectQueryBuilder,
  UpdateQueryBuilder,
} from 'typeorm';
import {
  getTenantContext,
  isPlatformContext,
  requireTenantId,
} from '../tenant/tenant-context';

export class TenantSubscriber {
  afterSelectQueryBuilder(queryBuilder: SelectQueryBuilder<unknown>) {
    const tenantId = tenantIdForRead();
    if (tenantId) {
      // 读取默认收敛到当前租户；平台态由 tenantIdForRead 放行。
      queryBuilder.andWhere(
        `${
          queryBuilder.alias ? queryBuilder.alias + '.' : ''
        }tenantId = :tenantId`,
        { tenantId }
      );
    }
  }

  afterInsertQueryBuilder(queryBuilder: InsertQueryBuilder<unknown>) {
    const context = getTenantContext();
    if (!context || isPlatformContext()) {
      return;
    }
    const tenantId = requireTenantId();
    const values = queryBuilder.expressionMap.valuesSet;
    if (Array.isArray(values)) {
      // 写入时强制覆盖传入的 tenantId，防止请求体跨租户伪造。
      queryBuilder.values(values.map(item => ({ ...item, tenantId })));
      return;
    }
    if (values && typeof values === 'object') {
      // 单条写入同样以上下文租户为准。
      queryBuilder.values({ ...values, tenantId });
    }
  }

  afterUpdateQueryBuilder(queryBuilder: UpdateQueryBuilder<unknown>) {
    const tenantId = tenantIdForWrite();
    if (tenantId) {
      queryBuilder.andWhere('tenantId = :tenantId', { tenantId });
    }
  }

  afterDeleteQueryBuilder(queryBuilder: DeleteQueryBuilder<unknown>) {
    const tenantId = tenantIdForWrite();
    if (tenantId) {
      queryBuilder.andWhere('tenantId = :tenantId', { tenantId });
    }
  }
}

function tenantIdForRead(): string | undefined {
  if (isPlatformContext()) {
    return undefined;
  }
  return getTenantContext()?.tenantId;
}

function tenantIdForWrite(): string | undefined {
  if (isPlatformContext()) {
    // 平台态写操作不自动加租户条件，调用方需要显式控制范围。
    return undefined;
  }
  return getTenantContext()?.tenantId;
}
