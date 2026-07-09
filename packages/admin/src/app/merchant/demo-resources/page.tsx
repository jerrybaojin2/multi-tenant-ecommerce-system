import { AdminShell } from '@/components/admin-shell';
import { DemoResourceForm } from '@/components/demo-resource-form';
import { DemoResourceTable } from '@/components/demo-resource-table';
import { merchantDemoResourceApi } from '@/lib/demo-resource-api';
import sections from '@/components/page-sections.module.css';

// 商家端 demo resource 列表 + 新增（本租户）。
// 走 /admin/merchant/demo-resources，apiRequest 注入 X-Tenant-Id；
// backend guard 会用当前租户覆盖请求体里的 tenantId，跨租户写入会被拒绝。
export default async function MerchantDemoResourcesPage() {
  let errorMessage = '';
  const resources = await merchantDemoResourceApi.list().catch(error => {
    errorMessage = error instanceof Error ? error.message : 'Demo resource 加载失败';
    return [];
  });

  return (
    <AdminShell
      surface="merchant"
      title="商家 Demo Resource"
      activeRoute="/merchant/demo-resources"
    >
      <section className={sections.section}>
        <h3 className={sections.sectionTitle}>新增（本租户）</h3>
        <DemoResourceForm mode="create" />
        <p className={sections.note}>
          backend 会用当前租户覆盖请求体里的 tenantId；跨租户写入会被 guard 拒绝。
        </p>
      </section>
      <section className={sections.section}>
        <h3 className={sections.sectionTitle}>列表（仅本租户）</h3>
        <DemoResourceTable
          errorMessage={errorMessage}
          resources={resources}
          surface="merchant"
        />
      </section>
    </AdminShell>
  );
}
