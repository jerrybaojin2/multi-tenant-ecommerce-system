import { MidwayConfig } from '@midwayjs/core';

export default {
  typeorm: {
    // @midwayjs/typeorm 默认会剥离 dataSource.migrations 以防误执行；
    // prod 显式开启，配合 migrationsRun 在启动时执行 migration（替代 synchronize）。
    allowExecuteMigrations: true,
    dataSource: {
      default: {
        type: 'postgres',
        host: process.env.DB_HOST,
        port: Number(process.env.DB_PORT || 5432),
        username: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        synchronize: false,
        // prod 不走 synchronize：启动时自动执行已注册的 migrations（建表/改表由 migration 驱动）。
        migrationsRun: true,
        logging: false,
      },
    },
  },
  appMeta: {
    exposeDevMetadata: false,
  },
} as MidwayConfig;
