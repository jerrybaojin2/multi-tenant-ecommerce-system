# 目录结构

> 本项目如何组织后端代码。

---

## 概览

遵循自建 Midway.js modular monolith。业务代码位于 `src/modules/<domain>/`。跨领域的平台基础能力位于 `src/core/`。Controllers 保持 thin；domain rules 放在 services 中。Persistence code 必须天然 tenant-aware。

---

## 目录布局

推荐后端形态：

```text
packages/backend/
  src/
    configuration.ts
    interface.ts
    config/
      config.default.ts
      config.local.ts
      config.prod.ts
    core/
      auth/
        auth.middleware.ts
        jwt.service.ts
        current-user.ts
      tenant/
        tenant-context.ts
        tenant.middleware.ts
        tenant.guard.ts
        platform-scope.ts
      database/
        data-source.ts
        migrations/
        tenant-repository.ts
        rls.ts
      errors/
        business-error.ts
        error.filter.ts
      logging/
        request-id.middleware.ts
      permissions/
        rbac.service.ts
        permission.guard.ts
    modules/
      platform/
        controller/
        dto/
        entity/
        service/
      merchant/
        controller/
        dto/
        entity/
        service/
      consumer/
        controller/
        dto/
        entity/
        service/
      goods/
      inventory/
      order/
      rental/
      payment/
      funds/
      notification/
    schedules/
      rental-overdue.schedule.ts
    integrations/
      payment-channels/
        payment-channel.ts
        wechat/
        alipay/
        lianlian/
        pingpong/
  test/
    fixtures/
    integration/
```

---

## 模块组织

- `core/auth/**`：JWT、current user resolution、password/session helpers 和 auth middleware。
- `core/tenant/**`：tenant context、tenant guard、platform cross-tenant guard，以及任何 AsyncLocalStorage/request-context adapters。
- `core/database/**`：ORM initialization、tenant-aware repository/client helpers、migrations 和 PostgreSQL RLS helpers。
- `core/permissions/**`：RBAC、menu/permission model、admin route guards，以及 platform-vs-merchant checks。
- `modules/platform/**`：platform operator APIs、merchant onboarding、qualification、packages 和 cross-tenant views。
- `modules/merchant/**`：merchant staff APIs 和 tenant self-service。
- `modules/consumer/**`：C-end WeChat mini-program APIs。让它们与 admin assumptions 保持分离。
- `modules/goods/**`：rental + sale product catalog 和 pricing rules。
- `modules/inventory/**`：retail stock、rental availability、reservations 和 concurrency control。
- `modules/order/**`：shared order header、order items、order-level transaction state。
- `modules/rental/**`：rental fulfillment records、rental events、overdue/renew/return/buyout state。
- `modules/payment/**`：payment orders、provider callback processing、channel routing 和 idempotency。
- `modules/funds/**`：deposit/rent/sale ledgers 和 settlement side effects。
- `schedules/**`：Midway scheduled jobs。带有 tenant-scoped effects 的 jobs 必须显式迭代 tenants 并隔离 failures。
- `integrations/**`：provider adapters 和 protocol-specific code。不要让 provider payload models 进入 domain entities。

---

## Controller 布局

- Admin/platform APIs 使用 `/admin/**` routes。
- Merchant admin APIs 使用 `/admin/merchant/**` routes，并要求 tenant context。
- Platform operator APIs 使用 `/admin/platform/**` routes，并要求 platform role。
- C-end mini-program APIs 使用 `/app/consumer/**` routes 和 app-user auth。
- Payment 和 provider callbacks 使用 `/open/**` 或 provider-specific public routes，但必须从可信 provider identifiers（例如 `sub_mchid` 或 channel merchant id）派生 tenant。

---

## Middleware 注册

- `core/**` 下的 Middleware classes 不会仅因为使用 `@Middleware()` 就自动生效。
- Global request middleware 必须在 `src/configuration.ts` 中用 class `getName()` value 注册，例如 `this.app.useMiddleware(['tenant'])`。
- 已注册 middleware classes 也必须是 Midway definitions，因此使用 `@Provide('<middleware-name>')`，并与 `getName()` 返回值保持一致。
- 在 compiled bootstrap path 中，provider/controller/middleware files 必须从 `src/index.ts` 导出，这样 decorators 才会执行并进入 container definitions。
- Tenant、auth、request-id 和 audit middleware 必须在 controllers 依赖其 context helpers 之前注册。
- 添加调用 `requireTenantId()` 或 `requireTenantContext()` 的 route 时，验证该 route family 的 middleware path 能建立 context。

---

## 命名约定

- Module folders：需要时使用 lowercase kebab-case；优先简单 lowercase names（`order`、`payment`、`rental`）。
- Entity classes：`PascalCase`，带 `Entity` 后缀。
- Entity files：小写描述性名称，例如 `order.entity.ts`、`order-item.entity.ts`、`rental-event.entity.ts`。
- DTO files：`<action>.dto.ts` 或 `<domain>-<action>.dto.ts`。
- Service files/classes：`<domain>.service.ts` 和 `DomainService`。
- Middleware/guards：`<purpose>.middleware.ts`、`<purpose>.guard.ts`。
- Status codes：字符串 enums/constants 存放在单一 module-level contract 中，不要在 controllers 中重复。

---

## 需要建立的示例

PR0/PR1 应创建第一批标准示例：

- 一个带 `tenantId` column 的 tenant-scoped entity。
- 一个从可信 auth/header sources 解析 tenant 的 tenant context middleware。
- 一个由 demo service 使用的 tenant-aware repository/client helper。
- 一个带显式 role guard 的 platform-only service method。
- 一个位于 `/app/consumer/**` 下的 C-end controller。
- 一个显式迭代 tenants 的 scheduled rental overdue scan。
