# backend/ (root) — pure-logic tenant isolation simulator

> ⚠️ 这**不是**真实的 cool-admin 后端。真实 vendored v8 后端在
> [`../packages/backend/`](../packages/backend/)。

本目录是 PR0 早期骨架，仅保留**纯 JavaScript 多租户隔离逻辑模拟器**，
作为 `tests/tenant-isolation.test.mjs` 的被测对象（业务隔离语义回归，
永远跑、无依赖、CI 必跑）。

- `tenant/isolation-simulator.mjs` — `TenantScopedStore`，模拟 v8
  `TenantSubscriber` 的隔离语义（list/get/create/update/delete + platform 逃逸）。
  用于在没有 PG 的环境下也能守护隔离逻辑。
- `config/config.default.example.ts` / `config.prod.example.ts` — 早期配置示例，
  现已被 `packages/backend/src/config/config.{local,prod}.ts` 取代（保留作为
  prod-config 守卫的 fallback 路径之一）。

真实 PG + TypeORM + v8 TenantSubscriber 的隔离测试在
[`../tests/real-tenant.test.mjs`](../tests/real-tenant.test.mjs)。
