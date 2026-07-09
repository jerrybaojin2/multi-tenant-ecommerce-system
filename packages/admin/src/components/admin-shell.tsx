import Link from 'next/link';
import styles from './admin-shell.module.css';

type AdminSurface = 'merchant' | 'platform';

const surfaceLabels: Record<AdminSurface, string> = {
  merchant: '商家后台',
  platform: '平台运营',
};

const navItems = [
  {
    href: '/merchant/demo-resources',
    label: '商家 Demo',
    surface: 'merchant',
  },
  {
    href: '/platform/demo-resources',
    label: '平台 Demo',
    surface: 'platform',
  },
] satisfies Array<{ href: string; label: string; surface: AdminSurface }>;

export function AdminShell({
  children,
  surface,
  title,
}: Readonly<{
  children: React.ReactNode;
  surface: AdminSurface;
  title: string;
}>) {
  return (
    <main className={styles.layout}>
      <aside className={styles.sidebar}>
        <div>
          <p className={styles.kicker}>MiniApp Rent</p>
          <h1 className={styles.brand}>{surfaceLabels[surface]}</h1>
        </div>
        <nav className={styles.nav} aria-label="管理后台导航">
          {navItems.map(item => (
            <Link
              key={item.href}
              className={item.surface === surface ? styles.activeLink : styles.link}
              href={item.href}
            >
              {item.label}
            </Link>
          ))}
        </nav>
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
