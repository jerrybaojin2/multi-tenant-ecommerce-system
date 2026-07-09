import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AdminShell } from '@/components/admin-shell';
import { DemoResourceDetail } from '@/components/demo-resource-detail';
import { platformDemoResourceApi } from '@/lib/demo-resource-api';
import { ApiRequestError } from '@/lib/types';
import sections from '@/components/page-sections.module.css';

// 平台端 demo resource 详情：跨租户只读（无编辑/删除入口）。
export default async function PlatformDemoResourceDetailPage({
  params,
}: Readonly<{
  params: Promise<{ id: string }>;
}>) {
  const { id } = await params;

  let resource;
  let errorMessage = '';
  try {
    resource = await platformDemoResourceApi.get(id);
  } catch (error) {
    if (error instanceof ApiRequestError && error.status === 404) {
      notFound();
    }
    errorMessage = error instanceof Error ? error.message : '加载失败';
  }

  return (
    <AdminShell
      surface="platform"
      title="平台 Demo Resource 详情"
      activeRoute="/platform/demo-resources"
    >
      <Link className={sections.backLink} href="/platform/demo-resources">
        ← 返回列表
      </Link>
      {errorMessage ? (
        <p className={sections.pageError}>{errorMessage}</p>
      ) : resource ? (
        <section className={sections.section}>
          <h3 className={sections.sectionTitle}>详情（跨租户只读）</h3>
          <DemoResourceDetail resource={resource} />
        </section>
      ) : null}
    </AdminShell>
  );
}
