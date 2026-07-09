import {
  Body,
  Controller,
  Del,
  Get,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
} from '@midwayjs/core';
import { CreateDemoResourceDto } from '../dto/create-demo-resource.dto';
import { UpdateDemoResourceDto } from '../dto/update-demo-resource.dto';
import { DemoResourceService } from '../service/demo-resource.service';

// 商家端 demo 资源 CRUD：全部走租户作用域（X-Tenant-Id 由请求头注入）。
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
  @HttpCode(201)
  async create(@Body() input: CreateDemoResourceDto) {
    return {
      item: await this.demoResourceService.createForTenant(input),
    };
  }

  @Get('/:id')
  async detail(@Param('id') id: string) {
    return {
      item: await this.demoResourceService.getForTenant(id),
    };
  }

  @Patch('/:id')
  async update(@Param('id') id: string, @Body() input: UpdateDemoResourceDto) {
    return {
      item: await this.demoResourceService.updateForTenant(id, input),
    };
  }

  @Del('/:id')
  async remove(@Param('id') id: string) {
    await this.demoResourceService.deleteForTenant(id);
    return { ok: true };
  }
}
