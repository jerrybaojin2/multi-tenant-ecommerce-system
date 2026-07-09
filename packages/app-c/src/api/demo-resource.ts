import { tenantRequest } from '../utils/request';
import type { DemoResourceListResponse } from '../types/demo-resource';

export async function listConsumerDemoResources() {
  const response = await tenantRequest<DemoResourceListResponse>({
    url: '/app/consumer/demo-resources/',
  });

  return response.data.items;
}
