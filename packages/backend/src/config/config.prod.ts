import { CoolConfig } from '@cool-midway/core';
import { MidwayConfig } from '@midwayjs/core';
import { entities } from '../entities';
import { TenantSubscriber } from '../modules/base/db/tenant';

/**
 * 本地开发 npm run prod 读取的配置文件
 */
export default {
  typeorm: {
    dataSource: {
      default: {
        // PostgreSQL (PRD D3/D4). 生产凭据必须来自环境变量，不硬编码。
        type: 'postgres',
        host: process.env.DB_HOST,
        port: Number(process.env.DB_PORT || 5432),
        username: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        // 自动建表 注意：线上部署的时候不要使用，有可能导致数据丢失
        synchronize: false,
        // 打印日志
        logging: false,
        // 是否开启缓存
        cache: true,
        // 实体路径
        entities,
        // 订阅者（cool-admin v8 多租户隔离核心）
        subscribers: [TenantSubscriber],
      },
    },
  },
  cool: {
    // 多租户隔离（PRD D3）— 生产同样开启，仅 /admin/**/* 走 TenantSubscriber
    tenant: {
      enable: true,
      urls: ['/admin/**/*'],
    },
    // 实体与路径，跟生成代码、前端请求、swagger文档相关 注意：线上不建议开启，以免暴露敏感信息
    eps: false,
    // 是否自动导入模块数据库
    initDB: false,
    // 判断是否初始化的方式
    initJudge: 'db',
    // 是否自动导入模块菜单
    initMenu: false,
  } as CoolConfig,
} as MidwayConfig;
