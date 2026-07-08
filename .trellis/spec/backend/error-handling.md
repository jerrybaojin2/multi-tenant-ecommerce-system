# 错误处理

> 本项目如何处理后端错误。

---

## 概览

使用 Midway error filters，并返回客户端安全消息。Domain services 应尽早拒绝无效状态流转，保留幂等性，并避免向 clients 泄漏内部 provider details。

错误应回答三个问题：

- 这是 client/domain problem、permission problem、provider problem，还是 system problem？
- 将此消息展示给 caller 是否安全？
- 它是否需要 rollback、retry、compensation 或 audit logging？

---

## 错误类型

- **校验错误**：DTO shape 无效、缺少必填字段、enum/status values 无效。通过框架校验路径返回 400-style responses。
- **认证错误**：缺少或无效的 admin/app token。返回 unauthorized，不透露 tenant/resource 是否存在。
- **授权错误**：Role/menu/feature 未启用、merchant 访问平台专属能力、尝试跨租户访问。返回 forbidden。
- **领域冲突错误**：订单/租赁状态流转无效、重复回调、状态过期、库存冲突。返回 business error，并保持状态不变。
- **Provider 错误**：WeChat/Alipay/LianLian/PingPong API 调用失败。内部存储 provider code/message；对外暴露稳定的业务消息。
- **系统错误**：Database、Redis、queue、unexpected exceptions。让 Midway exception filter 生成通用响应，并记录完整细节。

后端骨架到位后，使用一个项目标准的 `BusinessError` shape。不要发明多套并行 error wrappers。

---

## 错误处理模式

- 在 controller boundary 验证 DTOs。
- 保持 controllers thin；services 检查 tenant、role 和 state 后抛出 domain errors。
- 不要捕获后吞掉错误。只有在补充上下文、转换 provider errors 或执行 compensation 时才捕获。
- 在 transactions 中，通过 throw 触发 rollback。不要从失败的事务操作返回 partial-success objects。
- Payment callbacks 必须 idempotent：重复的 success callbacks 应在确认状态后返回 success，而不是抛出噪声错误。
- Scheduled jobs 应隔离 tenant failures。一个 tenant failure 不能阻止所有 tenants 被处理。

示例 service pattern：

```ts
async returnRental(rentalId: string, command: ReturnRentalDto) {
  return this.database.transaction(async tx => {
    const rental = await this.rentalRepo.loadForUpdate(tx, rentalId);
    if (!canReturn(rental.status)) {
      throw new BusinessError('RENTAL_STATUS_INVALID', 'Rental cannot be returned from current status');
    }
    // update rental, append rental_event, emit deposit settlement event
  });
}
```

---

## API 错误响应

所有后端 APIs 必须遵守这些响应原则：

- 不暴露 stack traces、SQL text、certificates、provider secrets 或 raw upstream payloads。
- 包含适合当前客户端的稳定业务消息。
- 对常见 domain failures 使用一致 codes，例如 `ORDER_STATUS_INVALID`、`TENANT_FORBIDDEN`、`FEATURE_DISABLED`、`PAYMENT_CALLBACK_DUPLICATE`。
- 在日志中使用 provider request ids 或 transaction ids，不一定要放进客户端响应。

---

## 租户与安全错误

- 跨租户访问尝试是安全事件，不是普通 not-found 调试。
- 对 merchant/admin callers，优先使用 forbidden/not-found responses，避免确认另一个 tenant 的 record 是否存在。
- 平台专属路径在角色检查缺失或模糊时必须默认拒绝。
- 功能未启用的访问返回 forbidden，并应在日志中标识 feature key。

---

## 常见错误

- 向 C-end clients 返回 raw provider error payloads。
- 把 duplicate payment callbacks 当作 fatal，而不是 idempotent success。
- 捕获 transaction errors 后，在 partial writes 之后继续。
- 调试 payment certificate 或 signature failures 时记录 secrets。
- 返回有助于枚举 tenant ids 的 "tenant not found" details。
