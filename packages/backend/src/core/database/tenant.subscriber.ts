import { EventSubscriberModel } from '@midwayjs/typeorm';
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

@EventSubscriberModel()
export class TenantSubscriber {
  afterSelectQueryBuilder(queryBuilder: SelectQueryBuilder<unknown>) {
    const tenantId = tenantIdForRead();
    if (tenantId) {
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
      queryBuilder.values(values.map(item => ({ ...item, tenantId })));
      return;
    }
    if (values && typeof values === 'object') {
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
    return undefined;
  }
  return getTenantContext()?.tenantId;
}
