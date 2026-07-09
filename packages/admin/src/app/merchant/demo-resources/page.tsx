import { AdminShell } from '@/components/admin-shell';
import { DemoResourceTable } from '@/components/demo-resource-table';
import { getMerchantDemoResources } from '@/lib/demo-resource-api';

export default async function MerchantDemoResourcesPage() {
  let errorMessage = '';
  const resources = await getMerchantDemoResources().catch(error => {
    errorMessage = error instanceof Error ? error.message : 'Demo resource 加载失败';
    return [];
  });

  return (
    <AdminShell surface="merchant" title="商家 Demo Resource">
      <DemoResourceTable errorMessage={errorMessage} resources={resources} />
    </AdminShell>
  );
}
