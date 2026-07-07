# 多租户电商系统 (Multi-Tenant E-commerce System)

## Goal

构建一个多租户「租售结合」SaaS 平台：后端基于 **cool-admin v8+（Node/Midway + TypeORM + PostgreSQL）**，复用其内置多租户与插件机制；C 端 uni-app 微信小程序、B+平台 admin 用 cool-admin-vue 双品牌。支持多商家入驻，同一商品既能出租也能售卖，数据隔离。

## Decision (ADR-lite)

**D1 — 业务模式**：**租售结合**。商品同时承载租赁属性（押金/租期/JSONB 计费规则）与零售属性；订单支持租买混单。

**D2 — 租户形态**：**多商家入驻 SaaS**。每个租户=独立商家，自营商品/订单/资金，共享一套系统。

**D3 — 数据隔离**：**共享数据库 + tenant_id 逻辑隔离**（cool-admin v8 内置 TypeORM Subscriber）。MVP 以应用层过滤为主，RLS 降为可选加固（与连接池 GUC 冲突）。

**D4 — 后端基座**：**cool-admin v8.0.0+（Midway 3.x + TypeORM）**，多租户与插件开箱即用。

**D5 — 订单模型**：**1 张订单主表 + 行级类型 + 租赁子表**。`order(type)` → `order_item(type: sale/rental)` → `rental` 子表（租期/押金/归还）+ `rental_event` 事件流水。理由：支持租买混单、主流程统一、避免拆双表的 UNION 分页/Subscriber 漏过滤。双层状态机：订单交易态（共享）+ 租赁履约态（独立）。

**D6 — 资金模型**：**资金不入 order 表，独立台账**。押金/租金/货款三类独立流水表；押金=担保物非收入，随状态机事件（paid 冻结 / returned 解冻 / overdue 扣减 / bought_out 转抵）触发，DepositService 订阅 EventBus 记账。

**D7 — 前端端范围**：**C 端 MVP 仅微信小程序**（H5 二期、App 暂不进，不为多端提前抽象）；admin 双品牌（商家后台 + 平台运营后台）。

**D8 — 支付方案**：**微信服务商分账（收付通降级）**。平台暂无收付通所需 ICP/EDI 资质，降级到普通服务商分账；仍是微信分账、合规；API 与收付通一致，未来取得资质后迁移成本低。押金走预付费托管；封装为 cool-admin 插件；回调从 sub_mchid 反查 tenant。

## Technical Approach

- **后端**：cool-admin v8.0.0+（Midway 3.x + TypeORM + PostgreSQL）
  - 多租户：`BaseEntity.tenantId` + JWT tenantId 声明 + TypeORM Subscriber（afterSelect/Insert/Update/Delete）；admin 超管 + 白名单 URL 绕过 = 平台运营特权
  - 三端（单服务）：`controller/admin/**`（B 商家 + 平台运营，角色+tenantId 区分）+ `controller/app/consumer/**`（C 端，独立 /app token 流）
  - 插件：cool-admin 平台级插件；插件表须继承 BaseEntity 才有 tenant_id
- **支付**：**微信服务商分账（D8）**；封装为 cool-admin 插件；每商家=sub_mchid；回调从 sub_mchid 反查 tenant；押金预付费托管
- **C 端**：uni-app Vue3 + Vite + TS + wot-design-uni + Pinia；每商家独立小程序 AppID + `VITE_TENANT_ID` + 请求头 `X-Tenant-Id`；购物车 `Record<tenantId, CartItem[]>` 分桶；租/买双入口 Tab
- **Admin**：cool-admin-vue（Vue 3.5，**注意仓库是 cool-admin-vue 非 cool-admin-vue3**）；`vite build --mode platform|merchant` + `VITE_BRAND` 双品牌；菜单/权限后端驱动

## 关键约束与风险（必须遵守）

- ⚠️ **版本**：必须 v8.0.0+（GitHub master 是 v4.x 无多租户）。取 v8，构建前验证 `src/modules/base/db/tenant.ts`。
- ⚠️ **原生 SQL 绕过租户过滤**（nativeQuery/sqlRenderPage）→ 静默跨租户泄漏。ESLint/审查规则拦截；插件安装时审计。
- ⚠️ **生产关闭** `synchronize:true`、`cool.eps:true`（核对不影响前端构建期 eps 注入）。
- ⚠️ **C 端微信小程序无运行时热插**（微信禁运行时下载 JS）→ C 端插件只能 uni 分包 + 构建期纳入，商家开启 C 端功能需重新构建发版。
- ⚠️ **admin 路由 glob 未覆盖 plugins**（`src/cool/router/index.ts:19` 只扫 `modules/*`）→ 须扩到 `plugins/*`，否则插件菜单 viewPath 404。
- ⚠️ **请求拦截器默认无 `X-Tenant-Id`**（`src/cool/service/request.ts`）→ 两端自行加。
- ❓ **cool-admin v8 是否内置 EventBus 未确认**（DepositService 资金联动依赖）→ PR0/PR1 期间核实，否则用 Midway 自带事件能力兜底。
- ❓ **平台电商资质（ICP/EDI）**：决定支付走收付通还是降级分账（见 D8）。

## What I already know

- 仓库现状：**greenfield**，根目录仅 `.claude/`、`.opencode/`、`.trellis/`、`AGENTS.md`，无业务代码
- `.trellis/spec/`（backend / frontend 指南）为空脚手架，需在 `00-bootstrap-guidelines` 任务中填充（PR0 顺带做）

## Research 已完成

- [`research/cool-admin-multi-tenant.md`](research/cool-admin-multi-tenant.md) — ✅ GO：v8 内置多租户、TypeORM、PG 可选 RLS、三端组织、三大坑
- [`research/payment-funds.md`](research/payment-funds.md) — 支付推荐收付通+预付费押金；备选服务商分账；二清合规；回调反查 tenant
- [`research/fulfillment-order-fsm.md`](research/fulfillment-order-fsm.md) — 订单主表+行级类型+租赁子表；双层状态机；资金独立台账
- [`research/mvp-pr-breakdown.md`](research/mvp-pr-breakdown.md) — 10 个 PR 序列 + agent 映射 + 并行波次
- [`research/frontend-cross-platform.md`](research/frontend-cross-platform.md) — C 端仅 MP；admin 双品牌；5 个前端坑；仓库名更正
- [`research/plugin-architecture.md`](research/plugin-architecture.md) — 插件映射 Midway；多租户底线；C 端热插限制
- [`research/frontend-uni-stack.md`](research/frontend-uni-stack.md) — uni Vue3+wot-design-uni；避雷 uv-ui
- [`research/backend-framework.md`](research/backend-framework.md) / [`research/backend-orm-db.md`](research/backend-orm-db.md) — NestJS+Drizzle 方案**已搁置**（D4 改用 cool-admin）

## Open Questions

- 待 PR0/PR1 核实：cool-admin v8 内置 EventBus？（资金联动 DepositService 依赖；否则用 Midway 自带事件兜底）

> ✅ blocking 已全部收敛（D1–D8 + MVP 范围 + PR 拆解）。

## MVP PR 序列（来自 research/mvp-pr-breakdown.md）

风险优先 + walking skeleton 先行，纵向切片：

| PR | 标题 | 模块 | agent |
|---|---|---|---|
| PR0 | 基座接入 + 多租户隔离验证 + spec 填充 | infra/multi-tenant | backend |
| PR1 | 三端 walking skeleton（假数据端到端） | 全端 | backend+c+admin |
| PR2 | Lint/CI 守护（原生 SQL 拦截 + synchronize/eps 关闭检查） | infra | backend |
| PR3 | 租售商品模型（JSONB 计费规则） | backend+admin | backend |
| PR4 | 库存（零售现货 + 租赁档期/数量，重叠排他） | backend | backend |
| PR5 | 订单双状态机（零售 + 租赁）★核心最长 | backend+c | backend |
| PR6 | 支付/押金（资金独立核算 + 模拟支付插件） | backend+plugin | backend |
| PR7 | 租赁履约（归还/续租/逾期，定时任务遍历租户） | backend+c | backend |
| PR8 | 插件机制 demo（.cool 包独立开发/热安装） | plugin+admin | plugin |
| PR9 | 平台运营（商家入驻/套餐/分账） | backend+admin | backend |

并行波次：A 串行骨架(PR0-2) → B/C 三路并行(PR3/4) → 后续按依赖。**backend-agent 是瓶颈（9 PR），建议 2 人**；c/admin/plugin 各 1 人。

## Requirements (evolving)

- 后端 cool-admin v8+；前端 uni-app Vue3（C 端）+ cool-admin-vue（B/平台端）
- 多租户多商家入驻，共享库 + tenant_id（内置）
- 租售结合（订单主表+行级类型+租赁子表）
- 插件系统复用 cool-admin
- **MVP = 租售并行完整**，C 端仅微信小程序

## Acceptance Criteria (evolving)

- [ ] 多租户隔离经自动化测试验证（A 租户绝不可访问 B 租户数据）
- [ ] 原生 SQL 绕过被 lint/审查规则拦截
- [ ] 平台账号跨租户可见，商家账号严格限本租户
- [ ] 同一商品支持"租"与"买"，购物车可租买混单
- [ ] 租赁流程（押金冻结/租期/归还/续租/逾期/买断）+ 零售流程（发货/自提/收货）可用
- [ ] 资金三类（押金/租金/货款）独立台账，押金随状态机事件联动
- [ ] 插件可独立开发、打包，后台免改代码安装/卸载/配置
- [ ] 生产环境 synchronize 与 cool.eps 已关闭

## Definition of Done

- 测试覆盖核心域（租售订单双状态机、押金资金台账、租户隔离、插件加载/卸载）
- Lint / typecheck / 构建通过；CI 锁三大坑
- 多租户隔离 + 插件热插拔有自动化测试守护
- spec 文档更新

## Out of Scope (MVP)

- H5 / App 端（二期）
- 第三方聚合支付
- 复杂营销（拼团/分销）——按需后置
- PostgreSQL RLS（可选加固，非 MVP 必须）

## Technical Notes

- greenfield 仓库；项目名 miniAppRentPlatfrom（小程序租赁平台）
- cool-admin 文档：https://node.cool-admin.com/src/guide/ ；多租户页 `/src/guide/core/tenant.html`
- admin 仓库：`cool-team-official/cool-admin-vue`（8.x 分支，Vue 3.5）
