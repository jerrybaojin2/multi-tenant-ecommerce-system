import type { Brand } from '../types';

/**
 * 后端驱动菜单契约。
 *
 * demo 阶段由 `demo-menu.ts` 提供结构等价的静态占位数据；待 backend 菜单/权限接口落地后，
 * 把 `getAdminMenu` 替换为真实 fetch 即可，契约（AdminMenuResponse）与校验
 * （validateMenuItems）保持不变。前端只渲染后端返回的菜单，不硬编码 role 判断
 * （见 frontend/index.md、hook-guidelines.md、quality-guidelines.md）。
 */
export interface AdminMenuItem {
  /** 菜单唯一 key。 */
  key: string;
  /** 所属 surface：决定渲染在 merchant 还是 platform 壳。 */
  surface: Brand;
  /** 导航路由路径（动态渲染前校验：必须以 / 开头）。 */
  routePath: string;
  /** 展示文案。 */
  label: string;
  /** 权限 code（backend 驱动可见性；demo 阶段默认授予）。 */
  permissionCode: string;
  /** 映射到已编译视图/路由（保留给未来动态注册映射）。 */
  viewPath: string;
  /** 展示排序（升序，缺省按 99 处理）。 */
  order?: number;
}

/** 后端菜单接口返回 envelope（预留真实 backend menu API 契约）。 */
export interface AdminMenuResponse {
  items: AdminMenuItem[];
}

/**
 * 动态渲染/注册前校验：routePath、permissionCode、viewPath 必须存在且非空，
 * routePath 必须以 / 开头，surface 必须是合法 Brand。
 * 校验失败立即抛错（fail-fast），避免渲染出残缺导航（见 frontend/type-safety.md）。
 */
export function validateMenuItems(items: AdminMenuItem[]): AdminMenuItem[] {
  for (const item of items) {
    if (
      !item.key ||
      !item.routePath ||
      !item.permissionCode ||
      !item.viewPath
    ) {
      throw new Error(
        `invalid menu item: missing required field(s) in ${JSON.stringify(item)}`
      );
    }
    if (!item.routePath.startsWith('/')) {
      throw new Error(
        `invalid menu item routePath (must start with /): ${item.routePath}`
      );
    }
    if (item.surface !== 'merchant' && item.surface !== 'platform') {
      throw new Error(`invalid menu item surface: ${String(item.surface)}`);
    }
  }
  return items;
}
