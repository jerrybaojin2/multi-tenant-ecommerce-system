import {
  BaseEntity,
  Column,
  CreateDateColumn,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export abstract class BaseTenantEntity extends BaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // 所有租户表统一保留 tenant_id，供订阅器追加查询和写入边界。
  @Column({ name: 'tenant_id', type: 'varchar', length: 64 })
  tenantId: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
