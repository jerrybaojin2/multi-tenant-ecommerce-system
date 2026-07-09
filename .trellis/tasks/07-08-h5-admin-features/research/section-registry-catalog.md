# 商城区块 Registry 清单（首页装修）

- 日期: 2026-07-09
- 来源: PRD「首页模块动态配置（重点）」+ `07-07/research/storefront-template-architecture.md`
- 目的: 收敛小程序 / H5 首页可装修区块的 MVP 清单与 props schema，作为平台 registry 与商家装修的事实依据。

## 与架构的关系

承接 [`storefront-template-architecture.md`](../../07-07-multi-tenant-ecommerce-system/research/storefront-template-architecture.md) 的分层：

- 后端 `storefront_section_registry`（平台/全局）= 本文档定义的区块元数据
- 后端 `storefront_section_instances`（tenant-scoped）= 商家装修结果（sort / visibility / props）
- 前端 `templates/registry.ts` = 已编译区块组件白名单，`sectionName` 只能映射到这里注册的 key

## 通用区块实例结构

每个 section instance 统一字段（对齐 `storefront_section_instances` 表）：

| 字段 | 类型 | 说明 |
|---|---|---|
| id | uuid | 区块实例 id |
| sectionName | string | 区块类型标识，必须在 registry 白名单内 |
| sort | int | 页面内排序 |
| visibility | bool | 是否显示 |
| props | jsonb | 区块参数（见各区块 schema） |

## 首页（pageType=home）区块清单

### MVP 必备

| sectionName | 区块 | 用途 | 关键 props |
|---|---|---|---|
| search | 搜索条 | 搜索入口 + 热词 | placeholder, hotWords[] |
| banner | 轮播图 | 图片轮播 + 跳转 | items[{image,link,type}], interval, autoplay |
| notice | 公告 | 滚动 / 静态公告 | text, scrollable, link |
| navGrid | 金刚区 | 分类 / 功能图标宫格 | items[{icon,label,link}], columns |
| productRecommend | 推荐商品 | 商品网格 | title, dataSource, productIds[]?, limit, columns |
| productSection | 商品分组 | 按分类 / 专题聚合 | title, categoryId, limit, layout |
| richText | 图文 / 广告位 | 营销图、富文本 | image\|html, link |

### 二期扩展（MVP 仅登记 registry 元数据，前端不渲染）

| sectionName | 区块 | 依赖 |
|---|---|---|
| countdownSale | 限时秒杀 | 营销 / 促销（二期） |
| couponCenter | 优惠券聚合 | 营销（二期） |
| live | 直播间入口 | 直播能力（范围外） |

## 关键 props schema 草案（首页 MVP）

### banner（轮播图）

```json
{
  "items": [{ "image": "url", "link": "url|path", "type": "product|category|page|url" }],
  "interval": 4000,
  "autoplay": true
}
```

### navGrid（金刚区）

```json
{
  "items": [{ "icon": "url|builtin", "label": "分类", "link": "..." }],
  "columns": 4
}
```

### productRecommend（推荐商品）

```json
{
  "title": "为你推荐",
  "dataSource": "recommend | new | hot | manual",
  "productIds": ["..."],
  "limit": 10,
  "columns": 2
}
```

`dataSource=manual` 时才使用 `productIds`；其余由后端按策略取数。

### productSection（商品分组）

```json
{
  "title": "新品上市",
  "categoryId": "...",
  "limit": 6,
  "layout": "grid | scroll"
}
```

## 前后端 registry 约定

- 前端 `registry.ts` 导出 `{ [sectionName]: Component }`，renderer 按 schema 顺序渲染；未注册的 sectionName 安全跳过并上报（不抛错）。
- 后端 `storefront_section_registry` 记录每个区块：`name` / `displayName` / `defaultProps` / `propsSchema` / `version` / `status`。
- 区块 props 缺失字段时走 `defaultProps` 安全降级（对齐架构验收标准第 109 行）。
- 新增区块类型 = 前端编译进包 + 后端登记 registry，必须小程序发版（PRD 第 218 行约束）。

## 决策结论（已确认）

- [x] 商品详情页（pageType=product/detail）MVP 固定结构，不纳入本期装修；装修留二期。
- [x] navGrid 的 icon 支持双模式：内置图标库 key（如 `builtin:home`）或上传图片 url，`icon` 字段两者兼容。
- [x] productRecommend 的 `dataSource` MVP 仅支持 `manual` / `new` / `hot`；`recommend` 推荐算法二期再加。
