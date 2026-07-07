# @miniapp-rent/backend (vendored cool-admin v8)

> 本目录是 `cool-admin-midway` 分支 `8.x`（version `8.0.0`）的 **vendored 副本**。
> 嵌套 `.git` 已移除，作为项目代码纳入版本管理（PRD D4 + 红线"v8 vendor 接入"）。
> 下方保留上游 README 供参考。

## 相对上游 v8 的改动（PR0）

- `package.json`：name → `@miniapp-rent/backend`；移除 `mysql2`；新增 `pg` +
  `@types/pg`；`start` 改为 `cross-env NODE_ENV=production`（Windows 适配）；
  新增 `check` 脚本委托仓库根守卫。
- `src/config/config.local.ts` / `src/config/config.prod.ts`：DB 从 MySQL 切到
  PostgreSQL（`type: 'postgres'`），连接参数走 `DB_*` 环境变量；
  `cool.tenant.enable = true` 且 `urls: ['/admin/**/*']`。生产保持
  `synchronize: false` + `cool.eps: false`（红线）。
- `docker-compose.yml`：上游 MySQL 替换为 `postgres:16-alpine`；新增
  `docker/init-db.sql` 在首启时创建测试库 `cool_test`。

其余均为上游 v8 原样（含 `src/modules/base/db/tenant.ts` 的 `TenantSubscriber` +
`noTenant`，以及 `src/modules/base/entity/base.ts` 的 `BaseEntity.tenantId`）。

## 安装与运行

```bash
# 在本目录
npm install                 # 或 pnpm install（工作区根要求 pnpm >=9）
docker compose up -d        # 启动 PostgreSQL（cool_dev + cool_test）
cp .env.example .env        # 凭据不同则编辑

npm run dev                 # 本地开发（mwtsc watch + midway mock）
npm start                   # 生产启动（cross-env NODE_ENV=production）
```

## 守卫（在仓库根运行）

```bash
npm run guard:cool-admin    # v8 集成标记
npm run guard:prod-config   # synchronize:false / eps:false
npm run check               # 上述 + 测试
```

## 多租户隔离（PRD D3）

- 所有租户业务实体必须 `extends BaseEntity`（继承 `tenantId` / `tenant_id`），
  不得重复声明租户列。
- `/admin/**/*` 下的 TypeORM Repository/QueryBuilder 路径由 `TenantSubscriber`
  自动过滤。原生 SQL（`nativeQuery`/`sqlRenderPage`/`repository.query`）会绕过
  过滤 —— 租户代码禁止使用（红线）。
- 平台跨租户读必须用显式 `noTenant(ctx, async () => ...)` 逃逸并角色门禁。

真实 PG 隔离测试位于 `../../tests/real-tenant.test.mjs`，连 `cool_test` 库；
PG 不可用时优雅跳过。

---

<!-- 以下为上游 cool-admin 原始 README，保留供参考 -->



<p align="center">cool-admin(nodejs版)一个很酷的后台权限管理系统，开源免费，Ai编码、流程编排、模块化、插件化、极速开发CRUD，方便快速构建迭代后台管理系统，支持原生、docker、普通服务器等多种方式部署
到 <a href="https://cool-js.com" target="_blank">官网</a> 进一步了解。
<p align="center">
    <a href="https://github.com/cool-team-official/cool-admin-midway/blob/master/LICENSE" target="_blank"><img src="https://img.shields.io/badge/license-MIT-green?style=flat-square" alt="GitHub license" />
    <a href=""><img src="https://img.shields.io/github/package-json/v/cool-team-official/cool-admin-midway?style=flat-square" alt="GitHub tag"></a>
    <img src="https://img.shields.io/github/last-commit/cool-team-official/cool-admin-midway?style=flat-square" alt="GitHub tag"></a>
</p>

## 特性

Ai 时代，很多老旧的框架已经无法满足现代化的开发需求，Cool-Admin 开发了一系列的功能，让开发变得更简单、更快速、更高效。

- **Ai 编码**：通过微调大模型学习框架特有写法，实现简单功能从 Api 接口到前端页面的一键生成[详情](https://node.cool-admin.com/src/guide/ai.html)
- **流程编排**：通过拖拽编排方式，即可实现类似像智能客服这样的功能[详情](https://node.cool-admin.com/src/guide/flow.html)
- **多租户**：支持多租户，采用全局动态注入查询条件[详情](https://node.cool-admin.com/src/guide/core/tenant.html)
- **多语言**：基于大模型自动翻译，无需更改原有代码[详情](https://node.cool-admin.com/src/guide/core/i18n.html)
- **原生打包**：打包成 exe 等安装包，打包完可以直接运行在 windows、mac、linux 等操作系统上[详情](https://node.cool-admin.com/src/guide/core/pkg.html)
- **模块化**：代码是模块化的，清晰明了，方便维护
- **插件化**：插件化的设计，可以通过安装插件的方式扩展如：支付、短信、邮件等功能
- ......

![](https://cool-show.oss-cn-shanghai.aliyuncs.com/admin/flow.png)

## 技术栈

- 后端：**`node.js` `typescript`**
- 前端：**`vue.js` `element-plus` `jsx` `pinia` `vue-router`**
- 数据库：**`mysql` `postgresql` `sqlite`**

如果你是前端，后端的这些技术选型对你是特别友好的，前端开发者可以较快速地上手。
如果你是后端，Typescript 的语法又跟 java、php 等特别类似，一切看起来也是那么得熟悉。

如果你想使用 java 版本后端，请移步[cool-admin-java](https://cool-js.com/admin/java/introduce.html)

#### 官网

[https://cool-js.com](https://cool-js.com)

## 视频教程

[官方 B 站视频教程](https://www.bilibili.com/video/BV1j1421R7aB)

<!-- 在此次添加使用文档 -->

## 演示

[AI 极速编码](https://node.cool-admin.com/src/guide/ai.html)

[https://show.cool-admin.com](https://show.cool-admin.com)

- 账户：admin
- 密码：123456

<img src="https://cool-show.oss-cn-shanghai.aliyuncs.com/admin/home-mini.png" alt="Admin Home"></a>

#### 项目前端

[https://github.com/cool-team-official/cool-admin-vue](https://github.com/cool-team-official/cool-admin-vue)

或

[https://gitee.com/cool-team-official/cool-admin-vue](https://gitee.com/cool-team-official/cool-admin-vue)

或

[https://gitcode.com/cool_team/cool-admin-vue](https://gitcode.com/cool_team/cool-admin-vue)

## 微信群

<img width="260" src="https://cool-show.oss-cn-shanghai.aliyuncs.com/admin/wechat.jpeg?v=1" alt="Admin Wechat"></a>

## 运行

#### 修改数据库配置，配置文件位于`src/config/config.local.ts`

以 Mysql 为例，其他数据库请参考[数据库配置文档](https://cool-js.com/admin/node/quick.html#%E6%95%B0%E6%8D%AE%E5%BA%93%E9%85%8D%E7%BD%AE)

Mysql(`>=5.7版本`)，建议 8.0，node 版本(`>=18.x`)，首次启动会自动初始化并导入数据

```ts
// mysql，驱动已经内置，无需安装
typeorm: {
    dataSource: {
      default: {
        type: 'mysql',
        host: '127.0.0.1',
        port: 3306,
        username: 'root',
        password: '123456',
        database: 'cool',
        // 自动建表 注意：线上部署的时候不要使用，有可能导致数据丢失
        synchronize: true,
        // 打印日志
        logging: false,
        // 字符集
        charset: 'utf8mb4',
        // 是否开启缓存
        cache: true,
        // 实体路径
        entities: ['**/modules/*/entity'],
      },
    },
  },
```

#### 安装依赖并运行

```bash
$ npm i
$ npm run dev
```

启动完成访问：[http://localhost:8001/](http://localhost:8001)

注： `npm i`如果安装失败可以尝试使用切换您的镜像源，推荐使用[pnpm](https://pnpm.io/)安装

## CURD(快速增删改查)

大部分的后台管理系统，或者 API 服务都是对数据进行管理，所以可以看到大量的 CRUD 场景(增删改查)，cool-admin 对此进行了大量地封装，让这块的编码量变得极其地少。

#### 新建一个数据表

`src/modules/demo/entity/goods.ts`，项目启动数据库会自动创建该表，无需手动创建

```ts
import { BaseEntity } from '../../base/entity/base';
import { Column, Entity, Index } from 'typeorm';

/**
 * 商品
 */
@Entity('demo_app_goods')
export class DemoAppGoodsEntity extends BaseEntity {
  @Column({ comment: '标题' })
  title: string;

  @Column({ comment: '图片' })
  pic: string;

  @Column({ comment: '价格', type: 'decimal', precision: 5, scale: 2 })
  price: number;
}
```

#### 编写 api 接口

`src/modules/demo/controller/app/goods.ts`，快速编写 6 个 api 接口

```ts
import { CoolController, BaseController } from '@cool-midway/core';
import { DemoAppGoodsEntity } from '../../entity/goods';

/**
 * 商品
 */
@CoolController({
  api: ['add', 'delete', 'update', 'info', 'list', 'page'],
  entity: DemoAppGoodsEntity,
})
export class DemoAppGoodsController extends BaseController {
  /**
   * 其他接口
   */
  @Get('/other')
  async other() {
    return this.ok('hello, cool-admin!!!');
  }
}
```

这样我们就完成了 6 个接口的编写，对应的接口如下：

- `POST /app/demo/goods/add` 新增
- `POST /app/demo/goods/delete` 删除
- `POST /app/demo/goods/update` 更新
- `GET /app/demo/goods/info` 单个信息
- `POST /app/demo/goods/list` 列表信息
- `POST /app/demo/goods/page` 分页查询(包含模糊查询、字段全匹配等)

### 部署

[部署教程](https://node.cool-admin.com/src/guide/deploy.html)

### 内置指令

- 使用 `npm run lint` 来做代码风格检查。

[midway]: https://midwayjs.org

### 低价服务器

[阿里云、腾讯云、华为云低价云服务器，不限新老](https://cool-js.com/service/cloud)
