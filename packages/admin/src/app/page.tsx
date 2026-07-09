import { redirect } from 'next/navigation';

// 顶层入口先落到登录壳（demo 阶段无鉴权，登录壳用于选择品牌 surface）。
export default function HomePage() {
  redirect('/login');
}
