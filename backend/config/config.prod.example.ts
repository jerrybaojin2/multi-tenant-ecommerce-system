import { MidwayConfig } from '@midwayjs/core';

export default {
  typeorm: {
    dataSource: {
      default: {
        type: 'postgres',
        host: process.env.DB_HOST,
        port: Number(process.env.DB_PORT || 5432),
        username: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        synchronize: false,
        logging: false,
        entities: ['**/dist/**/*.entity.js', '**/dist/**/entity/*.js']
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
    exposeDevMetadata: false
  },
  prodGuard: {
    requireSecureSecrets: true,
    rejectDevMetadata: true
  }
} as MidwayConfig;
