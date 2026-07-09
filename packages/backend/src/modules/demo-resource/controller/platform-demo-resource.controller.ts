import { Controller, Get, Inject, Param } from '@midwayjs/core';
import { DemoResourceService } from '../service/demo-resource.service';

// 平台端 demo 资源：跨租户只读，走显式平台服务（不加 tenant predicate）。
@Controller('/admin/platform/demo-resources')
export class PlatformDemoResourceController {
  @Inject()
  demoResourceService: DemoResourceService;

  @Get('/')
  async list() {
    return {
      items: await this.demoResourceService.listForPlatform(),
    };
  }

  @Get('/:id')
  async detail(@Param('id') id: string) {
    return {
      item: await this.demoResourceService.getForPlatform(id),
    };
  }
}
