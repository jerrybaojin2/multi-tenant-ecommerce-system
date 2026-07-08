# 阶段任务拆分 - 三端交付

- 日期: 2026-07-08
- 父任务: `multi-tenant-ecommerce-system`
- 目的: 将当前 Trellis 计划拆成分阶段工作，对齐三个交付端：后端、C 端小程序和 admin。

## 任务模型

保留 `multi-tenant-ecommerce-system` 作为父级项目任务。只有当某个阶段准备进入实现时，才按阶段创建子任务。每个阶段内部分别跟踪后端、C 端、admin 和横切验收项。

推荐层级：

```text
multi-tenant-ecommerce-system
  phase-00-foundation
  phase-01-three-surface-skeleton
  phase-02-product-inventory
  phase-03-order-rental-transaction
  phase-04-payment-fulfillment
  phase-05-platform-ops-hardening
```

这样可以避免提前创建大量空置任务，同时仍然让归属边界清晰。

## 阶段 00 - 基础

- 状态: 基本完成。
- 对应: PR0 加 PR1 后端 demo resource 切片。
- 后端:
  - 自研 Midway.js 后端。
  - PostgreSQL Docker 环境。
  - 租户上下文、基础租户实体、demo resource 服务和运行时启动路径。
  - 架构守护与生产配置守护。
- C 端:
  - 包已存在，但还没有真实请求封装。
- Admin:
  - 包已存在，技术栈决策仍未定。
- 横切:
  - Trellis 后端 spec 已更新。
  - 根检查和真实 PostgreSQL 租户测试通过。

## 阶段 01 - 三端骨架

- 状态: 下一个活跃阶段。
- 对应: PR1。
- 后端:
  - 保留 `/admin/merchant/demo-resources`、`/admin/platform/demo-resources` 和 `/app/consumer/demo-resources` 作为第一个 walking resource。
  - PR2 开始时补充迁移路径，或记录本地 schema 设置方式。
- C 端:
  - 构建 uni-app Vue3 请求封装。
  - 添加一个调用 `/app/consumer/demo-resources` 的 demo 页面。
  - 确认租户 header/auth 边界。
- Admin:
  - 决定 admin 技术栈：Next.js 或 Vue。
  - 添加登录壳、路由壳和角色感知菜单占位。
  - 添加商家 demo resource 页面和平台 demo resource 页面。
- 横切验收:
  - Tenant A 商家只能看到 Tenant A 的 demo resources。
  - Tenant B C 端不能看到 Tenant A 的 resources。
  - 平台路由有意列出跨租户数据。
  - Admin 技术栈决策已记录到 PRD 和前端 spec。

## 阶段 02 - 商品与库存

- 状态: 骨架后待办。
- 对应: PR3 和 PR4。
- 后端:
  - 商品、SKU、租赁计价、零售库存、租赁可用性和预约 API。
  - 商品与库存 CRUD 的租户隔离测试。
- C 端:
  - 商品列表/详情。
  - 购买/租赁入口。
  - 预计租金展示。
- Admin:
  - 商品管理。
  - 库存与租赁可用性看板。
- 横切验收:
  - 商品可以仅售卖、仅租赁或同时支持两者。
  - 并发售卖和租赁可用性规则已测试。

## 阶段 03 - 订单与租赁交易

- 状态: 待办。
- 对应: PR5。
- 后端:
  - 订单主信息、订单行、售卖/租赁行类型、租赁子表和状态转移。
  - 创建/取消/退款时的库存预约与释放。
- C 端:
  - 购物车、结算、订单列表和订单详情。
- Admin:
  - 订单管理壳。
  - 履约动作占位。
- 横切验收:
  - 合法状态转移通过参数化测试。
  - 非法状态转移失败且无副作用。
  - 租售混合购物车保持租户隔离。

## 阶段 04 - 支付与履约

- 状态: 待办。
- 对应: PR6 和 PR7。
- 后端:
  - 支付通道 Strategy 接口。
  - 先实现模拟支付，后续再接 provider adapters。
  - 押金、租金、货款支付台账，以及归还验机、续租、逾期、买断和结算。
- C 端:
  - 支付结果、押金状态、租赁履约状态、续租/归还/买断入口。
- Admin:
  - 履约运营。
  - 押金与结算可见性。
- 横切验收:
  - 支付回调具备幂等性。
  - 押金流程与订单收入分离。
  - 定时任务显式遍历租户。

## 阶段 05 - 平台运营与加固

- 状态: 待办。
- 对应: PR2、PR8 和 PR9。如果 raw SQL/迁移/RLS 守护成为阻塞点，PR2 可以更早启动。
- 后端:
  - CI/raw SQL 守护、迁移、RLS 准备。
  - 商家入驻、套餐绑定、审计日志和平台专用服务。
  - 项目自有扩展 Strategy demo。
- C 端:
  - 用户可见的租户/商家套餐效果。
  - 仅支持构建期或路由期扩展表面。
- Admin:
  - 平台运营控制台。
  - 商家入驻和套餐管理。
  - 扩展开启/关闭配置。
- 横切验收:
  - 平台服务有角色守护并记录审计。
  - 普通商家路由不能访问跨租户操作。
  - 迁移和生产守护纳入根检查。

## 子任务创建规则

当某个阶段准备执行且验收标准清晰时，再创建 Trellis 子任务。建议首批子任务：

1. `phase-01-app-c-skeleton`
2. `phase-01-admin-shell`
3. `phase-02-product-inventory-backend`

不要立即拆分所有未来阶段。在范围稳定到足以实现之前，将未来阶段保留在这份路线图中。
