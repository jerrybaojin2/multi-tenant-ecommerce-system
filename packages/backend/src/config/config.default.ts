import { MidwayConfig } from '@midwayjs/core';
import * as path from 'path';

export default {
  keys: process.env.APP_KEYS || 'miniapp-rent-platform-dev-key',
  koa: {
    port: Number(process.env.PORT || 8001),
  },
  asyncContextManager: {
    enable: true,
  },
  staticFile: {
    dirs: {
      public: {
        prefix: '/public',
        dir: path.join(__dirname, '..', '..', 'public'),
      },
    },
  },
  typeorm: {
    dataSource: {
      default: {
        type: 'postgres',
        host: process.env.DB_HOST || '127.0.0.1',
        port: Number(process.env.DB_PORT || 5432),
        username: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD || 'postgres',
        database: process.env.DB_NAME || 'rent_dev',
        entities: [
          '**/modules/**/entity/*.entity{.ts,.js}',
          '**/core/**/entity/*.entity{.ts,.js}',
        ],
        synchronize: false,
        logging: false,
      },
    },
  },
  appMeta: {
    exposeDevMetadata: false,
  },
} as MidwayConfig;
