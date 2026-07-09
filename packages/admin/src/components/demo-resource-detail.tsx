import type { DemoResource } from '@/lib/types';
import styles from './demo-resource-detail.module.css';

function formatTime(value: string): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('zh-CN');
}

/** Demo resource 详情展示（merchant 与 platform detail 页共用，纯展示）。 */
export function DemoResourceDetail({
  resource,
}: Readonly<{ resource: DemoResource }>) {
  return (
    <dl className={styles.detail}>
      <div className={styles.row}>
        <dt>名称</dt>
        <dd>{resource.name}</dd>
      </div>
      <div className={styles.row}>
        <dt>描述</dt>
        <dd>{resource.description || '—'}</dd>
      </div>
      <div className={styles.row}>
        <dt>租户</dt>
        <dd>{resource.tenantId}</dd>
      </div>
      <div className={styles.row}>
        <dt>ID</dt>
        <dd className={styles.mono}>{resource.id}</dd>
      </div>
      <div className={styles.row}>
        <dt>创建时间</dt>
        <dd>{formatTime(resource.createdAt)}</dd>
      </div>
      <div className={styles.row}>
        <dt>更新时间</dt>
        <dd>{formatTime(resource.updatedAt)}</dd>
      </div>
    </dl>
  );
}
