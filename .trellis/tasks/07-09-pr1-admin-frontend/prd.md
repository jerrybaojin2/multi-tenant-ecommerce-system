# PR1 Admin Next.js 壳接通

## Goal
在现有 `packages/admin` Next.js 骨架上，落地登录壳、路由壳、角色感知菜单占位，接通 `/admin/merchant/**` 与 `/admin/platform/**` demo resource，验证 merchant 本租户、platform 跨租户。

## 范围
- 登录壳 + 路由壳（merchant / platform 双品牌）
- 角色感知菜单占位（菜单/权限后端驱动）
- 调 `/admin/merchant/**` demo（本租户）、`/admin/platform/**` demo（跨租户，显式 platform 服务）
- Admin 技术栈决策记录到前端 spec

## 依赖
- `07-09-pr1-backend`：`/admin/merchant/**`、`/admin/platform/**` demo resource API 契约（先行）

## 验收
- [ ] 登录壳 + 双品牌路由壳可跑
- [ ] merchant 角色只看本租户 demo 数据
- [ ] platform 角色可跨租户读（走显式服务）
- [ ] 角色菜单后端驱动
- [ ] Admin 技术栈记录更新到 spec

## 参考
- 父 PRD：`../07-09-pr1-walking-skeleton/prd.md`
- Admin 技术栈：`07-08` PRD（Next.js + 自研 Midway API）
- 前端规范：`.trellis/spec/frontend/`
