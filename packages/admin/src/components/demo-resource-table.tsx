import Link from 'next/link';
import type { Brand, DemoResource } from '@/lib/types';
import styles from './demo-resource-table.module.css';

export function DemoResourceTable({
  errorMessage,
  resources,
  surface,
}: Readonly<{
  errorMessage?: string;
  resources: DemoResource[];
  surface: Brand;
}>) {
  if (errorMessage) {
    return <p className={styles.error}>{errorMessage}</p>;
  }

  if (!resources.length) {
    return <p className={styles.empty}>暂无 demo resource 数据</p>;
  }

  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>名称</th>
            <th>描述</th>
            <th>租户</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {resources.map(resource => (
            <tr key={resource.id}>
              <td>{resource.name}</td>
              <td className={styles.descCell}>
                {resource.description || '—'}
              </td>
              <td>{resource.tenantId}</td>
              <td>
                <Link
                  className={styles.link}
                  href={`/${surface}/demo-resources/${resource.id}`}
                >
                  查看
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
