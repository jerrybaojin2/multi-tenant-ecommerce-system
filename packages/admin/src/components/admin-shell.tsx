import Link from 'next/link';
import type { Brand } from '@/lib/types';
import { getMenuForSurface } from '@/lib/menu/demo-menu';
import styles from './admin-shell.module.css';

const surfaceLabels: Record<Brand, string> = {
  merchant: '商家后台',
  platform: '平台运营',
};

function roleNote(surface: Brand): string {
  return surface === 'platform'
    ? '跨租户读 · 显式平台服务'
    : '本租户作用域 · X-Tenant-Id';
}

/**
 * Admin 双品牌壳。菜单由后端（demo 阶段为 demo-menu provider）驱动，按 surface 过滤后渲染；
 * 页面只负责把 surface/title/activeRoute 传入，不在组件内硬编码 role/menu 判断。
 */
export async function AdminShell({
  children,
  surface,
  title,
  activeRoute,
}: Readonly<{
  children: React.ReactNode;
  surface: Brand;
  title: string;
  activeRoute?: string;
}>) {
  const menuItems = await getMenuForSurface(surface);

  return (
    <main className={styles.layout}>
      <aside className={styles.sidebar}>
        <div>
          <p className={styles.kicker}>MiniApp Rent</p>
          <h1 className={styles.brand}>{surfaceLabels[surface]}</h1>
          <p className={styles.roleNote}>{roleNote(surface)}</p>
        </div>
        <nav className={styles.nav} aria-label="管理后台导航">
          {menuItems.map(item => (
            <Link
              key={item.key}
              className={
                item.routePath === activeRoute ? styles.activeLink : styles.link
              }
              href={item.routePath}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <Link className={styles.switchLink} href="/login">
          切换品牌 / 登出（demo）
        </Link>
      </aside>
      <section className={styles.content}>
        <header className={styles.header}>
          <p className={styles.kicker}>PR1 walking skeleton</p>
          <h2>{title}</h2>
        </header>
        {children}
      </section>
    </main>
  );
}
