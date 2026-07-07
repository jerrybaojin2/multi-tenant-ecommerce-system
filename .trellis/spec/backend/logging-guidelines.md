# Logging Guidelines

> How logging is done in this project.

---

## Overview

Use Midway/cool-admin logger facilities, not `console.log`, for backend code. Logs must make tenant isolation, payment callbacks, order/rental state transitions, and scheduled jobs traceable without exposing secrets or personal data.

---

## Log Levels

- `debug`: Local development details and temporary diagnostics. Do not rely on debug logs for production operations.
- `info`: Important business events that completed successfully, such as payment callback accepted, rental returned, tenant plugin enabled, scheduled job summary.
- `warn`: Expected but abnormal conditions, such as duplicate callback, provider retry, tenant plugin disabled for a requested feature, stale state transition attempt.
- `error`: Unexpected exceptions, provider hard failures, transaction rollback after all retries, tenant isolation violation attempts, schedule tenant failure.

---

## Structured Logging

Prefer structured objects or consistently formatted key/value fields. Include the fields that make the event searchable:

- `requestId` or trace id when available.
- `tenantId` for tenant-scoped work.
- `userId` / `adminUserId` / `consumerId` when relevant and safe.
- `module`, `service`, `operation`.
- Domain identifiers such as `orderId`, `orderNo`, `rentalId`, `paymentId`, `outTradeNo`, `transactionId`, `pluginKey`.
- Provider identifiers such as WeChat request id, callback id, `sub_mchid`.

Example:

```ts
this.logger.info('payment callback processed', {
  tenantId,
  subMchid,
  outTradeNo,
  transactionId,
  status: 'paid',
});
```

---

## What To Log

- Authentication/authorization failures at warn level when they indicate tenant or role misuse.
- Platform-only `noTenant` operations with actor, reason, and filters.
- Payment webhook receipt, signature result, tenant resolution, idempotency decision, and final state.
- Order/rental state transitions: previous status, next status, actor, event id.
- Deposit/funds ledger writes: ledger type, amount in cents, idempotency key, related event.
- Scheduled job start/end summaries and per-tenant failures.
- Plugin install/enable/disable/config changes.

---

## What Not To Log

Never log:

- JWTs, refresh tokens, session ids, passwords, API keys, private keys, certificates, `apiV3Key`.
- Full payment provider callback bodies if they include personal or sensitive fields.
- Full addresses, phone numbers, id card data, bank cards, or openid/unionid unless masked and operationally necessary.
- Raw SQL containing user data.
- Cross-tenant record payloads while debugging tenant issues.

Mask sensitive values at the source before logging. Do not rely on downstream log processors to clean secrets.

---

## Review Checklist

- [ ] No `console.log` remains in backend code.
- [ ] Errors include enough context to debug without exposing secrets.
- [ ] Payment and funds logs use minor units and idempotency keys.
- [ ] Tenant-scoped logs include `tenantId`.
- [ ] Platform-only cross-tenant operations log actor and reason.
