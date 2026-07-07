# Directory Structure

> How backend code is organized in this project.

---

## Overview

Follow cool-admin v8 module conventions. Business code lives under `src/modules/<module>/`; platform plugins live under the cool-admin plugin mechanism. Keep API controllers thin and put business rules in services. Keep tenant-scoped persistence in TypeORM entities that extend `BaseEntity`.

---

## Directory Layout

Recommended backend shape:

```text
src/
├── config/
│   ├── config.default.ts
│   ├── config.local.ts
│   └── config.prod.ts
├── modules/
│   ├── base/                         # cool-admin base module; do not fork casually
│   ├── merchant/
│   │   ├── config.ts
│   │   ├── controller/
│   │   │   └── admin/                # B-end merchant and platform admin APIs
│   │   ├── dto/
│   │   ├── entity/
│   │   ├── service/
│   │   └── schedule/
│   ├── consumer/
│   │   ├── config.ts
│   │   ├── controller/
│   │   │   └── app/
│   │   │       └── consumer/         # C-end mini-program APIs: /app/consumer/**
│   │   ├── dto/
│   │   ├── entity/
│   │   └── service/
│   ├── goods/
│   ├── order/
│   ├── rental/
│   ├── payment/
│   └── platform/
│       ├── controller/
│       │   └── admin/                # platform-only cross-tenant operations
│       ├── dto/
│       ├── entity/
│       └── service/
└── plugins/
    └── wxpay-ecommerce/
        ├── assets/
        ├── src/
        │   ├── index.ts              # exports Plugin
        │   ├── entity/
        │   ├── service/
        │   ├── controller/
        │   └── dto/
        ├── plugin.json
        └── README.md
```

If upstream cool-admin v8 uses a different plugin directory for installed `.cool` packages, keep upstream install/runtime paths and apply the same rules to plugin source packages.

---

## Module Organization

- `controller/admin/**`: Admin-side APIs for merchant staff and platform operators. Authorization is role/menu driven; tenant filtering still applies unless a platform-only service intentionally uses `noTenant`.
- `controller/app/consumer/**`: C-end WeChat mini-program APIs. Use the app token stream and tenant header/JWT context; never reuse admin authentication assumptions.
- `controller/open/**`: Public callback or open endpoints only. Webhooks must derive tenant context from trusted payload fields such as `sub_mchid`, not from user headers.
- `entity/**`: TypeORM entities. Tenant-scoped entities must extend `BaseEntity`; do not redeclare `tenantId`.
- `service/**`: Business logic, transactions, state transitions, payment/funds orchestration, and reusable domain queries.
- `dto/**`: Request validation and typed API payload contracts.
- `schedule/**`: Midway scheduled tasks. Jobs with tenant-scoped effects must iterate tenants explicitly and run one tenant at a time with tenant context.
- `middleware/**`: Request-level guards, tenant/header checks, and endpoint-specific middleware.
- `db.json` / `menu.json`: Use cool-admin seed conventions when a module needs initial data or menus.
- `config.ts`: Required cool-admin module metadata.

---

## Domain Module Guidance

- `goods`: rental + sale product catalog, JSONB pricing/rental rules, stock-facing product data.
- `order`: shared order header, order items, order-level transaction state.
- `rental`: rental fulfillment records, rental events, overdue/renew/return/buyout state.
- `payment`: payment orders, WeChat service-provider/ecommerce payment integration, callbacks, profit sharing.
- `funds` or `deposit`: deposit/rent/sale ledgers and idempotent accounting listeners.
- `platform`: merchant onboarding, tenant profiles, cross-tenant operations, payment qualification status.

Do not split sale and rental into separate order modules. PR0/PRD chooses one shared order header plus item type and rental child records.

---

## Naming Conventions

- Module folders: lowercase kebab-case only when needed; prefer simple lowercase names (`order`, `payment`, `rental`).
- Entity classes: `PascalCase` with an `Entity` suffix only if the domain name would otherwise be ambiguous.
- Entity files: lowercase descriptive names, for example `order.ts`, `order-item.ts`, `rental-event.ts`.
- DTO files: `<action>.dto.ts` or `<domain>-<action>.dto.ts`.
- Service files/classes: `<domain>.service.ts` and `DomainService`.
- Plugin keys: lowercase kebab-case, stable forever after release, for example `wxpay-ecommerce`.
- Status codes: string enums/constants stored in one service/module-level contract, not duplicated in controllers.

---

## Examples To Establish

The repository is greenfield. PR0/PR1 should create the first canonical examples:

- A tenant-scoped entity extending `BaseEntity`.
- An admin controller using `@CoolController` generic CRUD.
- A C-end controller under `controller/app/consumer`.
- A platform-only service method with an explicit `noTenant` escape and role guard.
- A scheduled rental overdue scan that iterates tenants explicitly.
