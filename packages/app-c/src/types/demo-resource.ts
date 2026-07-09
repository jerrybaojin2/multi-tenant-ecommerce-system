export interface DemoResource {
  id: string;
  tenantId: string;
  name: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface DemoResourceListResponse {
  items: DemoResource[];
}
