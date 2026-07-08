import { Column, Entity } from 'typeorm';
import { BaseTenantEntity } from '../../../core/database/base-tenant.entity';

@Entity('demo_resources')
export class DemoResourceEntity extends BaseTenantEntity {
  @Column({ type: 'varchar', length: 80 })
  name: string;

  @Column({ type: 'varchar', length: 240, default: '' })
  description: string;
}
