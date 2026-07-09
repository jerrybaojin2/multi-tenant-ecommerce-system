# PR1 C端 uni-app 接通

## Goal
在现有 `packages/app-c` uni-app 骨架上，实现 tenant-aware 请求封装（注入 X-Tenant-Id），接通 `/app/consumer/**` demo resource，提供一个 demo 页验证 C 端租户上下文。

## 范围
- 请求封装：注入已校验租户上下文（X-Tenant-Id / app token）
- demo 页：调 `/app/consumer/demo-resource`，展示本租户数据
- 复用 storefront registry 边界规范（PR1 只骨架/规范，不做模板编辑器）

## 依赖
- `07-09-pr1-backend`：`/app/consumer/**` demo resource API 契约（先行）

## 验收
- [ ] C 端请求携带已校验租户上下文
- [ ] demo 页只展示本租户 demo 数据
- [ ] uni-app 可本地启动、调通后端

## 参考
- 父 PRD：`../07-09-pr1-walking-skeleton/prd.md`
- 前端规范：`.trellis/spec/frontend/`
- storefront 边界：`07-07/research/storefront-template-architecture.md`
