# 研究：多租户 SaaS 的 Node.js 后端框架（租赁 + 零售电商）

- **查询**：比较 NestJS / Fastify / Express / Midway.js（+ Egg.js 历史方案）在多租户 SaaS 电商后端中的适配度；推荐主框架，并给出具体租户上下文模式。
- **范围**：外部（框架生态研究，2025）
- **日期**：2026-07-07

---

## 摘要（面向决策）

- **首选：NestJS** — 最适合中大型多租户 SaaS，以及小团队逐步扩张的场景。Angular 风格的 modules + DI 提供强结构约束；成熟的 guard/interceptor/middleware 管线、一等 TypeScript 支持，以及承载租户上下文这类横切关注点的清晰位置。生态最大，招聘池最大。
- **备选 1：Midway.js** — 如果团队在中国、重视中文文档/社区，并希望使用经阿里双 11 验证过的默认能力，同时支持 OOP 与函数式风格，则选择它。对微信/小程序上下文很友好。
- **备选 2：Fastify（手工结构）** — 仅当原始吞吐或最低 magic 是最高优先级，并且团队愿意自行构建 DI、模块边界和租户上下文管线时才选。它要求最高工程纪律；对小团队构建复杂领域而言风险较高。

共享数据库租户模型中最重要的技术模式是 **通过 `AsyncLocalStorage` 实现 request-scoped context**（也称 CLS / continuation-local storage）：在 middleware/guard 中每请求写入一次，然后下游任意位置读取，避免把 `tenant_id` 穿过每个函数签名。**四个框架都支持这种模式**，但 NestJS（通过 `nestjs-cls` proxy providers）和 Midway（通过 `@Inject(Context)` + ALS）最顺手。文末代码草图对此有详细说明。

---

## 1. 选项对比表

| 维度 | **NestJS** | **Fastify（+ 手工结构）** | **Express** | **Midway.js** | **Egg.js（历史方案）** |
|---|---|---|---|---|---|
| 架构风格 | 有主张，类 Angular；modules + classes + DI | 无主张微框架；结构自己搭 | 极简、最老、最少主张 | 有主张，IoC 容器，OOP **和**函数式范式 | 约定优于配置，plugin-based，目前维护模式 |
| DI / module system | 一等支持，基于 decorator 的 IoC 容器；feature modules | 无内建（自己做 / `awilix`） | 无 | 一等自研 IoC 容器（`@Injectable`、`@Controller`） | Plugin loader + app/context/agent；较僵硬 |
| TypeScript 与 DX | 为 TS 构建；类型覆盖充分；体验优秀 | TS 类型良好；结构较少 | `@types/express`；默认松散 | 为 TS 构建（阿里）；中文文档好 | TS 支持较晚加入；DX 偏旧 |
| 多租户上下文传播 | 成熟：middleware/interceptor + `AsyncLocalStorage`；`nestjs-cls` 提供 typed CLS + **Proxy Providers** + **Transactional** plugin | 手工：`onRequest` hook + ALS；管线自管 | 手工：middleware + ALS | `@Inject() ctx`、请求作用域，加 ALS 风格支持；ORM 集成 | Plugin/guard + ctx；可做但偏旧 |
| 生态（2025） | 四者最大；大量模块、OpenAPI、Passport、Queues、Microservices、Prisma/TypeORM/MikroORM/Drizzle | 很强；主流 HTTP 框架中最快；插件多 | 原始 npm 足迹最大，但很多库与 Express 耦合 | 中国生态为主；支持 Prisma/TypeORM/Sequelize/Mongoose、调度、微服务、serverless | 收缩中；被 Midway 取代 |
| 社区 / 招聘 | 全球极大，英语优先 | 全球增长中 | 全球大但老化 | 中国强；微信/uni-app 友好；双语文档 | 主要中国，下降中 |
| 性能 | 良好（可用 Fastify adapter 获得约 2x 吞吐） | **原始吞吐最好** | 基线 | 良好（Koa/Express adapters） | 尚可 |
| 学习曲线 | 中高（decorators、modules、RxJS 可选） | 入门低，规模化高 | 低 | 中等 | 中高（约定） |
| ORM 集成 | Prisma（官方 recipe）、TypeORM（官方）、MikroORM、Sequelize、Drizzle（社区） | 都可用；需自行接线 | 都可用；需自行接线 | TypeORM、Sequelize、Prisma、Mongoose components | TypeORM/Sequelize/Egg-mysql |
| 对本项目最佳性 | ✅ 综合最佳 | ⚠️ 仅适合性能执念场景 | ❌ 对中大型 SaaS 太无结构 | ✅ 强备选，尤其中国团队 | ❌ 维护模式 |

---

## 2. 行业惯例及其原因

### 2.1 “非平凡服务使用带 DI 的框架” → NestJS / Midway
多租户 SaaS 有大量横切关注点（auth、tenant scoping、audit logging、permissions、feature flags）。如果没有 DI + 模块系统，这些关注点会泄漏到每个 handler，或变成临时全局变量。DI 让你只定义一次 `TenantContext`、`CurrentUser`、`AuditLogger`，然后干净注入。这一惯例存在的原因是：**横切层意面化是 SaaS 后端腐烂的第一路径**。

### 2.2 “用 AsyncLocalStorage 传播每请求状态，而不是 request-scoped providers / 参数穿透”
- **把 `tenantId` 穿过每个函数**既啰嗦又容易出错（漏传一次 = 跨租户数据泄漏，对 SaaS 是灾难）。
- **REQUEST-scoped providers**（NestJS 中看似显然的答案）会导致 DI 容器每请求重建 provider 子树，性能差，并且历史上会与一些 singleton 假设和 event listeners 冲突。
- **AsyncLocalStorage（ALS / CLS）** 是 Node 原生、低开销的隐式携带请求状态方式，类似 Java/Go 的 thread-local storage。NestJS 文档明确推荐其作为 REQUEST-scoped providers 的替代。行业已经把 ALS 收敛为租户/用户/请求上下文的默认方式。文档同样指出的注意点是：它会“模糊代码流”，因此只应承载真正横切的值（tenantId、userId、requestId、tx），不要放业务数据。

### 2.3 “在 ORM/数据访问层强制租户隔离，而不仅是 controller”
共享 DB + `tenant_id` 是最便宜的多租户模型，但也最容易泄漏。惯例是每个业务 repository **必须**按请求 `tenant_id` 自动过滤，最好通过全局查询过滤器（Prisma row-level extensions / TypeORM `where` base repository / Drizzle RLS-like middleware）。绕过该层的手写 raw query 应被视为需要审查的 code smell。guard/middleware 只解析一次 tenant_id；数据层从 ALS 上下文读取它。这正是 `nestjs-cls` **Transactional** plugin + tenant-aware base repository 要解决的问题。

### 2.4 “Node 20+ LTS 作为运行时基线（2025）”
Midway v4 要求 Node >= 20。ALS 自 Node 16 起稳定且性能良好。所有推荐框架在 2025 年都面向 Node 20 LTS。

---

## 3. 映射到我们的约束

| 我们的约束 | 对选型的影响 |
|---|---|
| **共享 DB + 每个业务表带 `tenant_id`（逻辑隔离）** | 需要强健、难绕过的每请求租户上下文。→ 强烈偏向成熟 ALS/CLS + DI 的框架，让 tenant_id 只解析一次并自动注入 repo。**NestJS（`nestjs-cls` Proxy Providers + Transactional）** 和 **Midway** 表现突出。Express/Fastify-manual 能做，但更依赖纪律。 |
| **租赁 + 零售（同 SKU 可租或可买）** | 复杂领域 → 多模块（pricing、inventory、orders、returns、leases）。NestJS modules / Midway components + DI 受益很大。pricing/lease-policy Strategy pattern 在 DI 中清晰，在平铺 Express 中痛苦。 |
| **多商家 SaaS** | Merchant = tenant。需要租户入驻、每租户配置，可能有每租户 feature flags。NestJS `ConfigModule` + tenant-scoped providers 适配；Midway components 也类似。 |
| **默认 TypeScript** | 四者都可用 TS，但 NestJS 与 Midway 天然 TS-first。 |
| **uni-app / 微信小程序前端** | 后端边缘只是 HTTP/JSON API，本身框架无关。但微信特定关注点（WeChat Pay、微信登录/openid、小程序 session、微信 server-to-server callbacks）在 Midway 的中文生态中支持更好。NestJS 也能通过标准库完成，但更多依赖英语资料。 |
| **Greenfield，小团队可能性高** | 偏向结构最完整、学习材料最多的选项 → **NestJS**（教程最大）或 **Midway**（如偏好中文文档）。Fastify-manual 是对团队自我约束能力的下注；复杂领域中风险较高。 |

---

## 4. 主推荐：NestJS

### 原因
1. **结构随团队扩展。** Modules/controllers/providers 为 orders、inventory、leases、tenants、pricing、payments 提供可预测布局，无需自创约定。新人比在定制 Fastify 布局上更快上手。
2. **对租户隔离这类横切管线支持最佳。** middleware → ALS → Proxy Provider → tenant-aware repository 的管线最干净。`nestjs-cls` **Transactional** plugin 将租户上下文与 DB transaction 自动绑定，连事务失败也不应泄漏租户范围。
3. **TypeScript 一等支持**，端到端一致。
4. **全球最大生态与招聘池**；OpenAPI/Swagger、Passport auth、queues、scheduler、microservices 等都有成熟支持。
5. **HTTP core 可切换：**默认 Express，后续需要时可切到 Fastify adapter 获得更高吞吐，无需重写。

### 注意事项
- 从 Express 背景来的开发者需要适应 decorator/IoC。
- Boot/reflective DI 相比 raw Fastify 有少量性能成本（典型 SaaS 规模无关紧要；真有瓶颈可切 Fastify adapter）。
- `nestjs-cls` 是第三方包（非核心团队），但它是事实标准，维护良好、采用广泛。

---

## 5. 备选

### Midway.js（阿里）— 备选 1
**选择条件：**团队主要在中国；希望微信/支付宝支付与 uni-app 时代工程习惯有强中文文档和经双 11 验证的 IoC core。
- 优点：自研 IoC，支持 OOP **和**函数式（`defineApi` + `useContext`）风格；提供 TypeORM/Prisma/Sequelize/Mongoose、调度、微服务、**serverless** 等 components。Node 20+，当前 v4。多范式让简单 handler 保持简单，复杂领域使用 DI。
- 缺点：全球（非中文）社区较小；英语文档有但主要内容是中文；第三方教程少于 NestJS。
- 多租户适配：`@Inject() ctx` + 请求作用域 + ALS 可很好工作；ORM components 可像 NestJS 一样从上下文读取 tenant_id。

### Fastify（手工结构）— 备选 2
**选择条件：**最高吞吐或最低 runtime magic 是硬要求，且团队有能力强制模块边界和租户上下文 helper。
- 优点：主流 Node HTTP 中最快，插件模型优秀，TS 很好，内建 JSON Schema/Ajv schema validation。
- 缺点：架构自己造。DI、module system、tenant-aware repository base、ALS-context 管线全部自管。对小团队构建复杂租售领域来说，长期维护风险最高。

### Egg.js — 历史方案（不推荐）
约定优于配置，agent/worker 模型，阿里系 Midway 前身。现在基本被 Midway 取代并进入维护模式。不要用 Egg 开始 2025 年的 greenfield SaaS。

### Express — 不推荐作为主框架
对中大型多租户领域太无结构；最终会笨拙地重造 NestJS。作为 NestJS 底层引擎没问题。

---

## 6. 具体多租户请求上下文模式（NestJS）

目标：每请求**只解析一次** `tenant_id`，然后任何 service/repository 都能**无需手工参数穿透**地访问；同时 ORM 层自动租户过滤，避免忘记 filter 导致跨商家数据泄漏。

该模式由三部分组成：

1. **`nestjs-cls`** 承载请求上下文（typed store）。
2. **全局 middleware/guard** 解析租户（来自 JWT、`x-tenant-id` header 或 host/subdomain），并一次性写入 CLS store。
3. **Proxy Provider**（`@InjectableProxy`）将当前租户暴露为 injectable；再用 **tenant-aware base repository** + ORM 全局 filter 自动应用 `WHERE tenant_id = ?`，业务代码不直接接触 tenant_id。

```ts
// ---- 1. Typed CLS store -----------------------------------------------
export interface AppClsStore {
  tenantId: string;
  userId?: string;
  requestId: string;
}

// ---- 2. Tenant resolved once per request (global middleware) ----------
// app.module.ts
import { ClsModule } from 'nestjs-cls';
import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';

@Module({
  imports: [
    ClsModule.forRoot({
      global: true,
      middleware: {
        mount: true,                              // runs for every route, first
        generateId: true,                          // auto requestId
        idName: 'requestId',
        setup: (cls, req) => {
          // In production: derive tenantId from verified JWT / subdomain / header
          const tenantId = (req.headers['x-tenant-id'] as string) ?? resolveFromJwt(req);
          if (!tenantId) throw new UnauthorizedException('Missing tenant');
          cls.set('tenantId', tenantId);           // written ONCE here
          cls.set('userId', req.user?.id);
        },
      },
    }),
    // ...feature modules
  ],
  providers: [{ provide: APP_GUARD, useClass: AuthGuard }], // optional: enforce auth
})
export class AppModule {}

// ---- 3. Inject the current tenant anywhere (no manual threading) -------
// proxies/proxies.ts
import { InjectableProxy } from 'nestjs-cls/proxy-provider';

@InjectableProxy()
export class CurrentTenant {
  id!: string;
}

// feature module registration
ClsModule.forFeature(CurrentTenant);

// ---- 4. Populate the proxy (interceptor or in the setup hook above) ----
@Injectable()
export class TenantInterceptor implements NestInterceptor {
  constructor(private readonly tenant: CurrentTenant) {}
  intercept(ctx: ExecutionContext, next: CallHandler) {
    const cls = this.clsService; // or read directly
    this.tenant.id = cls.get('tenantId')!;
    return next.handle();
  }
}

// ---- 5. Service code never sees tenantId — it's implicit ---------------
@Injectable()
export class OrderService {
  constructor(
    private readonly orders: OrderRepository,   // tenant-aware repo
    @Inject(CurrentTenant) private readonly tenant: CurrentTenant,
  ) {}

  listMyOrders() {
    // tenantId is auto-applied by the repository's global filter;
    // no need to pass it in. (Use this.tenant.id only when you must.)
    return this.orders.findMany({ status: 'open' });
  }
}

// ---- 6. ORM-level enforcement (Prisma example) -------------------------
// A Prisma client extension that injects tenant_id from CLS into every
// business-model query, so forgetting a filter cannot leak data.
export const withTenant = (prisma: PrismaClient, cls: ClsService) =>
  prisma.$extends({
    query: {
      // For each tenant-scoped model:
      order: {
        $allOperations: async ({ model, operation, args, query }) => {
          const tenantId = cls.get<AppClsStore>('tenantId');
          if (!tenantId) throw new Error('No tenant context'); // hard fail > silent leak
          args.where = { ...(args.where ?? {}), tenantId };
          return query(args);
        },
      },
      // ...repeat for product, inventory, lease, payment, etc.
    },
  });

// INSERT/CREATE safety: also default tenantId on create.
```

### 为什么这个组合适合我们
- **只解析一次：**middleware 在 controller 之前运行；CLS 在该请求的所有 async chains 中传播。
- **无需参数穿透：**services 注入 `CurrentTenant` 或依赖 ORM filter；业务代码干净，租赁/零售逻辑不会被多租户噪声污染。
- **纵深防御：**即使开发者忘了 `where`，Prisma/TypeORM 全局 filter 也会 hard-fail 或自动注入；缺失租户上下文时抛错，而不是静默返回跨商家数据。
- **同一上下文承载 DB transaction：**结合 `nestjs-cls` **Transactional** plugin，让单个租户请求在一个 tx 中运行。

### Fastify / Midway 等价实现（简述）
- **Fastify：**用 `onRequest` hook 执行 `als.run(store, () => reply)`，暴露 typed `req.tenant` decorator；Prisma 租户 extension 同样可用。
- **Midway：**controller 中 `@Inject() ctx`；用 Midway IMiddleware + ALS（或 request-scoped provider）设置 tenant；IoC 容器 + ORM component 与 NestJS 流程几乎一一对应。

---

## 7. 外部参考

- NestJS 官方 — Async Local Storage recipe（ALS 作为 REQUEST-scoped providers 替代）：https://docs.nestjs.com/recipes/async-local-storage  （2026-07-07 已验证）
- `nestjs-cls` 文档 — Proxy Providers（singleton proxy 委派到 per-request CLS instance；tenant-DB-connection factory 示例）：https://papooch.github.io/nestjs-cls/features-and-use-cases/proxy-providers  （2026-07-07 已验证）
- `nestjs-cls` Transactional plugin（自动 tx 绑定 CLS）：https://papooch.github.io/nestjs-cls/plugins/available-plugins/transactional
- Midway.js 官方介绍（阿里、IoC、OOP+FP、Node 20+、v4、双 11 验证）：https://midwayjs.org/docs/intro  （2026-07-07 已验证）
- Node.js 文档 — `AsyncLocalStorage`（Node 16 起稳定，低开销）：https://nodejs.org/api/async_context.html
- Prisma client extensions（tenant row-filter pattern）：https://www.prisma.io/docs/concepts/components/prisma-client/client-extensions

---

## 注意事项 / 未找到

- 本环境的 Web search tooling 间歇不可用；Google 搜索页未加载，但上面的权威文档页已直接抓取并验证，核心结论（ALS pattern、nestjs-cls Proxy Providers 包含 tenant-connection 示例、Midway v4/Node20/双 11）来自这些 primary sources。
- 未在此处引用具体 2025 benchmark 数值（NestJS-Express vs NestJS-Fastify vs raw Fastify req/s），避免陈旧数字；相对排序（raw Fastify > NestJS-Fastify > NestJS-Express ≈ Midway-Koa > Express）稳定且广为人知。
- ORM 选择（Prisma vs TypeORM vs Drizzle）作为下游独立决策处理；本文代码草图假设 Prisma，因为其 client-extension 模型给出最干净的 tenant-row filter，但 TypeORM（base repository）和 Drizzle（RLS-like middleware）也可行，应在各自研究笔记中确认。
- 招聘/成本考虑为方向性判断，未量化。
