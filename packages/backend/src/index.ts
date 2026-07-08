// 统一包导出入口，减少外部调用方直接依赖内部文件路径。
export * from './configuration';
export * from './core/tenant/tenant.middleware';
export * from './modules/consumer/controller/ping.controller';
export * from './modules/demo-resource/controller/consumer-demo-resource.controller';
export * from './modules/demo-resource/controller/merchant-demo-resource.controller';
export * from './modules/demo-resource/controller/platform-demo-resource.controller';
export * from './modules/demo-resource/dto/create-demo-resource.dto';
export * from './modules/demo-resource/entity/demo-resource.entity';
export * from './modules/demo-resource/service/demo-resource.service';
export * from './modules/health/controller/health.controller';
export * from './modules/platform/controller/ping.controller';
