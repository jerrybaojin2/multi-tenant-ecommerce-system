# Component Guidelines

> How Vue components are built in this project.

---

## Overview

Use Vue 3 SFCs with `<script setup lang="ts">`. C-end components should favor wot-design-uni first, then uni-ui for stable official fallbacks. Admin components should follow cool-admin-vue and Element Plus/cool-crud patterns.

Components must be tenant-neutral. They receive data and emit events; they do not mutate `tenantStore`, set tenant headers, or decide admin permissions.

---

## Component Structure

Preferred SFC order:

```vue
<script setup lang="ts">
import type { GoodsCard } from '@/types/goods'

const props = defineProps<{
  item: GoodsCard
  mode?: 'rent' | 'sale'
}>()

const emit = defineEmits<{
  select: [id: string]
}>()
</script>

<template>
  <!-- template -->
</template>

<style scoped lang="scss">
/* component styles */
</style>
```

Rules:

- Use `defineProps<T>()` and `defineEmits<T>()`; avoid untyped props.
- Keep components presentational unless the component owns a small local interaction.
- Move fetch, store orchestration, and cross-page business rules into pages or composables.
- Expose mode-specific behavior through typed props such as `mode: 'rent' | 'sale'`.

---

## C-End Components

- Use wot-design-uni components for buttons, tabs, inputs, pickers, cards, count-down, and dialogs.
- Use uni APIs for mini-program capabilities (`uni.scanCode`, `uni.requestSubscribeMessage`) from page/composable code, not deeply nested presentational components.
- Product detail uses one page/component flow with a rent/buy switch; do not create separate rent-only and buy-only product detail pages.
- Cart components must support both `rent` and `sale` rows in the same tenant bucket, while checkout can restrict MVP settlement to one mode at a time.
- Keep mini-program package size in mind: reusable heavy components belong in the subpackage that uses them unless needed by the main package.

---

## Admin Components

- Follow cool-admin-vue module conventions and reuse existing base components before adding new primitives.
- Use backend `perms`/permission directives for button visibility; never hard-code role names as the source of truth.
- Platform-only tenant filters/columns belong in platform views or backend-provided schema; merchant views should not show cross-tenant controls.
- Brand differences should flow from config/theme/logo, not duplicated component trees.

---

## Styling Patterns

- Prefer component-scoped SCSS in SFCs.
- C-end styles must be mini-program compatible. Do not use unsupported browser-only DOM/CSS assumptions.
- Use design tokens/config for tenant brand colors and logos.
- Avoid one-off inline styles except for values computed from safe, typed config.

---

## Common Mistakes

- Do not call `uni.request` directly from components.
- Do not mutate tenant context from a component.
- Do not hide admin features by checking `VITE_BRAND` alone when the backend permission model should decide visibility.
- Do not introduce abandoned uni UI libraries such as `uv-ui`; use wot-design-uni first.
