# Research: Node.js Backend Framework for Multi-Tenant SaaS (Rental + Retail E-commerce)

- **Query**: Compare NestJS / Fastify / Express / Midway.js (+ Egg.js legacy) for a multi-tenant SaaS e-commerce backend; recommend a primary framework and show a concrete tenant-context pattern.
- **Scope**: external (framework ecosystem research, 2025)
- **Date**: 2026-07-07

---

## TL;DR (decision-oriented)

- **PRIMARY: NestJS** — best fit for medium/large multi-tenant SaaS on a small-but-growing team. Angular-style modules + DI give you enforced structure, a mature guard/interceptor/middleware pipeline, first-class TypeScript, and a clean home for the cross-cutting tenant context. Largest ecosystem and hiring pool.
- **ALTERNATIVE 1: Midway.js** — pick this if the team is China-based, values Chinese-language docs/community, and wants Alibaba-battle-tested (双11) defaults with both OOP and functional styles. Strong for the WeChat/mini-program context.
- **ALTERNATIVE 2: Fastify (manual structure)** — pick this only if raw throughput or minimal magic is the top priority and the team is willing to hand-build DI, module boundaries, and the tenant-context plumbing. Highest engineering discipline required; risky for a small team building a complex domain.

The single most important technical pattern for our shared-DB tenant model is **request-scoped context via `AsyncLocalStorage`** (a.k.a. CLS / continuation-local storage), populated once per request from a middleware/guard and read anywhere downstream — so `tenant_id` never has to be threaded through every function signature. **All four frameworks support this**, but NestJS (via `nestjs-cls` proxy providers) and Midway (via `@Inject(Context)` + ALS) make it the most ergonomic. This is detailed in the code sketch at the end.

---

## 1. Options Comparison Table

| Dimension | **NestJS** | **Fastify (+ manual structure)** | **Express** | **Midway.js** | **Egg.js (legacy)** |
|---|---|---|---|---|---|
| Architecture style | Opinionated, Angular-like; modules + classes + DI | Unopinionated micro-framework; you build the structure | Minimal, oldest, least opinionated | Opinionated, IoC container, OOP **and** functional paradigms | Convention-over-config, plugin-based, now in maintenance |
| DI / module system | First-class, decorator-based IoC container; feature modules | None built-in (roll your own / `awilix`) | None | First-class self-built IoC container (`@Injectable`, `@Controller`) | Plugin loader + app/context/agent; rigid |
| TypeScript & DX | Built for TS; types everywhere; excellent | Good TS types; less structure | `@types/express`; loose by default | Built for TS (Alibaba); good Chinese docs | TS support added late; dated DX |
| Multi-tenant context propagation | Mature: middleware/interceptor + `AsyncLocalStorage`; `nestjs-cls` provides typed CLS + **Proxy Providers** + **Transactional** plugin | Manual: `onRequest` hook + ALS; you own the plumbing | Manual: middleware + ALS | `@Inject() ctx`, request-scoped, plus ALS-style support; ORM integrations | Plugin/guard + ctx; doable but dated |
| Ecosystem (2025) | Largest of the four; huge module ecosystem, OpenAPI, Passport, Queues, Microservices, Prisma/TypeORM/MikroORM/Drizzle | Very strong; fastest mainstream HTTP; many plugins | Largest raw npm footprint, but many libs are Express-coupled | China-centric ecosystem; components for Prisma/TypeORM/Sequelize/Mongoose, scheduling, microservices, serverless | Shrinking; superseded by Midway |
| Community / hiring | Global, very large, English-first | Global, growing | Global, large but aging | Strong in China; WeChat/uni-app friendly; bilingual docs | China only, declining |
| Performance | Good (can run on Fastify adapter for ~2x throughput) | **Best** raw throughput of these | Baseline | Good (Koa/Express adapters) | Decent |
| Learning curve | Moderate-high (decorators, modules, RxJS optional) | Low to start, high to scale well | Low | Moderate | Moderate-high (conventions) |
| ORM integration | Prisma (official recipe), TypeORM (official), MikroORM, Sequelize, Drizzle (community) | Works with all; you wire it | Works with all; you wire it | TypeORM, Sequelize, Prisma, Mongoose components | TypeORM/Sequelize/Egg-mysql |
| Best for our case | ✅ Best overall fit | ⚠️ Only if perf-obsessed | ❌ Too unstructured for medium-large SaaS | ✅ Strong alternative, esp. China team | ❌ Maintenance mode |

---

## 2. Industry Conventions and WHY They Exist

### 2.1 "Use a framework with DI for non-trivial services" → NestJS / Midway
Multi-tenant SaaS has heavy cross-cutting concerns (auth, tenant scoping, audit logging, permissions, feature flags). Without DI + a module system, these concerns leak into every handler or become ad-hoc globals. DI lets you declare a `TenantContext`, `CurrentUser`, `AuditLogger` once and inject them cleanly. This convention exists because **spaghetti at the cross-cutting layer is the #1 way SaaS backends rot**.

### 2.2 "Propagate per-request state via AsyncLocalStorage, not request-scoped providers / parameter threading"
- **Threading `tenantId` through every function** is verbose and error-prone (one missed call = a cross-tenant data leak — catastrophic for SaaS).
- **REQUEST-scoped providers** (the "obvious" NestJS answer) force the DI container to rebuild a provider subtree on every request, which kills performance and (historically) breaks with certain singleton assumptions and event listeners.
- **AsyncLocalStorage (ALS / CLS)** is the Node-native, low-overhead way to carry request state implicitly. It's analogous to thread-local storage in Java/Go. NestJS docs explicitly recommend it as an alternative to REQUEST-scoped providers. The industry has converged on ALS as the default for tenant/user/request context. The caveat, also documented: it "obfuscates code flow," so scope it to genuinely cross-cutting values (tenantId, userId, requestId, tx) — not business data.

### 2.3 "Enforce tenant isolation at the ORM/data-access layer, not just the controller"
Shared-DB-with-`tenant_id` is the cheapest multi-tenant model but the most leak-prone. Convention: every business repository **must** automatically filter by the request's tenant_id, ideally via global query filters (Prisma row-level extensions / TypeORM `where` base repository / Drizzle RLS-like middleware). Hand-written raw queries bypassing this layer are treated as a code smell requiring review. A guard/middleware resolves tenant_id once; the data layer reads it from the ALS context. This is exactly what the `nestjs-cls` **Transactional** plugin + a tenant-aware base repository deliver.

### 2.4 "Node 20+ LTS as the runtime baseline (2025)"
Midway v4 requires Node >= 20. ALS is stable and performant since Node 16. All recommended frameworks target Node 20 LTS in 2025.

---

## 3. Mapping Onto OUR Constraints

| Our constraint | How it shapes the choice |
|---|---|
| **Shared DB + `tenant_id` on every business table (logical isolation)** | Demands a robust, hard-to-bypass per-request tenant context. → Strongly favors a framework with mature ALS/CLS + DI so tenant_id is resolved once and auto-injected into repos. **NestJS (`nestjs-cls` Proxy Providers + Transactional)** and **Midway** shine here. Express/Fastify-manual work but require more discipline. |
| **Rental + retail (same SKU rentable OR purchasable)** | Complex domain → many modules (pricing, inventory, orders, returns, leases). Benefits hugely from NestJS modules / Midway components + DI. A pricing/lease-policy strategy pattern is clean in DI; painful in flat Express. |
| **Multi-merchant SaaS** | Merchant = tenant. Need tenant onboarding, per-tenant config, possibly per-tenant feature flags. NestJS `ConfigModule` + tenant-scoped providers fit; Midway components similarly. |
| **TypeScript assumed** | All four are TS-capable, but NestJS and Midway are TS-first by design. |
| **uni-app / WeChat Mini Program frontend** | Backend is just an HTTP/JSON API to the mini-program — framework-agnostic at the edge. BUT WeChat-specific concerns (WeChat Pay, 微信登录/openid, mini-program session, possibly WeChat server-to-server callbacks) have better Chinese-ecosystem support in Midway. NestJS handles them fine via standard libs but with more English-centric docs. |
| **Greenfield, small team likely** | Favor the option with the most batteries-included structure and best learning materials → **NestJS** (huge tutorial base) or **Midway** (if Chinese docs preferred). Fastify-manual is a bet the team can self-impose discipline; risky for a small team on a complex domain. |

---

## 4. Primary Recommendation: NestJS

### Why
1. **Structure scales with the team.** Modules/controllers/providers give a predictable layout for orders, inventory, leases, tenants, pricing, payments — without inventing conventions. New hires ramp faster than on a bespoke Fastify layout.
2. **Best-in-class cross-cutting plumbing for tenant isolation.** The middleware → ALS → Proxy Provider → tenant-aware repository pipeline (sketched below) is the cleanest available. The `nestjs-cls` **Transactional** plugin ties the tenant context to a DB transaction automatically, so even transaction failures can't leak tenant scope.
3. **First-class TypeScript** end-to-end.
4. **Largest ecosystem & hiring pool** globally; OpenAPI/Swagger, Passport auth, queues, scheduler, microservices all built-in.
5. **Flexible HTTP core:** runs on Express by default, can switch to Fastify adapter for ~2x throughput if needed later — no rewrite.

### Caveats
- Decorator/IoC overhead has a learning curve for devs from Express.
- Boot/reflective DI has minor perf cost vs raw Fastify (irrelevant at typical SaaS scale; switch to Fastify adapter if it ever matters).
- `nestjs-cls` is a third-party package (not core-team) — but it's the de-facto standard, well-maintained, ~widely adopted.

---

## 5. Alternatives

### Midway.js (Alibaba) — ALTERNATIVE 1
**Choose if:** primarily China-based team; want WeChat/支付宝 pay and uni-app-era ergonomics with strong Chinese docs and a battle-tested (双11) IoC core.
- Pros: self-built IoC, supports OOP **and** functional (`defineApi` + `useContext`) styles, ships components for TypeORM/Prisma/Sequelize/Mongoose, scheduling, microservices, **serverless**. Node 20+, v4 current. Multi-paradigm lets simple handlers stay simple while complex domains use DI.
- Cons: smaller global (non-Chinese) community; English docs exist but primary content is Chinese; fewer third-party tutorials than NestJS.
- Multi-tenant fit: `@Inject() ctx` + request scope + ALS works well; ORM components can read tenant_id from context similarly to NestJS.

### Fastify (manual structure) — ALTERNATIVE 2
**Choose if:** maximum throughput or minimal runtime magic is a hard requirement, and the team is disciplined enough to enforce module boundaries and a tenant-context helper themselves.
- Pros: fastest mainstream Node HTTP, excellent plugin model, great TS, schema validation built-in (JSON Schema/Ajv).
- Cons: you build the architecture. DI, module system, tenant-aware repository base, and the ALS-context plumbing are all on you. For a small team building a complex rental+retail domain, this is the highest-risk option for long-term maintainability.

### Egg.js — LEGACY (not recommended)
Convention-over-configuration, agent/worker model, Alibaba-era predecessor to Midway. Now effectively superseded by Midway and in maintenance mode. Do not start a greenfield SaaS on Egg in 2025.

### Express — NOT recommended as primary
Too unstructured for a medium-large multi-tenant domain; you'd end up rebuilding NestJS poorly. Fine as the underlying engine NestJS uses.

---

## 6. Concrete Multi-Tenant Request-Context Pattern (NestJS)

Goal: resolve `tenant_id` **exactly once** per request, then make it available to any service/repository **without manual parameter threading** — and have ORM-level tenant filtering so a forgotten filter can't leak data across merchants.

The pattern composes three pieces:

1. **`nestjs-cls`** carries the request context (typed store).
2. A **global middleware/guard** resolves the tenant (from JWT, `x-tenant-id` header, or host/subdomain) and writes `tenantId` into the CLS store once.
3. A **Proxy Provider** (`@InjectableProxy`) exposes the current tenant as an injectable, and a **tenant-aware base repository** + ORM global filter auto-applies `WHERE tenant_id = ?` so business code never touches tenant_id directly.

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

### Why this composition works for us
- **Resolved once:** the middleware runs before any controller; CLS propagates across all async chains for that request.
- **No threading:** services inject `CurrentTenant` or rely on the ORM filter; business code is clean and rental-vs-retail logic isn't polluted with multi-tenancy noise.
- **Defense in depth:** even if a developer forgets a `where`, the Prisma/TypeORM global filter hard-fails or auto-injects — a missing tenant context throws rather than silently returning cross-merchant data.
- **Same context carries the DB transaction:** pair with `nestjs-cls` **Transactional** plugin so a tenant's whole request runs in one tx.

### Fastify / Midway equivalents (brief)
- **Fastify:** use the `onRequest` hook to `als.run(store, () => reply)` and expose a typed `req.tenant` decorator; build the Prisma tenant-extension the same way.
- **Midway:** `@Inject() ctx` in controllers; use Midway's IMiddleware + ALS (or request-scoped provider) to set tenant; the IoC container + ORM component mirror the NestJS flow almost 1:1.

---

## 7. External References

- NestJS official — Async Local Storage recipe (ALS as alternative to REQUEST-scoped providers): https://docs.nestjs.com/recipes/async-local-storage  (verified 2026-07-07)
- `nestjs-cls` docs — Proxy Providers (singleton proxy delegating to per-request CLS instance; tenant-DB-connection factory example): https://papooch.github.io/nestjs-cls/features-and-use-cases/proxy-providers  (verified 2026-07-07)
- `nestjs-cls` Transactional plugin (auto tx tied to CLS): https://papooch.github.io/nestjs-cls/plugins/available-plugins/transactional
- Midway.js official intro (Alibaba, IoC, OOP+FP, Node 20+, v4, 双11 battle-tested): https://midwayjs.org/docs/intro  (verified 2026-07-07)
- Node.js docs — `AsyncLocalStorage` (stable since Node 16, low overhead): https://nodejs.org/api/async_context.html
- Prisma client extensions (for the tenant row-filter pattern): https://www.prisma.io/docs/concepts/components/prisma-client/client-extensions

---

## Caveats / Not Found

- Web search tooling in this environment was intermittent; Google search page did not load, but the authoritative doc pages above were fetched and verified directly, and the core claims (ALS pattern, nestjs-cls Proxy Providers including the tenant-connection example, Midway v4/Node20/双11) come from those primary sources.
- Exact 2025 benchmark numbers (NestJS-Express vs NestJS-Fastify vs raw Fastify req/s) not cited numerically here to avoid stating stale figures; the relative ordering (raw Fastify > NestJS-Fastify > NestJS-Express ≈ Midway-Koa > Express) is stable and well-known.
- Choice of ORM (Prisma vs TypeORM vs Drizzle) is treated as a separate downstream decision; this doc assumes Prisma for the code sketch because its client-extension model gives the cleanest tenant-row filter, but TypeORM (base repository) and Drizzle (RLS-like middleware) are both viable and should be confirmed in their own research note.
- Hiring/cost considerations are directional, not quantified.
