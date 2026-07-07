# Research: 履约方式 + 租售订单状态机设计

- **Query**: 研究零售/租赁履约方式 MVP 范围；设计租售订单状态机；论证订单表合/拆；资金与状态联动
- **Scope**: external（电商/租赁行业通用模式）+ 设计决策（结合本项目 cool-admin/TypeORM/PG 栈与 PRD D1）
- **Date**: 2026-07-07

---

## TL;DR（推荐结论先看）

| 决策点 | 推荐 | 一句话理由 |
|---|---|---|
| **订单表合/拆** | **共用 1 张 `order` 主表 + 订单行 `order_item` 用 `type` 区分租/买 + 独立 `rental` 履约子表** | 同一购物车可租买混单（PRD D1「租售结合」），主流程（支付/取消/退款）一致，租赁差异下沉到子表，避免双主表带来的对账/幂等复杂度 |
| **零售履约 MVP** | 物流发货 + 到店自提 + 虚拟商品（三种全收，但虚拟商品=自动发货的最简形态） | 三种复用同一状态机分支，增量成本低；自提是线下租赁归还的天然落点 |
| **租赁履约 MVP** | 起租 → 到期/归还 → 续租/逾期/买断 四态；损坏赔偿走独立 `damage_claim` 流，不污染主状态机 | 覆盖核心生命周期，但赔偿/丢失等长尾用「事件流水」承载，状态机保持精简 |
| **资金联动** | **资金 = 订单状态的事件副作用**：押金随「已支付」冻结、随「已归还/已完成」解冻、随「损坏/逾期」扣减；租金/货款随终态结算。资金账户独立于订单表 | 押金是「担保物」不是「收入」，必须独立台账（PRD D1「资金流独立核算」），状态机只触发，不记账 |

---

## 1. 履约方式（Fulfillment）

### 1.1 零售履约（Sale Fulfillment）

#### 三种形态与 MVP 取舍

| 履约方式 | 是否进 MVP | 实现要点 | 状态机差异 |
|---|---|---|---|
| **物流发货（shipping）** | ✅ 是（核心） | `order_item.shipping_type=logistics`；需快递单号、地址、发货/揽收/签收事件 | 多 `shipped`→`delivered` 节点 |
| **到店自提（pickup）** | ✅ 是 | `shipping_type=pickup`；自提门店、核销码、用户到店扫码核销 | 多 `ready_for_pickup`→`picked_up` 节点；无物流单号 |
| **虚拟商品（virtual）** | ✅ 是（最简，作自动履约） | 卡密/链接发券；支付成功即履约 | 支付成功→直接 `completed` |

**推荐**：三种全进 MVP。原因——
1. 三者共用同一零售状态机的「分支」，主流程（待付→已付→履约→完成）不变，只是「履约中」内部分支不同；
2. **自提是租赁归还的天然落点**（用户到店归还/验机），与租赁流程复用门店/核销基建；
3. 虚拟商品几乎是「零成本」的自动履约，可作为系统最早的端到端 demo。

> MVP 暂不做：同城配送（第三方运力对接）、预售（库存与发货时序解耦）、多仓分拨。这些在状态机上是「物流分支的细化」，未来加节点即可，不影响主架构。

#### 关键字段建议（`order` / `order_item`）

```
order.shipping_type      : 'logistics' | 'pickup' | 'virtual'
order.shipping_address   : JSON（物流地址；pickup 时存门店 id；virtual 为空）
order.logistics_no       : 物流单号（仅 logistics）
order.pickup_store_id    : 自提门店（仅 pickup）
order.pickup_code        : 核销码（仅 pickup）
```

> 物流类型挂在 **order 级别**而非 item 级别：MVP 一单一种履约方式（混单时若 item 物流类型不同需拆单）。**拆单规则见 §3.3**。

---

### 1.2 租赁履约（Rental Fulfillment）

租赁履约的核心是「**时间维度**」——商品有借出日、应还日、实还日，状态随时间推移而流转。这是与零售最大的差异。

#### 生命周期阶段（MVP）

```
[未起租] → [租期中(in-rent)] → [待归还(due)] → [已归还(returned)]
                                  ↓
                              [逾期(overdue)]
                                  ↓
                          [续租(renewed) → 回到 in-rent] / [买断(bought-out) → 完成]
```

| 阶段 | 触发 | MVP 是否做 |
|---|---|---|
| **起租（start）** | 发货签收 / 自提核销 / 虚拟品支付 | ✅ 必做（这是租赁的「履约开始」） |
| **到期（due）** | 到达 `expected_return_at` | ✅ 必做（定时任务扫表） |
| **归还（returned）** | 用户到店归还 + 验机 + 扣损坏（若有） | ✅ 必做 |
| **续租（renewed）** | 用户在到期前/逾期后追加租期，补租金 | ✅ 必做（高频场景） |
| **逾期（overdue）** | 超过应还日仍未归还 | ✅ 必做（触发押金扣减/通知） |
| **买断（bought-out）** | 用户不归还，按残值买下 | ✅ 必做（逾期转买断是常见路径） |
| **损坏赔偿（damage）** | 归还时验机发现损坏 | ⚠️ **走独立 `damage_claim` 流，不改主状态** |
| **丢失（lost）** | 物流丢件/用户丢失 | ⚠️ MVP 用「逾期→买断」近似覆盖 |

#### 关键设计：状态机 vs 事件流水

> **核心原则**：主状态机只承载「主干生命周期」（5-6 个状态），损坏/丢失/赔偿等「长尾异常」用 **`rental_event` 事件流水表**承载，不污染状态机。

理由：
- 状态机状态越多，转移矩阵越复杂（N²），测试/对账成本爆炸；
- 损坏赔偿是「归还时的一次性事件」，归完后状态还是 `returned`，不需要单独状态；
- 事件流水天然支持审计、多次申诉。

```
rental_event(rental_id, event_type, amount, snapshot_json, created_at)
  event_type ∈ {started, renewed, returned, overdue, damage, lost, bought_out, refund}
```

#### 关键字段建议（`rental` 子表）

```
rental.order_item_id        : 关联订单行
rental.status               : 'pending' | 'in_rent' | 'overdue' | 'returned' | 'bought_out'
rental.rent_start_at        : 起租时间（=履约开始）
rental.expected_return_at   : 应还时间（起租 + 租期）
rental.actual_return_at     : 实还时间
rental.renew_count          : 续租次数
rental.deposit_amount       : 押金（冗余，便于对账）
rental.rent_amount          : 租金（已付）
```

> 注意：`rental.status` 与 `order.status` 是 **两层状态**——订单层管「交易态」（待付/已付/完成/取消），租赁层管「履约态」（租期中/逾期/归还）。两者通过事件联动（见 §4）。

---

## 2. 订单状态机

### 2.1 关键决策：共用订单表 + 订单行类型 + 租赁子表（推荐）

**论证「能否用统一订单表」**：可以，且推荐。但「统一」≠「一张大宽表塞所有租赁字段」，而是 **分层抽象**：

```
order（订单主表，承载交易通用流程）
  ├─ type : 'sale' | 'rental' | 'mixed'      ← 订单级类型（便于查询/统计）
  └─ order_item（订单行，承载商品+行级类型）
       └─ type : 'sale' | 'rental'            ← 行级类型（同一单可混）
            └─ rental（仅 rental 行关联，承载租期/押金/归还等租赁专属字段）
```

#### 为什么不拆成 `sale_order` + `rental_order` 两张表？

| 方案 | 共用 1 表（推荐） | 拆 2 表 |
|---|---|---|
| 购物车租买混单 | 天然支持（1 单 N 行） | 需结算时拆成 2 单，幂等/对账复杂 |
| 支付/取消/退款流程 | 1 套 | 2 套（重复代码） |
| 用户「我的订单」列表 | 1 次查询 | 需 UNION，分页困难 |
| 多租户过滤（tenant_id） | 1 个 Subscriber | 2 个，易漏 |
| 统计/对账 | 1 表聚合 | 跨表 JOIN |
| 租赁专属字段 | 隔离到 `rental` 子表，主表干净 | 表本身分散，但 JOIN 增多 |
| **代价** | `order.type` + `order_item.type` 需校验一致性 | — |

**结论**：合表，租赁差异下沉到 `rental` 子表。代价（类型一致性校验）远小于拆表代价（流程重复）。

#### 为什么不「全部塞进 `order_item` 一个大表」？

如果把 `rent_start_at`/`expected_return_at` 等租赁字段直接放 `order_item`：
- `order_item` 会有大量 NULL（零售行用不到）；
- 租赁可能多次续租/多次事件，单行无法承载历史 → 还是要事件表；
- 违反单一职责。

**所以**：租赁字段独立成 `rental` 子表（1:1 对应 rental 类型的 order_item），历史走 `rental_event`。

---

### 2.2 零售订单状态机（`order.type='sale'`）

```
                          ┌────────── auto cancel ──────────┐
                          ▼                                  │
[pending_pay] ──pay──▶ [paid] ──ship/pickup-ready/virtual──▶ [in_fulfillment]
     │                     │                                       │
     │                   cancel                                deliver/pickup
     │(timeout)             │                                       │
     ▼                      ▼                                       ▼
[canceled]◀──────── [canceled]                                 [completed]
                          │                                       │
                       refund                                 refund(after-sale)
                          ▼                                       ▼
                      [refunded]◀────────────────────────────[refunded]
```

| 状态 | code | 含义 | 进入条件 |
|---|---|---|---|
| 待支付 | `pending_pay` | 下单未付 | 创建订单 |
| 已支付 | `paid` | 收到支付（零售：货款全部到账） | 支付回调成功 |
| 履约中 | `in_fulfillment` | 物流：已发货；自提：备货完成待提；虚拟：通常直接跳过 | 商家发货 / 备货完成 |
| 已完成 | `completed` | 物流：签收；自提：核销；虚拟：支付即完成 | 签收/核销/自动 |
| 已取消 | `canceled` | 未支付超时/用户/商家取消 | 超时/主动取消（未付） |
| 已退款 | `refunded` | 全额退款 | 退款流程完成 |

**转移规则**：
- `pending_pay → paid`：支付成功回调（幂等，靠支付单号）
- `pending_pay → canceled`：超时（定时任务，默认 15-30min）或用户主动
- `paid → in_fulfillment`：商家操作发货/备货（虚拟商品跳过此态直接 completed）
- `in_fulfillment → completed`：物流签收回调 / 自提核销 / 虚拟自动
- `paid / in_fulfillment / completed → refunded`：发起退款审批通过（MVP 可仅支持 completed 后的售后退款，in_fulfillment 前的退款视复杂度）

> **部分退款**：MVP 用 `order.refund_amount` 字段累计 + 状态保持 `completed`（不退回 completed 态），仅全额退才置 `refunded`。避免「退了一半」的中间态污染主状态机。

---

### 2.3 租赁订单状态机

租赁订单是 **双层状态**：订单层（交易态）+ 租赁层（履约态）。

#### 2.3.1 订单层（`order.status`，与零售共享状态码）

租赁订单的「订单层」与零售几乎一致，差异在 **`paid` 之后不是「履约中发货」，而是「等待起租」**：

```
[pending_pay] ──pay(押金冻结+租金扣款)──▶ [paid]
                                              │
                                   发货签收/自提核销/虚拟
                                              ▼
                                        [in_fulfillment]   ← 含义=已起租，租赁履约中
                                              │
                                  归还完成/买断完成/全额退
                                              ▼
                                        [completed]
```

- `in_fulfillment`（订单层）= 租赁已起租，对应 `rental.status ∈ {in_rent, overdue}`；
- `completed`（订单层）= 租赁彻底结束（已归还/已买断/全额退），对应 `rental.status ∈ {returned, bought_out}`。

#### 2.3.2 租赁层状态机（`rental.status`）—— 核心差异在此

```
                  发货签收/自提核销
[pending] ───────────────────────▶ [in_rent]
                                       │
                       到达 expected_return_at
                                       ▼
                                  [overdue]◀──────续租后再次到期────┐
                                  │     │                          │
                              归还  │     │ 续租(renew)             │
                                  │     └──────────────────────────┘
                                  ▼
                              [returned]
                                  │
                            （订单层→completed，押金退还）

        ── 任意态均可 ── 买断(bought_out) ──▶ [bought_out]（订单层→completed，扣残值/转所有权）
```

| `rental.status` | 含义 | 进入条件 | 对订单层影响 |
|---|---|---|---|
| `pending` | 已下单未起租 | 订单 paid 但未发货 | order=paid |
| `in_rent` | 租期进行中 | 起租事件（签收/核销/虚拟自动） | order=in_fulfillment |
| `overdue` | 已逾期未还 | 超过 expected_return_at 仍未还 | order=in_fulfillment（不变） |
| `returned` | 已归还 | 验机完成，扣损坏后归还闭环 | order→completed，押金退还 |
| `bought_out` | 已买断 | 用户/系统发起买断，付残值 | order→completed，押金转抵货款 |

**转移规则**：
- `pending → in_rent`：起租事件（物流签收 / 自提核销 / 虚拟品支付）。**这是「租赁履约开始」的判定点**，记 `rent_start_at`，并据此算 `expected_return_at = rent_start_at + 租期`。
- `in_rent → overdue`：定时任务扫到 `now > expected_return_at AND status=in_rent`。触发逾期通知 + 押金按规则扣（如每日扣 X，上限押金）。
- `overdue → in_rent`：续租成功（补租金 + 延 `expected_return_at`）。
- `in_rent/overdue → returned`：归还闭环（验机 + 损坏扣款 + 押金结算）。
- `任意 → bought_out`：买断（付残值，押金抵扣，所有权转移，无需归还）。

> **逾期与续租的循环**：`in_rent ↔ overdue` 可多次往返（多次续租），用 `renew_count` 记次数、`rental_event` 记每次续租事件。

---

### 2.4 混单（`order.type='mixed'`）的完成判定

同一订单含零售行 + 租赁行时：
- 订单层 `completed` 的判定 = **所有行都终态**：
  - 零售行：`completed`/`refunded`；
  - 租赁行：对应 `rental.status ∈ {returned, bought_out}`。
- 订单层 `in_fulfillment` 期间，零售行可能已完成而租赁行仍在租——**订单层取「最靠前的行状态」**（木桶效应）。
- 这正是分层抽象的价值：行级状态独立推进，订单层做聚合判定。

---

## 3. 拆单与一致性规则

### 3.1 一个 order 一个 tenant_id

PRD D3：共享库 + tenant_id 隔离。**订单必须单租户**——多租户购物车（PRD 已述按 tenantId 分桶）在结算时 **按 tenantId 拆成多个 order**，绝不跨租户合单。这与 cool-admin Subscriber 的过滤粒度天然对齐。

### 3.2 一个 order 一种 shipping_type（MVP）

MVP 一单一种履约方式。若购物车内同时有「物流发货」和「自提」商品 → 结算时按 shipping_type 拆成多单。

### 3.3 type 一致性校验

`order.type` 由其 `order_item.type` 推导：
- 全 sale → `sale`；
- 全 rental → `rental`；
- 混合 → `mixed`。

下单 service 层强制校验，不允许 `order.type` 与 items 矛盾。

---

## 4. 资金与状态联动（核心）

### 4.1 三类资金，独立台账

PRD D1 明确「资金流独立核算」。资金**不入 order 表**，而是独立的资金账户/流水：

| 资金类型 | 性质 | 触发订单事件 | 资金动作 |
|---|---|---|---|
| **货款（sale_amount）** | 收入 | 零售订单 `completed` | 确认收入（结算给商家） |
| **租金（rent_amount）** | 收入 | 租赁订单 `paid`（先收） | 确认收入（租期开始即赚得，按权责发生制可分摊） |
| **押金（deposit）** | **担保物，非收入** | 见下表 | **冻结 → 解冻/扣减** |

### 4.2 押金生命周期（最易错，重点）

押金是「担保物」，**不进收入，进冻结**。状态联动：

| 订单/租赁事件 | 押金动作 |
|---|---|
| 租赁订单 `pending_pay → paid` | **冻结**（从用户余额/支付通道预授权冻结，不入商家收入） |
| 租赁 `returned` 且无损坏 | **全额解冻退还** |
| 租赁 `returned` 且有损坏 | 扣损坏金额（`damage_claim`），余款解冻退还 |
| 租赁 `overdue` | 按规则扣逾期费（如每日 X，上限=押金），从冻结额中扣 |
| 租赁 `bought_out` | 押金 **转抵** 买断残值（不足另补，多余退还） |
| 订单 `canceled`（未起租） | 解冻退还 |
| 订单 `refunded` | 解冻退还 |

> **关键原则**：押金的冻结/扣减/退还，全部由 **状态机事件触发**，状态机本身不持有金额，只发事件（`rentalEventEmitter.emit('returned', {rentalId})`），由独立的 `DepositService` 订阅并记账。这样状态机纯逻辑、可单测；资金规则可独立演进。

### 4.3 推荐的「事件驱动」联动架构

```
Order/Rental FSM  ──emit(event)──▶  EventBus / Listener
                                          │
                       ┌──────────────────┼──────────────────┐
                       ▼                  ▼                  ▼
                DepositService     PaymentService     SettlementService
                (押金台账)         (货款/租金)        (商家结算)
```

- Midway 有内置事件机制（`@Inject() eventBus` / `EventModule`），天然契合；
- 每个事件幂等处理（带 `event_id` 去重），保证状态机重放不会重复扣款；
- 失败重试与对账（资金表与订单状态对账）独立可测。

### 4.4 资金表建议（独立于 order）

```
deposit_account(user_id, tenant_id, frozen_amount, available_amount)   -- 押金账户余额
deposit_ledger(id, user_id, tenant_id, order_id, type, amount, ref_event_id, created_at)
   type ∈ {freeze, unfreeze, deduct, refund}                            -- 押金流水
payment(order_id, channel, paid_amount, deposit_amount, rent_amount, sale_amount, status)  -- 支付单
```

> `payment` 单表承载「这一单付了多少、其中押金/租金/货款各多少」，是订单与资金的桥。

---

## 5. 与 cool-admin / TypeORM / PG 的落地注意

1. **多租户**：`order`/`order_item`/`rental`/`rental_event`/`deposit_*` 全部继承 `BaseEntity`（带 tenant_id），走 Subscriber 过滤。⚠️ 订单查询高频，**绝不用原生 SQL**（PRD 已列为高风险）。
2. **定时任务**：逾期扫描用 cool-admin 的 `schedule` 目录（Midway `@Schedule`），单租户隔离要在任务里显式带 tenant_id（定时任务无 JWT 上下文，Subscriber 可能失效——需验证或手动传 ctx）。
3. **状态机实现**：MVP 不必引重型库（如 `xstate`），用 **枚举 + 转移函数 + 守卫** 即可。每个状态码用字符串常量，转移集中在 `OrderTransitionService`，便于单测覆盖全矩阵。
4. **幂等**：支付回调、状态转移、资金动作三处都要幂等键（支付单号 / event_id）。
5. **悲观锁**：状态转移涉及资金，`SELECT ... FOR UPDATE` 锁订单行，防并发（如归还与买断并发）。

---

## 6. 待主 agent 决策的 Open Question

- **[Blocking] 支付通道**：押金「冻结」需要支付通道支持预授权/担保（微信「担保支付」/支付宝「预授权」）。若 MVP 用模拟支付，押金冻结=余额数字记账即可，但生产前必须确认通道能力。这直接决定 §4.2 的实现复杂度。
- **[Preference] 售后退款范围**：MVP 是否支持「已完成订单的售后退款」？若不支持，`completed → refunded` 边可砍，状态机更简。
- **[Preference] 续租定价**：续租租金是按原价、按日折算、还是阶梯？影响 `rental_event` 计费逻辑，不影响状态机结构。
- **[Preference] 逾期扣费规则**：是否从押金扣逾期费？还是仅通知+影响信用？影响押金是否会被部分扣减。

---

## Caveats / Not Found

- 本仓库为 greenfield，无既有订单代码可参照，设计基于电商/租赁行业通用模式 + 项目栈约束。
- cool-admin v8 是否内置事件总线（EventBus）未在已读文档中确认；若内置则直接用，否则用 Midway 自带 `@midwayjs/core` 的事件能力或 NestJS 风格的 EventEmitter（Midway 兼容）。建议在 `00-bootstrap` 任务中核实。
- 押金的「冻结」在真实支付通道（微信担保支付）有规则限制（如冻结时长上限），生产前需对通道文档二次确认。
