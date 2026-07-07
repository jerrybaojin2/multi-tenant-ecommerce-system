# Research: 境内双通道 + 境外跨境支付（多通道统一抽象）

- **Query**: 多通道支付架构（微信/支付宝/连连/PingPong）统一抽象；境内支付宝分账；境外连连/PingPong 跨境收单 vs 收款/结汇 可生产规则；押金多通道兼容；合规前置清单
- **Scope**: external（支付宝/连连/PingPong 官方规则，结合领域知识）+ mixed（cool-admin/Midway/TypeORM 落点）
- **Date**: 2026-07-07

> **抓取说明**：支付宝开放文档(opendocs.alipay.com)、连连(global.lianlianpay.com/docs)、PingPong(developer.pingpongx.com) 官方文档站**全部为前端 SPA 渲染**，curl 仅能拿到 JS 壳（无正文）。下述「可生产规则」来自：①Bing 搜索可抓取的官方/百科摘要（产品线、牌照数、平台覆盖、封顶费率）已逐条标注来源 ②对其余接口字段、签约门槛、具体费率等**未能在抓取中逐字核实**的内容，统一以「领域知识 / 待落地核实」显式标注，落地前必须以商户平台最新文档为准。已核实的事实以 ✅[已核实] 标注。

---

## 0. 一句话结论（决策先行）

> **境内 = 微信电商收付通 + 支付宝(分账/预授权)** 双通道 Strategy 统一抽象；**境外 = 跨境收款/结汇为主**（商家做跨境电商收境外款），用 **PingPong 或连连的「跨境收款」产品线**（不是全球收单）；**跨境收单**（境外消费者直付）仅在平台真有境外 C 端消费者直接下单付款时才需要，且其押金托管能力弱、合规门槛高，**MVP 不做**，留作二期。押金在境内走通道原生的资金预授权/预付费；境外无原生冻结，退化为「先收后退」或与收款合并结算。

---

## 1. 多通道统一抽象设计（可落地）

### 1.1 通道接口（Strategy）

定义统一的 `PaymentChannel` 接口，所有通道实现同一契约。订单按「**通道决策**」选具体实现：

```ts
interface PaymentChannel {
  readonly code: ChannelCode;            // 'wxpay' | 'alipay' | 'lianlian' | 'pingpong'
  readonly region: 'domestic' | 'cross_border';

  // 下单（货款/租金/押金三类，统一 businessType 入参）
  createOrder(req: CreateOrderRequest): Promise<CreateOrderResult>;
  // 查询
  query(orderChannelRef: string): Promise<ChannelOrderState>;
  // 退款（全额/部分）
  refund(req: RefundRequest): Promise<RefundResult>;
  // 押金：冻结（预授权/预付费）
  freezeDeposit(req: FreezeRequest): Promise<FreezeResult>;
  // 押金：扣款（损坏/逾期）— 在已冻结金额内扣
  deductDeposit(req: DeductRequest): Promise<DeductResult>;
  // 押金：解冻退还
  releaseDeposit(req: ReleaseRequest): Promise<ReleaseResult>;
  // 分账/清分（境内分账、境外收款/结汇都映射到此）
  settle(req: SettleRequest): Promise<SettleResult>;
  // 回调验签 + 解析（把通道原始回调转成统一 DomainEvent）
  parseWebhook(rawBody: Buffer, headers: Record<string,string>): Promise<WebhookEvent>;
}
```

**关键设计点**：
- **`businessType` 三态贯穿**：`GOODS`(货款) / `RENT`(租金) / `DEPOSIT`(押金)。每通道对押金能力差异通过 `freezeDeposit` 的实现是否抛 `UnsupportedError` 表达（境外通道不支持原生冻结 → 路由层拒绝押金走境外，见 §6）。
- **`settle` 的多义**：境内=分账（分账接收方/二级商户清分）；境外收款=把境外平台销售款结汇回境内。业务层叫法统一为「结算/清分」，通道层各自实现。
- **回调统一为 DomainEvent**：各通道 `parseWebhook` 把签名/字段差异吃掉，输出统一 `WebhookEvent{ type, orderChannelRef, amount, businessType, channel, raw }`，下游 `WebhookDispatcher` 按事件类型路由到状态机/DepositService。**回调幂等**以 `orderChannelRef + event类型 + 状态判断` 为前置。

### 1.2 通道决策（路由）

订单创建时由 `ChannelRouter` 决定走哪个通道，依据：

| 决策维度 | 取值来源 | 默认路由 |
|---|---|---|
| **订单币种/用户区域** | 订单 `currency` / 用户 `region`（境外消费者→境外收单；境内→境内） | CNY+境内用户→微信/支付宝；境外消费者→境外收单 |
| **租户可用通道** | tenant 配置 `merchant_channel_config.available_channels[]` | 平台默认开通道 |
| **租户通道优先级** | tenant 配置 `priority_channel`（如某商家主营境外，默认 PingPong） | 按 tenant 意愿 |
| **押金标记** | `businessType=DEPOSIT` | 强制走支持冻结的通道（境内），境外通道直接拒绝 |
| **业务类型** | 跨境销售款回收(商家侧) / 跨境收单(消费者侧) | 见 §5 |

**路由示例**：
- 境内 C 端微信小程序买货 → 微信电商收付通（押金走预付费）
- 同一商家后台把 Shopify 境外店铺销售款收回境内 → 走 PingPong/连连**跨境收款**（这是商家对账动作，不是 C 端下单链路）
- 平台未来做境外 C 端直接下单付款 → 走 PingPong/连连**全球收单**（MVP 不做）

### 1.3 通道配置按租户管理

```ts
// 每租户每通道一份配置（行级）
MerchantChannelConfig  (tenantId + channelCode 复合唯一)
  + tenantId              多租户隔离（继承 BaseEntity）
  + channelCode           'wxpay'|'alipay'|'lianlian'|'pingpong'
  + enabled               是否启用
  + priority              优先级权重
  + channelMerchantRef    通道侧商户标识
                          - wxpay:  sub_mchid（二级商户号）
                          - alipay: 商户PID/appid（或分账接收方ID）
                          - lianlian: 连连商户号 + 收款账户ID
                          - pingpong: PingPong merchantId + 收款账户
  + credentials_enc       加密的通道凭证（API Key/私钥/证书序列号）— 必须加密落库
  + split_receivers[]     分账接收方（境内：平台佣金 + 商家应得）
  + settle_account_id     境外收款：结汇入账账户
  + onboarding_status     通道进件状态 PENDING/NORMAL/FROZEN
```

- **多租户天然契合**：每个 tenant = 各通道一套商户配置（sub_mchid/PID/连连账户），与 `BaseEntity.tenantId` 一一映射（复用 cool-admin 多租户）。
- **回调反查 tenant**：回调无 JWT/tenantId 上下文（PRD 已警示），按通道侧商户标识（微信 sub_mchid / 支付宝 PID / 连连商户号）**反查** `MerchantChannelConfig.tenantId` → 手动设置租户上下文后再走标准 Repository 写库（绕开「原生 SQL 绕过租户过滤」坑）。
- **不同商家可用不同通道/不同境外收款账户**：天然支持——某商家只做境内就只配 wxpay+alipay；做跨境另配 pingpong 收款账户到其境外店铺。

### 1.4 插件化封装

按 `plugin-architecture.md` 思路，做成 cool-admin 平台插件 `plugin-payment`：
- 子目录 `channels/{wxpay,alipay,lianlian,pingpong}/` 各含 `Channel.ts` 实现 + `Webhook.controller.ts`
- 统一 `PaymentService`（Strategy 容器）+ `ChannelRouter` + `WebhookDispatcher`
- 实体继承 `BaseEntity` → 自动 tenant_id 隔离
- 配置走 cool-admin 插件配置面板（凭证加密存储）
- ⚠️ C 端调用入口构建期纳入（uni 分包），admin/B 端配置才热插

---

## 2. 境内支付宝（可生产接入 + 分账 + 与微信的统一性）

### 2.1 可生产接入方式（选哪个产品）

| 接入方式 | 场景 | 适配本项目 | 备注 |
|---|---|---|---|
| **当面付**（扫码/被扫 alipay.trade.precreate/pay） | 线下/PC 网页二维码 | PC/H5 二期可用 | 文档：open.alipay.com 「当面付」 |
| **App 支付**（alipay.trade.app.pay） | 原生 App | ❌ MVP 无 App | |
| **电脑网站支付**（alipay.trade.page.pay） | PC 电商网站 | ❌ MVP 无 PC | |
| **手机网站支付**（alipay.trade.wap.pay） | H5 | ⚠️ H5 二期 | |
| **小程序支付**（my.tradePay） | **支付宝小程序** | ⚠️ 取决于是否做支付宝小程序 | 本项目 C 端是**微信小程序**，支付宝小程序是额外端 |

**关键现实**：本项目 C 端是**微信小程序**，支付宝的钱不能在微信小程序里直接拉起（微信小程序仅允许微信支付）。因此**支付宝通道在 MVP 阶段主要服务于**：
1. **PC 网站支付/H5**（二期，电脑网站支付 `trade.page.pay`）
2. **商家后台/平台 admin** 的对公支付场景（B2B 大额，用当面付扫码或 PC 网站支付）

> **MVP 取舍**：支付宝通道**先做接口实现 + 沙箱联调**，但 C 端微信小程序不集成支付宝拉起（受微信生态限制）。等做支付宝小程序端或 PC 端时再启用。这与 PRD「C 端 MVP 仅微信小程序」一致。

### 2.2 分账能力（支付宝分账产品）✅[领域知识/待核实]

支付宝有与微信分账**对等**的分账产品，使多商家平台同样可消二清：

- **产品名**：支付宝「商家分账」（`alipay.trade.order.settle` / 分账接收方 `alipay.trade.royalty` 系列）
- **机制**：平台作为**ISV/系统服务商**，商家进件为支付宝**商户**，分账接收方新增后，下单标记 `royalty` 或独立发起分账
- **与微信分账的统一性**：✅ 概念一致——都是「消费者付款→进商家商户号→平台按规则分账抽佣」。可在 §1 的 `settle()` 接口统一抽象
- **差异**：
  - 微信用「服务商 + 二级商户(sub_mchid)」；支付宝用「应用 appid + 商户 PID + 分账接收方」
  - 字段名/接口形态不同（适配器层吃掉差异）
- **资质**：商家需有支付宝商户号；平台需具备 ISV 资质或服务商身份；分账比例签约时配置（与微信类似）

### 2.3 押金：支付宝资金预授权冻结（对应微信预付费）✅[领域知识/待核实]

支付宝有**与微信预付费/保证金对等**的「**预授权/资金冻结**」能力，是租赁押金的理想载体：

- **产品**：支付宝「**资金预授权**」（预下单冻结额度，按需解冻扣款/解冻退还）
- **接口族**：`alipay.fund.auth.order.app.freeze`（冻结）/ `alipay.fund.auth.order.voucher`（解冻扣款 / 全额退回）
- **机制**：用户授权冻结一笔额度（不实际扣款，占用可用额度），履约完成全额退还 / 损坏逾期按需扣
- **与微信预付费统一性**：✅ 可在 §1 的 `freezeDeposit/deductDeposit/releaseDeposit` 统一抽象，两通道各实现
- **适用场景**：当面付/扫码的押金冻结；与微信预付费在状态机层面行为一致

### 2.4 商户资质与费率 ✅[部分核实/费率待核实]

- **资质**：营业执照 + 对公账户；商家进件支付宝商户号；分账需额外签约分账产品
- **费率量级**：标准费率约 **0.6%**（行业/特殊资质可更低或更高）；分账/预授权可能有额外服务费，**具体费率签约时确认**（未逐字核实）
- **与微信对比**：费率量级相近（微信境内标准也约 0.6%），双通道成本可控

---

## 3. 境外连连 LianLian（两条产品线区分）

> ⚠️ 关键认知：**「跨境收单」≠「跨境收款/结汇」**。这两条线面向完全不同的场景、用不同产品、资质门槛不同。混淆会导致选错通道、合规翻车。

### 3.1 ✅[已核实] 公司与资质基线

- 连连数字（LianLian Digi / 连连支付），中国数字支付解决方案提供商 ✅[lianlian.com/about，百度百科]
- 截至 2025 年末建立由 **66 项支付牌照及相关资质**组成的牌照体系 ✅[百度百科「连连数字科技股份有限公司」]
- **唯一一家在美国所有州均持有货币转移牌照的中国数字支付服务商** ✅[同上]
- 连连国际（LianLian Global）：跨境收款/收单主体；支持 Amazon、速卖通、Shopee、TikTok Shop、Temu、Lazada、Shopify、Ozon 等平台 ✅[lianlianpay.com/global 首页摘要]
- 直连 **180+ 平台、140+ 币种**；TikTok Shop 等五大平台 **0.2% 封顶** ✅[同上]
- 业务覆盖电商、跨境贸易、物流、航旅等 20+ 行业，支持 **130 多种货币** ✅[百度百科「连连支付」]

### 3.2 (a) 跨境收单（全球收单 / Global Acquiring）

- **场景**：**境外消费者**用境外卡/本地支付方式，**直接付款给商家**（站内收银台，消费者发起支付）
- **典型**：独立站（Shopify）境外访客刷卡结账、SaaS 服务向海外用户收费
- **资金流**：境外消费者 → 连连（持牌收单）→ 结算给商家（境内或境外账户）
- **API**：连连全球收单 API（创建支付单、查询、退款、回调），支持卡组织/本地支付方式（信用卡、本地钱包等）✅[产品线存在，具体字段待开发者文档核实]
- **资质门槛**：较高——需商户进件、提交业务资质、风控/反洗钱审核；收单涉及**境外持卡人**，对商户业务真实性、拒付率、行业合规要求严
- **清结算**：可结算多币种，T+若干 到账；**拒付（chargeback）**风险由商户承担（收单的固有风险）
- **费率**：取决于卡组、币种、行业风险；通常比境内支付高（卡组织 interchange + 通道费）
- **电商平台常用度**：⚠️ **仅当平台真有「境外消费者在平台下单付款」场景才用**。多数中国跨境电商平台实际是「卖家在亚马逊/Shopify 卖货，平台不参与收银台」，此时用收单较少

### 3.3 (b) 跨境收款 / 结汇（电商收款）

- **场景**：**商家**把在境外平台（Amazon/Shopify/TikTok Shop 等）已经收到的销售款，**收回境内/境外账户**（结汇成人民币或保留外币）
- **典型**：跨境电商卖家回款——这是**绝大多数中国跨境电商的真实场景**
- **资金流**：境外电商平台 → 商家在连连的**虚拟本土账户**（VBA，各站点本地银行账户）→ 商家发起**结汇/提现** → 人民币到境内对公/法人账户
- **API**：连连提供**虚拟账户开立** + **结汇/提现** API；商家侧操作为主（绑定店铺、申请结汇）✅[lianlianglobal.cn dashboard collection vba]
- **资质门槛**：相对收单**低**——商家提供营业执照、法人信息、店铺证明、KYC 即可开户；无需境外持卡人风控
- **清结算币种/时效**：多币种（USD/EUR/GBP/JPY 等本地币种入账），结汇后人民币 T+0/T+1 到账（多数平台宣传「秒到」）
- **合规（外汇/结汇）**：由连连作为持牌机构代为申报结汇（**这是核心价值——把外贸合规门槛接管**），商家凭贸易背景材料结汇
- **费率**：**提现费率约 0.3%–1%**（封顶/平台专享可低至 0.2%，如 TikTok Shop 五大平台 0.2% 封顶 ✅[已核实]）；汇率按牌价
- **电商平台常用度**：✅ **这是电商平台「境外」场景的主流选择**——平台里的商家做跨境电商，回款走收款/结汇

### 3.4 连连在两种场景下用哪个

| 场景 | 连连产品线 | API 性质 |
|---|---|---|
| (A) 跨境收单（境外消费者付款给商家/平台） | 全球收单（Acquiring） | 收银台下单/支付/退款 |
| (B) 跨境收款/结汇（商家把境外销售款收回境内） | 跨境收款/电商收款 + 虚拟账户 + 结汇 | 账户开立/结汇/提现 |

---

## 4. 境外 PingPong（与连连对照）

### 4.1 ✅[已核实] 公司与资质基线

- PingPong，杭州乒乓智能技术有限公司旗下跨境贸易数字化品牌，**2015 年成立**，总部杭州 ✅[百度百科「pingpong」]
- 主营业务：**跨境收款、外贸 B2B 收付款、全球收单、全球分发、供应链融资、汇率管理、出口退税、VAT 税务、SaaS 企业服务、PingPong Card（VCC）** ✅[pingpongx.com 首页 meta + 百度百科]
- 覆盖 **200+ 国家和地区** ✅[bing 摘要]
- 浙江信航支付有限公司持有境内支付牌照 ✅[pingpongxpay.com 备案]
- 中国（杭州）跨境电商综试区管委会官方合作伙伴 ✅[pingpong-china.com]

### 4.2 两条产品线（与连连对称）

| 产品线 | PingPong 名称 | 场景 | 与连连对应 |
|---|---|---|---|
| 跨境收款/结汇 | **跨境收款**（主打，最早起家业务） | 跨境电商卖家回款到境内 | = 连连(b) 跨境收款 |
| 跨境收单 | **全球收单（Acquiring）** | 境外消费者付款给商家 | = 连连(a) 全球收单 |
| 外贸 B2B | 外贸收款 | B2B 贸易收款/付款 | 连连也有外贸 B2B |
| 增值 | VAT/退税/VCC/光年（汇率） | 税务/融资/汇率对冲 | 连连也有类似 |

### 4.3 可生产规则

- **资质门槛**：与连连同档——商家提供营业执照、法人、店铺证明、KYC 开户；进件相对境内支付稍重但成熟流程
- **API**：PingPong Developer Platform（developer.pingpongx.com）提供收款/收单/结汇 API ✅[SPA，字段待落地核实]
- **清结算**：多币种虚拟账户入账，结汇人民币到境内账户；时效 T+0/T+1 为主
- **合规**：PingPong 作为持牌机构代为结汇申报，与连连同等（核心价值同上）
- **费率**：跨境收款提现费率长期主打**1% 封顶**（早期行业标杆），近年主流平台专享更低；汇率按牌价。**具体费率以开户签约为准**（未逐字核实）

### 4.4 连连 vs PingPong 对比

| 维度 | 连连 LianLian | PingPong | 选型建议 |
|---|---|---|---|
| 资质/牌照 | 66 项牌照，全美州货币转移 ✅ | 浙江信航境内牌 + 跨境布局 | 连连牌照更全（尤其美国），跨境收单更稳 |
| 起家/强项 | 综合支付（电商/B2B/物流/航旅） | **跨境电商收款**（最早主打，卖家认知高） | 纯电商跨境收款 PingPong 体验成熟 |
| 平台覆盖 | 180+ 平台 ✅，含 Amazon/Shopee/TikTok/Temu | 覆盖主流电商 + Shopify 独立站 | 两者相当 |
| 封顶费率 | TikTok Shop 五大平台 0.2% ✅ | 1% 封顶（行业早期标杆） | 连连近期平台专享更低，需按平台询价 |
| 收单能力 | 全球收单（牌照全，欧美更稳） | 全球收单（有） | 跨境收单**首选连连**（牌照/风控） |
| 增值服务 | VAT/退税/光年汇率 | VAT/退税/VCC/光年/融资 | 相当 |
| API 成熟度 | 开发者文档完善（SPA） | 开发者文档完善（SPA） | 相当，都需落地核实字段 |

> **选型倾向**：①**只做跨境收款（场景 B）**：两者皆可，按商家已在用哪个 / 哪个费率更低选；PingPong 卖家认知高、连连近期费率有优势。②**需要跨境收单（场景 A）**：**首选连连**（牌照更全、欧美风控成熟）。③**多通道并存**：抽象层支持两者并存，不同 tenant 可配不同收款方（商家用哪个就在 tenant 配哪个）。

---

## 5. 场景判定：平台「境外」到底是哪种场景

### 场景 A — 跨境收单（境外消费者直接付款给平台/商家）

- **特征**：收银台在**平台/商家自己的站内**，境外消费者在这里选支付方式（境外卡/本地钱包）完成付款
- **触发条件**：平台有**面向境外消费者的 C 端交易入口**（独立站/海外 App/海外小程序）
- **用哪个产品**：连连全球收单 或 PingPong 全球收单（§3.2 / §4.2 收单线）
- **本项目适用性**：❌ **MVP 不适用**。C 端是微信小程序（境内），无境外 C 端入口。**二期**若做面向海外消费者的独立站/App 再启用

### 场景 B — 跨境收款/结汇（商家把境外平台销售款收回境内）

- **特征**：交易**不在本平台发生**——商家在 Amazon/Shopify/TikTok Shop 卖货收款，本平台帮助商家把这笔境外款**结汇回境内**
- **触发条件**：入驻本平台的商家是**跨境电商卖家**，平台提供「回款/结汇/对账」增值服务
- **用哪个产品**：连连跨境收款 或 PingPong 跨境收款（§3.3 / §4.2 收款线）
- **本项目适用性**：✅ **这才是电商平台「境外」的真实主流场景**。若平台商家做跨境电商，提供收款/结汇通道是高价值增值

> **建议**：先与业务方确认「境外」指 A 还是 B（PRD Open Question）。**默认按 B**（跨境收款/结汇）落地，因为：①跨境电商真实痛点 ②合规门槛低于收单 ③不涉及境外持卡人风控 ④PingPong/连连成熟方案。**A（跨境收单）列为二期**。

---

## 6. 押金的多通道兼容

| 通道 | 押金原生能力 | 机制 | 可用性 |
|---|---|---|---|
| **微信** | ✅ 预付费（预付充退）/ 保证金 | 消费者预付冻结于微信侧，扣/退走 API | ✅ 推荐主路径（见 payment-funds.md） |
| **支付宝** | ✅ 资金预授权冻结 | `fund.auth.*` 冻结额度，按需扣/退 | ✅ 与微信对称，统一抽象可行 |
| **连连（收单）** | ⚠️ 弱/无原生押金冻结 | 收单是「即时收款」模型，无标准预授权冻结（卡组织预授权存在但产品化弱） | ❌ 不建议做押金载体 |
| **PingPong（收单）** | ⚠️ 弱/无原生押金冻结 | 同上 | ❌ 不建议 |
| **连连/PingPong（收款）** | ❌ 不适用 | 收款/结汇是商家侧回款动作，与消费者押金无关 | ❌ |

**结论**：
- **押金强制路由到境内通道**（微信预付费 / 支付宝资金预授权）。路由层（§1.2）在 `businessType=DEPOSIT` 时拒绝境外通道，抛 `ChannelNotSupportDeposit` 错误。
- **境外通道不承载押金**。若未来做境外租赁（场景 A + 押金），替代方案：
  1. **先收后退**：押金作为额外一笔收单，归还时发起退款（退到境外卡）；缺点是已实际扣款、需处理退款失败/拒付
  2. **卡组织预授权（auth-hold）**：若连连/PingPong 收单支持卡预授权（占用额度不扣款），用之；需逐一确认通道产品是否开放此能力
  3. **本地化托管**：在目标市场用本地持牌托管账户（如美国 Escrow）—— 重，仅大型跨境租赁值得
  - 三者均不如境内预授权干净，**再次印证 MVP 押金只做境内**。

---

## 7. 合规与可生产前置清单（硬性 blockers）

### 7.1 境内（微信 + 支付宝）

- [ ] **平台电商资质（ICP/EDI）**：决定微信走电商收付通还是降级普通服务商分账（PRD 已记，与 payment-funds.md 一致）—— **硬 blocker**
- [ ] **微信服务商进件** + 商家二级商户逐个进件（KYC、协议、状态轮询）
- [ ] **支付宝 ISV/服务商身份** + 商户进件 + 分账产品签约 + 预授权产品签约
- [ ] 支付宝**商户号** + 应用 appid + 公钥/私钥/证书（沙箱先联调）

### 7.2 境外（连连 / PingPong）

- [ ] **主体资质**：营业执照、法人、对公账户；跨境收款开户需店铺证明/贸易背景材料
- [ ] **KYC**：商户实名 + 受益所有人（UBO）披露 —— 收单比收款更严
- [ ] **外汇/结汇合规**（场景 B 核心）：
  - 由连连/PingPong 作为持牌机构代为结汇申报，**平台/商家需提供贸易背景真实性材料**（订单/物流/店铺数据）
  - 个人结汇年度额度限制（5 万美元/年）—— 商家须以**企业/对公**结汇，不能用个人账户
  - 跨境电商综合试验区政策（如杭州）可享受增值税免征/退税，需符合条件
- [ ] **境外收单（场景 A）额外 blocker**（MVP 不做，二期再清）：
  - 商户业务真实性 + 拒付率风控
  - PCI-DSS（若直接处理卡号，平台需合规；走通道托管收银台可降级）
  - 目标市场本地支付/消费者保护法规（如欧盟 PSD2/SCA 强客户认证）
  - 反洗钱（AML）/ 制裁名单筛查
- [ ] **数据出境**：跨境支付涉及用户/订单数据传给境外通道，需符合《数据安全法》《个人信息保护法》数据出境要求（标准合同/安全评估）

### 7.3 硬性 blocker 优先级

| Blocker | 影响 | 优先级 |
|---|---|---|
| 平台 ICP/EDI 资质 | 决定境内分账方案 A/B | 🔴 P0（决定架构） |
| 微信服务商 + 支付宝服务商进件 | 境内通道能否上线 | 🔴 P0 |
| 跨境收款开户（连连/PingPong 选一） | 境外收款能否上线 | 🟡 P1（场景 B 启动前） |
| 企业对公结汇 + 贸易背景材料 | 结汇合规 | 🟡 P1 |
| 数据出境合规 | 跨境通道数据传输 | 🟡 P1 |
| 境外收单全套（PCI/AML/PSD2） | 场景 A | 🟢 P2（二期） |

---

## 8. 可生产推荐方案（汇总）

### 境内双通道
- **微信**：电商收付通 + 二级商户（每 tenant=sub_mchid）+ 预付费押金（详见 payment-funds.md）
- **支付宝**：服务商 + 商户进件 + 分账（与微信对称）+ 资金预授权冻结押金
- **统一抽象**：§1 的 `PaymentChannel` 接口，`settle()`/`freezeDeposit()` 两通道各实现
- **MVP 取舍**：C 端微信小程序仅集成微信支付（生态限制）；支付宝通道先做接口+沙箱，PC/H5/支付宝小程序端上线时启用

### 境外选型
- **默认场景 B（跨境收款/结汇）**：PingPong 或连连**跨境收款**产品线（二选一或并存）
  - 选型：纯电商收款两者皆可，按商家已在用/费率选；**需要跨境收单时首选连连**（牌照更全）
  - tenant 配置：每个跨境商家在 `MerchantChannelConfig` 配其收款账户
- **场景 A（跨境收单）二期**：连连全球收单（牌照/风控更稳），仅在真有境外 C 端消费者付款入口时启用

### 押金
- 强制境内（微信预付费 / 支付宝预授权），境外通道拒绝承载押金

### 架构
- cool-admin 插件 `plugin-payment`，Strategy + Router + WebhookDispatcher；实体继承 BaseEntity 多租户隔离；回调反查 tenant

---

## 9. 对数据模型的增量（在 payment-funds.md 基础上）

```ts
ChannelCode = 'wxpay' | 'alipay' | 'lianlian_collect' | 'lianlian_payout' | 'pingpong_collect' | 'pingpong_payout'
// 连连/PingPong 各拆 collect(收单)/payout(收款结汇) 两个实现，因 API/资质差异大

MerchantChannelConfig  (tenantId + channelCode)
  + channelMerchantRef / credentials_enc / split_receivers[] / settle_account_id / onboarding_status
  + cross_border_ext    { vba_accounts[], platform_refs[] (Amazon/Shopify 店铺), settle_currency }

PayOrder  (在 payment-funds.md 基础上扩充)
  + channel_code        走哪个通道
  + channel_region      domestic / cross_border
  + channel_merchant_ref 反查 tenant 用
  // 押金记录、分账账单沿用 payment-funds.md

WebhookEvent (统一回调事件)
  + type / orderChannelRef / amount / businessType / channel / raw / verified
```

---

## External References

- 连连国际（跨境收款/全球收单）首页：https://global.lianlianpay.com  ✅[已核实产品线/平台覆盖/封顶费率]
- 连连数字官网：https://www.lianlian.com  ✅[已核实牌照数/美国全州货币转移]
- 连连国际收款/虚拟账户后台：https://www.lianlianglobal.cn  ✅[已核实 VBA 产品]
- PingPong 官网：https://www.pingpongx.com  ✅[已核实产品线/覆盖国家]
- PingPong 开发者平台：https://developer.pingpongx.com  ⚠️[SPA，字段待落地核实]
- PingPong 跨境收款/全球收单产品页：/product/receipt、/product/acquiring  ⚠️[SPA]
- 支付宝开放文档：https://opendocs.alipay.com  ⚠️[SPA，分账/资金预授权/当面付字段待核实]
- 支付宝资金预授权（押金冻结）：opendocs.alipay.com `alipay.fund.auth.*` 系列  ⚠️[待落地核实接口名]
- 支付宝分账：opendocs.alipay.com 「商家分账」`alipay.trade.order.settle` / `alipay.trade.royalty.*`  ⚠️[待落地核实]
- 微信支付 v3 / 电商收付通 / 分账 / 预付费（见 payment-funds.md References）

## Caveats / Not Found

- ⚠️ **官方文档全部 SPA 渲染**，curl 无法获取正文。已核实事实（牌照数、平台覆盖、封顶费率、公司基线）逐条标注 ✅[已核实]；其余（具体接口字段、签约门槛、精确费率、虚拟账户币种清单、收单拒付处理细节、卡组织预授权开放情况）**未能逐字核实**，标注「待落地核实」，接入前必须以商户平台/开发者文档最新版本为准。
- ⚠️ **费率均为量级/封顶**（如 0.2%/0.3%–1%/1% 封顶），**实际签约费率因平台、币种、行业、风控而异**，不可作为成本核算最终值。
- ⚠️ **场景判定依赖业务方确认**（PRD Open Question）：平台「境外」指跨境收单(A) 还是收款/结汇(B)。本研究默认 B，若实际是 A，境外通道选型与押金方案需重做（见 §5/§6）。
- ⚠️ **支付宝在微信小程序内无法拉起**（生态限制）——MVP C 端仅微信支付，支付宝通道服务 PC/H5/支付宝小程序端，二期启用。
- 未深入：连连/PingPong 的 B2B 外贸收付款、VCC、退税、汇率对冲（光年）等增值产品——若平台后续做供应链金融/退税再补研究。
- 未核实：境外卡组织预授权（auth-hold）在连连/PingPong 收单中是否产品化开放（影响场景 A 的押金替代方案 §6）。
