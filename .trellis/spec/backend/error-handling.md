# Error Handling

> How backend errors are handled in this project.

---

## Overview

Use Midway error filters and return client-safe messages. Domain services should reject invalid state transitions early, preserve idempotency, and avoid leaking internal provider details to clients.

Errors should answer three questions:

- Is this a client/domain problem, permission problem, provider problem, or system problem?
- Is it safe to show the message to the caller?
- Does it require rollback, retry, compensation, or audit logging?

---

## Error Types

- **Validation errors**: Invalid DTO shape, missing required fields, invalid enum/status values. Return 400-style responses through the framework validation path.
- **Authentication errors**: Missing or invalid admin/app token. Return unauthorized without revealing whether a tenant/resource exists.
- **Authorization errors**: Role/menu/feature not enabled, merchant accessing platform-only capability, cross-tenant access attempt. Return forbidden.
- **Domain conflict errors**: Invalid order/rental transition, duplicate callback, stale status, inventory conflict. Return a business error and keep state unchanged.
- **Provider errors**: WeChat/Alipay/LianLian/PingPong API failures. Store provider code/message internally; expose a stable business message.
- **System errors**: Database, Redis, queue, unexpected exceptions. Let the Midway exception filter produce a generic response and log the full details.

Use one project-standard `BusinessError` shape once the backend skeleton is in place. Do not invent multiple parallel error wrappers.

---

## Error Handling Patterns

- Validate DTOs at the controller boundary.
- Keep controllers thin; throw domain errors from services after checking tenant, role, and state.
- Do not catch and swallow errors. Catch only when adding context, converting provider errors, or performing compensation.
- In transactions, throw to rollback. Do not return partial-success objects from failed transactional operations.
- Payment callbacks must be idempotent: duplicate success callbacks should return success after confirming state, not throw noisy errors.
- Scheduled jobs should isolate tenant failures. One tenant failure must not stop all tenants from being processed.

Example service pattern:

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

## API Error Responses

All backend APIs must preserve these response principles:

- Do not expose stack traces, SQL text, certificates, provider secrets, or raw upstream payloads.
- Include a stable business message suitable for the current client.
- Use consistent codes for common domain failures such as `ORDER_STATUS_INVALID`, `TENANT_FORBIDDEN`, `FEATURE_DISABLED`, `PAYMENT_CALLBACK_DUPLICATE`.
- Use provider request ids or transaction ids in logs, not necessarily in client responses.

---

## Tenant And Security Errors

- Cross-tenant access attempts are security events, not normal not-found debugging.
- For merchant/admin callers, prefer forbidden/not-found responses that do not confirm another tenant's record exists.
- Platform-only paths must fail closed when role checks are missing or ambiguous.
- Feature-disabled access returns forbidden and should identify the feature key in logs.

---

## Common Mistakes

- Returning raw provider error payloads to C-end clients.
- Treating duplicate payment callbacks as fatal instead of idempotent success.
- Catching transaction errors and continuing after partial writes.
- Logging secrets while debugging payment certificate or signature failures.
- Returning "tenant not found" details that help enumerate tenant ids.
