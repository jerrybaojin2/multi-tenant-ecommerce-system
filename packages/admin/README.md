# @miniapp-rent/admin

Dual-brand admin (merchant backend + platform ops console). Stack (per
`.trellis/spec/frontend/`):

- `cool-admin-vue` 8.x (repo is `cool-admin-vue`, NOT `cool-admin-vue3`)
  Vue 3.5 + Vite + Pinia + vue-router
- `vite build --mode merchant` / `vite build --mode platform` driven by
  `VITE_BRAND`
- Menus / permissions / routes are backend-driven via `permmenu`
- Must extend the router `import.meta.glob` to cover `plugins/*` (upstream only
  globs `modules/*`); add `X-Tenant-Id` to the request interceptor

## PR0 status

Placeholder only. The cool-admin-vue 8.x scaffold and dual-brand build config
land in the walking-skeleton PR.
