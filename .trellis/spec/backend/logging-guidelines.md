# 日志指南

> 本项目如何记录日志。

---

## 概览

后端代码使用 Midway logger facilities，而不是 `console.log`。日志必须让 tenant isolation、payment callbacks、order/rental state transitions 和 scheduled jobs 可追踪，同时不暴露 secrets 或 personal data。

---

## 日志级别

- `debug`：本地开发细节和临时诊断。不要依赖 debug 日志做生产运维。
- `info`：已成功完成的重要业务事件，例如 payment callback accepted、rental returned、tenant feature enabled、scheduled job summary。
- `warn`：预期内但异常的情况，例如 duplicate callback、provider retry、请求 tenant 的 feature disabled、stale state transition attempt。
- `error`：意外异常、provider hard failures、所有重试后的 transaction rollback、tenant isolation violation attempts、schedule tenant failure。

---

## 结构化日志

优先使用结构化对象或格式一致的 key/value fields。包含能让事件被搜索到的字段：

- 可用时包含 `requestId` 或 trace id。
- tenant-scoped work 包含 `tenantId`。
- 相关且安全时包含 `userId` / `adminUserId` / `consumerId`。
- `module`、`service`、`operation`。
- Domain identifiers，例如 `orderId`、`orderNo`、`rentalId`、`paymentId`、`outTradeNo`、`transactionId`、`featureKey`。
- Provider identifiers，例如 request id、callback id、`sub_mchid`、channel merchant id。

示例：

```ts
this.logger.info('payment callback processed', {
  tenantId,
  channel: 'wechat',
  channelMerchantId,
  outTradeNo,
  transactionId,
  status: 'paid',
});
```

---

## 记录什么

- 当 authentication/authorization failures 表明 tenant 或 role misuse 时，以 warn 级别记录。
- 平台专属操作记录 actor、reason 和 filters。
- Payment webhook receipt、signature result、tenant resolution、idempotency decision 和 final state。
- Order/rental state transitions：previous status、next status、actor、event id。
- Deposit/funds ledger writes：ledger type、minor units 的 amount、idempotency key、related event。
- Scheduled job start/end summaries 和 per-tenant failures。
- Feature enable/disable/config changes。

---

## 不记录什么

绝不要记录：

- JWTs、refresh tokens、session ids、passwords、API keys、private keys、certificates、provider secret keys。
- 包含 personal 或 sensitive fields 的完整 payment provider callback bodies。
- 完整 addresses、phone numbers、id card data、bank cards，或未脱敏且非运营必要的 openid/unionid。
- 包含 user data 的 Raw SQL。
- 调试 tenant issues 时的 cross-tenant record payloads。

在日志源头就对 sensitive values 做 mask。不要依赖下游 log processors 清理 secrets。

---

## 评审清单

- [ ] 后端代码中没有遗留 `console.log`。
- [ ] Errors 包含足够 debug 的上下文，同时不暴露 secrets。
- [ ] Payment 和 funds logs 使用 minor units 和 idempotency keys。
- [ ] Tenant-scoped logs 包含 `tenantId`。
- [ ] 平台专属的跨租户操作记录 actor 和 reason。
