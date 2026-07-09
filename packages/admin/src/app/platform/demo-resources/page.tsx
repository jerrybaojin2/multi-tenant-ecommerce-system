import { AdminShell } from '@/components/admin-shell';
import { DemoResourceTable } from '@/components/demo-resource-table';
import { getPlatformDemoResources } from '@/lib/demo-resource-api';

export default async function PlatformDemoResourcesPage() {
  let errorMessage = '';
  const resources = await getPlatformDemoResources().catch(error => {
    errorMessage = error instanceof Error ? error.message : 'Demo resource 加载失败';
    return [];
  });

  return (
    <AdminShell surface="platform" title="平台 Demo Resource">
      <DemoResourceTable errorMessage={errorMessage} resources={resources} />
    </AdminShell>
  );
}
