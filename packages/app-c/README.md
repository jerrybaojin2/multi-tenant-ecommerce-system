# @miniapp-rent/app-c

C-end WeChat mini-program. Stack (per `.trellis/spec/frontend/`):

- uni-app Vue 3 + Vite + TypeScript
- wot-design-uni (primary UI) + uni-ui (fallback)
- Pinia (`tenant`, `auth`, `cart`, `rental`)
- `uni.request` wrapper injecting `X-Tenant-Id` from read-only `tenantStore`
- Per-merchant mini-program AppID with compile-time `VITE_TENANT_ID`

MVP targets `MP-WEIXIN` only; no H5/App abstraction is introduced prematurely
(`frontend/index.md`).

## PR1 status

Walking-skeleton wiring is in place and aligned with the backend demo contract:

- `src/utils/tenant.ts` — startup tenant resolver; the **only** place allowed to
  initialize tenant state (`initTenantStore`, called from `App.vue` `onLaunch`)
  and the canonical read for business code (`requireTenantId`). scene/小程序码
  validation is deferred to a later PR (PR1 trusts the compiled tenant id).
- `src/stores/tenant.ts` — read-only tenant context; `initialize()` is the single
  write point and is startup-owned.
- `src/utils/request.ts` — `tenantRequest` / `tenantUpload` / `tenantDownload`
  wrappers, all sharing `buildTenantHeaders()` which injects `X-Tenant-Id` (from
  `tenantStore`) and an optional auth token (from `authStore`, empty in demo).
- `src/api/demo-resource.ts` + `src/pages/demo/index.vue` — calls
  `GET /app/consumer/demo-resources/` and renders the current tenant's `items`.

### Response envelope note

The backend exposes no global success-response wrapper (`configuration.ts`
registers only `AppErrorFilter`). Success bodies are therefore bare objects
(`{items}` / `{item}`), not the `ApiResult<T>` envelope described in
`frontend/type-safety.md`. The C-end follows the **actual** backend shape here
and unwraps `data.items` directly; errors carry `{code,message}` via the filter
and are surfaced as `RequestError`. Flagged for backend/frontend spec alignment.

## Local run

`.env` provides `VITE_TENANT_ID` (must match a backend seed tenant, e.g.
`tenant-a` / `tenant-b`) and `VITE_API_BASE_URL` (`http://127.0.0.1:8001`).

```bash
npm run check            # structural guard (no deps)
npm run typecheck        # vue-tsc --noEmit
npm run dev:mp-weixin    # local mini-program dev
npm run build:mp-weixin  # mini-program production build
```
