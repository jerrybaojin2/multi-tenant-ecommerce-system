# 跨层思考指南

> **目的**：在实现前梳理跨层数据流。

---

## 问题

**大多数缺陷发生在层边界**，而不是单个层内部。

常见跨层缺陷：

- API 返回格式 A，前端期望格式 B
- Database 存储 X，service 转换为 Y，但丢失数据
- 多个层用不同方式实现同一逻辑

---

## 实现跨层功能前

### 第 1 步：绘制数据流

画出数据如何移动：

```
Source -> Transform -> Store -> Retrieve -> Transform -> Display
```

对每个箭头提问：

- 数据当前是什么格式？
- 可能出什么错？
- 谁负责验证？

### 第 2 步：识别边界

| 边界 | 常见问题 |
|----------|---------------|
| API -> Service | 类型不匹配、字段缺失 |
| Service -> Database | 格式转换、null 处理 |
| Backend -> Frontend | 序列化、日期格式 |
| Component -> Component | Props 形状变化 |

### 第 3 步：定义契约

对每个边界：

- 精确输入格式是什么？
- 精确输出格式是什么？
- 可能发生哪些错误？

---

## 常见跨层错误

### 错误 1：隐式格式假设

**坏例子**：未检查就假设日期格式

**好例子**：在边界处显式转换格式

### 错误 2：验证分散

**坏例子**：在多个层验证同一件事

**好例子**：在入口点验证一次

### 错误 3：泄漏抽象

**坏例子**：Component 知道 database schema

**好例子**：每个层只知道相邻层

---

## 跨层功能清单

实现前：

- [ ] 已绘制完整数据流
- [ ] 已识别所有层边界
- [ ] 已定义每个边界处的格式
- [ ] 已决定验证发生在哪里

实现后：

- [ ] 已使用边界场景测试（null、empty、invalid）
- [ ] 已验证每个边界处的错误处理
- [ ] 已检查数据能完成往返

---

## 跨平台模板一致性

在 Trellis 中，命令模板（例如 `record-session.md`）存在于**多个平台**中，内容相同或近似相同。这是一条跨层边界。

### 清单：修改任何命令模板后

- [ ] 找到所有拥有同一命令的平台：`find src/templates/*/commands/trellis/ -name "<command>.*"`
- [ ] 更新所有平台副本（Markdown `.md` 和 TOML `.toml`）
- [ ] 对 Gemini TOML：调整换行续写（`\\` vs `\`）和三引号字符串
- [ ] 运行 `/trellis:check-cross-layer` 验证没有遗漏

**真实案例**：在 Claude 中更新 `record-session.md` 使用 `--mode record`，但忘记了 iFlow、Kilo、OpenCode 和 Gemini；后来被 cross-layer check 捕获。

---

## 生成运行时模板升级一致性

有些生成文件既是文档，也是运行时输入。在 Trellis 中，`.trellis/workflow.md` 会被 `get_context.py`、`workflow_phase.py`、SessionStart filters 和 per-turn hooks 解析。模板变更必须同时针对 fresh init 和 upgrade 路径验证。

### 清单：修改运行时解析模板后

- [ ] 识别每一个读取该模板的运行时 parser，而不仅是安装它的 file writer
- [ ] 检查相关语法是否位于明显 managed regions（例如 tag blocks）之外
- [ ] 验证 fresh `init` 输出，以及会写入较旧 `.trellis/.version` 的 versioned `update` 场景
- [ ] 使用较旧的 pristine template fixture 添加升级回归，再断言安装后的文件达到当前 packaged shape
- [ ] 更新拥有运行时契约的 backend spec

**真实案例**：Codex inline mode 把 workflow platform markers 从 `[Codex]` / `[Kilo, Antigravity, Windsurf]` 改为 `[codex-sub-agent]` / `[codex-inline, Kilo, Antigravity, Windsurf]`。Fresh init 正确，但 `trellis update` 只合并 `[workflow-state:*]` blocks，保留了这些 blocks 外的旧 markers。结果：升级后的项目获得了新的 hook scripts，但仍使用旧 workflow routing，因此 `get_context.py --mode phase --platform codex` 可能返回空的 Phase 2.1 detail。

---

## 模式检测探针清单

当 CLI 通过探测远程资源自动检测模式时（例如检查 `index.json` 是否存在，以决定 marketplace vs direct download）：

### 实现前：

- [ ] Probe 会在使用结果的**所有**代码路径运行（interactive、`-y`、`--flag` 组合）
- [ ] 区分 404 与 transient error，不要把两者都当成 "not found"
- [ ] transient errors 必须**中止或重试**，绝不能静默切换模式
- [ ] 当上下文改变时（例如用户切换 source），**重置**共享状态（caches、prefetched data）
- [ ] **Shortcut paths**（例如 `--template` 跳过 picker）必须拥有与 probed path 相同质量的错误处理；检查 downstream functions 不会调用 catch-all wrappers

### 实现后：

- [ ] 从 probe result 到 mode-decision branch 追踪每条路径，不允许 fallthrough
- [ ] 外部格式契约（giget URI、raw URLs）已测试，或至少以注释记录
- [ ] Metadata reads 会消费完整响应或使用 streaming parser，绝不把固定大小 prefix 当作完整 JSON 解析
- [ ] 从 parsed parts 重建 composite identifier 时，验证**所有**字段都已包含且处于**正确位置**（例如 `provider:repo/path#ref`，不是 `provider:repo#ref/path`）
- [ ] 验证 shortcut 之后调用的 **action functions** 不会在内部使用旧的 catch-all fetch；当错误区分很重要时，它们必须使用 probe-quality variant

**真实案例**：Custom registry flow 在 3 轮 review 中暴露 8 个缺陷：(1) probe 只在 interactive mode 运行，(2) transient errors 会落到错误模式，(3) giget URI 的 `#ref` 位置错误，(4) prefetched templates 会在 source switches 间泄漏，(5) `--template` shortcut 绕过 probe，但 `downloadTemplateById` 内部使用 catch-all `fetchTemplateIndex`，把 timeouts 转成了 "Template not found"。

**真实案例**：Agent-session update hints 使用 `response.read(4096)` 获取 npm `latest` metadata，然后把它当作完整 JSON 解析。`@mindfoldhq/trellis` package metadata 超过 4 KB，因此 JSON 被截断，解析静默失败，第一次 session injection 没有显示 update hint。修复：解析前读取完整响应，并添加回归用例，其中 `version` 后跟一个 8 KB metadata tail。

---

## 何时创建流程文档

在以下情况创建详细流程文档：

- 功能跨越 3 个以上层
- 涉及多个团队
- 数据格式复杂
- 功能以前造成过缺陷
