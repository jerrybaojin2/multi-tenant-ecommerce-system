import { Controller, Get, Inject, Param } from '@midwayjs/core';
import { DemoResourceService } from '../service/demo-resource.service';

// C 端只读 demo 资源：全部走租户作用域（X-Tenant-Id 由请求头注入）。
@Controller('/app/consumer/demo-resources')
export class ConsumerDemoResourceController {
  @Inject()
  demoResourceService: DemoResourceService;

  @Get('/')
  async list() {
    return {
      items: await this.demoResourceService.listForTenant(),
    };
  }

  @Get('/:id')
  async detail(@Param('id') id: string) {
    return {
      item: await this.demoResourceService.getForTenant(id),
    };
  }
}
