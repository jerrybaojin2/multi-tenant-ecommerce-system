import { AdminShell } from '@/components/admin-shell';
import { DemoResourceTable } from '@/components/demo-resource-table';
import { platformDemoResourceApi } from '@/lib/demo-resource-api';
import sections from '@/components/page-sections.module.css';

// 平台端 demo resource 列表：跨租户只读。
// 走 /admin/platform/demo-resources，路由前缀在 backend 自动判定 role=platform，
// 走显式平台服务（不加 tenant predicate），可看到所有租户数据。
export default async function PlatformDemoResourcesPage() {
  let errorMessage = '';
  const resources = await platformDemoResourceApi.list().catch(error => {
    errorMessage = error instanceof Error ? error.message : 'Demo resource 加载失败';
    return [];
  });

  return (
    <AdminShell
      surface="platform"
      title="平台 Demo Resource"
      activeRoute="/platform/demo-resources"
    >
      <p className={sections.note}>
        跨租户只读：走显式平台服务，路由前缀 /admin/platform 自动判定 platform 角色，
        可看到全部租户的 demo 数据。
      </p>
      <section className={sections.section}>
        <h3 className={sections.sectionTitle}>列表（跨租户）</h3>
        <DemoResourceTable
          errorMessage={errorMessage}
          resources={resources}
          surface="platform"
        />
      </section>
    </AdminShell>
  );
}
