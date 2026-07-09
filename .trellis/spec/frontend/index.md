# 前端开发指南

> C-end WeChat mini-program 与双品牌 admin frontend 的项目约定。

---

## 范围

本项目有两个前端端面：

- **C-end**：uni-app Vue 3 + Vite + TypeScript，在 **PR0/PR1/MVP 阶段仅面向 WeChat mini-program**。除非后续 PRD 明确引入 H5/App 目标，否则不要添加 H5/App abstractions。
- **Admin**：Next.js + TypeScript，作为商家后台和平台运营后台的独立管理端。业务流程必须调用 Midway.js 后端 API，不在 Next.js API routes 中实现。

所有 PR0/PR1 前端工作的硬规则：

- 每个 C 端业务请求必须从 `tenantStore` 注入 `X-Tenant-Id`。
- `tenantStore` 从 `VITE_TENANT_ID` 初始化，并且对 business code 只读。
- C-end cart state 是 `Record<tenantId, CartItem[]>`。
- Admin menus、routes 和 permissions 由后端驱动；前端只渲染后端返回的内容。
- Admin 通过 Next.js 路由区分 merchant 与 platform surface；品牌差异留在 config、theme、static assets 和 backend menu data 中。
- C-end plugins 是构建时包含的 uni subpackages。它们不是 runtime hot plugins。

---

## 指南索引

| 指南 | 描述 | 状态 |
|-------|-------------|--------|
| [目录结构](./directory-structure.md) | C-end 和 admin file layout | Filled |
| [组件指南](./component-guidelines.md) | Vue SFC、wot-design-uni 和 admin component patterns | Filled |
| [Hook 指南](./hook-guidelines.md) | Composables、request hooks、tenant-aware helpers | Filled |
| [状态管理](./state-management.md) | Pinia stores、tenant/cart/auth/server state rules | Filled |
| [质量指南](./quality-guidelines.md) | Required checks、forbidden frontend patterns、review checklist | Filled |
| [类型安全](./type-safety.md) | TS strictness、API contracts、runtime validation boundaries | Filled |

---

## 开发前清单

- 阅读此索引，以及被修改层对应的具体指南。
- 对 C-end work，确认目标仍为 `MP-WEIXIN`，且 `VITE_TENANT_ID` 可用。
- 对 admin work，确认功能属于 `merchant`、`platform` 还是两者，并保持 visibility backend-driven；不要新增 Next.js API routes 承载业务流程。
- 添加重复 components、composables、request helpers、stores 或 enum-like constants 前先搜索。

## 质量检查

- 不存在 frontend spec placeholder text。
- C-end request wrappers 注入 `X-Tenant-Id`；business code 中不直接使用 `uni.request`。
- Tenant state 在 initialization 之外只读。
- Admin code 不硬编码本应属于后端的 role/menu/permission decisions。
- 代码存在后，typecheck、lint 和相关 mini-program/admin build command 通过。

**语言**：项目 Trellis 文档默认使用简体中文维护；只有外部或公开文档需要英文时才使用英文。
