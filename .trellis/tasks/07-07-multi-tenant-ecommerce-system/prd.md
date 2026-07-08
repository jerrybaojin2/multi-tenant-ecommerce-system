# 多租户电商系统 (Multi-Tenant E-commerce System)

## 目标

构建一个多租户「租售结合」SaaS 平台：后端采用 **自研 Midway.js 主后端（Midway 3.x + PostgreSQL）**，自行实现租户上下文、RBAC、订单、租赁履约、资金台账、支付通道与审计能力；C 端使用 uni-app 微信小程序；B+平台 admin 使用独立 Web 管理端（Next.js 或 Vue，PR1 定版）。支持多商家入驻，同一商品既能出租也能售卖，并保证数据隔离。

## 决策（ADR-lite）

**D1 — 业务模式**：**租售结合**。商品同时承载租赁属性（押金/租期/JSONB 计费规则）与零售属性；订单支持租买混单。

**D2 — 租户形态**：**多商家入驻 SaaS**。每个租户=独立商家，自营商品/订单/资金，共享一套系统。

**D3 — 数据隔离**：**共享 PostgreSQL + tenant_id + 应用层租户上下文 + RLS 兜底**。MVP 先实现 tenant-aware data access 与隔离测试；业务表落地迁移后逐步启用 PostgreSQL RLS，避免只靠开发者手写 WHERE。

**D4 — 后端基座**：**自研 Midway.js 3.x 主后端**。不使用 cool-admin 运行时；认证、RBAC、租户上下文、审计、任务、支付通道与后台 API 由项目自建。

**D5 — 订单模型**：**1 张订单主表 + 行级类型 + 租赁子表**。`order(type)` → `order_item(type: sale/rental)` → `rental` 子表（租期/押金/归还）+ `rental_event` 事件流水。双层状态机：订单交易态（共享）+ 租赁履约态（独立）。

**D6 — 资金模型**：**资金不入 order 表，独立台账**。押金/租金/货款三类独立流水表；押金=担保物非收入，随状态机事件（paid 冻结 / returned 解冻 / overdue 扣减 / bought_out 转抵）触发台账记录。

**D7 — 前端端范围**：**C 端 MVP 仅微信小程序**（H5 二期、App 暂不进，不为多端提前抽象）；admin 双品牌（商家后台 + 平台运营后台）。

**D8 — 支付方案（境内 + 境外多通道）**：按**实际可生产规则**双轨接入。
- **境内**：微信（服务商分账，每商家=sub_mchid，消除二清）+ 支付宝（分账）
- **境外**：连连支付 LianLian / PingPong（跨境收单 或 收款/结汇，视场景）
- **统一抽象**：`PaymentChannel` Strategy/适配器，订单按业务或用户区域路由；通道配置按租户管理
- **押金托管**：强制境内路由；`businessType=DEPOSIT` 时路由层拒绝境外通道（押金走微信预付费/支付宝预授权）
- 回调按通道商户标识反查 tenant
- ⚠️ **支付宝 MVP 限制**：支付宝无法在微信小程序内拉起 → MVP C 端仅微信支付；支付宝通道先做接口+沙箱，PC/H5/支付宝小程序端上线时启用
- **境外场景 = 跨境收款/结汇（场景 B，已确认）**：商家做跨境电商，境外销售款经连连/PingPong 收款结汇到商家账户

**D9 — C 端用户身份**：**每租户独立 + 预留全局**。每个商家小程序有独立 `tenant_user`（带 `tenant_id`）；表预留 `union_id` 字段，未来可升级为跨商家全局用户统一。MVP 不做跨商家识别。

**D10 — 仓库结构**：**单仓 monorepo（pnpm workspace）**。根目录 `packages/{backend, app-c, admin}`：backend=自研 Midway.js 主后端、app-c=uni-app Vue3 C 端、admin=独立管理端（Next.js/Vue 待 PR1 定版）。统一依赖/CI/脚本/版本。

## 技术方案

- **后端**：自研 Midway.js 3.x + PostgreSQL
  - 租户上下文：JWT/请求头解析 tenant → Midway middleware/guard → `tenant-context` helper → tenant-aware repository/client
  - 平台运营：通过显式 platform role guard 进入跨租户服务，所有跨租户操作审计记录
  - API 路由：`/admin/merchant/**`（B 商家）、`/admin/platform/**`（平台运营）、`/app/consumer/**`（C 端，独立 app token 流）、`/open/**`（支付/开放回调）
  - 扩展机制：不做 cool-admin 插件运行时；以领域模块 + Strategy 扩展点替代
- **数据库**：PostgreSQL；所有 tenant-owned 表含 `tenant_id`；RLS 作为防线；生产禁 schema auto-sync
- **支付（多通道 D8）**：境内微信服务商分账 + 支付宝；境外连连/PingPong；PaymentChannel Strategy 统一抽象、按区域/业务路由；押金强制境内通道
- **C 端**：uni-app Vue3 + Vite + TS + wot-design-uni + Pinia；每商家独立小程序 AppID + `VITE_TENANT_ID` + 请求头 `X-Tenant-Id`；购物车 `Record<tenantId, CartItem[]>` 分桶；租/买双入口 Tab
- **Admin**：独立管理端（Next.js 或 Vue，PR1 定版）；商家后台 + 平台后台共用权限模型，菜单/权限后端驱动

## 关键约束与风险（必须遵守）

- ⚠️ **租户上下文不可相信客户端字段**：C 端 `X-Tenant-Id` 必须与 app token / 小程序 AppID / 商家配置校验后才能进入 tenant context。
- ⚠️ **原生 SQL 绕过租户过滤** → 静默跨租户泄漏。PR2 必须用 lint/审查规则拦截 raw query；RLS 作为 DB 兜底。
- ⚠️ **生产关闭 schema auto-sync 与开发元数据/调试端点**。
- ⚠️ **C 端微信小程序无运行时热插**（微信禁运行时下载 JS）→ C 端扩展只能 uni 分包 + 构建期纳入。
- ⚠️ **支付合规**：平台 ICP/EDI、微信/支付宝服务商进件、跨境收款开户与数据出境合规属 P0/P1 blocker。

## 研究已完成

- [`research/payment-funds.md`](research/payment-funds.md) — 境内微信：服务商分账+预付费押金；二清合规；回调反查 tenant
- [`research/payment-cross-border.md`](research/payment-cross-border.md) — 多通道 Strategy 抽象；境内支付宝；境外默认收款/结汇；押金强制境内路由
- [`research/fulfillment-order-fsm.md`](research/fulfillment-order-fsm.md) — 订单主表+行级类型+租赁子表；双层状态机；资金独立台账
- [`research/mvp-pr-breakdown.md`](research/mvp-pr-breakdown.md) — 10 个 PR 序列 + agent 映射 + 并行波次
- [`research/frontend-cross-platform.md`](research/frontend-cross-platform.md) — C 端仅 MP；admin 双品牌；前端租户上下文约束
- [`research/frontend-uni-stack.md`](research/frontend-uni-stack.md) — uni Vue3+wot-design-uni；避雷 uv-ui
- [`research/backend-framework.md`](research/backend-framework.md) / [`research/backend-orm-db.md`](research/backend-orm-db.md) — 历史选型研究；当前确认自研 Midway.js 主后端，并保留 PostgreSQL/RLS 的安全结论
- [`research/cool-admin-multi-tenant.md`](research/cool-admin-multi-tenant.md) / [`research/plugin-architecture.md`](research/plugin-architecture.md) — 历史参考，不再作为目标架构

## 未决问题

- PR1 前定版 admin 技术栈：Next.js 还是 Vue。
- PR1/PR2 前定版 ORM/迁移方案：继续 TypeORM，还是切 Drizzle/Prisma。当前 PR0 仅保留 TypeORM subscriber 骨架用于隔离验证。
- ⚠️ **合规 P0 blocker**：平台 ICP/EDI 资质 + 微信/支付宝服务商进件；**P1**：跨境收款开户 + 企业对公结汇 + 数据出境合规。

> 🔁 架构调整（2026-07-08）：用户确认 **使用 Midway.js 做主后端，不使用 cool-admin v8**。PR0 从 vendor cool-admin 改为自研 Midway.js 基座：租户上下文、RBAC、数据访问、支付通道、审计、任务调度由项目自建。

## MVP PR 序列

风险优先 + walking skeleton 先行，纵向切片：

| PR | 标题 | 模块 | agent |
|---|---|---|---|
| PR0 | 自研 Midway 基座 + 多租户隔离验证 + spec 更新 | infra/multi-tenant | backend |
| PR1 | 三端 walking skeleton（假数据端到端） | 全端 | backend+c+admin |
| PR2 | Lint/CI 守护（原生 SQL 拦截 + prod 配置检查 + RLS 准备） | infra | backend |
| PR3 | 租售商品模型（JSONB 计费规则） | backend+admin | backend |
| PR4 | 库存（零售现货 + 租赁档期/数量，重叠排他） | backend | backend |
| PR5 | 订单双状态机（零售 + 租赁）★核心最长 | backend+c | backend |
| PR6 | 支付/押金（资金独立核算 + 模拟支付通道） | backend | backend |
| PR7 | 租赁履约（归还/续租/逾期，定时任务遍历租户） | backend+c | backend |
| PR8 | 扩展机制 demo（Strategy/Feature module） | backend+admin | backend |
| PR9 | 平台运营（商家入驻/套餐/分账） | backend+admin | backend |

并行波次：A 串行骨架(PR0-2) → B/C 三路并行(PR3/4) → 后续按依赖。

## 需求（持续演进）

- 后端自研 Midway.js 3.x；前端 uni-app Vue3（C 端）+ 独立管理端（B/平台端）
- 多租户多商家入驻，共享 PostgreSQL + tenant_id + tenant context + RLS 兜底
- 租售结合（订单主表+行级类型+租赁子表）
- 扩展机制采用项目内模块化 + Strategy，不复用 cool-admin 插件运行时
- **MVP = 租售并行完整**，C 端仅微信小程序
- 消息通知：MVP 用微信小程序订阅消息（支付成功 / 发货 / 租赁到期）

## 验收标准（持续演进）

- [ ] 多租户隔离经自动化测试验证（A 租户绝不可访问 B 租户数据）
- [ ] 原生 SQL 绕过被 lint/审查规则拦截
- [ ] 平台账号跨租户可见，商家账号严格限本租户
- [ ] 同一商品支持"租"与"买"，购物车可租买混单
- [ ] 租赁流程（押金冻结/租期/归还/续租/逾期/买断）+ 零售流程（发货/自提/收货）可用
- [ ] 资金三类（押金/租金/货款）独立台账，押金随状态机事件联动
- [ ] 支付通道/业务扩展可通过模块化 Strategy 接入，后台可配置启停
- [ ] 生产环境 schema auto-sync 与开发元数据/调试端点已关闭

## 完成定义

- 测试覆盖核心域（租售订单双状态机、押金资金台账、租户隔离、支付通道）
- Lint / typecheck / 构建通过；CI 锁关键风险
- 多租户隔离 + 支付/扩展 Strategy 有自动化测试守护
- spec 文档更新

## MVP 范围外

- H5 / App 端（二期）
- 第三方聚合支付
- 营销（优惠券/拼团/分销）——按需后置
- 租赁损坏赔偿独立理赔工单（MVP 简化为：逾期/损坏 → 从押金扣款）
- 跨商家全局用户识别（D9 预留字段，MVP 不实现）
- PostgreSQL RLS 全量上线（PR2 准备，业务表落地后逐步开启）

## 技术备注

- greenfield 仓库；项目名 miniAppRentPlatfrom（小程序租赁平台）
- Midway.js 文档：https://midwayjs.org/
- Admin 技术栈待 PR1 定版：Next.js 或 Vue 管理端
