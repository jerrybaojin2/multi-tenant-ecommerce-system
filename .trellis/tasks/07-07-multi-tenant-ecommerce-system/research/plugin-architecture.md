# 研究：多租户租售 SaaS 的插件架构

- **查询**: 设计一套插件架构，参考 cool-admin/node 插件系统，落地到 NestJS + Drizzle ORM + PostgreSQL(RLS 多租户) + uni-app Vue3 技术栈
- **范围**: mixed（外部：cool-admin 文档与 NestJS/前端最佳实践；内部：本项目待落地实现）
- **日期**: 2026-07-07

---

## 1. 参考实现：cool-admin/node 插件模型（已抓取官方文档）

文档地址：<https://node.cool-admin.com/src/guide/plugin.html>（HTTP 200 已抓取，内容见下方摘要）

### 1.1 核心结论
cool-admin/node（基于 Midway.js）的插件**不是** NestJS 那种"导入 DynamicModule"的编译期集成，而是一套**运行时可热加载的插件包机制**：

- 插件以独立包（仓库/脚手架）开发，`npm run release` 打包成 `.cool` 后缀的压缩包；
- 通过后台「扩展管理 -> 插件管理」上传安装，**无需重新编译主程序**；
- 主程序通过统一的 `PluginService` 用字符串 key 反射式调用插件方法。

### 1.2 插件包结构（官方脚手架）
```
├── assets/            资源（logo 等）
├── dist/              编译产物（自动生成）
├── release/           打包产物 .cool（自动生成）
├── src/
│   └── index.ts       入口，所有功能集中在 export class CoolPlugin extends BasePlugin
│   └── other.ts       可选其他文件
├── test/index.ts      开发期测试
├── package.json       依赖与项目信息
├── plugin.json        ★ 插件清单（manifest）
├── README.md          展示在插件详情
└── tsconfig.json
```

### 1.3 清单 contract（`plugin.json`）
```json
{
  "name": "测试",            // 显示名
  "key": "test",             // 唯一英文标识，调用时用
  "hook": "",                // 钩子，如替换系统上传组件 "upload"
  "singleton": false,        // 是否单例（单例拿不到请求级 ctx）
  "version": "1.0.0",
  "description": "...",
  "author": "...",
  "logo": "assets/logo.png",
  "readme": "README.md",
  "config": {                // 默认配置，运行时可被后台覆盖
    "appId": "xxxxx",
    "filePath": "@baseDir/xxx.txt"
  }
}
```
- `@baseDir`：特殊关键字，生产=项目根 `/src`，开发=插件根目录。
- 多环境配置：用 `@local` / `@prod` 包裹键实现环境隔离。

### 1.4 插件代码 contract（`src/index.ts`）
```ts
import { BasePlugin } from "@cool-midway/plugin-cli";

export class CoolPlugin extends BasePlugin {
  // 生命周期：插件就绪后触发（单例仅一次；非单例每次调用都触发；改配置也会重初始化）
  async ready() { console.log("插件就绪"); }

  async show(a, b) { return this.pluginInfo; }      // 业务方法
  async useCache() { this.cache.set("a", 1); }      // 继承框架缓存（MidwayCache）
  async usePlugin() {                                // 调用其他插件
    const p = await this.pluginService.getInstance("xxx");
  }
}
export const Plugin = CoolPlugin;   // ★ 导出名必须叫 Plugin
```

### 1.5 注册 / 加载 / 调用机制
- **安装**：后台上传 `.cool` 包 -> 解压 -> 写入插件目录与 DB 记录 -> 触发 `EVENT_PLUGIN_READY` 事件（其他模块可在 `xxx/event/plugin.ts` 监听 `@Event(EVENT_PLUGIN_READY)`）。
- **调用（外部模块）**：
  ```ts
  @Inject() pluginService: PluginService;
  const r = await this.pluginService.invoke("test", "show", 1, 2); // key, method, ...args
  const inst = await this.pluginService.getInstance("test");
  const cfg  = await this.pluginService.getConfig("test");
  ```
- **配置存储**：**不写在代码里**，而是存 DB，由后台插件管理界面维护；运行时按当前环境（@local/@prod）取值。
- **生命周期 hook**：文档明确点名的只有 `ready()`（初始化完成）。安装/启用/禁用/卸载在 UI 上操作，对应 DB 状态与文件解压/删除。

### 1.6 关键限制与差异（相对我们要做的）
| 维度 | cool-admin/node | 我们的目标 |
|---|---|---|
| 运行时 | Midway.js（IoC + 装饰器扫描 `eps`） | NestJS（DI + DynamicModule） |
| 插件形态 | 运行时热加载 `.cool` 包，反射调用 | 需决策：编译期 import vs 运行时动态加载 |
| 插件提供内容 | **主要是 service/方法 + 配置 + hook**；不强调自带 Controller/实体表/前端页面 | 需要自带 Controller/Drizzle 表/管理后台菜单/前端页面 |
| 多租户 | 文档有 tenant 模块，但**插件本身是平台级**，配置全局；未强调每租户独立启停 | 必须**每租户粒度**启停，且插件 SQL **必须**自动租户隔离 |
| 单例/请求上下文 | 通过 `singleton` 控制 ctx 可达性 | 我们用 AsyncLocalStorage 注入租户，无此问题 |

> ⚠️ 注意：cool-admin 的插件本质是"**可调用的功能模块 + 可视化配置**"，并没有强约定插件自带 REST 路由、自带数据表、自带前端页面。**我们的需求更重**（租赁/零售场景一个插件往往要带自己的表、API、管理页、小程序页），所以不能照搬，要在其清单/生命周期思想上扩展。

---

## 2. 落地到 NestJS 的插件模式

### 2.1 总体策略
NestJS 的 DI 容器在 `bootstrap()` 时定型，**真正的运行时热装卸（不停机加 Controller）非常 hacky**（要手操 router 注册表 + DI 容器，且 Nest 9+ 之后路由动态注册支持很弱）。因此推荐 **分层策略**：

| 层级 | 机制 | 是否可热加载 |
|---|---|---|
| **代码加载** | 启动期 `import()` + `DynamicModule.forRootAsync` 装配 | ❌ 需重启进程 |
| **启用/禁用** | DB 存 `tenant_plugin` 状态，运行时守卫拦截 | ✅ 不重启 |
| **配置变更** | DB 存配置，热读 | ✅ 不重启 |
| **真正的动态分发** | 用"**能力注册表（Capability Registry）**"模式：插件把可调用 handler 注册到全局 Registry，主程序按 `(tenantId, pluginKey, action)` 查表分发 | ✅ |

> 结论：采用 **"编译期装配 + 运行期启停 + 注册表分发"** 的混合模型。这是 NestJS 生态最务实的选择，也是大多数企业 SaaS（如 Directus extensions、Medusa modules）的做法。完全运行时 `.cool` 式热装卸不在 MVP 范围（成本/收益不划算，且与 RLS 多租户强约束冲突）。

### 2.2 DynamicModule 注册（forRootAsync + 自动发现）
```ts
// src/plugin/plugin.module.ts
import { DynamicModule, Provider } from "@nestjs/common";
import { PluginService } from "./plugin.service";
import { PLUGIN_MANIFESTS, PluginManifest } from "./types";

export class PluginCoreModule {
  static forRootAsync(): DynamicModule {
    const providers: Provider[] = [PluginService];

    // 启动期扫描 src/plugins/*/manifest.json + 默认导出 module
    const manifests = scanPluginManifests(); // 同步读文件
    for (const m of manifests) {
      providers.push({ provide: m.key, useFactory: () => instantiate(m) });
    }
    providers.push({ provide: PLUGIN_MANIFESTS, useValue: manifests });

    return {
      module: PluginCoreModule,
      providers,
      exports: [PluginService, PLUGIN_MANIFESTS],
      global: true,
    };
  }
}
```

### 2.3 一个示例插件的目录结构（推荐 contract）
```
src/plugins/coupon/                          # 插件 key = coupon
├── manifest.json                            # 清单（见 §5）
├── coupon.module.ts                         # NestJS DynamicModule
├── controllers/
│   └── coupon.controller.ts                 # REST 路由（前缀 /api/plugins/coupon）
├── services/
│   └── coupon.service.ts
├── schema/
│   └── coupon.schema.ts                     # Drizzle pgTable 定义
├── migrations/
│   └── 0001_init.sql                        # 安装时执行
├── menus.ts                                 # 注入到 admin 后台的菜单声明
├── jobs.ts                                  # 定时任务声明（可选）
├── frontend/                                # 后台动态页面（懒加载 chunk）
│   └── views/index.vue
├── miniprogram/                             # uni-app 分包（C 端）
│   └── pages/coupon/index.vue
└── README.md
```

### 2.4 自动发现装饰器（让 Controller/Provider 被扫描）
```ts
// src/plugins/coupon/coupon.module.ts
import { Module } from "@nestjs/common";
import { CouponController } from "./controllers/coupon.controller";
import { CouponService } from "./services/coupon.service";

@Module({
  controllers: [CouponController],
  providers: [CouponService],
  exports: [CouponService],
})
export class CouponPluginModule {
  // onModuleInit: 把 menus/jobs 注册进全局 Registry
  // onApplicationBootstrap: 注册 Drizzle schema 到运行时表集合
}
```

### 2.5 生命周期 hook 映射
| cool-admin | NestJS 等价 | 用途 |
|---|---|---|
| `ready()` | `OnModuleInit` / `OnApplicationBootstrap` | 注册菜单/任务/schema |
| UI 安装 | 执行 migration + 写 `tenant_plugin` 默认值 | 建表、给已有租户默认配置 |
| UI 启用/禁用 | 守卫读 `tenant_plugin.status` 决定是否放行路由 | 运行时启停 |
| UI 卸载 | 执行 down migration + 删 `tenant_plugin` 行 | 清理（生产慎用 drop） |
| `EVENT_PLUGIN_READY` | `EventEmitter2` 事件 | 跨模块监听插件就绪 |

### 2.6 隔离与容错
- **进程级隔离**：MVP 用进程内 `try/catch` + 超时包装插件调用，记 metrics，禁用连续失败的插件（熔断）。真正隔离需走 **子进程 / worker_threads / VM 沙箱**，留作后续。
- **路由级隔离**：所有插件 Controller 统一前缀 `/api/plugins/:pluginKey`，加全局 `PluginGuard` 检查该插件对当前租户是否启用。
- **依赖隔离**：插件不直接 `import` 主程序内部 service，只通过**受控 API（PluginContext）**访问——类似 cool-admin 的 `this.pluginService` + `this.cache`。

---

## 3. 多租户 × 插件集成（安全关键部分）

> 这是我们与 cool-admin 最大的差异点。cool-admin 插件是**全局**的；我们的插件**必须每租户可启停，且插件产生的所有数据查询必须自动租户隔离**。

### 3.1 数据模型
```sql
-- 平台级：已安装的插件（哪些插件被装配进系统）
plugin_installed (
  key          text primary key,    -- 'coupon'
  version      text,
  manifest     jsonb,               -- 清单
  status       text                 -- installed | enabled | disabled
)

-- 租户级：每个租户启用哪些插件、各自配置
tenant_plugin (
  tenant_id    uuid,
  plugin_key   text,
  status       text,                -- enabled | disabled
  config       jsonb,               -- 该租户对该插件的配置覆盖
  primary key (tenant_id, plugin_key)
)
```

### 3.2 强制租户隔离的链路（核心安全保证）
```
请求进入
  → TenantGuard 从 JWT/header 解析 tenantId
  → 写入 AsyncLocalStorage (tenantContext)
  → PluginGuard 查 tenant_plugin(tenant_id, plugin_key).status = enabled? 否则 403
  → Controller 调用插件 service
  → service 拿 db client（由 TenantDbFactory 提供，已 set local tenant_id）
  → Drizzle 查询 → PostgreSQL RLS 自动过滤 tenant_id ✅
```

**关键点**：
1. **插件绝不能拿到裸的 `drizzle(pool)` 客户端**，只能拿到 `ctx.db`（被 `set local app.tenant_id` 包裹的 transaction 客户端）。
2. **插件自带的表必须带 `tenant_id` 列并启用 RLS policy**——这是 manifest 审核契约的一部分（见 §5 `requiresTenantColumn: true`）。
3. **定时任务/Cron** 没有请求上下文，必须显式遍历启用了该插件的租户，逐个 `Als.run({tenantId}, () => job())`。

### 3.3 配置存取
```ts
// 插件内通过注入的 PluginContext 拿配置（已按 tenantId 解析）
class CouponService {
  constructor(private ctx: PluginContext) {}
  async foo() {
    const cfg = await this.ctx.getConfig(); // 合并: manifest.config ← tenant_plugin.config
    const db  = this.ctx.db;                // 租户隔离客户端
  }
}
```

---

## 4. 前端插件化

### 4.1 后台/B 端（Web，Vue3）
三个层级需要动态化：

| 层 | 方案 | 说明 |
|---|---|---|
| **菜单** | 后端 `GET /api/plugins/menus`（按当前租户启用的插件聚合）→ 前端动态注入路由表 | 后端是单一事实来源，避免前端硬编码 |
| **路由** | `router.addRoute()` 在登录后动态注册 | Vue Router 原生支持 |
| **页面组件** | **Vite 的动态 import + 代码分割**（MVP）；规模大时升级 **Module Federation** | 见下权衡 |

**MVP 推荐：构建时纳入 + 运行时菜单/路由注入**
- 所有内置插件的 Vue 组件在主仓库构建，但通过 `defineAsyncComponent(() => import(/* @vite-ignore */ path))` 懒加载；
- 路由表由后端菜单驱动，前端只渲染"已启用插件"对应的路由；
- 第三方独立包开发的插件：先支持 **npm 包形式发布 + 主项目 `dependencies` 安装 + 构建纳入**；真正远程加载（CDN 下 `import('https://...')`）作为 P2。

> 权衡：Module Federation 能做到"独立构建独立部署"，但配置复杂、与 uni-app/小程序环境不兼容、版本漂移风险高。对于 SaaS 后台，**动态菜单+路由+懒加载 chunk 已能覆盖 90% 需求**，且实现成本低一个数量级。

### 4.2 C 端微信小程序（uni-app Vue3）
小程序的运行时限制了"远程下载代码执行"——**微信小程序严禁运行时动态加载任意 JS**。所以：

| 方案 | 可行性 | 适用 |
|---|---|---|
| 微信原生「插件」机制 | ⚠️ 需走微信审核、与 uni-app 集成麻烦、且是小程序账号级而非租户级 | ❌ 不适合 SaaS 多租户 |
| **uni-app `subPackages` 分包** | ✅ 构建期纳入，按需下载，加载快 | ★ MVP 推荐 |
| 构建期插件包含（条件编译） | ✅ 多个插件模块编译进主包/分包，按租户配置显示入口 | 配合分包使用 |

**推荐**：C 端**放弃"独立开发后远程热插"的幻想**，改为：
- 插件作者把小程序页面以 **npm 包**（含 `.vue`）发布；
- 主 C 端工程 `dependencies` 安装 + 在 `pages.json` 的 `subPackages` 注册一个分包；
- 运行时按该租户是否启用该插件，决定是否展示入口 tab/按钮（后端菜单接口驱动）。

> 与 cool-admin 的 uni 端一致——它的"插件"在小程序侧也是构建期包含的，不存在运行时远程插件。

---

## 5. 推荐的插件契约（Contract）

### 5.1 `manifest.json` 字段（基于 cool-admin 扩展）
```jsonc
{
  "key": "coupon",                       // 唯一英文标识
  "name": "优惠券",
  "version": "1.0.0",
  "author": "...",
  "description": "...",
  "logo": "assets/logo.png",
  "readme": "README.md",

  // 后端能力声明
  "module": "./coupon.module.ts#CouponPluginModule",  // NestJS 入口
  "requiresTenantColumn": true,          // ★ 插件自带表必须含 tenant_id + RLS
  "migrations": "./migrations",          // 安装/升级时执行
  "menus": "./menus.ts",                 // 注入后台菜单
  "jobs": "./jobs.ts",                   // 定时任务（可选）

  // 前端能力声明
  "frontend": {
    "adminViews": "./frontend/views",    // 后台懒加载页面目录
    "miniprogramSubpackage": "./miniprogram"
  },

  // 默认配置（按环境/租户可覆盖，存 DB）
  "config": {
    "defaultDiscount": 0.1,
    "maxPerUser": 5
  },

  // 兼容 cool-admin 语义
  "singleton": false,
  "hook": "",                            // 预留：钩子位（如替换支付/上传）
  "minAppVersion": "1.0.0"               // 主程序最低版本要求
}
```

### 5.2 生命周期 hook（插件类实现，可选）
```ts
export interface PluginLifecycle {
  onInstall(ctx): Promise<void>;       // 建表/初始数据
  onEnable(tenantId, ctx): Promise<void>;
  onDisable(tenantId, ctx): Promise<void>;
  onUninstall(ctx): Promise<void>;     // 删表（生产需确认）
  onModuleInit(ctx): void;             // 注册菜单/任务
  onAppReady(ctx): void;               // 应用 bootstrap 完成
}
```

### 5.3 注册/加载时序
1. 部署期：插件 npm 包安装进 `node_modules/plugins/<key>`，`PluginCoreModule.forRootAsync()` 启动时扫描 manifest，注册 NestJS module、收集 schema/menus/jobs。
2. 安装：管理员 `POST /api/plugins/:key/install` → 执行 `migrations/*.sql` → 写 `plugin_installed`。
3. 租户启用：租户管理员 `POST /tenants/me/plugins/:key/enable` → 写 `tenant_plugin(enabled)` → 触发 `onEnable`。
4. 运行：每次请求经 TenantGuard + PluginGuard，插件 handler 通过 `ctx.db`（RLS）查询，前端按 `GET /plugins/menus` 渲染。
5. 禁用/卸载：状态置位 + （卸载时）`onUninstall`/down migration。

---

## 6. 与 cool-admin 的权衡对比

| 维度 | cool-admin/node | 我们的方案 | 理由 |
|---|---|---|---|
| 热装卸 | ✅ 运行时上传 `.cool` 包即装即用 | ❌ 编译期装配 + 运行期启停 | NestJS 路由运行时注册困难；与 RLS/多租户强约束冲突；收益不抵风险 |
| 插件能力 | service + 配置 + hook（轻） | Controller + 表 + 菜单 + 前端页 + 小程序分包（重） | 租赁/零售业务插件形态更重 |
| 多租户 | 平台级，配置全局 | 每租户启停 + 配置隔离 + 强制 RLS | SaaS 必需 |
| 配置存储 | DB + 后台 UI（同） | DB + 后台 UI（同） | 一致，沿用 |
| 调用方式 | `pluginService.invoke(key, method)` | DI 注入 + `PluginContext.invoke` | NestJS DI 更类型安全 |
| 单例/ctx | `singleton` 字段控制 | 不需要（ALS 注入租户） | 我们的 ctx 模型不同 |
| 前端插件 | 后台菜单/页面（文档未详述热远程加载） | 后台动态菜单+路由+懒加载；小程序分包 | 适配 uni-app 与小程序限制 |

---

## 7. 风险与注意事项

1. **运行时热装卸不可行（MVP）**：明确放弃「不停机上传插件包即生效」，避免投入产出失衡。先用 npm 包 + 重启装配；后续如确需，再调研 NestJS 动态路由 + Module Federation。
2. **RLS 是底线**：插件自带表**必须** `tenant_id` + RLS policy，否则会跨租户泄露数据。建议在 CI 校验 migration 文件包含 RLS 语句。
3. **定时任务/后台 Job 容易绕过租户上下文**：必须强制走 `Als.run({tenantId})`，并在 code review 中作为 checklist。
4. **插件崩溃传染**：MVP 无进程级隔离，一个插件抛错可能影响请求甚至 bootstrap。需用熔断 + `try/catch` 包裹 + 启动期跳过坏插件（不阻塞主程序启动）。
5. **版本兼容**：插件 manifest 加 `minAppVersion`，主程序升级时检查不兼容插件并禁用，防止 API/DB schema 漂移。
6. **小程序限制**：C 端无法做到"独立开发后远程热插"，必须接受构建期纳入 + 分包。对外宣传"插件化"时需对小程序场景降低预期。
7. **migration 顺序与回滚**：多插件并发安装时表名/外键冲突需要命名空间约定（`plugin_<key>__<table>`）。

---

## 注意事项 / 未找到

- cool-admin 的 `core/module.md` / `core/tenant.md` / `core/eps.md` 三个补充页面本次 curl 返回 **404**（VitePress 的真实 URL 由 hash map 决定，路径带 hash）；但其 `plugin.html` 主文档已包含足够机制说明，不影响结论。
- 未在本仓库内做内部代码搜索（当前任务是 greenfield 架构设计，仓库尚无 NestJS/Drizzle 实现可供检索）。落地实现后建议补一份 `internal/` 扫描，对照本契约校验。
- 本文档为**架构研究/决策建议**，未修改任何 `research/` 之外的代码或配置。
