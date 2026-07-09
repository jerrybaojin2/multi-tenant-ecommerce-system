# 研究：跨平台端取舍 + 前端架构细化（多租户租售电商）

> **当前状态说明（2026-07-09）**：本文中的 cool-admin-vue admin 方案仅保留为历史研究参考。当前 PR1 决策为：C 端小程序使用 uni-app 架构，管理后台使用 Next.js，所有后台业务流程调用自研 Midway.js 后端，不放入 Next.js API routes。

- **查询**: 跨平台目标端（MVP 是否只微信小程序 / H5 / App 何时进）；C 端 uni 架构细化（目录、请求层 X-Tenant-Id 拦截器、多租户购物车分桶、租/买双入口、租赁/归还交互）；B/平台 admin 双品牌构建、菜单/权限按角色+租户隔离、插件动态加载；C 端小程序插件分包纳入。
- **范围**: mixed（external：cool-admin-vue 8.x 源码实证 + uni-app 官方机制；internal：基于已定 PRD 与 frontend-uni-stack.md）
- **日期**: 2026-07-07
- **数据来源**:
  - GitHub `cool-team-official/cool-admin-vue` 仓库（默认分支 `8.x`，2431★，2025-12-17 仍维护；package.json version=8.0.0）——**直接读 8.x 分支源码**作为实证（非凭文档记忆）。
  - 前序研究 `research/frontend-uni-stack.md`（uni 栈结论）+ `research/cool-admin-multi-tenant.md` + `research/plugin-architecture.md`。
  - uni-app / 微信小程序官方机制（条件编译、分包、运行时下载限制）。

---

## 摘要 — 决策与推荐

| 议题 | 推荐 | 一句话理由 |
|---|---|---|
| **C 端 MVP 目标端** | **仅微信小程序** | 商家入驻 SaaS 的分发天然在微信（小程序码/公众号/搜索）；先打透一个端，多端后续用 uni 同源代码低成本铺开 |
| **H5/App 何时进** | H5：二期（运营落地页/分享回流）；App：不进 MVP，仅"商家端运营助手"按需 | 见 §1 触发条件。**绝不为多端提前抽象而拖慢 MP 上线** |
| **C 端架构** | uni Vue3+Vite+TS + wot-design-uni + Pinia + `uni.request` 封装（拦截器注入 `X-Tenant-Id`） | 承接 frontend-uni-stack.md，每商家独立小程序 AppID + 编译期 `VITE_TENANT_ID` |
| **多租户购物车** | `Record<tenantId, CartItem[]>` 按 tenantId 分桶；切商家不丢车，下单按当前 tenantId 取车 | 跨商家用户存在，是最大耦合点，store 设计期必须定死 |
| **租/买双入口** | 商品详情同页：顶部 Tab「立即租 / 立即买」切换参数；购物车行级 `mode: 'rent'|'sale'`；下单分流到不同订单状态机入口 | 同一商品承载租赁+零售属性，UI 不分页、数据分路径 |
| **admin 双品牌构建** | **同一份 cool-admin-vue 8.x 代码**，`VITE_BRAND=merchant|platform` 环境变量 + `vite build --mode <brand>` 切换 `.env.<brand>`，品牌差异收敛到 `src/config` + 主题 + logo + 菜单可见性 | 源码实证：cool-admin-vue 品牌信息全走 `VITE_NAME` 等环境变量，无硬编码；一套代码两套产物 |
| **菜单/权限隔离** | **完全后端驱动**：`service.base.comm.permmenu()` 返回 `{menus, perms}`，前端动态注册路由 + 渲染菜单 + 挂权限指令 | 源码实证（`src/modules/base/store/menu.ts`）；租户隔离在后端 tenant_id 过滤 + 角色 perms 双重，前端只渲染服务端给的 |
| **admin 插件动态加载** | 插件 = `src/plugins/<name>/` 目录约定（`config.ts`+`service/`+`views/`），`import.meta.glob` 编译期扫描；**页面默认不在路由扫描内，靠后端菜单 `viewPath` 或 `config.ts` 的 `views` 注册**；真正"运行时热插"在后端，前端是"安装插件→重新构建/或后端下发的菜单 viewPath 指向已编译组件" | 源码实证（`bootstrap/module.ts`、`router/index.ts`） |
| **C 端小程序插件** | **无运行时热插**（微信禁运行时下载执行 JS）→ C 端"插件"= uni 分包 + 构建期纳入，按 `VITE_TENANT_ID` + 商家套餐决定是否打该分包 | 与 PRD 约束一致；如实标注，不夸大 |

---

## 1. 跨平台目标端决策

### MVP：**仅微信小程序**

理由（按优先级）：
1. **分发匹配**：多商家入驻 SaaS，商家获客主入口是小程序码、公众号、附近、搜索——全在微信生态。H5/App 在 MVP 无独立获客价值。
2. **支付闭环**：租赁押金 + 租金 + 货款需微信支付，小程序原生支付体验最短链路。
3. **能力对齐**：租赁履约需推送（模板消息/订阅消息）、扫码（取还货核销），MP 原生支持且最稳。
4. **资源聚焦**：greenfield，团队应把有限精力打透"租售并行 + 多租户隔离"这条主线，而非先吃多端差异。

### H5 / App 进入条件（触发清单）

| 端 | 何时进（满足任一） | 价值 | 增量成本 |
|---|---|---|---|
| **H5** | ① 需要小程序外分享落地页（朋友圈/外部浏览器回流）；② 平台运营做营销活动 H5 落地；③ 商家需要"小程序未覆盖用户"的兜底访问 | 分享回流、SEO、PC 端访问 | 低：uni 一码多端，请求层/UI 库多端兼容，**主要工作是支付适配（H5 微信支付/其他支付）+ 域名/备案** |
| **App（uni 编译）** | **暂不进**。除非出现：① 商家端要做重运营 App（库存/履约/对账移动化，超出 admin H5 范围）；② 需原生能力（蓝牙取还货设备、推送保活）MP 不够用；③ 出海/多商店分发硬需求 | 原生能力、独立分发 | 高：App 打包/签名/上架/更新通道；建议届时**单独评估 uni-app x 仅 App 端**（见 uni-stack.md §7） |

**关键原则**：**不为"以后要多端"而在 MVP 提前抽象**。uni 的条件编译（`#ifdef MP-WEIXIN`）允许后续按端打补丁，前期过度抽象（如把所有交互写成平台无关）反而拖慢。MVP 直接用 MP API，多端需求出现时再用条件编译分支。

### 不进 MVP 的端（明确排除）

- **支付宝/抖音/百度小程序**：除非商家有明确该生态客群，否则不进。每加一个端 = 一套 AppID/审核/支付配置/测试矩阵。
- **快应用**：不进。
- **PC 客户端（Electron）**：admin 用 Web 即可，不做桌面端。

---

## 2. C 端 uni 架构细化

### 2.1 目录结构（推荐）

```
src/
  App.vue
  main.ts
  pages.json              # uni 页面/分包/tabBar 注册（MP 必需，非 vue-router）
  manifest.json           # uni 配置（appid/权限/分包预加载等），CI 按商家替换 appid
  env.d.ts
  env/                    # 商家维度的环境变量（编译期注入）
    .merchant-a.env       # VITE_TENANT_ID=tenant_a, VITE_APPID=wxAAA...
    .merchant-b.env
  config/
    index.ts              # 导出编译期常量：tenantId, appName, apiBase, brand 主题
  utils/
    request.ts            # uni.request 封装 + 拦截器（X-Tenant-Id / token / 401/403）
    tenant.ts             # 租户解析器：编译期常量 + scene 参数校验
  stores/
    tenant.ts             # 当前商家上下文（只读，启动期写入）
    auth.ts               # token / 用户信息（跨租户共享）
    cart.ts               # Record<tenantId, CartItem[]> 分桶购物车
    rental.ts             # 进行中租赁单/归还流程临时态
  api/
    goods.ts              # 商品（含租/售双属性）
    order.ts              # 订单（rent/sale 两套状态机入口）
    rental.ts             # 租赁履约：续租/归还/逾期
    pay.ts                # 支付（押金+租金+货款）
  components/
    goods-card.vue        # 商品卡（租/售价同显）
    rent-buy-switch.vue   # 租/买切换组件
    sku-picker.vue        # SKU 选择（区分租赁 SKU 维度：租期档）
  pages/                  # 主包：首页/分类/商品详情/购物车/订单/我的（tabBar 5 页）
  subpackages/            # 分包（按业务域，降主包体积）
    rental/               # 租赁履约：归还/续租/押金明细
    order/                # 订单详情/物流/评价
    activity/             # 活动/优惠券（可按 tenantId 套餐裁剪）
  static/                 # 商家品牌资源（CI 按商家替换 logo/主题色）
```

**分包规划（应对 MP 主包 2MB 限制，与 frontend-uni-stack.md §8.6 一致）**：
- 主包只放 tabBar 5 个一级页 + 登录 + 必备公共件。
- 租赁履约、订单详情、活动页进分包。
- 分包可按 `VITE_TENANT_ID` + 商家套餐**条件纳入**：低套餐商家不打 `activity` 分包，CI 用环境变量驱动 `pages.json` 的 `subPackages` 数组。

### 2.2 请求层封装（带 X-Tenant-Id + token 拦截器）

**基座**：跨端唯一稳定是 `uni.request`（不用 axios，MP 端无 XHR/fetch）。封装一个 `request(options)` + 拦截器数组。

```ts
// src/utils/request.ts（接口骨架，非最终代码）
type Interceptor = (config: UniRequestOptions) => UniRequestOptions | Promise<UniRequestOptions>

// 拦截器职责（顺序重要）
// 1. tenant header 注入：从 tenantStore 读 tenantId → headers['X-Tenant-Id']
//    —— 编译期烧死的 tenantId 兜底，运行期 tenantStore 覆盖（支持未来商家切换）
// 2. auth token：从 authStore 读 → headers['Authorization'] = `Bearer ${token}`
//    —— token 跨租户共享，但 tenant header 每请求必带
// 3. 请求/响应统一日志（dev）、loading、错误码归一
// 4. 响应：按 { code, data, message } 解包
//    - code === 1000（成功约定，与 cool-admin-vue 源码 request.ts 一致）→ return data
//    - 401 → refreshToken / 跳登录
//    - 403（含跨租户）→ 显式报错 + 上报（客户端哨兵，服务端是真相之源）
// 5. 上传 uni.uploadFile / 下载 uni.downloadFile：tenant header 拦截逻辑要同样适用
//    —— 把拦截器做成"通用前置"而非只绑 uni.request
```

**多租户硬约定（与 frontend-uni-stack.md §5 一致，强化）**：
- **每个业务请求必须带 `X-Tenant-Id`**（拦截器统一注入，业务代码不感知）。
- **403（跨租户）一律拦截并上报**，作为隔离的客户端哨兵（服务端 TypeORM Subscriber + tenant_id 才是真相之源）。
- **客户端 tenant header 不可被业务代码改写**：tenantStore 启动期由"编译期常量 + scene 校验"写入，业务只读。

### 2.3 多租户购物车按 tenantId 分桶

```ts
// stores/cart.ts（数据形状，非最终代码）
type CartItem = {
  goodsId: string
  skuId: string
  qty: number
  mode: 'rent' | 'sale'      // 关键：租/买在同一购物车里分轨
  rentTermId?: string         // mode=rent 时：租期档（月/周/日）
  depositSnapshot?: number    // mode=rent 时：押金快照（防租期档调价）
  priceSnapshot: number       // 价格快照（防下单前调价）
  addedAt: number
}

type CartState = {
  buckets: Record<string /* tenantId */, CartItem[]>  // 按 tenantId 分桶
}

// 行为：
// - add(item): push 到 buckets[currentTenantId]
// - 切商家（未来模式 B）时不清空，UI 按 currentTenantId 过滤展示
// - 结算：只取 buckets[currentTenantId] 的选中项；下单请求带 tenantId
// - 持久化：uni.setStorageSync('cart', buckets)，结构含 tenantId 维度
```

**关键点**：购物车与租户上下文**必须解耦**（frontend-uni-stack.md §3 已强调，此处落地为 `Record<tenantId, CartItem[]>`）。MVP 模式 A 下只有一个桶，但数据结构按多桶设计，未来切换/聚合零改造成本。

### 2.4 同一商品的「租/买」双入口交互

**商品详情页（单一页面，不拆租/买两页）**：
- 顶部 / SKU 区：**`<rent-buy-switch>` 切换**（Tab 或 Segment：「立即租 / 立即买」）。
  - 切到"租"：SKU 选择器多出**租期档**维度（如 月租/季租/年租，各对应租金 + 押金）；底部 CTA 变「加入租赁车 / 立即租赁」。
  - 切到"买"：标准 SKU + 数量；底部 CTA「加入购物车 / 立即购买」。
- 价格区**同时展示**：日租金/月租金（小字）+ 零售价（主），让用户一眼知道"还能租"。
- 加车时根据当前 mode 写入 `CartItem.mode`，**同一商品可在购物车里同时存在 rent 行和 sale 行**（不同 skuId 或同 skuId 不同 mode 视为两行）。

**购物车页**：
- 按租/买**分组渲染**（租赁组 / 零售组），各自小计：租赁组小计 = Σ(租金×租期) + Σ押金；零售组小计 = Σ价格。
- 结算分流：租赁组 → 租赁订单状态机（待付押金+首期租金 → 发货/自提 → 履约中 → 到期归还/续租 → 押金结算）；零售组 → 标准零售订单状态机。
- **MVP 可限制：单次结算只能同 mode 同 tenantId**（避免租/买混合单状态机复杂度），UI 强制分组结算。

**`rent-buy-switch` 组件契约**：emit `change(mode)`，父组件据此切换 SKU 选择器 schema 与 CTA；状态 lifted up 到商品详情页，不进全局 store（避免污染）。

### 2.5 租赁订单 / 归还流程的小程序交互要点

租赁履约是本项目相对标准电商的**最大差异点**，MP 交互要点：

1. **押金透明化**：下单页**单独高亮押金金额**与"归还时按规则退还"说明；支付页拆分「押金 + 租金/货款」两笔，符合微信支付对资金类型的合规要求（与 PRD 未决问题「支付与资金流」强相关，需后端配合分账）。
2. **租期可视化**：订单详情用**时间轴/日历组件**展示「起租日 → 到期日 → 今日」，倒计时组件（wot-design-uni 有 CountDown）提示"距到期 X 天"。
3. **归还入口**：
   - 到期前 N 天（订阅消息推送）→ 订单详情出现「申请续租 / 申请归还」CTA。
   - 归还方式（待 PRD 定履约方式）：物流归还（填单号）/ 到店归还（扫码核销）/ 上门取件（预约时段）。**MP 端用 `uni.scanCode` 做到店核销最顺**。
   - 归还后状态：待验机 → 验机定损（扣减押金明细）→ 押金结算（退款原路）。
4. **续租**：在订单详情「续租」→ 选择新租期档 → 补付租金 → 到期日顺延；**续租不改原订单 ID**，建议作为原订单的子操作/续租记录。
5. **逾期处理**：到期未归还 → 状态转"逾期" → 推送 + 醒目提示 → 押金按日扣或转买断（视业务规则，待 PRD 定）。
6. **订阅消息**：MP 模板/订阅消息是租赁履约通知主通道（到期提醒、归还确认、押金到账），需在小程序后台配模板，下单/归还时 `uni.requestSubscribeMessage` 申请授权。
7. **分包**：租赁履约页（归还/续租/押金明细/验机）整体进 `subpackages/rental`，降主包体积。

---

## 3. B / 平台 admin（cool-admin-vue 8.x）

> **重要更正**：PRD 与 uni-stack.md 多处写 "cool-admin-vue3"，**实际 GitHub 仓库名是 `cool-admin-vue`**（owner `cool-team-official`），默认分支 `8.x`，package.json version `8.0.0`。它本身就是 Vue3（Vue 3.5 + Vite 5 + element-plus 2.10.2 + Pinia 2.3 + vue-router 4.5）。后文统一称 `cool-admin-vue`。

### 3.1 源码实证的关键机制（决策依据）

| 机制 | 源码位置（8.x 分支） | 实证要点 |
|---|---|---|
| **启动** | `src/main.ts` → `src/cool/bootstrap/index.ts` | `bootstrap(app)`：Pinia → router → `createModule(app)`（扫描模块/插件）→ `createEps()`（注入后端 endpoint service） |
| **模块/插件加载** | `src/cool/bootstrap/module.ts:9` | `import.meta.glob('/src/{modules,plugins}/*/{config.ts,service/**,directives/**}', {eager:true})` —— **modules 和 plugins 同机制**，约定目录即注册 |
| **模块 config 契约** | `src/cool/types/index.ts` (`ModuleConfig`) | `enable/order/install/onLoad/components/views/pages/ignore/toolbar/index/demo` —— 插件就是返回此结构的 `config.ts` |
| **菜单/权限** | `src/modules/base/store/menu.ts:162` | `service.base.comm.permmenu()` 拉后端 `{menus, perms}` → `setGroup`(菜单树) + `setRoutes`(视图路由) + `setPerms`(权限码) —— **完全后端驱动** |
| **路由动态注册** | `src/cool/router/index.ts:76-121` | `router.append(route)`：按 `route.viewPath` 从 `import.meta.glob` 找组件（`files['/src/'+viewPath.replace('cool/','')]`）→ `addRoute` |
| **路由扫描范围（重要）** | `src/cool/router/index.ts:19` | `import.meta.glob(['/src/modules/*/{views,pages}/**/*'])` —— **只 glob 了 `modules`，没 glob `plugins`**。插件页面要么靠后端菜单 `viewPath` 指向（被 modules glob 覆盖不到→需补 glob），要么靠插件 `config.ts` 的 `views/pages` 显式注册 |
| **请求拦截器** | `src/cool/service/request.ts:29-112` | 已有：`Authorization`、`language`、token 过期→refreshToken 队列、401→logout、403/500→跳错误页。**没有 X-Tenant-Id 注入** —— 本项目要加 |
| **响应码约定** | `src/cool/service/request.ts:129-134` | `code===1000` 成功，其余 reject。C 端封装应沿用此约定保持一致 |
| **品牌/配置** | `.env` + `src/config/index.ts` | `.env` 仅 `VITE_NAME`（品牌名）+ `VITE_TIMEOUT`；`config.app.name` 读 `VITE_NAME`。**品牌信息全走环境变量，零硬编码** → 双品牌构建天然友好 |
| **vite 构建** | `vite.config.ts:26-36` | `cool({ type:'admin', proxy, eps:{enable:true}, svg, demo })` —— `@cool-vue/vite-plugin` 的 `cool()` 是品牌/eps/svg 注入钩子点 |
| **i18n 自动纳入** | `vite.config.ts:42-44` | `VueI18nPlugin({ include: ['./src/{modules,plugins}/**/locales/**'] })` —— 插件 locale 文件自动被采集 |

### 3.2 双品牌构建与部署（商家后台 vs 平台运营后台）

**方案：同一份 `cool-admin-vue` 8.x 代码，环境变量驱动双产物。**

```
# 构建命令
vite build --mode platform     # 平台运营后台
vite build --mode merchant     # 商家后台

# .env.platform
VITE_BRAND=platform
VITE_NAME="XX 租售平台 · 运营后台"
VITE_API_BASE=/api
VITE_THEME_PRIMARY=#...        # 平台主色

# .env.merchant
VITE_BRAND=merchant
VITE_NAME="XX 租售 · 商家后台"
VITE_API_BASE=/api
VITE_THEME_PRIMARY=#...
```

**品牌差异收敛点（4 处，不散落业务代码）**：
1. **`src/config`**：`brand = import.meta.env.VITE_BRAND`，全局只读。
2. **主题/logo/static**：`src/modules/base/static/` 下按品牌分目录，`config.ts` 的 `install` 按 `brand` 选资源；或用 Vite `resolve.alias` 按 mode 切到不同 `static`。
3. **菜单可见性**：菜单本就后端驱动，平台/商家角色的 perms 不同 → 自然渲染不同菜单。前端再加 `meta.brand` 兜底过滤（防后端配错）。
4. **功能模块开关**：平台独有功能（租户管理、商家入驻审核、平台分账对账、全局数据）放 `src/modules/platform`，`config.ts` 的 `enable` 读 `brand==='platform'`；商家独有（店铺装修、自营商品）同理。

**部署**：两套独立静态产物，不同子域（`admin.platform.com` / `<merchant>.admin.com` 或 `admin.com/?brand=merchant`），各自指向同一后端（后端按角色+tenantId 区分）。Nginx 配独立 server 块（仓库已带 `nginx.conf`）。

> 源码佐证可行性：`vite.config.ts` 已支持 `build-static`（hash 路由）、`build-demo`（演示模式）等多 mode 构建；`config.app.router.mode` 按 `import.meta.env.MODE` 切 hash/history。加 `platform/merchant` 两个 mode 是同一模式的扩展，无新机制。

### 3.3 菜单 / 权限按角色 + 租户隔离

**职责划分（重要）**：

| 层 | 职责 | 实现 |
|---|---|---|
| **后端（真相之源）** | 按 `tenantId` 过滤数据 + 按角色返回 perms | cool-admin v8 TypeORM Subscriber（tenant_id 过滤）+ 角色 perms 表（PRD D3） |
| **前端（渲染层）** | 只渲染后端给的菜单/perms；不做任何安全决策 | `service.base.comm.permmenu()` → `menuStore` → 路由 + 菜单 + `v-permission` 指令 |

**角色与租户的组合（建议 perms 设计）**：
- **平台超管**（`admin`，PRD 中的白名单）：后端绕过 tenant_id 过滤，`permmenu` 返回**全平台菜单**（租户管理、商家审核、全局订单、分账对账、插件市场）。前端 `brand=platform` + 渲染全菜单。
- **平台运营**（平台子账号）：受限平台菜单，仍跨租户（受限于 perms 控制的租户范围）。
- **商家管理员**：`permmenu` 仅返回本租户菜单（商品、订单、店铺、员工、本租户财务），**后端 tenant_id 过滤保证只看到本租户数据**。
- **商家员工**（商家子角色）：商家菜单的子集（如只能看订单不能改价）。

**前端隔离要点**：
1. **登录分流**：登录页据 `VITE_BRAND` 决定入口语义（平台登录 vs 商家登录），可同页不同标题；后端按账号类型签发带 `tenantId`/角色的 token。
2. **`v-permission` 指令**（源码 `src/modules/base/directives/permission.ts` + `checkPerm`）：按 perms 数组控制按钮/元素显隐。**注意：这只是 UX，不是安全边界**——服务端必须独立鉴权。
3. **跨租户越权哨兵**：响应 403（源码已跳 `/403` 页）+ 前端日志上报；但**前端任何渲染/隐藏都不可作为安全依据**。
4. **数据可见性**：前端列表页**不显示租户列**给商家（本租户只有一桶数据），平台后台才显示 `tenantId` 列做跨租户筛选——这与 PRD "平台运营能跨租户、商家严格本租户" 一致。

### 3.4 插件菜单 / 页面 / 路由动态加载

> cool-admin 的"插件"在前端 = `src/plugins/<name>/` 目录约定（与 `modules` 同机制，源码 `bootstrap/module.ts:9` 的 glob 同时覆盖两者）。

**插件前端结构**：
```
src/plugins/<plugin-name>/
  config.ts        # ModuleConfig：install/onLoad/views/pages/components/ignore
  service/         # 该插件的 API service（被 eps 注入或手写）
  views/           # 插件业务页（在菜单里展示的页面）
  pages/           # 插件独立页（非菜单内，如设置弹窗）
  components/      # 插件私有组件
  locales/         # i18n（vite.config.ts 的 VueI18nPlugin 自动采集）
  directives/      # 插件自定义指令
```

**动态加载的三条路径（按场景）**：

1. **编译期纳入（默认，MVP 用这条）**：插件源码放 `src/plugins/`，`import.meta.glob` 编译期扫描 → `config.ts` 的 `views/pages` 注册路由 + 组件。**无运行时下载**，是静态打包。后端"安装插件"操作 → 后端表记录 → 重新构建前端产物部署。
2. **后端菜单驱动 `viewPath`**：后端给某角色菜单时，菜单项 `viewPath` 指向 `cool/<plugin-name>/views/xxx.vue`，`router.append`（源码 line 100）按 `files['/src/'+viewPath.replace('cool/','')]` 找组件动态 `addRoute`。**关键注意点**：`router/index.ts:19` 的 glob **只扫了 `modules/*`，没扫 `plugins/*`**，所以 `files` 字典里**没有插件 view**。**本项目必须把 glob 补成 `['/src/modules/*/{views,pages}/**/*', '/src/plugins/*/{views,pages}/**/*']`**，否则后端下发的插件菜单 viewPath 找不到组件、跳 404。
3. **`config.ts` 显式 `views/pages`**：插件自己 `views: [{path, component: () => import('./views/x.vue')}]`，`createModule` 阶段注册。不依赖后端菜单，适合插件自带固定入口页（如插件设置页）。

**"热插拔"如实标注**：
- cool-admin 后端的插件热安装（`.cool` 包）是**后端运行时**能力（Midway 框架层）。
- **前端没有真正的运行时热插**：要么重新构建部署，要么靠"后端菜单 viewPath 指向已编译进 bundle 的组件"实现"运行时显隐/注册路由"。**微信小程序端更不可能热插**（见 §4）。
- 因此 admin "插件动态加载"的准确表述是：**插件代码编译期进 bundle + 菜单/路由运行时由后端下发 + viewPath 动态匹配**。这满足"安装插件不用改前端代码、不用重新发版"的运营诉求，但插件代码必须先打包进产物。

---

## 4. C 端小程序「插件」= uni 分包 + 构建期纳入（如实标注）

**约束**（PRD 已定，源自信任）：微信小程序**禁止运行时下载执行 JS**（小程序安全策略），所以 C 端不可能像 admin 那样"运行时下发的菜单 → 找已编译组件"——C 端连"动态 viewPath 找组件"都做不到（uni MP 端页面必须在 `pages.json` 静态注册）。

**C 端"插件"的落地形态**：
- = **uni 分包（subpackage）**，构建期纳入主包的依赖图。
- 按 `VITE_TENANT_ID`（商家）+ 商家套餐，CI 决定**是否把某分包打进该商家的产物**：
  - `pages.json` 的 `subPackages` 数组由 CI 模板渲染（按 `VITE_TENANT_ID` + 套餐变量选填）。
  - 低套餐商家产物不含高级功能分包（如营销玩法、高级租赁履约），降体积 + 隔离。
- 商家在 admin 启用某 C 端功能模块 → 后端表记录 → 触发该商家小程序的 CI 重新构建 → 分包纳入 → 发版。

**如实标注的边界**：
- ❌ "用户运行时点一下就装插件"：**不可能**（MP 禁运行时下载 JS）。
- ❌ "admin 后台开关即生效"：**不即时生效**，要等该商家小程序下次构建发版（uni 分包是构建期）。
- ✅ "商家按套餐/租户配置，构建期裁剪功能"：**可行且推荐**，是 C 端"插件化"的现实形态。
- ✅ "分包预下载/懒加载"：**可行**，`pages.json` 配 `preloadRule` 让分包按需预下载，优化体验。
- ✅ 微信小程序官方的"**小程序插件**"机制（`plugins` 字段，可在 mp 后台搜插件用）：那是**复用第三方小程序插件**（如地图、客服），不是本系统业务插件的"热插"，**不要混淆**。本系统业务功能仍走 uni 分包自研。

**与 admin 插件的差异（务必对齐认知）**：

| 维度 | admin 插件 | C 端"插件" |
|---|---|---|
| 形态 | `src/plugins/<name>/` 目录 | uni `subpackages/<name>/` 分包 |
| 纳入时机 | 编译期（bundle 内） | 编译期（分包内） |
| 路由/页面 | 后端菜单 viewPath 运行时下发 + viewPath 动态匹配 / config.ts 注册 | `pages.json` 静态注册（构建期） |
| "启用"是否即时 | 后端表开关 → 菜单运行时显隐（**即时**） | 后端表开关 → 触发该商家 CI 构建 → 发版（**非即时**） |
| 运行时下载 | 否（组件已编译进 bundle） | 否（MP 禁止） |

---

## 5. 推荐前端架构（总览）

```
┌─────────────────────────────────────────────────────────────┐
│                    后端 cool-admin v8                        │
│  controller/admin/**  (平台+商家，角色+tenantId 区分)         │
│  controller/app/consumer/**  (C 端，独立 /app token 流)       │
│  TypeORM Subscriber 强制 tenant_id 过滤（真相之源）           │
│  插件系统（后端 .cool 热安装）                                │
└─────────────────────────────────────────────────────────────┘
            ▲                              ▲
            │ X-Tenant-Id + token          │ X-Tenant-Id + token
            │ (编译期 tenantId 兜底)         │ (角色 + tenantId)
            │                              │
   ┌────────┴───────────┐        ┌─────────┴──────────┐
   │  C 端 uni (MP 优先)  │        │ cool-admin-vue 8.x  │
   │  每商家独立小程序     │        │ 双品牌构建：         │
   │  VITE_TENANT_ID     │        │  --mode platform    │
   │  + 每商家 AppID      │        │  --mode merchant    │
   │  购物车按 tenantId 桶 │        │ 菜单/权限后端驱动    │
   │  租/买双入口          │        │ 插件=src/plugins/    │
   │  C 端"插件"=分包     │        │  +后端菜单viewPath   │
   └────────────────────┘        └────────────────────┘
```

**统一约定（两端共用）**：
- 响应 `{code:1000, data, message}` 约定（源码 `request.ts:129` 实证）。
- 每请求必带 `X-Tenant-Id`（前端拦截器注入；后端强制过滤才是边界）。
- token：C 端 `/app` token 流跨租户共享；admin token 含角色+tenantId 声明。

---

## 6. MVP 前端范围（C 端 + admin 各做哪些页面）

### 6.1 C 端 MVP 页面（微信小程序）

**主包（tabBar 5 页）**：
1. 首页（商品流、分类入口、活动位）
2. 分类（商品分类树 + 列表）
3. 商品详情（**租/买双入口**、SKU、租期档、评价）
4. 购物车（**按 tenantId 分桶 + 租/买分组**）
5. 我的（订单入口、租赁中、押金、设置）

**分包 `order`**：订单列表（rent/sale tab）、订单详情（含租赁时间轴）、物流、评价、售后申请。
**分包 `rental`**：我的租赁（进行中/待归还/已完结）、归还申请（物流/到店扫码）、续租、押金明细与退款。
**分包 `activity`**（按商家套餐裁剪）：优惠券、活动专题。

**核心流程页**：登录授权（微信一键）、确认订单（押金/租金/货款分账展示）、支付结果、收货地址（小程序地址或自填）、订阅消息授权。

**MVP 不做**：商家切换（模式 B）、跨店聚合、直播、社区、拼团等营销玩法。

### 6.2 admin MVP 页面

**平台运营后台（`--mode platform`）**：
- 租户管理（商家列表、入驻审核、套餐、启停）
- 全局商品库（可选：平台 SPU 模板供商家引用）
- 全局订单（跨租户查看、纠纷）
- 分账与财务（平台代收、分账、对账、押金池）
- 插件市场（安装/卸载/配置 cool-admin 插件）
- 系统配置（菜单/权限/角色/字典）
- 数据看板（全局 GMV、租赁履约率、逾期率）

**商家后台（`--mode merchant`）**：
- 商品管理（SPU/SKU、**租售双属性配置**：押金、租期档、租金规则）
- 订单管理（零售单 + 租赁单分 tab、履约状态机操作：发货/确认归还/扣押金）
- 租赁履约（在租列表、到期提醒、归还核销、续租审批、逾期处理）
- 客户与押金（会员、押金台账、退款）
- 营销（优惠券、活动，按套餐）
- 店铺设置（品牌/logo/主题、小程序配置）
- 员工与权限（本租户角色、子账号）
- 财务对账（本租户收入、押金流水）

**MVP 不做**：高级报表 BI、跨租户数据联邦、admin 端的实时大屏（用 echarts 简单看板即可，仓库已带 `echarts`+`vue-echarts` 依赖）。

---

## 7. 注意事项 / 风险与未决项

> ⚠️ **更新（2026-07-09）**：本研究基于 cool-admin v8（Vue）前端调研。2026-07-08 架构调整后 admin 已改用 **Next.js + 自研 Midway.js 后端**，cool-admin / eps / vue 相关结论（第 1、7、8、9 条）**作废**。仍有效的约束：第 2 条（tenant header 仅哨兵）、第 3 条（C 端功能需重新构建发版）、第 4 条（租/买混合结算复杂度）。第 5 条「支付与资金流」已在主 PRD **D6/D8** 决策；第 6 条「履约方式」订单模型已在 **D5** 决策（双层状态机），具体归还路径优先级后续在履约 PR 再定。

1. **路由 glob 未覆盖 plugins（实证坑）**：`src/cool/router/index.ts:19` 的 `import.meta.glob` 只扫 `modules/*`，后端菜单下发的插件 `viewPath`（`cool/<plugin>/views/...`）会找不到组件 → 404。**本项目须把 glob 扩到 `plugins/*`**，否则 admin 插件页面加载不通。
2. **前端 tenant header 只是哨兵**：服务端 TypeORM Subscriber + tenant_id 过滤才是安全边界（PRD D3 + frontend-uni-stack.md §8.4 已强调）。前端 `X-Tenant-Id` 注入是"方便 + 快速发现 bug"，**不可作为防越权**。
3. **C 端"插件"非即时生效**：商家在 admin 启用 C 端功能 → 需该商家小程序重新构建发版（MP 禁运行时下载）。**运营话术和文档必须如实标注**，避免给商家"即时生效"的错觉。详见 §4。
4. **租/买混合结算的复杂度**：MVP 建议**单次结算仅同 mode 同 tenantId**（§2.4），避免一个订单同时含租+买导致状态机混乱。混合单作为后续优化。
5. **押金资金流依赖后端**：C 端押金展示/退还 UI 已规划，但实际资金分账（平台代收 vs 微信电商分账 vs 沙箱模拟）依赖 PRD 未决问题「支付与资金流」定夺，前端需据后端方案调整支付页结构。
6. **归还履约方式待定**：物流/自提/到店归还的 UI 差异较大，依赖 PRD 未决问题「履约方式」。到店扫码核销（`uni.scanCode`）是 MP 体验最佳路径，建议优先。
7. **未实证的 admin 文档页**：cool-admin 官方文档站（cool-admin.com 多个路径 404，show.cool-admin.com 是 demo 壳）在本次抓取中不稳定，**所有 admin 机制结论均来自直接读 `cool-admin-vue` 8.x 源码**（比文档更权威）。若需官方文档原话佐证，建议在稳定网络下重抓 `cool-admin-midway-docs` 仓库的 markdown 源。
8. **双品牌构建的 `enable` 字段**：平台/商家独有模块用 `config.ts` 的 `enable: brand==='xxx'` 控制。注意 `bootstrap/module.ts:81` 是 `if (e.enable !== false)` 才 `install` —— 设 `enable:false` 可整模块跳过，但**模块的 `config.ts` 仍会被 glob 扫描并 import**（只是不 install），其副作用（如顶层 import）仍执行；写模块时顶层不要放副作用代码。
9. **eps（endpoint service）依赖 `@cool-vue/vite-plugin`**：`virtual:eps`（`bootstrap/eps.ts:4`）由 vite 插件从后端 `/base/open/eps` 拉取并注入。**生产关闭 `cool.eps`（PRD 约束）会影响此机制**——需确认关闭路径是仅关后端 eps 暴露、不影响前端构建期 eps 注入；或改用其他 service 定义方式。**待与后端 cool-admin v8 eps 生产策略对齐**。

---

## 附：数据抓取记录（2026-07-07）

- **GitHub API（实证核心）**：`api.github.com/repos/cool-team-official/cool-admin-vue`（默认分支 `8.x`，2431★，pushed 2025-12-17，lang=Vue）+ `git/trees/8.x?recursive=1`（921 条路径）+ `users/cool-team-official/repos`（52 仓，确认 owner 与 8.x 一致性）。
- **cool-admin-vue 8.x 源码（raw.githubusercontent.com）**：`src/main.ts`、`src/cool/{index,bootstrap/{index,module,eps},module/index,router/index,service/{index,request,base},types/index,utils/storage}.ts`、`src/modules/base/{index,config,store/{index,menu,app,user,process},directives/permission}.ts`、`src/config/{index,dev,prod,proxy}.ts`、`vite.config.ts`、`.env`、`package.json`、`index.html`。
- **官方文档站**：`cool-admin.com/doc/cool-admin-vue3/*`（404）、`show.cool-admin.com`（200，demo 壳）、`node.cool-admin.com`（200）——文档路径不稳定，改以源码为权威依据。
- 关键版本号（package.json）：`cool-admin-vue` 8.0.0 / Vue ^3.5.13 / Pinia ^2.3.1 / element-plus 2.10.2 / vue-router ^4.5.0 / vite ^5.4.14 / axios ^1.7.9 / @cool-vue/vite-plugin ^8.2.2 / @cool-vue/crud ^8.0.6 / tailwindcss ^3.4.17。
