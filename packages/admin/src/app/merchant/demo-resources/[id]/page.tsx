import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AdminShell } from '@/components/admin-shell';
import { DemoResourceDetail } from '@/components/demo-resource-detail';
import {
  DeleteDemoResourceButton,
  DemoResourceForm,
} from '@/components/demo-resource-form';
import { merchantDemoResourceApi } from '@/lib/demo-resource-api';
import { ApiRequestError } from '@/lib/types';
import sections from '@/components/page-sections.module.css';

// 商家端 demo resource 详情：本租户读 + 编辑 + 删除。
// 跨租户或不存在时 backend 返回 404（guard 收敛 affected=0），此处映射为 notFound()。
export default async function MerchantDemoResourceDetailPage({
  params,
}: Readonly<{
  params: Promise<{ id: string }>;
}>) {
  const { id } = await params;

  let resource;
  let errorMessage = '';
  try {
    resource = await merchantDemoResourceApi.get(id);
  } catch (error) {
    if (error instanceof ApiRequestError && error.status === 404) {
      notFound();
    }
    errorMessage = error instanceof Error ? error.message : '加载失败';
  }

  return (
    <AdminShell
      surface="merchant"
      title="商家 Demo Resource 详情"
      activeRoute="/merchant/demo-resources"
    >
      <Link
        className={sections.backLink}
        href="/merchant/demo-resources"
      >
        ← 返回列表
      </Link>
      {errorMessage ? (
        <p className={sections.pageError}>{errorMessage}</p>
      ) : resource ? (
        <>
          <section className={sections.section}>
            <h3 className={sections.sectionTitle}>详情</h3>
            <DemoResourceDetail resource={resource} />
          </section>
          <section className={sections.section}>
            <h3 className={sections.sectionTitle}>编辑（本租户）</h3>
            <DemoResourceForm mode="update" resource={resource} />
          </section>
          <section className={sections.section}>
            <h3 className={sections.sectionTitle}>删除</h3>
            <DeleteDemoResourceButton id={resource.id} />
          </section>
        </>
      ) : null}
    </AdminShell>
  );
}
