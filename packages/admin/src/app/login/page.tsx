'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { Brand } from '@/lib/types';
import styles from './page.module.css';

/**
 * 登录壳（demo 阶段无鉴权）。
 * backend 用可信请求头（X-Tenant-Id / /admin/platform 路由前缀）承载租户身份，
 * 这里仅占位并让用户选择进入哪个品牌 surface；真实认证、token、权限与菜单由 Midway.js 后端后续提供。
 */
export default function LoginPage() {
  const router = useRouter();
  const [surface, setSurface] = useState<Brand>('merchant');

  function enter(target?: Brand) {
    const next = target ?? surface;
    router.push(
      next === 'platform' ? '/platform/demo-resources' : '/merchant/demo-resources'
    );
  }

  return (
    <main className={styles.page}>
      <section className={styles.panel}>
        <p className={styles.kicker}>Admin Sign In</p>
        <h1>租赁平台管理后台</h1>
        <form
          className={styles.form}
          onSubmit={event => {
            event.preventDefault();
            enter();
          }}
        >
          <label>
            账号
            <input name="username" placeholder="请输入账号" type="text" />
          </label>
          <label>
            密码
            <input name="password" placeholder="请输入密码" type="password" />
          </label>
          <fieldset className={styles.surface}>
            <legend>进入品牌（demo）</legend>
            <label className={styles.radio}>
              <input
                type="radio"
                name="surface"
                checked={surface === 'merchant'}
                onChange={() => setSurface('merchant')}
              />
              <span>商家后台（本租户）</span>
            </label>
            <label className={styles.radio}>
              <input
                type="radio"
                name="surface"
                checked={surface === 'platform'}
                onChange={() => setSurface('platform')}
              />
              <span>平台运营（跨租户）</span>
            </label>
          </fieldset>
          <button type="submit">登录</button>
        </form>
        <p className={styles.note}>
          PR1 demo 阶段无真实鉴权：后端用可信请求头（X-Tenant-Id /
          /admin/platform 路由前缀）承载租户身份，登录壳仅占位并选择品牌。
          真实认证、权限与菜单数据由 Midway.js 后端后续提供。
        </p>
        <div className={styles.direct}>
          <Link href="/merchant/demo-resources">直接进入商家</Link>
          <Link href="/platform/demo-resources">直接进入平台</Link>
        </div>
      </section>
    </main>
  );
}
