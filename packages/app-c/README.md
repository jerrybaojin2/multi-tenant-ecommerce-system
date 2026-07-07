# @miniapp-rent/app-c

C-end WeChat mini-program. Stack (per `.trellis/spec/frontend/`):

- uni-app Vue 3 + Vite + TypeScript
- wot-design-uni (primary UI) + uni-ui (fallback)
- Pinia (`tenant`, `auth`, `cart`, `rental`)
- `uni.request` wrapper injecting `X-Tenant-Id` from read-only `tenantStore`
- Per-merchant mini-program AppID with compile-time `VITE_TENANT_ID`

## PR0 status

Placeholder only. The uni-app scaffold (CLI template, `pages.json`,
`utils/request.ts`, `stores/tenant.ts`, `X-Tenant-Id` interceptor) lands in the
walking-skeleton PR. MVP targets `MP-WEIXIN` only; no H5/App abstraction is
introduced prematurely (D7).
