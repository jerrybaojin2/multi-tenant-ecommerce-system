import styles from './page.module.css';

export default function LoginPage() {
  return (
    <main className={styles.page}>
      <section className={styles.panel}>
        <p className={styles.kicker}>Admin Sign In</p>
        <h1>租赁平台管理后台</h1>
        <form className={styles.form}>
          <label>
            账号
            <input name="username" placeholder="请输入账号" type="text" />
          </label>
          <label>
            密码
            <input name="password" placeholder="请输入密码" type="password" />
          </label>
          <button type="button">登录</button>
        </form>
        <p className={styles.note}>
          PR1 仅保留登录壳；真实认证、权限和菜单数据由 Midway.js 后端提供。
        </p>
      </section>
    </main>
  );
}
