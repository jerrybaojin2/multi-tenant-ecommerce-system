# 类型安全

> 前端工作的 TypeScript 与验证模式。

---

## 概览

严格使用 TypeScript。优先使用 domain-specific types，而不是宽松 records，因为 tenant、order mode 和 payment/deposit fields 很容易混淆。

前端代码存在后，推荐 compiler posture：

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

## 类型组织

- 被多个 modules 使用的 shared domain types 放在 `src/types/` 下。
- 单一 module 使用的 types 可以与代码共置为 `*.types.ts`。
- API request/response contracts 放在 API client 旁边；如果之后引入 backend generation，也可以放在 generated/contract folder 中。
- 不要把 admin-only types 与 C-end mini-program code 共享，除非它们是真正的 domain contracts。

核心 domain primitives 应保持显式：

```ts
type TenantId = string
type OrderMode = 'rent' | 'sale'
type Brand = 'merchant' | 'platform'
```

在 stores、API params 和 component props 中一致使用这些类型。

---

## API 契约

使用一致的 response envelope：

```ts
type ApiResult<T> = {
  code: number
  data: T
  message?: string
}
```

规则：

- API clients 返回 typed `data`，不是 `unknown` blobs。
- Request params 在普通 C-end business calls 中不得接受任意 tenant ids；tenant id 来自 request wrapper。
- 当 rent/sale 分支字段不同时，使用 discriminated unions 表达。

示例：

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

## 验证

- 在第一个业务请求前验证启动阶段的租户配置。
- 在 shape 会影响 payment、deposit 或 tenant-sensitive behavior 的边界处，把 backend responses 视为不可信。
- 如果引入 runtime validation library，让 schemas 靠近 API contracts，并从 schemas 推断 TypeScript types。
- 对 admin backend-driven menus，在 dynamic route registration 前验证 required fields，例如 route path、permission code 和 `viewPath`。

---

## 禁止模式

- 在 API responses、store state、component props 或 route/menu contracts 中使用 `any`。
- 使用宽泛 type assertions（例如 `as CartItem`）掩盖缺失的 rent/sale fields。
- 在 templates 中到处分散 stringly typed order modes、brands、permission keys 或 tenant ids。
- 当 business APIs 必须有 tenant id 时，在 request config 中把 tenant id 设为 optional。
- 在 frontend contracts 中把 deposit、rent amount 和 goods amount 混在一个通用 `amount` 字段下。
