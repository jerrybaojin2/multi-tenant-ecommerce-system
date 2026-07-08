import { MidwayConfig } from '@midwayjs/core';

export default {
  typeorm: {
    dataSource: {
      default: {
        type: 'postgres',
        host: process.env.DB_HOST || '127.0.0.1',
        port: Number(process.env.DB_PORT || 5432),
        username: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD || 'postgres',
        database: process.env.DB_NAME || 'rent_dev',
        synchronize: true,
        logging: process.env.TYPEORM_LOGGING === 'true',
        entities: ['**/src/**/*.entity{.ts,.js}', '**/src/**/entity/*{.ts,.js}']
      }
    }
  },
  tenant: {
    context: {
      headerName: 'x-tenant-id',
      required: true
    },
    rls: {
      enabled: true,
      settingKey: 'app.tenant_id'
    }
  },
  appMeta: {
    exposeDevMetadata: true
  },
  prodGuard: {
    requireSecureSecrets: false,
    rejectDevMetadata: false
  }
} as MidwayConfig;
