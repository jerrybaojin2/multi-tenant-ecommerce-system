# API 与数据模型映射

- 日期: 2026-07-08
- 用途: 将 [功能点 PRD](../prd.md) 中的 H5/Admin 功能点映射到后端 API 接口与数据库数据模型，为 PR1+ 开发提供技术基础。
- 后端约定来源: `.trellis/spec/backend/directory-structure.md`、现有 `demo-resource` 模块模式。

## 设计约定

### 实体基类
所有租户隔离表继承 `BaseTenantEntity`，自动包含：
- `id` (uuid, PK)
- `tenantId` → `tenant_id` (varchar 64)
- `createdAt` → `created_at`
- `updatedAt` → `updated_at`

平台级表（不按租户隔离，如商家入驻、套餐、平台审计）不继承该基类，使用独立主键。

### 命名约定
- 表名：snake_case 复数（`products`、`order_items`）
- 实体类：PascalCase + `Entity` 后缀（`ProductEntity`）
- 字段：TS camelCase 映射到 DB snake_case
- 状态码：字符串 enum，集中在单一 module-level contract

### 路由前缀约定（来自 spec）
- C 端：`/app/consumer/**`
- 商家端：`/admin/merchant/**`
- 平台端：`/admin/platform/**`
- 支付/回调：`/open/**`（从可信 provider 标识解析 tenant）

### 模块归属
- 共享业务模块（goods/inventory/order/aftersale/payment/funds/logistics/promotion/content/customer-service）：被多端 controller 调用
- 端专属模块（consumer/merchant/platform）：仅暴露该端的 API

---

## 数据模型（按模块）

### 1. 商品模块（goods）

| 表 | 用途 | 关键字段 | 租赁扩展点 |
|---|---|---|---|
| `categories` | 商品分类（树形） | parent_id、name、sort、level、icon | - |
| `products` | 商品 SPU | category_id、name、main_image、images(jsonb)、status(上架/下架)、sales_type(sale/rent/both)、description | rental_price、deposit、rental_rules(jsonb) 预留 |
| `product_skus` | 商品 SKU | product_id、sku_code、attributes(jsonb)、price、stock、sales_type | rental 相关字段预留 |
| `product_attributes` | SPU 属性/规格 | product_id、name、values(jsonb) | - |
| `product_evaluations` | 商品评价 | product_id、order_id、user_id、score、content、images(jsonb)、reply、status(待审核/通过/隐藏) | - |
| `product_favorites` | 商品收藏 | product_id、user_id | - |
| `browse_histories` | 浏览记录 | product_id、user_id、viewed_at | - |

> 注：`products.sales_type` 用 enum 区分仅售/仅租/租售，MVP 仅启用 `sale`，`rent/both` 预留。

### 2. 库存模块（inventory）

| 表 | 用途 | 关键字段 | 租赁扩展点 |
|---|---|---|---|
| `inventories` | 零售库存（按 SKU） | sku_id、available_qty、locked_qty、warning_qty | rental_availability、rental_reservations 预留 |

### 3. 订单模块（order）

| 表 | 用途 | 关键字段 | 租赁扩展点 |
|---|---|---|---|
| `orders` | 订单主表 | order_no、user_id、status(待支付/待发货/已发货/已完成/已取消)、total_amount、payment_amount、address_snapshot(jsonb)、logistics_status、type(sale/rent/mixed) | rental 状态字段预留 |
| `order_items` | 订单项 | order_id、product_id、sku_id、name、image、price、qty、item_type(sale/rent) | rental_id 关联预留 |
| `order_logs` | 订单操作日志 | order_id、operator、action、from_status、to_status、remark | - |

> 订单状态机：见主 PRD D5。MVP 仅实现 `sale` 交易状态机，`rent/mixed` 预留。

### 4. 售后模块（aftersale）

| 表 | 用途 | 关键字段 |
|---|---|---|
| `aftersales` | 售后单 | order_id、order_item_id、user_id、type(退款/退货退款/换货)、reason、status(申请中/审核通过/拒绝/已完成)、amount、images(jsonb) |
| `aftersale_logs` | 售后操作日志 | aftersale_id、operator、action、remark |

### 5. 支付模块（payment）

| 表 | 用途 | 关键字段 |
|---|---|---|
| `payment_orders` | 支付订单 | order_id、payment_no、channel(mock/wechat/alipay/lianlian/pingpong)、amount、status(待支付/成功/失败/已退款)、provider_trade_no、business_type(sale/deposit)、paid_at |
| `payment_callbacks` | 支付回调记录（幂等） | payment_no、provider、raw_payload(jsonb)、processed(bool) |

### 6. 资金台账模块（funds）

| 表 | 用途 | 关键字段 |
|---|---|---|
| `funds_ledgers` | 资金流水 | order_id、type(sale_payment/deposit_freeze/deposit_unfreeze/deposit_deduct/refund)、amount、direction(in/out)、balance_after、remark | deposit 相关流水的状态机事件联动预留 |

### 7. 营销模块（promotion）

| 表 | 用途 | 关键字段 |
|---|---|---|
| `coupon_templates` | 优惠券模板 | name、type(满减/折扣/立减)、value、min_amount、scope、valid_type、valid_days、total_qty、received_qty |
| `coupons` | 用户优惠券 | template_id、user_id、status(未使用/已使用/已过期)、used_order_id、received_at、expire_at |
| `member_levels` | 会员等级配置 | name、level、threshold、discount、points_rate |
| `member_points` | 会员积分流水 | user_id、delta、balance_after、source(order/signin/exchange)、remark |
| `members` | 用户会员关系 | user_id、level_id、total_points、growth_value |

### 8. 物流模块（logistics）

| 表 | 用途 | 关键字段 |
|---|---|---|
| `shipping_templates` | 运费模板 | name、charge_type(weight/piece/area)、is_free_threshold、status |
| `shipping_template_items` | 运费模板明细 | template_id、region_codes(jsonb)、first_unit、first_fee、next_unit、next_fee |
| `express_companies` | 快递公司配置（商家支持） | code、name、logo、is_enabled、sort |
| `shipments` | 发货单 | order_id、express_company_code、tracking_no、shipped_at、signed_at、status |

> 快递鸟集成：物流轨迹查询、电子面单、状态推送通过 `integrations/` 适配器，不污染领域实体。

### 9. 客服模块（customer-service）

| 表 | 用途 | 关键字段 |
|---|---|---|
| `cs_sessions` | 客服会话 | user_id、staff_id、status(进行中/已关闭)、last_message_at |
| `cs_messages` | 客服消息 | session_id、sender_type(user/staff)、content、message_type(text/image)、read_at |
| `faqs` | 常见问题 | category、question、answer、sort、status |
| `complaints` | 投诉 | user_id、target_type(order/merchant)、target_id、reason、status、handle_remark |

### 10. 内容模块（content）

| 表 | 用途 | 关键字段 |
|---|---|---|
| `banners` | 轮播图 | title、image、link_type、link_value、position(home/category)、sort、status |
| `articles` | 文章/帮助 | category、title、content、author、view_count、status |
| `announcements` | 公告 | title、content、scope(shop/platform)、status、publish_at |

### 11. C 端用户模块（consumer-user）

| 表 | 用途 | 关键字段 |
|---|---|---|
| `tenant_users` | 租户用户 | phone、openid、union_id(预留全局)、nickname、avatar、status | union_id 预留（D9） |
| `user_addresses` | 用户地址 | user_id、name、phone、province、city、district、detail、is_default |

### 12. 权限模块（rbac，双品牌共用）

> 权限按租户隔离：商家管理员权限在各自 tenant 范围内；平台管理员通过 platform scope 跨租户。

| 表 | 用途 | 关键字段 | 隔离 |
|---|---|---|---|
| `admin_users` | 管理员账户 | username、phone、password_hash、brand(merchant/platform)、status、last_login_at | tenant_id（平台管理员为 null） |
| `admin_roles` | 角色 | name、code、brand、data_scope(self/tenant/all) | tenant_id |
| `admin_menus` | 菜单（后端驱动） | parent_id、name、path、component、icon、permission、sort、type(menu/button)、brand | 无（全局菜单定义） |
| `admin_role_menus` | 角色-菜单关联 | role_id、menu_id | - |
| `admin_user_roles` | 用户-角色关联 | user_id、role_id | - |

### 13. 平台模块（platform，非租户隔离）

| 表 | 用途 | 关键字段 |
|---|---|---|
| `merchants` | 商家（即租户主体） | name、logo、contact、status(待审核/正常/禁用/封禁)、domain（H5 站点域名）、app_id、created_at |
| `merchant_qualifications` | 商家资质 | merchant_id、type(营业执照/法人/行业许可)、file_url、status(待审核/通过/拒绝) |
| `packages` | 套餐 | name、price、period、features(jsonb)、limits(jsonb: 商品数/订单数)、status |
| `merchant_packages` | 商家套餐关联 | merchant_id、package_id、start_at、expire_at、status |
| `settlements` | 结算单 | merchant_id、period、gross_amount、commission_rate、commission、net_amount、status(待结算/已结算) |
| `withdrawals` | 提现申请 | merchant_id、amount、status(待审核/已打款/拒绝)、bank_info、applied_at |
| `audit_logs` | 审计日志 | operator_id、brand、action、target、target_id、ip、payload(jsonb)、created_at |

### 14. 租赁模块（rental，全部预留）

| 表 | 用途 | 关键字段 | 状态 |
|---|---|---|---|
| `rentals` | 租赁履约记录 | order_item_id、start_at、end_at、deposit_amount、status(租赁中/已归还/已逾期/已买断) | 🔸预留 |
| `rental_events` | 租赁事件流水 | rental_id、event(paid/returned/overdue/renewed/bought_out)、occurred_at、remark | 🔸预留 |

---

## 实体关系概览

```
merchants (平台)
  └─ tenant_id 贯穿所有租户表
       ├─ products ── product_skus ── inventories
       ├─ orders ── order_items ── shipments
       ├─ aftersales
       ├─ payment_orders ── funds_ledgers
       ├─ coupons / members / member_points (用户级，tenant_users 下)
       ├─ tenant_users ── user_addresses / favorites / browse_histories
       └─ admin_users / admin_roles / admin_menus (权限)
```

数据模型梳理完成，详见各模块表。

---

## API 接口（按端）

> 规范：RESTful，动词映射 HTTP method；列表接口支持分页/筛选 query；统一返回 `{ items, total }` 或 `{ item }`。

### C 端 API（`/app/consumer/**`）

**认证**：app token + `X-Tenant-Id`（必须与 AppID/商家配置校验后才进入 tenant context）

| 模块 | Method | Path | 说明 |
|---|---|---|---|
| 认证 | POST | `/auth/login` | 登录（手机号/微信授权） |
| 用户 | GET / PUT | `/users/profile` | 查看 / 更新个人信息 |
| 地址 | GET / POST / PUT / DELETE | `/users/addresses[/:id]` | 地址增删改查 |
| 商品 | GET | `/products` | 商品列表（分页/筛选/搜索/分类） |
| 商品 | GET | `/products/:id` | 商品详情 |
| 商品 | GET | `/products/:id/evaluations` | 商品评价 |
| 分类 | GET | `/categories` | 分类树 |
| 收藏 | GET / POST | `/favorites` | 收藏列表 / 收藏 |
| 收藏 | DELETE | `/favorites/:productId` | 取消收藏 |
| 浏览 | GET | `/browse-histories` | 浏览记录 |
| 购物车 | GET | `/cart` | 购物车 |
| 购物车 | POST / PUT / DELETE | `/cart/items[/:id]` | 加入 / 改数量 / 删除 |
| 订单 | POST | `/orders` | 创建订单 |
| 订单 | GET | `/orders` | 订单列表（状态筛选） |
| 订单 | GET | `/orders/:id` | 订单详情 |
| 订单 | POST | `/orders/:id/cancel` | 取消订单 |
| 订单 | POST | `/orders/:id/confirm` | 确认收货 |
| 支付 | POST | `/payments` | 发起支付 |
| 支付 | GET | `/payments/:paymentNo/result` | 支付结果 |
| 售后 | POST | `/aftersales` | 申请售后 |
| 售后 | GET | `/aftersales[/:id]` | 售后列表 / 详情 |
| 优惠券 | GET | `/coupons/available` | 可领优惠券 |
| 优惠券 | POST | `/coupons/:templateId/receive` | 领取优惠券 |
| 优惠券 | GET | `/coupons/mine` | 我的优惠券 |
| 会员 | GET | `/members/profile` | 会员信息 |
| 会员 | GET | `/members/points` | 积分明细 |
| 物流 | GET | `/shipments/:orderId/track` | 物流跟踪（快递鸟） |
| 客服 | GET | `/cs/sessions` | 会话列表 |
| 客服 | POST | `/cs/sessions/:id/messages` | 发送消息 |
| 客服 | GET | `/faqs` | 常见问题 |
| 客服 | POST | `/complaints` | 提交投诉 |
| 内容 | GET | `/banners` | 首页轮播图 |
| 内容 | GET | `/announcements` | 公告 |
| 内容 | GET | `/articles/:id` | 文章详情 |

### 商家端 API（`/admin/merchant/**`）

**认证**：管理员 JWT + tenant context（限本租户）

| 模块 | Method | Path | 说明 |
|---|---|---|---|
| 商品 | GET / POST | `/products` | 列表 / 新增 |
| 商品 | GET / PUT / DELETE | `/products/:id` | 详情 / 更新 / 删除 |
| 商品 | PUT | `/products/:id/status` | 上架/下架 |
| 分类 | GET / POST / PUT / DELETE | `/categories[/:id]` | 分类管理 |
| 评价 | GET | `/product-evaluations` | 评价列表 |
| 评价 | PUT | `/product-evaluations/:id/reply` | 回复评价 |
| 订单 | GET | `/orders[/:id]` | 订单列表 / 详情 |
| 订单 | POST | `/orders/:id/ship` | 发货 |
| 订单 | POST | `/orders/:id/refund` | 退款 |
| 库存 | GET | `/inventories` | 库存列表 |
| 库存 | PUT | `/inventories/:skuId` | 调整库存 |
| 售后 | GET | `/aftersales` | 售后列表 |
| 售后 | POST | `/aftersales/:id/audit` | 审核 |
| 售后 | POST | `/aftersales/:id/process` | 处理 |
| 资金 | GET | `/funds/ledgers` | 资金流水 |
| 资金 | GET | `/funds/summary` | 收入汇总 |
| 营销 | GET / POST / PUT / DELETE | `/coupon-templates[/:id]` | 优惠券模板 |
| 营销 | GET / POST / PUT | `/member-levels[/:id]` | 会员等级 |
| 营销 | GET / POST / PUT / DELETE | `/banners[/:id]` | 轮播图 |
| 客服 | GET | `/cs/sessions` | 会话列表 |
| 客服 | POST | `/cs/sessions/:id/messages` | 回复 |
| 客服 | GET / POST / PUT / DELETE | `/faqs[/:id]` | FAQ |
| 客服 | GET / PUT | `/complaints[/:id]` | 投诉列表 / 处理 |
| 物流 | GET / POST / PUT / DELETE | `/shipping-templates[/:id]` | 运费模板 |
| 物流 | GET / PUT | `/express-companies[/:code]` | 快递公司配置 |
| 物流 | POST | `/shipments/print` | 电子面单（快递鸟） |
| 店铺 | GET / PUT | `/shop/profile` | 店铺信息 |
| 店铺 | GET / PUT | `/shop/settings` | 营业配置 |
| 店铺 | GET / POST / PUT / DELETE | `/announcements[/:id]` | 公告 |
| 权限 | GET / POST / PUT / DELETE | `/rbac/roles[/:id]` | 角色 |
| 权限 | GET / POST / PUT / DELETE | `/rbac/users[/:id]` | 用户 |
| 权限 | GET | `/rbac/menus` | 菜单 |

### 平台端 API（`/admin/platform/**`）

**认证**：平台管理员 JWT + platform scope（跨租户，需审计）

| 模块 | Method | Path | 说明 |
|---|---|---|---|
| 商家 | GET | `/merchants` | 商家列表 |
| 商家 | GET | `/merchants/:id` | 商家详情 |
| 商家 | POST | `/merchants/:id/audit` | 入驻审核 |
| 商家 | PUT | `/merchants/:id/status` | 状态变更 |
| 商家 | GET / POST / PUT | `/merchant-qualifications[/:id]` | 资质管理 |
| 套餐 | GET / POST / PUT / DELETE | `/packages[/:id]` | 套餐管理 |
| 套餐 | GET | `/merchant-packages` | 商家套餐 |
| 套餐 | PUT | `/merchant-packages/:id` | 变更套餐 |
| 结算 | GET / PUT | `/settlement-rules` | 分账规则 |
| 结算 | GET | `/settlements` | 结算单 |
| 结算 | POST | `/settlements/generate` | 生成结算 |
| 结算 | GET | `/withdrawals` | 提现申请 |
| 结算 | POST | `/withdrawals/:id/audit` | 提现审核 |
| 数据 | GET | `/analytics/overview` | 平台概览 |
| 数据 | GET | `/analytics/merchant-ranking` | 商家排行 |
| 数据 | GET | `/analytics/transactions` | 交易统计 |
| 数据 | GET | `/analytics/users` | 用户统计 |
| 内容 | GET / POST / PUT / DELETE | `/announcements[/:id]` | 平台公告 |
| 内容 | GET / POST / PUT / DELETE | `/articles[/:id]` | 文章 |
| 内容 | GET / POST / PUT / DELETE | `/banners[/:id]` | 平台轮播图 |
| 审计 | GET | `/audit-logs` | 操作日志 |
| 投诉 | GET / PUT | `/complaints[/:id]` | 投诉列表 / 处理 |
| 物流 | GET / PUT | `/logistics/kdniao-config` | 快递鸟配置 |
| 权限 | GET / POST / PUT / DELETE | `/rbac/roles[/:id]` | 平台角色 |
| 权限 | GET / POST / PUT / DELETE | `/rbac/users[/:id]` | 平台用户 |
| 权限 | GET / POST / PUT / DELETE | `/rbac/menus[/:id]` | 菜单管理 |

---

## 跨 PR 模块映射

| PR | 数据模型 | API 端 |
|---|---|---|
| PR1 | tenant_users、admin_users、admin_menus、merchants（骨架） | 三端 walking skeleton demo |
| PR3 | products、product_skus、categories、inventories | 商品 C 端 + 商家端 |
| PR4 | inventories（扩展）、shipping_templates | 库存商家端 |
| PR5 | orders、order_items、order_logs、aftersales | 订单 C 端 + 商家端 |
| PR6 | payment_orders、payment_callbacks、funds_ledgers、coupons | 支付 C 端 + 资金商家端 |
| PR7 | shipments、rentals、rental_events（预留） | 物流 + 租赁履约（二期） |
| PR8 | （扩展点） | 策略 demo |
| PR9 | merchant_qualifications、packages、merchant_packages、settlements、withdrawals、audit_logs | 平台端全部 |
