import { Provide } from '@midwayjs/core';
import { InjectEntityModel } from '@midwayjs/typeorm';
import { Repository } from 'typeorm';
import { BusinessError } from '../../../core/errors/business-error';
import {
  isPlatformContext,
  requireTenantId,
} from '../../../core/tenant/tenant-context';
import { CreateDemoResourceDto } from '../dto/create-demo-resource.dto';
import { DemoResourceEntity } from '../entity/demo-resource.entity';

@Provide()
export class DemoResourceService {
  @InjectEntityModel(DemoResourceEntity)
  resourceRepo: Repository<DemoResourceEntity>;

  async listForTenant(): Promise<DemoResourceEntity[]> {
    const tenantId = requireTenantId();
    return this.resourceRepo.find({
      where: { tenantId },
      order: { createdAt: 'DESC' },
    });
  }

  async createForTenant(
    input: CreateDemoResourceDto
  ): Promise<DemoResourceEntity> {
    const tenantId = requireTenantId();
    const name = input.name?.trim();
    if (!name) {
      throw new BusinessError(
        'DEMO_RESOURCE_NAME_REQUIRED',
        'Name is required'
      );
    }

    const resource = this.resourceRepo.create({
      tenantId,
      name,
      description: input.description?.trim() || '',
    });
    return this.resourceRepo.save(resource);
  }

  async listForPlatform(): Promise<DemoResourceEntity[]> {
    if (!isPlatformContext()) {
      throw new BusinessError(
        'PLATFORM_ONLY',
        'Platform role is required for cross-tenant demo resources',
        403
      );
    }

    return this.resourceRepo.find({
      order: { tenantId: 'ASC', createdAt: 'DESC' },
    });
  }
}
