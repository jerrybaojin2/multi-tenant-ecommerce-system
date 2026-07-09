# 组件指南

> 本项目如何构建 Vue components。

---

## 概览

使用 Vue 3 SFCs 和 `<script setup lang="ts">` 构建 C 端组件。C 端组件应优先使用 wot-design-uni，其次用 uni-ui 作为稳定官方 fallback。Admin 组件使用 React/Next.js 组件，并保持后端权限驱动。

组件必须保持 tenant-neutral。它们接收数据并 emit events；它们不修改 `tenantStore`、不设置 tenant headers，也不决定 admin permissions。

---

## 组件结构

推荐 SFC 顺序：

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

规则：

- 使用 `defineProps<T>()` 和 `defineEmits<T>()`；避免 untyped props。
- 组件保持 presentational，除非组件拥有很小的 local interaction。
- 将数据请求、store 编排和跨页面业务规则移到 pages 或 composables。
- 通过 typed props（例如 `mode: 'rent' | 'sale'`）暴露 mode-specific behavior。

---

## C 端组件

- Buttons、tabs、inputs、pickers、cards、count-down 和 dialogs 使用 wot-design-uni components。
- Mini-program capabilities（`uni.scanCode`、`uni.requestSubscribeMessage`）从 page/composable code 调用，不在深层 presentational components 中调用。
- Product detail 使用一套 page/component flow 和 rent/buy switch；不要创建独立的 rent-only 与 buy-only product detail pages。
- Cart components 必须支持同一个 tenant bucket 中的 `rent` 和 `sale` rows；checkout 可以把 MVP settlement 限制为一次一个 mode。
- 注意 mini-program package size：可复用的 heavy components 应放在使用它们的 subpackage 中，除非 main package 也需要。

---

## Admin 组件

- 遵循 Next.js App Router 的页面/组件边界，并在添加新 primitives 前复用现有 admin shell 组件。
- 使用后端返回的 perms/menu 控制按钮可见性；绝不要把硬编码角色名当作事实来源。
- 平台专属的租户 filters/columns 属于 platform views 或后端提供的 schema；merchant views 不应展示跨租户 controls。
- 品牌差异应来自 config/theme/logo，而不是重复 component trees。

---

## 样式模式

- 优先使用 SFC 中的 component-scoped SCSS。
- C-end styles 必须兼容 mini-program。不要使用不受支持的 browser-only DOM/CSS assumptions。
- 使用 design tokens/config 管理 tenant brand colors 和 logos。
- 避免一次性 inline styles，除非这些值来自安全、typed config 的计算。

---

## 常见错误

- 不要从 components 直接调用 `uni.request`。
- 不要从 component 修改 tenant context。
- 当后端权限模型应决定可见性时，不要仅通过检查前端 surface/config 隐藏 admin features。
- 不要引入已废弃的 uni UI libraries，例如 `uv-ui`；优先使用 wot-design-uni。
