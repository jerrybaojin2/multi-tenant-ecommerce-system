import { Controller, Get } from '@midwayjs/core';

@Controller('/health')
export class HealthController {
  @Get('/')
  async index() {
    return {
      ok: true,
      service: 'miniapp-rent-backend',
      framework: 'midway',
    };
  }
}
