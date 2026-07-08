# 质量指南

> 后端开发的代码质量标准。

---

## 概览

后端质量主要关乎租户隔离、资金正确性，以及让自建 Midway.js 架构足够简单、易于维护。优先使用显式、朴素的 services 和 guards，而不是框架魔法。

---

## 禁止模式

- 把 Next.js/API routes 当作核心业务 workflows 的主后端。
- tenant-scoped tables 缺少 `tenant_id`。
- Request body 或 query parameters 直接控制租户拥有数据的 write scope。
- 在 request-scoped services 中直接使用 global DB client。
- tenant-scoped code 中使用 Raw SQL：`query`、字符串拼接 SQL，或在已批准 infrastructure 之外使用 ORM raw helpers。
- 没有 platform role guard 和 audit logging 的 cross-tenant reads/writes。
- Production schema auto-sync。
- Development metadata、docs 或 debug endpoints 暴露在 production。
- Controllers 包含 payment、funds、rental 或 inventory business logic。
- Payment/funds state changes 不在 transactions 中，或没有 idempotency keys。
- Scheduled jobs 处理 tenant data 时没有显式 tenant iteration/context。
- 记录 secrets、certificates、raw provider payloads 或完整 personal data。

---

## 必需模式

- 主后端使用 Midway.js 3.x modules/controllers/services/middleware。
- Platform/merchant admin APIs 使用 `/admin/**`，C-end APIs 使用 `/app/consumer/**`。
- 每个请求只解析一次 tenant context，并从中心化 tenant-context helper 读取它。
- 对 tenant-owned rows 使用 tenant-aware data-access helpers。
- 一旦 migrations 到位，为 tenant-owned tables 添加 PostgreSQL RLS policies。
- 将 platform-only operations 隔离在 platform services 中，并清晰标记。
- 对 order、rental、payment、deposit、settlement、inventory 和 callback workflows 使用 transactions。
- 对 provider callbacks、state transitions 和 ledger writes 使用 idempotency keys。
- 对 status/state transitions 使用 enums/constants，并集中 transition guards。
- 使用 Midway logger，并包含 tenant 和 domain identifiers。

---

## 测试要求

PR0 及之后的后端 PR 应添加或保留以下测试：

- Tenant isolation：Tenant A 不能 list/info/update/delete Tenant B records。
- Platform bypass：platform role 可以有意执行 cross-tenant reads；merchant roles 不可以。
- Raw SQL guard：lint/review tooling 拒绝 tenant modules 中的 raw query usage。
- Production config guard：schema auto-sync 已禁用，development metadata 已在 production 禁用。
- Order/rental state machine transitions 和 invalid transition rejection。
- Payment callback idempotency，以及从 provider merchant identifiers 解析 tenant。
- Deposit ledger side effects：freeze、unfreeze、deduct、refund 和 bought-out transfer。
- Scheduled overdue scan 独立处理 tenants。
- migration support 存在后，RLS policies 默认拒绝越权访问。

如果 PR0 暂时无法实现 automated coverage，记录 manual verification，并按计划在 PR2 添加 automated check。

---

## 代码评审清单

- [ ] Backend package 直接依赖 Midway.js，不依赖 cool-admin runtime packages。
- [ ] 每个新的 tenant-scoped table 都包含 `tenant_id`。
- [ ] tenant-scoped code 不使用 raw SQL 或字符串拼接 queries。
- [ ] 任何 platform-scope usage 都有 role gate、log 和 test。
- [ ] Webhooks 和 scheduled jobs 显式建立 tenant context。
- [ ] Production config 禁用 schema sync 和 development metadata exposure。
- [ ] Order/rental/funds changes 受 transaction 保护且 idempotent。
- [ ] Payment code 存储 provider ids，并把 provider errors 映射为 client-safe errors。
- [ ] Logs 包含有用 identifiers，且不包含 secrets 或 PII。

---

## 需要预防的常见错误

- 假设 middleware guard 会自动保护 raw database access。
- 让 C-end headers 无验证地选择任意 tenant ids。
- 把 deposits 当作 order revenue，而不是独立 funds ledger entries。
- 混用 platform-global provider config 与 tenant-specific payment credentials。
- 让一个 tenant failure 中止所有 scheduled job processing。
