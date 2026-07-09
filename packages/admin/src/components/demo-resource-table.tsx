import type { DemoResource } from '@/lib/demo-resource-api';
import styles from './demo-resource-table.module.css';

export function DemoResourceTable({
  errorMessage,
  resources,
}: Readonly<{
  errorMessage?: string;
  resources: DemoResource[];
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
            <th>租户</th>
            <th>ID</th>
          </tr>
        </thead>
        <tbody>
          {resources.map(resource => (
            <tr key={resource.id}>
              <td>{resource.name}</td>
              <td>{resource.tenantId}</td>
              <td>{resource.id}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
