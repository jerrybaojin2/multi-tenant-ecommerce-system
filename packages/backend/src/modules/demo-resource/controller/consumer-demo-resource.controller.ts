import { Controller, Get, Inject } from '@midwayjs/core';
import { DemoResourceService } from '../service/demo-resource.service';

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
}
