# 质量指南

> 前端质量标准与评审检查。

---

## 概览

前端变更必须保持 multi-tenant isolation assumptions、mini-program constraints 和 cool-admin-vue conventions。优先做小而可验证的变更，而不是宽泛抽象。

---

## 禁止模式

- 在 business pages/components 中直接使用 `uni.request`、`uni.uploadFile` 或 `uni.downloadFile`，而不通过共享 tenant/auth header wrapper。
- C-end business code 手动设置 `X-Tenant-Id`、传入任意 tenant ids，或修改 `tenantStore`。
- 未按租户分桶的 cart state，例如没有 `Record<tenantId, CartItem[]>` 的 `CartItem[]`。
- 对 C-end mini-program 声称或实现 runtime hot-plugin。C-end plugin features 必须是 build-time uni subpackages。
- 使用 uni-app x、Vue 2、Vuex、axios-in-mini-program 或 abandoned UI libraries，除非后续 PRD 明确修订技术栈。
- Admin 硬编码 role/menu/permission branching，绕过后端 `permmenu`。
- 在 C-end code 中使用 browser-only DOM、`window`、`document`、`localStorage`、Node APIs 或不受支持的 CSS assumptions。

---

## 必需模式

- C-end 使用 uni-app Vue 3 + Vite + TypeScript + wot-design-uni + Pinia。
- C-end MVP 只面向 WeChat mini-program（`MP-WEIXIN`）。
- 每个 C 端业务请求从只读租户状态注入 `X-Tenant-Id`。
- Admin 使用 cool-admin-vue 8.x，并通过 `VITE_BRAND=merchant|platform` 构建。
- Admin menu、permission 和 route visibility 由后端驱动。
- Plugin admin pages 可以编译进 admin bundle，并由后端 menu/config 激活；C-end plugin pages 是 build 选择的静态 subpackages。

---

## 测试要求

前端代码存在后：

- 报告完成前运行相关 lint 和 typecheck commands。
- 对 C-end request/store work，在项目测试栈支持时添加 tenant header injection 和 cart bucket operations 的 unit tests。
- 对 admin brand work，验证 `merchant` 和 `platform` 两种 builds，或至少验证 mode-specific config resolution。
- 对 mini-program UI flows，运行 WeChat mini-program build command，并检查生成输出是否缺少 pages/subpackages。

文档类 spec updates 至少必须运行 readback check，确认 placeholders 和 required hard-rule phrases。

---

## 代码评审清单

- Tenant context 是否从 `VITE_TENANT_ID` 初始化一次，随后只读？
- 所有 C-end request paths（包括 upload/download）是否应用 tenant 和 auth headers？
- Cart data 是否按 tenant id 分桶，并对 rent/sale mode-aware？
- C-end change 是否避免了 MVP 阶段的 H5/App assumptions？
- Admin 可见性是否来自后端 menu/perms，而不是纯前端角色检查？
- Plugin claims 是否符合目标端面：admin compiled routes vs C-end build-time subpackages？
- Types 是否足够显式，能防止 rent/sale 和 tenant-id 混淆？
