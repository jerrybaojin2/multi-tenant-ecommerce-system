import { MidwayConfig } from '@midwayjs/core';

export default {
  typeorm: {
    dataSource: {
      default: {
        synchronize: true,
        logging: false,
      },
    },
  },
  appMeta: {
    exposeDevMetadata: true,
  },
} as MidwayConfig;
