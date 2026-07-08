import { Body, Controller, Get, Inject, Post } from '@midwayjs/core';
import { CreateDemoResourceDto } from '../dto/create-demo-resource.dto';
import { DemoResourceService } from '../service/demo-resource.service';

@Controller('/admin/merchant/demo-resources')
export class MerchantDemoResourceController {
  @Inject()
  demoResourceService: DemoResourceService;

  @Get('/')
  async list() {
    return {
      items: await this.demoResourceService.listForTenant(),
    };
  }

  @Post('/')
  async create(@Body() input: CreateDemoResourceDto) {
    return {
      item: await this.demoResourceService.createForTenant(input),
    };
  }
}
