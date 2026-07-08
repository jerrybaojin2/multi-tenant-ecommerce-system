import * as koa from '@midwayjs/koa';
import * as orm from '@midwayjs/typeorm';
import * as validate from '@midwayjs/validate';
import * as staticFile from '@midwayjs/static-file';
import * as cron from '@midwayjs/cron';
import * as info from '@midwayjs/info';
import {
  App,
  Configuration,
  IMidwayApplication,
  ILogger,
  Inject,
} from '@midwayjs/core';
import * as DefaultConfig from './config/config.default';
import * as LocalConfig from './config/config.local';
import * as ProdConfig from './config/config.prod';

@Configuration({
  imports: [
    koa,
    staticFile,
    orm,
    validate,
    cron,
    {
      component: info,
      enabledEnvironment: ['local'],
    },
  ],
  importConfigs: [
    {
      default: DefaultConfig,
      local: LocalConfig,
      prod: ProdConfig,
    },
  ],
})
export class MainConfiguration {
  @App()
  app: IMidwayApplication;

  @Inject()
  logger: ILogger;

  async onReady() {
    // Midway 组件导入完成后再挂载，确保每个请求先进入租户上下文。
    this.app.useMiddleware(['tenant'] as any);
    this.logger.info('[backend] self-built Midway.js backend ready');
  }
}
