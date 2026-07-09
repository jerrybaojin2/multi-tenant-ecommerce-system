import { Provide } from '@midwayjs/core';
import { InjectEntityModel } from '@midwayjs/typeorm';
import { Repository } from 'typeorm';
import { TenantAwareRepository } from '../../../core/database/tenant-repository';
import { BusinessError } from '../../../core/errors/business-error';
import { CreateDemoResourceDto } from '../dto/create-demo-resource.dto';
import { UpdateDemoResourceDto } from '../dto/update-demo-resource.dto';
import { DemoResourceEntity } from '../entity/demo-resource.entity';

@Provide()
export class DemoResourceService {
  @InjectEntityModel(DemoResourceEntity)
  resourceRepo: Repository<DemoResourceEntity>;

  private scoped(): TenantAwareRepository<DemoResourceEntity> {
    // 每次调用基于当前 repository 构造租户作用域 helper，
    // 确保所有 list/get/create/update/delete 都经过 TenantSubscriber guard。
    return new TenantAwareRepository(this.resourceRepo);
  }

  async listForTenant(): Promise<DemoResourceEntity[]> {
    return this.scoped().list();
  }

  async getForTenant(id: string): Promise<DemoResourceEntity> {
    const item = await this.scoped().getByScope(id);
    if (!item) {
      throw new BusinessError(
        'DEMO_RESOURCE_NOT_FOUND',
        'Demo resource not found',
        404
      );
    }
    return item;
  }

  async createForTenant(
    input: CreateDemoResourceDto
  ): Promise<DemoResourceEntity> {
    const name = input.name?.trim();
    if (!name) {
      throw new BusinessError(
        'DEMO_RESOURCE_NAME_REQUIRED',
        'Name is required'
      );
    }
    // createScoped 内部会以当前租户覆盖 tenantId，忽略请求体夹带的 tenantId。
    return this.scoped().createScoped({
      name,
      description: input.description?.trim() || '',
    });
  }

  async updateForTenant(
    id: string,
    input: UpdateDemoResourceDto
  ): Promise<DemoResourceEntity> {
    const patch: QueryPatch = {};
    if (input.name !== undefined) {
      const name = input.name.trim();
      if (!name) {
        throw new BusinessError(
          'DEMO_RESOURCE_NAME_REQUIRED',
          'Name must not be empty'
        );
      }
      patch.name = name;
    }
    if (input.description !== undefined) {
      patch.description = input.description.trim();
    }
    if (Object.keys(patch).length === 0) {
      throw new BusinessError(
        'DEMO_RESOURCE_NO_FIELDS',
        'At least one field must be provided'
      );
    }

    const affected = await this.scoped().updateScoped(id, patch);
    if (affected === 0) {
      // 跨租户或不存在统一返回 404，避免泄漏存在性。
      throw new BusinessError(
        'DEMO_RESOURCE_NOT_FOUND',
        'Demo resource not found',
        404
      );
    }
    return this.getForTenant(id);
  }

  async deleteForTenant(id: string): Promise<void> {
    const affected = await this.scoped().deleteScoped(id);
    if (affected === 0) {
      throw new BusinessError(
        'DEMO_RESOURCE_NOT_FOUND',
        'Demo resource not found',
        404
      );
    }
  }

  async listForPlatform(): Promise<DemoResourceEntity[]> {
    // 跨租户读取走显式平台服务：helper 在平台态不追加 tenant predicate，
    // 但角色守护（PLATFORM_ONLY）在 listAllForPlatform 内部校验。
    return this.scoped().listAllForPlatform();
  }

  async getForPlatform(id: string): Promise<DemoResourceEntity> {
    const item = await this.scoped().getByIdForPlatform(id);
    if (!item) {
      throw new BusinessError(
        'DEMO_RESOURCE_NOT_FOUND',
        'Demo resource not found',
        404
      );
    }
    return item;
  }
}

type QueryPatch = { name?: string; description?: string };
