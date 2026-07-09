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

## Open Questions

> 区分「spec 已定（实现遵循，不再讨论）」与「待 backend 契约 / 待拍板」。

### spec 已定（实现时遵循）
- ✅ surface 区分：merchant/platform 由 Next.js 路由 segment 区分（`app/merchant/**` vs `app/platform/**`），品牌差异留在 config / theme / static / backend menu（`frontend/index.md`、`directory-structure.md`）。
- ✅ 后端驱动：菜单 / 路由可见性 / 权限由后端返回，前端只渲染，不硬编码 role 判断（`index.md`、`hook-guidelines.md`、`quality-guidelines.md`）。
- ✅ 业务边界：后台业务流程调 Midway 后端，不在 Next.js `src/app/api` 实现（`index.md`、`directory-structure.md`、`quality-guidelines.md`）。
- ✅ env：`.env` 设 `NEXT_PUBLIC_API_BASE_URL` + 本地开发租户标识（`directory-structure.md`）。

### 待 backend 契约（阻塞前端落地）
- ⏳ `/admin/merchant/**` 与 `/admin/platform/**` demo resource 请求/响应契约：待 `07-09-pr1-backend` 定稿。
- ⏳ 认证 / 登录模型：merchant 与 platform 是同一套认证（角色不同）还是两套登录端？登录返回的 token 如何区分 surface 权限？待 backend 给登录 + 角色/权限契约。
- ⏳ 角色菜单后端驱动接口：菜单 / 权限返回 schema（route path、permission code、`viewPath` 等），待 backend 契约（`type-safety.md` 要求动态注册前验证这些字段）。
- ⏳ platform 跨租户读的调用区分：merchant 调 `/admin/merchant/**`、platform 调 `/admin/platform/**`；前端按路由 segment 选 path 已定，但 platform 的 token / 权限边界（跨租户读授权）待 backend。

### 技术栈记录（验收项）
- 🔸 Admin 技术栈「Next.js + 自研 Midway API」：`spec/frontend/index.md` 已记录该决策与边界。本任务验收项「Admin 技术栈记录更新到 spec」需确认——视为已由 index.md 满足，还是需要补一份独立 ADR-lite？倾向：若 index.md 记录已覆盖决策与边界，验收视为满足，不再新增文档。

## 参考
- 父 PRD：`../07-09-pr1-walking-skeleton/prd.md`
- Admin 技术栈：`07-08` PRD（Next.js + 自研 Midway API）
- 前端规范：`.trellis/spec/frontend/`
