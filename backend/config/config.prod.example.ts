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
        synchronize: false
      }
    }
  },
  cool: {
    eps: false,
    tenant: {
      enable: true,
      urls: ['/admin/**/*']
    }
  }
} as MidwayConfig;
