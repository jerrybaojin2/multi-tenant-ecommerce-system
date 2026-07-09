# C 端商城模板架构

- 日期: 2026-07-09
- 来源: 用户提供的本地参考文档 `D:\download\deepseek_markdown_20260709_9f3421.md`
- 目的: 固化“前端商城可以更换模板，但业务功能保持一致”的架构边界。

## 结论

C 端商城模板更换是“换视图，不换功能”：

- 模板只改变页面布局、区块顺序、视觉 tokens、图片和展示属性。
- 商品、购物车、订单、支付、售后、会员、客服等能力只实现一套共享 domain/API/state。
- 模板区块通过标准 props 和 events 接入共享能力，不允许复制一套独立业务流程。
- Midway.js 后端是模板配置、租户当前模板、页面实例和区块实例的事实来源。
- uni-app 微信小程序不能运行时下载执行新的 JS，因此运行时只能在已编译进包内的模板/区块之间切换；新增模板代码或新区块类型需要重新构建并发版。

## 分层

```text
PostgreSQL
  storefront_themes / storefront_page_instances / storefront_section_instances
      ↓
Midway.js template service
  解析 tenant context，返回当前租户页面 schema 与业务数据入口
      ↓
uni-app app-c
  已编译 section registry + template renderer
      ↓
Shared feature composables/stores
  goods/cart/order/payment/aftersale/auth/tenant
```

## 前端边界

推荐 C 端组织方式：

```text
src/
  templates/
    registry.ts             # 已编译模板和区块注册表
    renderer.vue            # 根据 schema 渲染已注册区块
    default/
      home-template.vue
  sections/
    product-list-section.vue
    banner-section.vue
    search-section.vue
    cart-entry-section.vue
  composables/
    use-goods.ts
    use-cart.ts
    use-order.ts
```

规则：

- `templates/**` 不直接调用后端业务 API，不写订单/支付/购物车状态。
- `sections/**` 可以触发 typed events，例如 `select-product`、`add-cart`，但实际业务动作交给 shared composables/stores。
- 所有模板读取同一份 `tenantStore`、`authStore`、`cartStore` 和 API clients。
- 区块 registry 必须是白名单；后端返回的 `sectionName` 只能映射到已编译组件，不允许动态 import 任意路径。
- H5 二期可以复用同一份 template schema，但支付、分享、登录等端能力通过端适配层处理。

## 后端与数据模型

推荐数据模型：

| 表 | 范围 | 说明 |
|---|---|---|
| `storefront_themes` | 平台/全局 | 模板定义，包含 name、version、status、default_schema、design_tokens |
| `storefront_theme_versions` | 平台/全局 | 模板版本和变更记录，支持回滚 |
| `tenant_storefront_settings` | tenant-scoped | 当前租户激活的 theme/version 与全局展示配置 |
| `storefront_page_instances` | tenant-scoped | 租户下某个页面类型的实例，例如 home/product/detail |
| `storefront_section_instances` | tenant-scoped | 页面区块实例，保存 section_name、sort、props(jsonb)、visibility |
| `storefront_section_registry` | 平台/全局 | 可选：后台配置用的区块元数据；前端仍以已编译 registry 为准 |

安全约束：

- 租户私有配置必须包含 `tenant_id`。
- C 端读取页面 schema 时从可信 tenant context 获取租户，不接受客户端传入任意 tenant id。
- 商家后台只能编辑本租户的 page/section instances。
- 平台后台可以管理 theme registry/version，但发布模板代码仍需要走构建发版流程。

## API 草案

C 端：

- `GET /app/consumer/storefront/pages/:pageType`：返回当前租户、当前模板版本、页面区块 schema。
- `GET /app/consumer/storefront/theme`：返回当前租户基础 design tokens 和 logo 等展示配置。

商家端：

- `GET /admin/merchant/storefront/themes`：查看可用模板。
- `PUT /admin/merchant/storefront/active-theme`：激活模板版本。
- `GET /admin/merchant/storefront/pages/:pageType`：查看页面配置。
- `PUT /admin/merchant/storefront/pages/:pageType/sections`：保存区块排序和 props。

平台端：

- `GET /admin/platform/storefront/themes`：模板库列表。
- `POST /admin/platform/storefront/themes`：创建模板元数据。
- `POST /admin/platform/storefront/themes/:id/versions`：登记模板版本。
- `PUT /admin/platform/storefront/themes/:id/status`：启用/停用模板。

## 验收标准

- 同一商品、购物车、订单、支付、售后流程在不同模板下走同一套 API 和 state。
- 切换模板后，租户数据不迁移、不复制、不改变订单/商品业务结果。
- 不存在任意后端 component path 被前端动态加载的能力。
- 旧模板配置缺少字段时，区块使用默认 props 安全降级。
- 模板版本可回滚，回滚只改变页面 schema/design tokens，不改业务数据。
