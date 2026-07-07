# miniAppRentPlatfrom

PR0 backend/infra scaffold for a greenfield multi-tenant rental e-commerce platform.

This repository does not vendor the full cool-admin backend. PR0 keeps the upstream base external and adds machine checks for the integration contract:

- cool-admin candidate must use `@midwayjs/core` 3.x or newer.
- cool-admin candidate must include `src/modules/base/db/tenant.ts`.
- cool-admin `BaseEntity` must expose `tenantId`.
- production config must keep `synchronize: false` and `cool.eps: false`.
- tenant isolation behavior is covered by a regression simulation.

## Commands

Run the local PR0 checks:

```powershell
npm run check
```

Verify an external cool-admin v8 candidate:

```powershell
npm run guard:cool-admin -- --candidate E:\path\to\cool-admin-v8
```

or:

```powershell
$env:COOL_ADMIN_PATH='E:\path\to\cool-admin-v8'
npm run guard:cool-admin
```

The candidate guard intentionally fails when no path is provided; it is for validating the selected external base, not this scaffold itself.
