# Research: uni-app 跨平台前端技术栈（多租户租售电商，微信小程序优先）

- **Query**: uni-app 版本（Vue3+Vite / uni-app x / Vue2）+ UI 库 + 状态管理 + TS + 请求层；多租户/商家上下文在 C 端如何流转
- **Scope**: external（2025 现状调研，基于 npm registry、GitHub API、DCloud 官方文档实时抓取）
- **Date**: 2026-07-07
- **数据来源**: npm registry（`registry.npmjs.org`）、GitHub REST API（stars/pushed_at）、DCloud 官方文档（`doc.dcloud.net.cn/uni-app-x/`）。所有"维护状态"结论均带抓取时间戳，非凭记忆。

---

## TL;DR — 推荐主栈

| 维度 | 推荐 | 一句话理由 |
|---|---|---|
| 框架版本 | **uni-app (Vue3 + Vite + TS)**，**不用** uni-app x、**不用** Vue2 | 微信小程序生态最成熟、组件库支持最广、生产风险最低；uni-app x 的微信小程序端仍在追赶且有 API 限制 |
| UI 库 | **wot-design-uni（主）** + 按需补充 `uni-ui`(DCloud 官方) | 2025–2026 维护活跃、TS 完整、Vue3 原生、组件丰富；DCloud 官方兜底 |
| 状态管理 | **Pinia** | uni-app 官方与 Vue3 生态首选；Vuex 已停滞 |
| 语言 | **TypeScript**（`<script setup lang="ts">`） | 已假设 TS；uni-app Vue3+Vite 官方模板原生支持 |
| 请求层 | 基于 `uni.request` 的自封装 + **拦截器注入 tenant header** | 跨端唯一稳定 API；拦截器是租户上下文注入点 |
| 多租户上下文 | **「一套代码 + 每商家一个独立小程序（不同 AppID）+ 编译期/启动期注入 tenantId」** 为主，预留「单小程序内商家切换」 | 见下文 §6，与多商家入驻 SaaS 形态最匹配 |

---

## 1. uni-app 版本选型

### 三个候选

| 版本 | 技术栈 | 微信小程序支持 | 生态/组件库 | 适用判断 |
|---|---|---|---|---|
| **uni-app (Vue3 + Vite)** | Vue3 SFC + Vite + TS + `uni.request` 等 uni API | **成熟、一等同级**（所有主流 UI 库均支持） | 最广 | **推荐** |
| **uni-app x** | uts（强类型）+ uvue（类 Vue3 DSL，编译到原生/小程序） | **已支持但有限制**（见下） | 较小，多需 uts 重写 | 暂不推荐（见风险） |
| uni-app (Vue2 + webpack) | Vue2 + webpack | 成熟 | 老，但 Vue2 已 EOL | 不推荐（新项目勿选） |

### uni-app x 的微信小程序现状（关键决策输入，2026-07 实测）

抓取 `doc.dcloud.net.cn/uni-app-x/mp/` 官方"小程序平台专题指南"确认：

- uni-app x **支持编译到微信小程序**，需 **HBuilderX 4.41+** 且 **微信开发者工具/基础库 ≥ 3.7.1**。
- 官方明确：uni-app x 在小程序端提供跨平台 **Element API**，把部分能力映射到小程序 **wxs**；并坦言**部分 wxs 能力/某些写法在小程序端不可用或受平台限制**（"代码不强依赖 wxs、wxs 相关也受平台限制"）。
- uvue 的强类型 DOM 模型（`UniElement`、refs、`virtualHost`）在 MP 端是"近似映射"，并非全等。

**结论**：uni-app x 的 App（Android/iOS/鸿蒙）端是其主战场和性能卖点；**微信小程序端是"能编译、有差异"的二级支持**。对一个**首要目标就是微信小程序**的电商 App，uni-app x 当前的"性能红利"在 MP 端兑现不了（MP 端仍走小程序运行时），却要承担 uts 学习成本 + 组件生态薄 + 平台差异坑。**现阶段不值。**

> 版本号抓取佐证（npm）：`@dcloudio/uni-app`、`@dcloudio/uni-mp-weixin` 的 latest tag 均为 `2.0.2-5010420260703001`（编译日期戳 2026-07-03，**持续维护中**）。注：DCloud 的 npm tag 不直读语义版本，实际由 HBuilderX/CLI 模板的 `@dcloudio/uni-app` 系列锁定 3.x/4.x 编译器；以 HBuilderX/CLI 官方模板版本为准。

### Vue2 为何排除

- Vue2 已于 2023-12-31 官方 EOL；新项目无理由选。
- npm 抓取：`vuex` latest `4.1.0`，`modified 2025-04-09`，**近一年无新功能推进**（仅安全维护）。生态明确在迁向 Pinia。

---

## 2. UI 组件库对比（**2025–2026 维护状态已实抓，含弃坑标注**）

> 抓取时间 2026-07-07。`pushed_at` = 仓库最近一次代码推送；`npm modified` = 最近一次发版。"活跃"判据：近 6 个月有代码/发版。

| 库 | 技术栈 | GitHub stars | 最近代码推送 | npm 最近发版 | 微信小程序 | TS | 电商组件 | **状态判定** |
|---|---|---|---|---|---|---|---|---|
| **wot-design-uni** | Vue3 + TS（原生） | 2,269 | 2026-05-12 | 1.14.0 / 2026-01-04 | ✅ | ✅ 完整 | 良（SKU/Price/CountDown 等） | 🟢 **活跃，推荐主选** |
| **uni-ui** (DCloud 官方) | Vue3/Vue2 兼容 | 2,085 | 2026-07-03 | 1.5.12 / 2026-03-26 | ✅ | ✅ | 中（偏基础） | 🟢 官方兜底，活跃 |
| **uview-plus** | Vue3 + TS（uView2 fork） | 705 | **2026-07-05** | 3.8.55 / 2026-06-12 | ✅ | ✅ | 优（购物车/订单/搜索等电商件齐） | 🟢 活跃，可作为电商件补充 |
| **uv-ui** (climblee) | Vue3/2 兼容 (uView2 fork) | 1,341 | **2024-07-28** | 1.0.25 / **2023-11-17** | ✅ | ⚠️ | 中 | 🔴 **近 2 年无更新，按弃坑处理** |
| **tmui** (tmui.design) | Vue3 + TS（含 nvue） | 仅 22（GitHub 镜像 `axbug/tmui-design`，主站在 gitee） | 2025-05-12 | npm 上 `tmui` 是无关的 2018 占位包 | ✅ | ✅ | 中 | 🟡 小众、社区小、平台分散，**生产慎用** |
| NutUI (京东) uni-app 版 | Vue3 | 6,506（主仓 `jdf2e/nutui`） | 2026-04-02 | uni-app 版随主仓发布 | ✅ | ✅ | 优 | 🟢 可选，但 uni-app 版本跟随主仓、文档分散 |

### 弃坑/陈旧库明确标注（**必须规避**）

- **🔴 uv-ui（climblee/uv-ui）**：2024-07-28 后无代码推送，npm 发版停在 2023-11-17。**按已弃坑处理，新项目不要用。**（这是本次调研最重要的一个"避雷"。）
- **🟡 tmui**：npm `tmui` 是无关占位包；真正仓库在 Gitee + GitHub 镜像 `axbug/tmui-design`（仅 22 star，2025-05 后无大动作）。社区规模与跨端稳定性不足以支撑一个生产级多租户电商，**不建议作为主选**。
- **🟡 wot-ui（`wot-ui` npm）**：与 `wot-design-uni` 不同，是 0.1.0-alpha（2025-03），非生产可用。**别认错包。**

### 推荐组合

- **主组件库：wot-design-uni** — Vue3 原生、TS 完整、近 6 个月持续迭代、设计统一、文档好。
- **兜底/补充：uni-ui（DCloud 官方）** — 出问题最少、和 uni-app 编译器同源维护，用作 wot 未覆盖或需要"最稳"的组件。
- **电商专项件**（如复杂 SKU 选择器、瀑布流商品卡）：wot 不足时用 **uview-plus** 的对应组件临时补位（同在 Vue3+TS 体系，组合成本低）。

---

## 3. 状态管理：Pinia（确认）

| 维度 | Pinia | Vuex |
|---|---|---|
| npm latest | 3.0.4（2025-11-05 修改） | 4.1.0（2025-04-09 修改） |
| 维护态势 | 活跃，Vue 官方推荐 | 仅安全维护 |
| TS 体验 | 原生优 | 弱 |
| 与 uni-app Vue3 | 官方推荐组合 | 可用但过时 |
| 模块化 | 天然 store 分文件 | 需 modules |

**结论：Pinia。** `pinia` 在 uni-app Vue3 下开箱即用，无 SSR/插件兼容包袱。

### 多租户上下文如何放（建议 store 切分）

```
stores/
  tenant.ts     // 当前商家上下文（tenantId/merchantId、店铺信息、主题色/logo）—— 单例，全局只读为主
  auth.ts       // 用户登录态、token（跨商家共享的 C 端用户身份）
  cart.ts       // 按 tenantId 分桶的购物车：Record<tenantId, CartItem[]>
  rental.ts     // 进行中的租赁单/归还流程的临时态（押金试算、租期选择）
```

- **租户上下文（tenant）必须和购物车（cart）解耦**：因为 C 端用户可跨商家，**购物车天然按 tenantId 分桶**，切商家时不丢车、下单时按当前 tenantId 取车。这是多租户电商前端最容易踩的耦合点，需在 store 设计期就定死。
- tenant store 在 **冷启动/切商家时** 由"租户解析器"写入（见 §6），其余地方只读消费，禁止业务代码直接 set。

---

## 4. TypeScript 接入（uni-app + Vue3 + Vite）

- 官方 CLI 模板 `npx degit dcloudio/uni-preset-vue#vite-ts` 即 TS 起手。
- 关键依赖：`@dcloudio/types`（uni API 的 d.ts，npm 抓取确认 `@dcloudio/uni-app` 的 devDep 锁定 `^3.0.15`，持续维护）。
- 推荐配置：
  - `tsconfig.json`：`"types": ["@dcloudio/types", "@types/wechat-miniprogram"]`（后者仅类型提示，编译产物不依赖）。
  - 严格度：`"strict": true` + `"noUncheckedIndexedAccess": true`（多租户数据隔离强相关，少出 null/undefined 越界）。
  - 路径别名：`@/*` → `src/*`，请求层/store/类型共用。
- 组件 SFC：`<script setup lang="ts">`，`defineProps<T>()` 泛型定义。
- 注意：uni-app 编译到 MP 时，**部分 Node/Web API 不可用**（如 `Buffer`、`process`、DOM），TS 类型上能过、运行时会炸——靠 `@dcloudio/types` 圈定可用 API。

---

## 5. HTTP / 请求层约定（多租户 API）

### 基座
- 跨端唯一稳定网络 API 是 **`uni.request`**（`uni.request` 在 H5/MP/App 三端均可用，是 uni-app 的"fetch"）。
- 不要直接用 `axios`——它在小程序端无 `XMLHttpRequest`/`fetch`，需 adapter，徒增坑。如确需 axios 风格，用社区 `uni-app 系 axios 封装`，但本质仍包 `uni.request`。

### 封装约定（建议接口）

```ts
// src/utils/request.ts
type TenantHeader = 'X-Tenant-Id' | 'X-Merchant-Id'   // 选一个，全局统一
// 拦截器职责（顺序重要）
// 1. baseURL: 从环境/租户配置取（不同商家可能有不同网关/子域）
// 2. tenant header 注入: 从 tenantStore 读 tenantId，写 X-Tenant-Id
//    —— 这是「防跨租户泄漏」在客户端的第一道（服务端必须二次强制，不可只信客户端）
// 3. auth token: 从 authStore 读 token，写 Authorization: Bearer <token>
//    —— 注意 token 通常「平台级/跨租户共享」（C 端一个微信号跨商家），但 tenant header 必须每请求带
// 4. 请求/响应统一日志、错误码归一、401→刷新token/跳登录、统一 loading
// 5. 响应：按 { code, data, message } 解包；403/租户越权 → 显式报错并上报
```

### 多租户相关的硬约定
- **每个业务请求必须带 tenant header**（拦截器统一注入，业务代码不感知）——这是"租户上下文流"的出口。
- **403（跨租户访问）一律拦截并上报**，作为多租户隔离的客户端哨兵（服务端是真相之源，但客户端哨兵能快速发现 bug）。
- 上传/下载用 `uni.uploadFile` / `uni.downloadFile`（不走 `uni.request`），但 tenant header 注入逻辑要同样适用——封装时把拦截器做成"通用前置"而非只绑 `uni.request`。
- 长连接（IM/订单推送）：MP 端用 `uni.connectSocket`（WebSocket），tenant header 通过连接初始握手 query/协议帧携带。

---

## 6. C 端如何识别「当前是哪个商家/店铺」（核心调研点）

### 业界常见模式（按"多商家入驻 SaaS"形态排序）

| 模式 | 做法 | 多商家 SaaS 适配度 | 优点 | 缺点 |
|---|---|---|---|---|
| **A. 每商家一个独立小程序（不同 AppID）** ⭐推荐 | 每个商家注册/复用一个微信小程序 AppID；同一份 uni-app 代码，**编译期/启动期注入 `VITE_TENANT_ID`/`TENANT_ID` 环境变量**写入 tenantStore | 高 | 微信原生分发（小程序码、公众号菜单、扫码直达）；租户边界天然清晰；用户认知简单（"进了某商家的小程序"）；token/会话天然按 AppID 隔离 | 多商家需多 AppID 管理；微信小程序总量有上限；发版需多包 |
| B. 单小程序 + 商家切换 | 一个 AppID，进入后选/扫码绑定 tenantId，存 storage | 中高 | 单包好维护；跨商家跳转顺畅 | 入口弱（要选/扫码）；切换体验差；分享链路要带 tenantId 参数防丢上下文 |
| C. 单小程序 + URL/scene 参数驱动 | 分享/扫码链接里带 `?tenantId=xxx` 或小程序码 scene | 高（常作为 A/B 的补充） | 与 A/B 正交 | 单独用易丢上下文（用户从主页进就没参数） |
| D. 平台聚合店（一个 AppID，多商家混列） | 类似淘宝/美团，平台是主，商家是子页 | 低（与"各自经营"诉求偏离） | 平台强控制 | 弱化商家独立感；本项目的"多商家入驻"通常不要这种 |

### 推荐方案（针对本项目"多商家入驻 SaaS + 租售结合"）

**主：模式 A（每商家独立小程序 AppID）+ 编译期注入 tenantId**
- uni-app 用环境变量（Vite 的 `import.meta.env.VITE_TENANT_ID` 或自定义 `.env.<merchant>`）在构建时把 tenantId 烧进小程序包。
- CI 按商家矩阵多构建产物（同一仓库，不同 `VITE_TENANT_ID` + 不同 `manifest.json` 的 `appid`）。
- tenantStore 启动时从编译期常量初始化，**不可被业务代码改写**（只读），杜绝前端误切租户。

**辅：模式 C（scene/参数兜底）**
- 分享卡片、小程序码、公众号跳转的小程序 `scene` 参数里带 `tenantId`，启动期校验：若 `scene.tenantId === 编译期 tenantId` 才放行，否则报错（防止分享串租户）。
- 用于"同一商家小程序被分享到外部"的入口归一。

**预留：模式 B（商家切换）作为二期**
- 若后续做"平台聚合店"或"商家联盟"，可在 tenantStore 上加 `switchTenant(id)`，并把 cart 按 tenantId 分桶（§3 已预留）。
- 切换时**清空非跨租户的临时态**（如表单草稿、当前商品详情页栈），但**保留 auth token**（C 端身份跨租户共享）。

### 为什么不直接选 B（单包切换）
- 本项目 PRD D2 已定"多商家入驻、各自经营、数据隔离"。微信生态里"一个商家一个小程序"是商家最自然、分发最强（小程序码、附近、搜索、公众号）的形态，且把"租户边界"前移到"包边界"，**前端几乎没有越权风险面**（A 包不可能误请求 B 租户，因为编译期就不同）。B 模式更适合同一主体下的多店聚合，与本项目诉求不完全契合。

---

## 7. 备选栈与何时切换

- **何时考虑 uni-app x**：当 App 端（尤其安卓原生性能、复杂动画/列表）成为瓶颈、且团队愿意吃 uts 成本时，可对 **App 端单独** 走 uni-app x（MP/H5 仍走 Vue3）。即"按端分包"，而非全栈迁 x。
- **何时考虑 NutUI uni-app 版**：若 wot-design-uni 在某个核心电商件上长期不补位，且不想引 uview-plus，可局部引 NutUI（设计语言会割裂，需评估）。
- **若未来要 H5/支付宝小程序**：wot-design-uni + uni-ui 均多端兼容，迁移成本低；请求层因统一走 `uni.request`，零改动。

---

## 8. 关键风险与 Caveats

1. **uv-ui 已实质弃坑**（2024-07 后停更）——任何老教程/模板若引了它，必须替换。这是 2025 起社区最常见的坑。
2. **uni-app x 的 MP 端非"性能优先"**：x 的卖点是 App 原生性能；MP 端仍跑在微信运行时，性能与 Vue3 版持平甚至略差（多一层映射），却要付 uts 成本。**首要目标是 MP 的项目不要为 x 买单。**
3. **DCloud npm tag 不可读语义版本**：`@dcloudio/*` 的 `latest` tag 常指向带日期戳的怪异版本号（如 `2.0.2-5010420260703001`），不要用它判断"是否过时"。以 HBuilderX 版本 / CLI 模板锁定的版本为准。
4. **客户端 tenant header 只是哨兵，不是安全边界**：服务端必须强制 tenant_id 过滤（PRD D3 已要求 RLS/ORM 层）。前端注入 tenant header 是"方便"和"快速发现问题"，不是"防越权"。
5. **跨租户购物车的状态设计是前端最大耦合点**：务必在 store 设计期就把 cart 按 tenantId 分桶定死（§3），否则后期改造成本极高。
6. **小程序包体积分包**：电商主包易超 2MB，需提前规划分包（按商家可选模块、活动页、租赁履约页分包），并和编译期 tenantId 注入联动（不同商家分包配置可不同）。

---

## 9. 一句话决策

> **uni-app (Vue3 + Vite + TS) + wot-design-uni(主)/uni-ui(兜底)/uview-plus(电商件补位) + Pinia + uni.request 封装(拦截器注入 X-Tenant-Id) + 每商家独立小程序(编译期注入 tenantId)**。避开 uv-ui（弃坑），暂不碰 uni-app x（MP 端不划算）。多租户上下文：编译期注入 → tenantStore(只读) → 请求拦截器(每请求带 X-Tenant-Id) → 服务端强制 tenant_id 过滤（真相之源）。购物车按 tenantId 分桶。

---

## 附：数据抓取记录（2026-07-07）

- npm registry（`/latest` 与全量元数据）：`@dcloudio/uni-app`、`@dcloudio/uni-mp-weixin`、`@dcloudio/vite-plugin-uni`、`@dcloudio/uni-ui`、`wot-design-uni`、`uview-plus`、`uv-ui`、`pinia`、`vuex`、`sard-uniapp`、`@nutui/nutui`、`tmui`。
- GitHub API（stars / pushed_at / archived）：`dcloudio/uni-app`(41,569★, pushed 2026-07-06)、`dcloudio/uni-ui`(2,085★, pushed 2026-07-03)、`Moonofweisheng/wot-design-uni`(2,269★, pushed 2026-05-12)、`ijry/uview-plus`(705★, pushed 2026-07-05)、`climblee/uv-ui`(1,341★, pushed **2024-07-28**)、`axbug/tmui-design`(22★, pushed 2025-05-12)、`jdf2e/nutui`(6,506★, pushed 2026-04-02)。
- DCloud 官方文档：`doc.dcloud.net.cn/uni-app-x/mp/`（"编译到小程序"，HBuilderX 4.41+ / 微信基础库 3.7.1+；MP 端走 wxs 映射、部分能力受限）。
