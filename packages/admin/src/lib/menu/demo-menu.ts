import type { Brand } from '../types';
import {
  AdminMenuItem,
  AdminMenuResponse,
  validateMenuItems,
} from './menu-types';

/**
 * demo 阶段菜单 provider：返回结构等同于未来 backend menu API 的静态数据。
 * 后续接入真实 backend 菜单/权限接口时，仅替换 `getAdminMenu` 内部实现为 fetch，
 * `AdminMenuResponse` 契约与 `validateMenuItems` 校验保持不变。
 */
const DEMO_MENU: AdminMenuItem[] = [
  {
    key: 'merchant.demo-resources',
    surface: 'merchant',
    routePath: '/merchant/demo-resources',
    label: 'Demo Resource',
    permissionCode: 'merchant:demo-resource:view',
    viewPath: 'merchant/demo-resources',
    order: 10,
  },
  {
    key: 'platform.demo-resources',
    surface: 'platform',
    routePath: '/platform/demo-resources',
    label: 'Demo Resource',
    permissionCode: 'platform:demo-resource:view',
    viewPath: 'platform/demo-resources',
    order: 10,
  },
];

/** 模拟后端菜单接口（返回完整 envelope，预留真实 fetch 替换点）。 */
export async function getAdminMenu(): Promise<AdminMenuResponse> {
  // demo：直接返回静态数据。
  // 真实场景：return fetch(`${apiBaseUrl}/admin/...menu`).then(r => r.json())
  return { items: DEMO_MENU };
}

/**
 * 按 surface 取已校验、已授权的菜单。
 * demo 阶段无真实鉴权：所有 permissionCode 默认授予。
 * 后续接入 backend 鉴权后，这里改为读取 granted permissions 再过滤。
 */
export async function getMenuForSurface(
  surface: Brand
): Promise<AdminMenuItem[]> {
  const { items } = await getAdminMenu();
  const validated = validateMenuItems(items);
  return validated
    .filter(item => item.surface === surface)
    .sort((a, b) => (a.order ?? 99) - (b.order ?? 99));
}
