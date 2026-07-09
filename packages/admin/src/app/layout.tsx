import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '租赁平台管理后台',
  description: '商家后台与平台运营后台',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
