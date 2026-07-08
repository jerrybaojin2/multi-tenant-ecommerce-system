import { Controller, Get, Inject } from '@midwayjs/core';
import { DemoResourceService } from '../service/demo-resource.service';

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
}
