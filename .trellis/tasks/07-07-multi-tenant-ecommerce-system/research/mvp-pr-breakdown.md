# MVP PR 拆分 - 多租户租售 SaaS

- 日期: 2026-07-08
- 当前决策: 自研 Midway.js 3.x 主后端、PostgreSQL、共享数据库加 `tenant_id`、应用层租户上下文，并在后续引入 PostgreSQL RLS。
- 取代内容: 2026-07-07 的 cool-admin v8 vendor 路线图。cool-admin 研究文件仅保留为历史参考。
- PR0 实现 commit: `bb3ca3958c4bccf86de2b7d60311cae46ebb82e0`
- Trellis 阶段拆分: 后端、C 端和 admin 的父/子任务模型见 `research/phase-task-breakdown.md`。

## 跨 PR 守护规则

1. 后端业务流程必须位于 Midway.js 后端中，不放在 Next.js API routes 或前端代码中。
2. 租户归属表必须包含 `tenant_id`；TypeScript 代码中暴露为 `tenantId`。
3. 租户上下文从可信的 auth/request 边界解析，然后由后端上下文 helper 读取。
4. 客户端请求体不得控制租户归属写入范围。
5. 租户作用域业务代码中禁止 raw SQL，除非通过已批准的 tenant-aware helper 路由并有测试覆盖。
6. 平台跨租户读写必须使用显式平台服务、角色守护和审计日志。
7. 生产配置保持 `synchronize:false` 和 `appMeta.exposeDevMetadata:false`。
8. C 端 MVP 仅微信小程序。小程序客户端不支持运行时插件加载，此项不在范围内。
9. 支付回调和定时任务没有天然的用户 JWT，必须显式建立租户上下文。
10. C 端商城模板可更换，但模板只改变布局/区块/样式配置；商品、购物车、订单、支付、售后必须走同一套共享 API、stores 和 domain composables。

## PR 总览

```text
PR0  自研 Midway 后端基础 + 租户隔离守护
  -> PR1  三端 walking skeleton
      -> PR2  CI/lint 守护 + 迁移/RLS 准备
      -> PR3  租赁 + 零售商品模型
          -> PR4  库存与租赁可用性
              -> PR5  订单与租赁状态机
                  -> PR6  支付、押金与资金台账
                      -> PR7  租赁履约
      -> PR8  扩展 Strategy demo
      -> PR9  平台运营
```

## PR0 - 自研 Midway 基础

- 状态: 已在 `bb3ca39` 实现。
- 范围:
  - 移除 cool-admin runtime/vendor 后端源码。
  - 创建 Midway.js 3.x bootstrap、配置、health/platform/consumer ping controllers。
  - 添加租户上下文 helper、租户 middleware、tenant-scoped base entity 和 PR0 query guard 骨架。
  - 添加拒绝 `@cool-midway/*` runtime dependencies 的架构守护。
  - 添加 `synchronize:false` 和 `appMeta.exposeDevMetadata:false` 的生产配置守护。
  - 将本地数据库重命名为 `rent_dev` 和 `rent_test`。
  - 更新 README、env、Cursor 和 VSCode 模板，使新代码按项目自有 Midway 风格生成。
- 验收:
  - `npm run check` 通过。
  - `packages/backend npm run build` 通过。
  - `packages/backend npm run lint` 通过。
  - 真实 PostgreSQL 租户测试使用 `rent_test`，PostgreSQL 不可用时清晰跳过。

## PR1 - 三端 Walking Skeleton

- 范围:
  - 后端: 在 `/admin/merchant/**`、`/admin/platform/**` 和 `/app/consumer/**` 后面创建真实 tenant-scoped demo resource。
  - C 端: uni-app Vue3 骨架，包含 tenant-aware 请求封装和一个 demo 页面。
  - Admin: 使用 Next.js 落地登录壳、路由壳和角色感知菜单占位。
  - 记录 C 端 storefront template registry 的边界：PR1 只保留骨架与规范，不做完整模板编辑器。
- 验收:
  - 商家上下文只能看到本租户数据。
  - 平台角色可以通过平台路由有意查看跨租户 demo 数据。
  - C 端请求携带已校验的租户上下文。
  - Admin 技术栈决策记录在 PRD 和前端 spec 中。

## PR2 - CI、Raw SQL 守护、迁移、RLS 准备

- 范围:
  - 在租户模块中添加针对 `repository.query`、`dataSource.query` 和字符串拼接 SQL 的 lint/review 守护。
  - 添加迁移骨架，并记录本地何时允许 schema auto-sync。
  - 迁移存在后，为单个租户表添加 RLS helper/prototype。
  - 保持生产守护接入根检查。
- 验收:
  - 故意放置的 raw SQL fixture 会导致 lint/check 失败。
  - 遇到 `synchronize:true` 或暴露 dev metadata 时，生产守护失败。
  - 迁移路径可以创建 demo 租户表。

## PR3 - 租赁 + 零售商品模型

- 范围:
  - Product/SKU entities，包含售卖字段和租赁字段。
  - 仅在需要灵活结构的位置使用 JSONB 保存租赁计价规则。
  - Admin 商品配置页面。
  - C 端商品列表/详情，包含租赁与购买入口。
  - C 端商品区块必须可被不同 storefront template 复用，不允许模板专属商品 API 或专属商品状态。
- 验收:
  - 同一商品可以仅售卖、仅租赁或同时支持两者。
  - 租户隔离回归覆盖商品列表/详情/更新/删除。
  - C 端可以计算预计租金。

## PR4 - 库存与租赁可用性

- 范围:
  - 零售库存数量。
  - 租赁可用性/预约模型。
  - 事务化 reserve、confirm、release 操作。
  - Admin 库存看板。
- 验收:
  - 并发售卖订单不能超卖。
  - 重叠租赁窗口会被拒绝。
  - 租户隔离适用于所有库存操作。

## PR5 - 订单与状态机

- 范围:
  - 订单主信息、订单行、售卖/租赁行类型、租赁子表和租赁事件流。
  - 为售卖交易状态和租赁履约状态建立显式状态转移表。
  - C 端结算/订单列表/订单详情。
  - C 端模板切换后，购物车和订单流程仍使用同一套 store/API；模板只能替换入口位置和视觉样式。
  - Admin 订单管理和履约动作入口。
- 验收:
  - 合法转移由参数化测试覆盖。
  - 非法转移会被拒绝。
  - 取消/退款能正确释放库存。
  - 租售混合购物车可持久化，且不会跨租户混合订单。

## PR6 - 支付、押金与资金台账

- 范围:
  - 项目自有 `PaymentChannel` Strategy 接口。
  - 先实现 mock payment channel，之后再接 WeChat/Alipay/cross-border adapters。
  - 将押金、租金和货款支付台账作为独立财务记录。
  - Provider 回调处理具备幂等性。
- 验收:
  - 重复回调不会推进两次状态。
  - 押金 freeze/unfreeze/deduct/refund 流程已测试。
  - 支付回调从可信 provider merchant identifiers 解析租户。

## PR7 - 租赁履约

- 范围:
  - 发货/出库、归还验机、续租、逾期扫描、买断和押金结算。
  - 定时任务显式遍历租户并隔离失败。
- 验收:
  - 归还损坏结算能正确更新押金台账。
  - 续租能延长可用性且不产生冲突。
  - 逾期定时扫描独立处理各租户。

## PR8 - 扩展 Strategy Demo

- 范围:
  - 演示项目自有 module/Strategy 扩展点，不依赖 cool-admin plugin runtime。
  - 候选: 支付通道 sandbox、公告模块、租赁计价 Strategy 或 storefront template/theme 配置 demo。
  - Admin 配置表面，支持按租户开启/关闭功能。
- 验收:
  - 功能可以按租户启用/禁用。
  - 扩展数据保持 tenant-scoped。
  - C 端扩展表面仅支持构建期/路由期，不做 runtime JS loading。
  - 如果选择 storefront template demo，不同模板下核心购物/下单/支付验收用例相同。

## PR9 - 平台运营

- 范围:
  - 商家入驻、资质、套餐绑定、平台概览和模拟结算/分账台账。
  - 带审计日志的平台专用跨租户服务。
- 验收:
  - 入驻会创建隔离租户和初始商家管理员。
  - 平台概览使用平台专用服务，而不是普通商家路由。
  - 结算记录能与 PR6 资金台账对账。

## Agent 映射

| Agent | PRs | 关注点 |
|---|---|---|
| backend-agent | PR0-PR9 backend slices | Midway modules、租户上下文、PostgreSQL、事务、状态机 |
| c-frontend-agent | PR1, PR3, PR5, PR6, PR7 | uni-app Vue3、租户请求封装、购物车/订单/租赁 UX |
| admin-frontend-agent | PR1, PR3, PR4, PR5, PR7, PR8, PR9 | Admin shell、商品/订单/库存/平台页面 |
| payment-agent | PR6, PR9 | Payment channel Strategy、回调、资金台账、结算 |
| reviewer-agent | every PR | Spec 合规、租户隔离、生产守护、测试覆盖 |

## PR1/PR2 前的未决决策

- ORM/迁移栈: 继续 TypeORM，还是在业务表固化前切换到 Drizzle/Prisma。
- 合规前置条件: ICP/EDI、WeChat/Alipay 服务商进件、跨境账户/数据合规。
