import { Controller, Get } from '@midwayjs/core';
import { getTenantContext } from '../../../core/tenant/tenant-context';

@Controller('/admin/platform')
export class PlatformPingController {
  @Get('/ping')
  async ping() {
    return {
      ok: true,
      scope: 'platform',
      context: getTenantContext(),
    };
  }
}
