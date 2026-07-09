# @miniapp-rent/app-c

C-end WeChat mini-program. Stack (per `.trellis/spec/frontend/`):

- uni-app Vue 3 + Vite + TypeScript
- wot-design-uni (primary UI) + uni-ui (fallback)
- Pinia (`tenant`, `auth`, `cart`, `rental`)
- `uni.request` wrapper injecting `X-Tenant-Id` from read-only `tenantStore`
- Per-merchant mini-program AppID with compile-time `VITE_TENANT_ID`

## PR1 status

The first walking-skeleton scaffold is in place:

- `src/pages.json` registers the demo page.
- `src/stores/tenant.ts` initializes read-only tenant context from
  `VITE_TENANT_ID`.
- `src/utils/request.ts` wraps `uni.request` and injects `X-Tenant-Id`.
- `src/pages/demo/index.vue` calls `/app/consumer/demo-resources`.

MVP targets `MP-WEIXIN` only; no H5/App abstraction is introduced prematurely
(D7).
