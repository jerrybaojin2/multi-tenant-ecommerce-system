# Directory Structure

> How backend code is organized in this project.

---

## Overview

Follow a self-built Midway.js modular monolith. Business code lives under `src/modules/<domain>/`. Cross-cutting platform primitives live under `src/core/`. Controllers stay thin; domain rules live in services. Persistence code must be tenant-aware by construction.

---

## Directory Layout

Recommended backend shape:

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

## Module Organization

- `core/auth/**`: JWT, current user resolution, password/session helpers, and auth middleware.
- `core/tenant/**`: tenant context, tenant guard, platform cross-tenant guard, and any AsyncLocalStorage/request-context adapters.
- `core/database/**`: ORM initialization, tenant-aware repository/client helpers, migrations, and PostgreSQL RLS helpers.
- `core/permissions/**`: RBAC, menu/permission model, admin route guards, and platform-vs-merchant checks.
- `modules/platform/**`: platform operator APIs, merchant onboarding, qualification, packages, and cross-tenant views.
- `modules/merchant/**`: merchant staff APIs and tenant self-service.
- `modules/consumer/**`: C-end WeChat mini-program APIs. Keep these separate from admin assumptions.
- `modules/goods/**`: rental + sale product catalog and pricing rules.
- `modules/inventory/**`: retail stock, rental availability, reservations, and concurrency control.
- `modules/order/**`: shared order header, order items, order-level transaction state.
- `modules/rental/**`: rental fulfillment records, rental events, overdue/renew/return/buyout state.
- `modules/payment/**`: payment orders, provider callback processing, channel routing, and idempotency.
- `modules/funds/**`: deposit/rent/sale ledgers and settlement side effects.
- `schedules/**`: Midway scheduled jobs. Jobs with tenant-scoped effects must iterate tenants explicitly and isolate failures.
- `integrations/**`: provider adapters and protocol-specific code. Keep provider payload models out of domain entities.

---

## Controller Layout

- Admin/platform APIs use `/admin/**` routes.
- Merchant admin APIs use `/admin/merchant/**` routes and require tenant context.
- Platform operator APIs use `/admin/platform/**` routes and require platform role.
- C-end mini-program APIs use `/app/consumer/**` routes and app-user auth.
- Payment and provider callbacks use `/open/**` or provider-specific public routes, but must derive tenant from trusted provider identifiers such as `sub_mchid` or channel merchant id.

---

## Middleware Registration

- Middleware classes under `core/**` are not active just because they use `@Middleware()`.
- Global request middleware must be registered in `src/configuration.ts` with the class `getName()` value, for example `this.app.useMiddleware(['tenant'])`.
- Registered middleware classes must also be Midway definitions, so use `@Provide('<middleware-name>')` with the same value returned by `getName()`.
- In the compiled bootstrap path, provider/controller/middleware files must be exported from `src/index.ts` so decorators execute and definitions enter the container.
- Tenant, auth, request-id, and audit middleware must be registered before controllers depend on their context helpers.
- When adding a route that calls `requireTenantId()` or `requireTenantContext()`, verify the middleware path can establish context for that route family.

---

## Naming Conventions

- Module folders: lowercase kebab-case only when needed; prefer simple lowercase names (`order`, `payment`, `rental`).
- Entity classes: `PascalCase` with an `Entity` suffix.
- Entity files: lowercase descriptive names, for example `order.entity.ts`, `order-item.entity.ts`, `rental-event.entity.ts`.
- DTO files: `<action>.dto.ts` or `<domain>-<action>.dto.ts`.
- Service files/classes: `<domain>.service.ts` and `DomainService`.
- Middleware/guards: `<purpose>.middleware.ts`, `<purpose>.guard.ts`.
- Status codes: string enums/constants stored in one module-level contract, not duplicated in controllers.

---

## Examples To Establish

PR0/PR1 should create the first canonical examples:

- A tenant-scoped entity with a `tenantId` column.
- A tenant context middleware that resolves tenant from trusted auth/header sources.
- A tenant-aware repository/client helper used by a demo service.
- A platform-only service method with an explicit role guard.
- A C-end controller under `/app/consumer/**`.
- A scheduled rental overdue scan that iterates tenants explicitly.
