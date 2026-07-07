# Type Safety

> TypeScript and validation patterns for frontend work.

---

## Overview

Use TypeScript strictly. Prefer domain-specific types over loose records because tenant, order mode, and payment/deposit fields are easy to mix up.

Recommended compiler posture once frontend code exists:

```json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "types": ["@dcloudio/types", "@types/wechat-miniprogram"]
  }
}
```

---

## Type Organization

- Shared domain types live under `src/types/` when consumed by multiple modules.
- Single-module types may be colocated as `*.types.ts`.
- API request/response contracts live beside the API client or in a generated/contract folder if backend generation is introduced later.
- Do not share admin-only types with C-end mini-program code unless they are true domain contracts.

Core domain primitives should be explicit:

```ts
type TenantId = string
type OrderMode = 'rent' | 'sale'
type Brand = 'merchant' | 'platform'
```

Use these consistently in stores, API params, and component props.

---

## API Contracts

Use a consistent response envelope:

```ts
type ApiResult<T> = {
  code: number
  data: T
  message?: string
}
```

Rules:

- API clients return typed `data`, not `unknown` blobs.
- Request params must not accept arbitrary tenant ids for normal C-end business calls; tenant id comes from the request wrapper.
- Represent rent/sale branching with discriminated unions when fields differ.

Example:

```ts
type CartItem =
  | {
      mode: 'sale'
      goodsId: string
      skuId: string
      qty: number
      priceSnapshot: number
      addedAt: number
    }
  | {
      mode: 'rent'
      goodsId: string
      skuId: string
      qty: number
      rentTermId: string
      depositSnapshot: number
      priceSnapshot: number
      addedAt: number
    }
```

---

## Validation

- Validate startup tenant configuration before the first business request.
- Treat backend responses as untrusted at boundaries where the shape affects payment, deposit, or tenant-sensitive behavior.
- If a runtime validation library is introduced, keep schemas near API contracts and infer TypeScript types from schemas.
- For admin backend-driven menus, validate required fields such as route path, permission code, and `viewPath` before dynamic route registration.

---

## Forbidden Patterns

- `any` for API responses, store state, component props, or route/menu contracts.
- Broad type assertions such as `as CartItem` to hide missing rent/sale fields.
- Stringly typed order modes, brands, permission keys, or tenant ids scattered through templates.
- Optional tenant id in request config for business APIs when tenant id is mandatory.
- Mixing deposit, rent amount, and goods amount under a generic `amount` field in frontend contracts.
