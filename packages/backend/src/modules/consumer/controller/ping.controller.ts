import { Controller, Get } from '@midwayjs/core';
import { getTenantContext } from '../../../core/tenant/tenant-context';

@Controller('/app/consumer')
export class ConsumerPingController {
  @Get('/ping')
  async ping() {
    return {
      ok: true,
      scope: 'consumer',
      context: getTenantContext(),
    };
  }
}
