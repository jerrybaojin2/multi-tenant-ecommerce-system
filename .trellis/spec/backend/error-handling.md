# Error Handling

> How backend errors are handled in this project.

---

## Overview

Use cool-admin/Midway error handling and return client-safe messages. Domain services should reject invalid state transitions early, preserve idempotency, and avoid leaking internal provider details to clients.

Errors should answer three questions:

- Is this a client/domain problem, permission problem, provider problem, or system problem?
- Is it safe to show the message to the caller?
- Does it require rollback, retry, compensation, or audit logging?

---

## Error Types

- **Validation errors**: Invalid DTO shape, missing required fields, invalid enum/status values. Return 400-style responses through the framework validation path.
- **Authentication errors**: Missing or invalid admin/app token. Return unauthorized without revealing whether a tenant/resource exists.
- **Authorization errors**: Role/menu/plugin not enabled, merchant accessing platform-only capability, cross-tenant access attempt. Return forbidden.
- **Domain conflict errors**: Invalid order/rental transition, duplicate callback, stale status, inventory conflict. Return a business error and keep state unchanged.
- **Provider errors**: WeChat payment/profit-sharing/deposit API failures. Store provider code/message internally; expose a stable business message.
- **System errors**: Database, Redis, queue, unexpected exceptions. Let the framework exception filter produce a generic response and log the full details.

Use the cool-admin standard business exception class/helper where available in the v8 codebase. Do not invent multiple parallel error wrappers.

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
async returnRental(rentalId: number, command: ReturnRentalDto) {
  return this.rentalRepo.manager.transaction(async manager => {
    const rental = await this.loadTenantRentalForUpdate(manager, rentalId);
    if (!canReturn(rental.status)) {
      throw new BusinessError('Rental cannot be returned from current status');
    }
    // update rental, append rental_event, emit deposit settlement event
  });
}
```

Replace `BusinessError` with the project-standard cool-admin exception once the backend skeleton is bootstrapped.

---

## API Error Responses

Follow cool-admin's response envelope and status conventions once the skeleton is present. Until then, all backend APIs must preserve these response principles:

- Do not expose stack traces, SQL text, certificates, provider secrets, or raw upstream payloads.
- Include a stable business message suitable for the current client.
- Use consistent codes for common domain failures such as `ORDER_STATUS_INVALID`, `TENANT_FORBIDDEN`, `PLUGIN_DISABLED`, `PAYMENT_CALLBACK_DUPLICATE`.
- Use provider request ids or transaction ids in logs, not necessarily in client responses.

---

## Tenant And Security Errors

- Cross-tenant access attempts are security events, not normal not-found debugging.
- For merchant/admin callers, prefer forbidden/not-found responses that do not confirm another tenant's record exists.
- Platform-only `noTenant` paths must fail closed when role checks are missing or ambiguous.
- Plugin-disabled access returns forbidden and should identify the plugin key in logs.

---

## Common Mistakes

- Returning raw WeChat error payloads to C-end clients.
- Treating duplicate payment callbacks as fatal instead of idempotent success.
- Catching transaction errors and continuing after partial writes.
- Logging secrets while debugging payment certificate or signature failures.
- Returning "tenant not found" details that help enumerate tenant ids.
