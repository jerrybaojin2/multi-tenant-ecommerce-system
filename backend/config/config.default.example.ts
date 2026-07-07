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
        database: process.env.DB_NAME || 'miniapp_rent_dev',
        synchronize: true
      }
    }
  },
  cool: {
    eps: true,
    tenant: {
      enable: true,
      urls: ['/admin/**/*']
    }
  }
} as MidwayConfig;
