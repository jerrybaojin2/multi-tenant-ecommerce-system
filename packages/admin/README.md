# @miniapp-rent/admin

Next.js 管理后台，覆盖商家后台（merchant）和平台运营（platform）两个品牌 surface。

## Stack Decision

PR1 决策：管理后台使用 **Next.js + TypeScript**（App Router）。后端业务流程仍全部位于
`packages/backend` 的 Midway.js 服务中，admin 只调用后端 API，**不在 Next.js `src/app/api`
中实现业务流程**。

## 多品牌 surface

merchant 与 platform 通过 Next.js 路由 segment 区分：

- `/app/merchant/**`：商家后台，本租户作用域，请求注入 `X-Tenant-Id`。
- `/app/platform/**`：平台运营，跨租户只读，路由前缀 `/admin/platform` 在 backend 自动判定
  platform 角色（走显式平台服务，不加 tenant predicate）。

品牌差异收敛在 config / theme / 后端菜单数据，不在 pages 中分散硬编码 role 判断。

## 租户身份（demo 阶段）

PR0/PR1 阶段 backend 用可信请求头承载租户身份（鉴权后续接入），demo 阶段无登录态/token：

- merchant 请求：`X-Tenant-Id`（取自 `NEXT_PUBLIC_MERCHANT_TENANT_ID`）。
- platform 请求：`/admin/platform` 路由前缀自动 platform；`X-Platform-Role` 作显式标注。
- 可选：`X-User-Id`。

登录壳 `/login` 仅占位并选择品牌 surface，不进行真实鉴权。

## 菜单 / 权限

菜单由「后端」驱动（demo 阶段为 `src/lib/menu/demo-menu.ts` 提供结构等价的静态占位），
前端只渲染后端返回的菜单；`validateMenuItems` 在动态渲染前校验 `routePath` /
`permissionCode` / `viewPath`。待 backend 菜单/权限接口落地后，把 `getAdminMenu` 替换为
真实 fetch 即可，契约保持不变。

## 环境变量

复制 `.env.example` 为 `.env`：

```
NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:8001
NEXT_PUBLIC_MERCHANT_TENANT_ID=tenant-a
```

- `NEXT_PUBLIC_API_BASE_URL`：Midway.js 后端地址。
- `NEXT_PUBLIC_MERCHANT_TENANT_ID`：本地开发使用的本租户标识（注入 merchant 请求头）。

## 目录结构

```
src/
  app/
    login/page.tsx                          # 登录壳（demo，选择品牌）
    merchant/demo-resources/
      page.tsx                              # 商家列表 + 新增（本租户）
      [id]/page.tsx                         # 商家详情 + 编辑 + 删除
    platform/demo-resources/
      page.tsx                              # 平台列表（跨租户只读）
      [id]/page.tsx                         # 平台详情（跨租户只读）
  components/
    admin-shell.tsx                         # 双品牌壳（菜单后端驱动）
    demo-resource-table.tsx / -form.tsx / -detail.tsx
  lib/
    api-client.ts                           # surface-aware typed fetch（注入可信头）
    demo-resource-api.ts                    # merchant CRUD + platform 只读
    types.ts                                # Brand / DemoResource / 响应 envelope
    menu/menu-types.ts, demo-menu.ts        # 后端菜单契约 + demo provider
```

## 响应 envelope

backend 未配置全局响应包装拦截器，controller 直接返回裸对象 `{items}`/`{item}`/`{ok}`；
错误由 `AppErrorFilter` 返回 `{code,message}`。本前端按**实际响应**适配（非
`frontend/type-safety.md` 约定的 `ApiResult<T>`），差异见实现报告。

## 常用命令

```
npm run dev      # 本地开发
npm run build    # 生产构建
npm run check    # 骨架结构守护
```
