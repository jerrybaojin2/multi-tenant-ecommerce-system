# 后端开发指南

> 自建 Midway.js / PostgreSQL 后端的项目约定。

---

## 概览

后端是一个面向多租户租赁 + 零售 SaaS 平台的全新 Midway.js 服务。它不基于 cool-admin。只构建我们需要的平台基础能力：租户上下文、RBAC、API modules、scheduled jobs、payment callbacks 和 auditability。

PR0 确立不可协商的后端契约：

- 使用 **Midway.js 3.x** 作为主后端框架。
- 使用 **PostgreSQL** 作为主数据库。
- 保持 shared-database multi-tenancy 显式：每一条租户拥有的数据都有 `tenantId` / `tenant_id`。
- 每个请求只解析一次 tenant context，将其存入 request/async context，并让 services 从该 context 读取，而不是信任任意 request body 字段。
- 迁移具备后，将 PostgreSQL RLS 作为 tenant-scoped tables 的首选 defense-in-depth 路径。
- tenant-scoped business code 中禁止 raw SQL，除非通过已批准的 tenant-aware helper，并有测试覆盖。
- Production config 必须禁用 schema auto-sync，并且不能暴露 development metadata endpoints。

---

## 指南索引

| 指南 | 描述 | 状态 |
|-------|-------------|--------|
| [目录结构](./directory-structure.md) | Midway package、module、controller、service、DTO、middleware、schedule 布局 | Active |
| [数据库指南](./database-guidelines.md) | PostgreSQL、ORM、tenant context、RLS、migrations 和 transactions | Active |
| [错误处理](./error-handling.md) | Domain errors、API responses、transaction failures 和 client-safe messages | Active |
| [日志指南](./logging-guidelines.md) | Midway logging、correlation fields、tenant auditability 和 sensitive-data 规则 | Active |
| [质量指南](./quality-guidelines.md) | Forbidden patterns、required review checks、tests 和 production guardrails | Active |

---

## 开发前清单

修改后端代码或 specs 前：

- [ ] 阅读此索引，以及被触及层对应的具体 guideline 文件。
- [ ] 判断代码属于 tenant-scoped、platform-only、scheduled work、webhook code 还是 infrastructure。
- [ ] 对 tenant-scoped data，确认 reads/writes 从可信 auth/context 派生 tenant context，而不是来自 request body fields。
- [ ] 对任何 cross-tenant/platform operation，记录它为什么是 platform-only，并强制显式 platform role guard。
- [ ] 如果添加 persistence，包含 migration plan 和 tenant isolation tests。
- [ ] 检查 production config 变更，确保 schema auto-sync 已禁用且 development-only metadata endpoints 已禁用。
- [ ] 如果变更触及 C-end 或 admin contracts，也阅读相关 frontend spec。

---

## 质量检查

后端 PR 的 reviewers 必须验证：

- Tenant A 不能读取、更新、删除、分页或列出 Tenant B 的数据。
- Platform cross-tenant reads 已做 role gate、audit，并且有意通过 platform services 路由。
- tenant-scoped code 未引入 raw SQL 路径。
- Scheduled jobs 和 webhooks 显式建立 tenant context，因为它们天然没有 user JWT。
- Payment、deposit、rental 和 order transitions 具备 idempotent 且受 transaction 保护。
- Production config 禁用 schema sync 和 development metadata exposure。
- Lint、typecheck 和相关 tests 通过。

---

## 语言

项目 Trellis 文档默认使用简体中文维护；只有外部或公开文档需要英文时才使用英文。代码注释应保持简短，只解释不明显的业务规则或隔离规则。
