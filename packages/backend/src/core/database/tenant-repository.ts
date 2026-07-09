import {
  DeleteQueryBuilder,
  InsertQueryBuilder,
  ObjectLiteral,
  QueryDeepPartialEntity,
  Repository,
  SelectQueryBuilder,
  UpdateQueryBuilder,
} from 'typeorm';
import { BusinessError } from '../errors/business-error';
import { isPlatformContext, requireTenantId } from '../tenant/tenant-context';
import { TenantSubscriber } from './tenant.subscriber';

// PR0 guard 实例：项目自有钩子（非 TypeORM 标准 EntitySubscriberInterface 钩子），
// 必须由本 helper 显式调用才会生效，详见 database-guidelines.md §PR0 guard 契约。
const tenantQueryGuard = new TenantSubscriber();

/**
 * 租户作用域仓储 helper。
 *
 * 包装 TypeORM QueryBuilder 并显式调用 TenantSubscriber.after*QueryBuilder，
 * 让 PR0 的隔离 guard 从「未生效骨架」转为「运行期生效」。规则：
 * - 商家/消费端读：自动追加 tenant predicate。
 * - 商家/消费端写：以当前上下文租户覆盖 tenantId，忽略请求体夹带的 tenantId。
 * - 平台态读：有意不追加 predicate（由调用方做角色守护）。
 * - 平台态写不在本 helper 范围；平台维护需走显式平台服务。
 *
 * 见 database-guidelines.md §Query 模式 / §PR0 Tenant Query Guard 契约。
 */
export class TenantAwareRepository<T extends ObjectLiteral> {
  constructor(private readonly repository: Repository<T>) {}

  /** 商家/消费端：当前租户列表（按 createdAt 倒序）。 */
  async list(): Promise<T[]> {
    // 缺租户上下文直接抛错，避免不加 predicate 导致跨租户泄漏。
    requireTenantId();
    const queryBuilder = this.repository.createQueryBuilder(this.alias);
    tenantQueryGuard.afterSelectQueryBuilder(
      queryBuilder as unknown as SelectQueryBuilder<unknown>
    );
    queryBuilder.orderBy(`${this.alias}.createdAt`, 'DESC');
    return queryBuilder.getMany();
  }

  /** 商家/消费端：按 id 取当前租户单条；跨租户返回 null。 */
  async getByScope(id: string): Promise<T | null> {
    requireTenantId();
    const queryBuilder = this.repository
      .createQueryBuilder(this.alias)
      .where(`${this.alias}.id = :id`, { id });
    tenantQueryGuard.afterSelectQueryBuilder(
      queryBuilder as unknown as SelectQueryBuilder<unknown>
    );
    return queryBuilder.getOne();
  }

  /** 商家/消费端：插入；guard 会以当前租户覆盖请求体里的 tenantId。 */
  async createScoped(values: QueryDeepPartialEntity<T>): Promise<T> {
    requireTenantId();
    const insertQueryBuilder = this.repository
      .createQueryBuilder()
      .insert()
      .values(values);
    tenantQueryGuard.afterInsertQueryBuilder(
      insertQueryBuilder as unknown as InsertQueryBuilder<unknown>
    );
    const result = await insertQueryBuilder.execute();
    const id = result.identifiers[0]?.id;
    if (!id) {
      throw new BusinessError(
        'DEMO_RESOURCE_CREATE_FAILED',
        'Demo resource was not persisted'
      );
    }
    // 回读保证返回完整行（含数据库生成的 createdAt/updatedAt），同时再次走 guard。
    const persisted = await this.getByScope(String(id));
    if (!persisted) {
      throw new BusinessError(
        'DEMO_RESOURCE_CREATE_FAILED',
        'Demo resource was not persisted'
      );
    }
    return persisted;
  }

  /** 商家/消费端：按 id 更新；跨租户返回 affected=0。 */
  async updateScoped(
    id: string,
    patch: QueryDeepPartialEntity<T>
  ): Promise<number> {
    requireTenantId();
    const updateQueryBuilder = this.repository
      .createQueryBuilder()
      .update()
      .set(patch)
      .where('id = :id', { id });
    tenantQueryGuard.afterUpdateQueryBuilder(
      updateQueryBuilder as unknown as UpdateQueryBuilder<unknown>
    );
    const result = await updateQueryBuilder.execute();
    return result.affected || 0;
  }

  /** 商家/消费端：按 id 删除；跨租户返回 affected=0。 */
  async deleteScoped(id: string): Promise<number> {
    requireTenantId();
    const deleteQueryBuilder = this.repository
      .createQueryBuilder()
      .delete()
      .where('id = :id', { id });
    tenantQueryGuard.afterDeleteQueryBuilder(
      deleteQueryBuilder as unknown as DeleteQueryBuilder<unknown>
    );
    const result = await deleteQueryBuilder.execute();
    return result.affected || 0;
  }

  /** 平台：跨租户列表（guard 在平台态不追加 predicate）；调用方需角色守护。 */
  async listAllForPlatform(): Promise<T[]> {
    requirePlatformContext();
    const queryBuilder = this.repository.createQueryBuilder(this.alias);
    tenantQueryGuard.afterSelectQueryBuilder(
      queryBuilder as unknown as SelectQueryBuilder<unknown>
    );
    queryBuilder
      .orderBy(`${this.alias}.tenantId`, 'ASC')
      .addOrderBy(`${this.alias}.createdAt`, 'DESC');
    return queryBuilder.getMany();
  }

  /** 平台：跨租户按 id 单条（guard 在平台态不追加 predicate）。 */
  async getByIdForPlatform(id: string): Promise<T | null> {
    requirePlatformContext();
    const queryBuilder = this.repository
      .createQueryBuilder(this.alias)
      .where(`${this.alias}.id = :id`, { id });
    tenantQueryGuard.afterSelectQueryBuilder(
      queryBuilder as unknown as SelectQueryBuilder<unknown>
    );
    return queryBuilder.getOne();
  }

  private get alias(): string {
    // 用表名作为查询别名，使 guard 追加的 `alias.tenantId` 能被 TypeORM 正确映射到 tenant_id 列。
    return this.repository.metadata.tableName;
  }
}

function requirePlatformContext(): void {
  if (!isPlatformContext()) {
    // 跨租户读取仅开放给平台态，避免商户借平台接口越权。
    throw new BusinessError(
      'PLATFORM_ONLY',
      'Platform role is required for cross-tenant access',
      403
    );
  }
}
