# State Management

> How frontend state is managed.

---

## Overview

Use Pinia for global client state. Keep local UI state in components/pages, server state in API responses/composables, and tenant/auth/cart state in dedicated stores.

PR0/PR1 hard rules:

- `tenantStore` initializes from `VITE_TENANT_ID`.
- Business code treats `tenantStore` as read-only.
- C-end cart is `Record<tenantId, CartItem[]>`.
- C-end requests read tenant id from `tenantStore` and inject `X-Tenant-Id`.

---

## Store Categories

C-end stores:

```text
stores/
  tenant.ts     # current tenant context; startup-owned writes only
  auth.ts       # token/user session
  cart.ts       # buckets: Record<tenantId, CartItem[]>
  rental.ts     # rental checkout/return/renewal temporary state
```

Admin stores:

- Use cool-admin-vue base stores for user, app, menu, route, permission, and process state.
- Add domain stores only when state is reused across views and cannot stay in URL/query/local component state.

---

## Tenant Store

`tenantStore` owns current tenant metadata:

- `tenantId`: from `import.meta.env.VITE_TENANT_ID`.
- optional display data: merchant name, logo, theme, current mini-program app id.
- initialization status and startup validation result.

Only startup/bootstrap code may initialize or validate tenant state. Business pages and composables may read tenant state but must not set or switch it in PR0/PR1.

Scene/share parameters may be validated against the compiled tenant id, but they must not silently override it.

---

## Cart Store

Cart state shape:

```ts
type CartItem = {
  goodsId: string
  skuId: string
  qty: number
  mode: 'rent' | 'sale'
  rentTermId?: string
  depositSnapshot?: number
  priceSnapshot: number
  addedAt: number
}

type CartState = {
  buckets: Record<string, CartItem[]>
}
```

Rules:

- Add/update/remove operations operate on `buckets[currentTenantId]`.
- Cart persistence keeps the tenant id dimension.
- Switching tenants is not an MVP feature, but the data model must remain compatible with future tenant buckets.
- Checkout only reads selected items from the current tenant bucket. MVP may restrict one checkout to a single mode (`rent` or `sale`).

---

## Server State

- Do not mirror full server lists into Pinia by default.
- Store only durable session state, drafts, or data reused across multiple pages.
- Reload server lists after mutations unless there is a clear optimistic update rule.
- Admin menu/permission state belongs to the existing cool-admin-vue menu/permission flow.

---

## Common Mistakes

- Do not couple `tenantStore` and `cartStore`; cart must be bucketed by tenant id.
- Do not persist unscoped cart arrays.
- Do not let business code set tenant id from route/query/scene parameters.
- Do not use frontend permission state as a security boundary.
