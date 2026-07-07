# MVP PR 拆解 — 多租户「租售结合」SaaS 电商

- **Scope**: 把 MVP（租售并行完整）拆解为模块化 PR 序列，风险优先、walking skeleton 先行
- **Date**: 2026-07-07
- **基线**: PRD（D1 租售结合 / D2 多商家入驻 / D3 共享库+tenant_id / D4 cool-admin v8）+ 5 份 research
- **关键约束（贯穿全部 PR，不在每个 PR 重复）**:
  1. **必须 cool-admin v8.0.0+**（GitHub master 是 v4 无多租户，不可 clone master）
  2. 业务实体必须 `extends BaseEntity`（继承 `tenantId` 列）才自动租户隔离
  3. **禁用原生 SQL**（`nativeQuery`/`sqlRenderPage` 绕过 Subscriber）→ ESLint 规则拦截
  4. 生产 `synchronize:false`、`cool.eps:false`
  5. C 端微信小程序无运行时热插 → C 端插件只能 uni 分包 + 构建期纳入；热插只面向 admin/B 端
  6. 三端组织：`controller/admin/**`（B+平台，靠角色+tenantId）+ `controller/app/consumer/**`（C 端，独立 `/app` token）

---

## 0. 拆解原则

- **风险优先**：PR0 先把最高风险（多租户数据隔离 + 版本正确性）用自动化测试锁死，再动业务。隔离机制若在 PR0 没被测试守护，后面每个业务 PR 都在裸奔。
- **Walking skeleton 先行**：PR1 打通「C 端下单 → B 端看到 → 平台跨租户可见」的最薄端到端链路（哪怕商品是假数据），让后续模块有集成靶子。
- **纵向切片**：每个业务 PR 跨 backend+c-frontend+admin-frontend 三端一起交付一个可演示能力，而非「先把所有后端做完」。
- **串行依赖最小化**：标出可并行的 PR，为 TeamCreate 组队并行开发铺路。
- **每 PR 必带测试**：业务逻辑 PR 必须带状态机/资金流单测；多租户相关 PR 必须带隔离回归测试。

---

## 1. PR 总览（甘特依赖视图）

```
PR0 基座+多租户隔离(walking skeleton 后端)
 ├─→ PR1 三端 walking skeleton(假数据端到端)              [可与 PR2 部分并行]
 │     ├─→ PR3 租售商品模型(C+admin+后端)
 │     │     └─→ PR4 库存(零售现货 + 租赁档期/数量)
 │     │           └─→ PR5 订单(零售 + 租赁状态机)        [核心，最长]
 │     │                 ├─→ PR6 支付/押金(资金流独立)
 │     │                 │     └─→ PR7 租赁履约(归还/续租/逾期)
 │     │                 └─→ PR8 插件机制 demo
 │     └─→ PR2 lint/CI 守护(原生SQL拦截 + synchronize/eps 关闭检查)
 └─→ PR9 平台运营(商家入驻/套餐/分账)                      [依赖 PR6 资金流]
```

**串行硬依赖链**：PR0 → PR1 → PR3 → PR4 → PR5 → PR6 → PR7；PR9 需 PR6。
**可并行**：PR2 与 PR1/PR3 并行；PR8 与 PR5/PR6 并行（不碰核心交易表）；PR9 的「入驻/套餐」子模块可与 PR5 并行，「分账」须等 PR6。

---

## 2. 逐 PR 详情

---

### PR0 — 仓库初始化 + cool-admin v8 接入 + 多租户隔离验证 + spec 填充

- **所属模块**：infra + multi-tenant
- **依赖前置 PR**：无（起点）
- **范围**:
  - greenfield 仓库接入 cool-admin v8.0.0+（**显式取 v8 release/zip，验证非 master**）
  - 验证关键文件存在：`src/modules/base/db/tenant.ts`、`BaseEntity.tenantId` 列、`@midwayjs/core` 3.x/4.x
  - 配置 PostgreSQL（`type:"postgres"`）+ 开发期 `synchronize:true`（仅 dev），prod config 占位关
  - 开启多租户：`cool.tenant.enable=true`、`urls:['/admin/**/*']`，`/app/**` 单独 token 流
  - 填充 `.trellis/spec/`（backend 指南：实体必须 extends BaseEntity / 禁原生 SQL / prod 配置；frontend 指南：uni+wot / tenant header / cart 分桶）
  - **多租户隔离自动化测试**（核心交付物，守护后续一切）：
    - 建两个租户 T1/T2 + 各自用户 + 各自一条业务数据（如临时 demo_goods）
    - 用 T1 token 查询，断言只见 T1 数据；构造 T1「越权读 T2 id」断言返回空/notfound
    - 断言 `admin` 超管 + 白名单 URL 能跨租户（平台运营特权）
    - 断言普通 `Repository.find()`/`createQueryBuilder()` 自动带 tenantId（覆盖 Subscriber 注入面）
- **关键验收点**:
  - [ ] `package.json` 的 `@midwayjs/core` ≥ 3.x，`tenant.ts` 文件存在
  - [ ] 隔离测试在 CI 绿：A 租户绝不可访问 B 租户数据（读/写/改/删四向）
  - [ ] 平台超管跨租户可见
  - [ ] `.trellis/spec/backend.md` + `frontend.md` 非空且包含三大约束
- **适合 agent**：backend-agent（spec 部分可与 c-frontend-agent 协作）
- **并行性**：阻塞一切，必须最先完成

---

### PR1 — 三端 Walking Skeleton（假数据端到端）

- **所属模块**：backend + c-frontend + admin-frontend
- **依赖前置 PR**：PR0
- **范围**: 打通最薄端到端链路，证明三端 token 流 + 租户隔离 + 基本联通：
  - 后端：建一个 demo 实体（extends BaseEntity，如 `notice`），分别在 `controller/admin/**`（B/平台）和 `controller/app/consumer/**`（C 端）暴露 list
  - admin-frontend（cool-admin-vue3）：双品牌构建配置占位（merchant / platform），登录后菜单按角色区分
  - c-frontend（uni-app Vue3 + wot-design-uni）：脚手架 + `X-Tenant-Id` 拦截器 + tenantStore（编译期 `VITE_TENANT_ID` 注入，只读）+ 一个页面调 `/app/consumer/**` 列表
  - 验证：C 端带 T1 请求只拿 T1 数据；B 端登录拿自己租户数据；平台超管拿全部
- **关键验收点**:
  - [ ] C 端小程序能登录（/app token 流）、带 tenant header、拿到隔离数据
  - [ ] B 端与平台端同一 admin 仓库、不同构建/不同菜单
  - [ ] cart store 已按 tenantId 分桶的骨架就位（即使本 PR 暂无购物车）
- **适合 agent**：backend-agent + c-frontend-agent + admin-frontend-agent（三端可同步开工，约定好 demo 实体契约后并行）
- **并行性**：PR0 后立即开始；与 PR2 可并行

---

### PR2 — Lint / CI 守护（原生 SQL 拦截 + 生产配置检查）

- **所属模块**：infra + multi-tenant
- **依赖前置 PR**：PR0
- **范围**: 把「三大坑」用机器规则锁死，而非靠人记：
  - ESLint 自定义规则：禁用 `nativeQuery` / `sqlRenderPage` 裸调用，强制走 `BaseService` 受控路径或显式 `noTenant()` 包裹（带 review 注释）
  - ESLint 规则：业务实体类必须 `extends BaseEntity`（否则漏 tenantId 列）
  - CI 检查：prod config 必须 `synchronize:false` + `cool.eps:false`（断言配置值）
  - CI 检查：`@midwayjs/core` 版本 ≥ 阈值（防止误降级到 master v4）
  - 预提交 hook 跑 PR0 的隔离回归测试
- **关键验收点**:
  - [ ] 一段故意写 `nativeQuery('select * from xxx')` 的代码被 lint 拦截
  - [ ] 一个不 extends BaseEntity 的实体被 lint 拦截
  - [ ] prod 配置检查在 CI 强制
- **适合 agent**：backend-agent（偏 infra/工程化）
- **并行性**：与 PR1 / PR3 完全并行，独立分支

---

### PR3 — 租售商品模型（三端）

- **所属模块**：backend + c-frontend + admin-frontend
- **依赖前置 PR**：PR1（用 demo 实体换为真商品）
- **范围**: 同一商品承载「零售属性 + 租赁属性」：
  - 后端实体 `goods`（extends BaseEntity）：基础信息 + 零售价 + 租赁属性（押金、计费规则 JSONB、租期档位、可租/可售开关）
  - 计费规则用 PostgreSQL JSONB（GIN 索引）存灵活定价（按时/按天/阶梯）
  - B 端 admin：商品 CRUD（图片走 base 模块文件上传）+ 租售属性配置页
  - C 端：商品列表 / 详情，按「租」「买」双入口展示
- **关键验收点**:
  - [ ] 同一商品支持「立即买」与「立即租」两条入口
  - [ ] 租赁押金 / 计费规则可配且 C 端能试算（租期 × 单价 + 押金）
  - [ ] 商品数据严格租户隔离（沿用 PR0 测试范式加 goods 用例）
  - [ ] 无原生 SQL（PR2 lint 在线）
- **适合 agent**：backend-agent（实体/计费规则）+ admin-frontend-agent（配置页）+ c-frontend-agent（列表/详情）
- **并行性**：PR1 后；三端子任务契约对齐后并行

---

### PR4 — 库存（零售现货 + 租赁档期/数量）

- **所属模块**：backend + admin-frontend
- **依赖前置 PR**：PR3
- **范围**: 双模库存：
  - 零售库存：现货数量（SKU 级扣减/回滚）
  - 租赁库存：可租数量 + **档期占用**（同一实物在重叠时段不可重复出租）
  - 用 `@CoolTransaction` 保证扣减原子性；预占/确认/释放三态
  - B 端：库存看板（现货余量、租赁日历/档期占用）
  - 为 PR5 订单状态机提供「锁库存 / 释放库存」领域服务
- **关键验收点**:
  - [ ] 并发下单扣减不超卖（事务测试）
  - [ ] 同一租赁品重叠档期被拒绝（排他约束或应用层校验 + 测试）
  - [ ] 库存操作严格租户隔离
- **适合 agent**：backend-agent（核心，事务/并发）+ admin-frontend-agent（看板）
- **并行性**：必须 PR3 后；阻塞 PR5

---

### PR5 — 订单（零售 + 租赁双状态机）★ 核心、最长

- **所属模块**：backend + c-frontend + admin-frontend
- **依赖前置 PR**：PR4
- **范围**: 租售两条订单路径，状态机分道：
  - 零售订单状态机：待支付 → 已支付 → 发货 → 已收货 → 完成（/ 取消 / 退款）
  - 租赁订单状态机：待支付（押金+租金）→ 已支付 → 履约中（出库/在租）→ 待归还 → 归还核验 → 押金结算 → 完成（含续租/逾期分支）
  - 资金流字段独立：`goodsAmount`（货款）/ `rentAmount`（租金）/ `deposit`（押金），互不混淆
  - 状态机用显式状态表 + 合法迁移校验（非法迁移抛错 + 测试）
  - 调 PR4 库存服务做锁/释放
  - C 端：下单页（租/买分流）、订单列表/详情；B 端：订单管理 + 履约操作台
- **关键验收点**:
  - [ ] 两条状态机各自的合法迁移全覆盖（参数化测试每条迁移）
  - [ ] 非法状态迁移被拒（带测试）
  - [ ] 租赁订单含押金/租金独立字段；续租/逾期分支可达
  - [ ] 取消/退款正确释放库存
  - [ ] 全程租户隔离回归通过
- **适合 agent**：backend-agent（状态机核心，最重）+ c-frontend-agent + admin-frontend-agent
- **并行性**：PR4 后串行；是后续 PR6/PR7 的依赖

---

### PR6 — 支付 / 押金（资金流独立核算）

- **所属模块**：backend + plugin（支付插件）+ c-frontend
- **依赖前置 PR**：PR5
- **范围**:
  - 支付作为**插件**接入（复用 cool-admin 插件机制，先支持「模拟支付」沙箱插件，预留微信支付插件位）
  - 订单支付：零售付货款；租赁付「租金 + 押金」
  - 押金独立台账：收取 → 冻结 → 归还时按扣损结算 → 退还
  - 支付回调驱动订单状态机迁移（与 PR5 状态机对接）
  - C 端：收银台（区分货款/租金/押金）；为 PR9 分账留资金流水接口
- **关键验收点**:
  - [ ] 押金收取/冻结/扣损/退还全链路有单测（资金正确性）
  - [ ] 支付回调幂等（重复回调不重复推进状态）
  - [ ] 模拟支付插件可独立安装/配置（验证插件机制）
  - [ ] 资金流水按租户隔离
- **适合 agent**：backend-agent + plugin-agent（支付插件）+ c-frontend-agent（收银台）
- **并行性**：PR5 后；阻塞 PR7（履约要押金状态）和 PR9 分账

---

### PR7 — 租赁履约（归还 / 续租 / 逾期）

- **所属模块**：backend + c-frontend + admin-frontend
- **依赖前置 PR**：PR6（押金结算依赖）
- **范围**: 租赁订单履约段闭环：
  - 归还核验：B 端收货验收 → 损耗判定 → 押金扣损结算（调 PR6 押金台账）
  - 续租：在租中发起续租 → 重算租金 + 档期延展（调 PR4 档期）
  - 逾期：定时任务（cool base 模块 schedule）扫描到期单 → 逾期状态 + 罚金规则
  - 出库/入库库存动作接 PR4
- **关键验收点**:
  - [ ] 归还损耗 → 押金扣减 → 退还 金额闭环正确（单测）
  - [ ] 续租档期延展不与新品冲突
  - [ ] 逾期定时任务租户隔离（无 ctx 时遍历租户执行，符合插件/定时任务的 ALS 约束）
- **适合 agent**：backend-agent（核心）+ admin-frontend-agent（验收台）+ c-frontend-agent（续租入口）
- **并行性**：PR6 后；可与 PR8 并行

---

### PR8 — 插件机制 Demo（验证可独立开发/热安装/配置）

- **所属模块**：plugin + admin-frontend
- **依赖前置 PR**：PR1（需要后端模块装配就绪）
- **范围**: 用一个轻量真实插件验证插件契约（非支付这种重的）：
  - 候选：一个「店铺装修/公告栏」或「评价」插件，含 manifest + 配置 UI + 一个 service 方法
  - 验证：`.cool` 包打包 → 后台安装 → 配置 → 启用/禁用 → `PluginService.invoke` 调用 → 卸载
  - 审计插件表是否 extends BaseEntity（继承 tenantId）；如不继承则文档化为「平台级配置」
  - admin 端：插件市场/管理页（安装/启停/配置）
  - 文档化 C 端限制：小程序插件只能 uni 分包构建期纳入，不热插
- **关键验收点**:
  - [ ] 插件可独立打包成 .cool，后台免改代码安装/卸载/配置
  - [ ] 插件数据若 extends BaseEntity 则自动租户隔离（带测试）
  - [ ] C 端插件入口由后端菜单接口驱动显示/隐藏（构建期分包）
- **适合 agent**：plugin-agent（主）+ admin-frontend-agent（管理页）
- **并行性**：可与 PR5/PR6 并行（不碰核心交易表）；不阻塞主线

---

### PR9 — 平台运营（商家入驻 / 套餐 / 分账）

- **所属模块**：backend + admin-frontend + multi-tenant
- **依赖前置 PR**：PR0（平台特权）+ PR6（分账需资金流）；入驻/套餐子模块只需 PR1
- **范围**: 平台运营面（`controller/admin/**` + 平台超管角色）：
  - **入驻**：商家注册审核、创建租户、分配 tenantId、初始化超管账号（`tenantId=null` 的平台超管操作）
  - **套餐**：套餐定义 + 租户绑定套餐 + 功能/额度限制（与 PR8 插件启停联动）
  - **分账**：基于 PR6 资金流水，按平台/商家分账比例记账（模拟分账，预留对接微信电商分账）
  - 平台看板：跨租户总览（用超管特权或显式 noTenant）
- **关键验收点**:
  - [ ] 新商家入驻 → 生成独立 tenantId → 其数据与既有租户隔离（回归 PR0 测试范式）
  - [ ] 分账金额与 PR6 流水对账一致
  - [ ] 平台跨租户查询显式走特权路径，不被误当成普通租户查询
- **适合 agent**：backend-agent（入驻/分账）+ admin-frontend-agent（运营后台）
- **并行性**：入驻/套餐子模块可与 PR5 并行；分账子模块须 PR6 后

---

## 3. 可并行 / 串行矩阵

| PR | 阻塞谁 | 可与谁并行 | 备注 |
|---|---|---|---|
| PR0 | 全部 | — | 起点，最先 |
| PR1 | PR3/PR5/PR8/PR9 | PR2 | walking skeleton |
| PR2 | — | PR1/PR3 | 守护规则，独立分支 |
| PR3 | PR4 | PR2/PR8 | 商品模型 |
| PR4 | PR5 | PR8/PR9(入驻) | 库存 |
| PR5 | PR6/PR7 | PR8/PR9(入驻) | 订单状态机（最长） |
| PR6 | PR7/PR9(分账) | PR8 | 支付/押金 |
| PR7 | — | PR8/PR9 | 履约 |
| PR8 | — | PR3~PR7 | 插件 demo |
| PR9 | — | PR3~PR8（分账等PR6） | 平台运营 |

**推荐组队并行波次**（供 TeamCreate 参考）：
- **波次 A（串行）**：PR0 → PR1（先打通骨架，所有人对齐契约）
- **波次 B（3 路并行）**：PR2（infra-agent）‖ PR3（backend+c+admin 三端）‖ PR8 起步（plugin-agent）
- **波次 C（串行主线）**：PR3 → PR4 → PR5（核心交易链，backend-agent 主力，c/admin 跟进）
- **波次 D（2 路并行）**：PR6（backend+plugin+c）‖ PR9 入驻/套餐子模块（backend+admin）
- **波次 E（2 路并行）**：PR7 ‖ PR9 分账子模块（依赖 PR6 完成）
- **波次 F**：PR8 收尾 + 全链路回归 + spec 更新

---

## 4. Agent 类型映射（为 TeamCreate 组队）

| Agent 类型 | 主责 PR | 侧重 |
|---|---|---|
| **backend-agent** | PR0, PR1(后端), PR2, PR3(后端), PR4, PR5(后端), PR6(后端), PR7(后端), PR9(后端) | Midway+TypeORM 实体/服务/状态机/事务/多租户隔离；最重，建议 ≥2 人或主力 |
| **c-frontend-agent** | PR1(C), PR3(C), PR5(C), PR6(C), PR7(C) | uni-app Vue3 + wot-design-uni；tenantStore/cart 分桶；X-Tenant-Id 拦截器 |
| **admin-frontend-agent** | PR1(admin), PR3(admin), PR4(看板), PR5(admin), PR7(验收台), PR8(管理页), PR9(运营后台) | cool-admin-vue3 双品牌构建；菜单/角色区分 B 与平台 |
| **plugin-agent** | PR6(支付插件), PR8 | cool-admin 插件契约；.cool 打包/安装；插件表 tenantId 审计 |

> backend-agent 是瓶颈资源（出现在 9 个 PR 的后端部分）。建议组队时 backend 配 2 人，c/admin/plugin 各 1 人，按波次调度。

---

## 5. 风险对齐（每 PR 都在守的底线）

| 风险 | 在哪个 PR 落地守护 |
|---|---|
| 用错版本（master v4 无多租户） | PR0（验证 tenant.ts）+ PR2（CI 版本阈值） |
| 原生 SQL 绕过租户过滤 | PR0（隔离测试）+ PR2（ESLint 拦截） |
| 业务实体漏 extends BaseEntity | PR2（ESLint 规则） |
| 生产 synchronize/eps 未关 | PR2（CI 配置断言） |
| C 端误以为可运行时热插插件 | PR8（文档化 + 分包方案） |
| 资金流（押金/租金/货款）混淆 | PR5（字段独立）+ PR6（押金台账单测） |
| 状态机非法迁移 | PR5（迁移表 + 参数化测试） |
| 定时任务绕过租户上下文 | PR7（逾期任务 ALS 遍历租户） |

---

## 6. MVP 完成定义（串联所有 PR 的验收）

- [ ] PR0 隔离测试 + PR2 lint/CI 全绿，作为所有后续 PR 的前置门禁
- [ ] 同一商品可「租」可「买」两条路径端到端走通（PR3+PR5）
- [ ] 租赁全生命周期可用：押金 → 在租 → 归还/续租/逾期 → 押金结算（PR6+PR7）
- [ ] 多租户隔离在每个业务 PR 的回归测试中持续绿
- [ ] 插件可独立开发/打包/安装/配置（PR8）
- [ ] 平台运营能入驻新商家且数据隔离 + 模拟分账（PR9）
- [ ] 生产配置门禁通过（synchronize/eps 关、版本正确、无裸 SQL）

---

## 7. Open Questions 对 PR 的影响（待 PRD 收敛）

PRD 有 4 个 Blocking/Preference 未定，会影响 PR 切片粒度，此处只标注影响，不阻塞拆解：

- **支付与资金流**（沙箱模拟 vs 微信分账 vs 聚合）：影响 PR6 范围。当前按「沙箱模拟 + 预留接口」拆，可后置替换。
- **履约方式**（物流/自提/到店）：影响 PR5 状态机分支与 PR7 核验流程。当前按抽象履约节点拆，待定后细化。
- **跨平台目标端**（MP only？H5/App？）：影响 c-frontend-agent 工作量与 PR1 分包规划。当前默认 MP 优先。
- **会员/营销/优惠券是否进 MVP**：未单列 PR。若进 MVP，作为 PR8 之后的可选 PR（优惠券天然适合做插件 demo，可替换 PR8 候选）。

> 建议：上述 4 问在 PR0/PR1 期间收敛，避免 PR5（订单）开始后返工。
