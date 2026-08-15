---
title: Markdown Reading Components Showcase
description: 验证 MESH 阅读宽度、代码 Diff、Editorial Table、Alerts、Figure、FigurePair 与渐进增强 Lightbox。
publishedAt: "2026-08-14T12:00:00+08:00"
tags:
  - Web Engineering
  - Testing
---

技术文章不应把所有内容压进同一种矩形。正文需要安静而窄，代码保持清晰，数据表可以适度突破阅读宽度，提醒与引用则必须在不依赖强烈色彩的前提下建立不同层级。

## Code diff

普通代码块继续使用原有 Shiki 高亮、语言标签与复制按钮。

```js
const workspace = createWorkspace()
await workspace.run()
```

Diff 标记只存在于 Markdown 源码中；页面与复制结果都只保留代码。

```js
const workspace = createSharedWorkspace() // [!code --]
const workspace = createIsolatedWorkspace() // [!code ++]
await workspace.run()
```

## Editorial table

表格保持真正的 table 语义。数字内容右对齐，名称与状态保持左对齐，inline code 继续使用 monospace。

| Model | Context | Tool use | Latency | Runtime | Status | Interface |
| :--- | ---: | :--- | ---: | ---: | :--- | :--- |
| Model 2 | 128K | Yes | 12.5% | 40 ms | Ready | `responses.create` |
| v2 | 256 | Yes | 8.4% | 2 s | Testing | `agents.run` |
| Research Preview | 1,024 | Limited | 4.8% | 180 ms | Evaluation | `artifacts.resolve` |

下面的宽表用于验证小屏幕只滚动表格区域，而不是扩张整个 document。

| Stage | Workspace model | State ownership | Artifact transport | Integration policy | Failure boundary | Recovery action |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| Before | Shared workspace | Implicit global state | Mutable files | Opportunistic merge | Process-wide | Restart the complete workflow |
| After | Isolated workspace | Explicit task state | Immutable artifact edges | Dedicated integration task | Per task | Resume from the last durable artifact |

## GitHub alerts

> [!NOTE]
> Additional context about the runtime architecture. Notes use Mist Blue and remain visually quieter than warnings.

> [!TIP]
> Prefer explicit integration tasks. A small, durable boundary is easier to inspect than an implicit merge.

> [!IMPORTANT]
> Integration is itself a real task and must produce an observable artifact.

> [!WARNING]
> Changing this workspace invalidates downstream tasks that still reference its previous state.

> [!CAUTION]
> This operation may destroy persistent artifacts. Confirm the recovery boundary before continuing.

### Rich alert content

Alerts retain complete block Markdown rather than flattening everything into one paragraph.

> [!NOTE]
> A durable execution record should include **state**, [artifact provenance](/), and inline values such as `attemptId`.
>
> - Record the transition before dispatch.
> - Persist the result before integration.
>
> ```ts
> const result = await task.run()
> await artifacts.persist(result)
> ```

## Blockquotes

普通引用只有一条细 Clay vertical line，不使用 Alert 的 label 或背景层。

> Systems should expose failure domains explicitly.

显式尾行以 em dash 开始时渲染为署名，并继续支持 inline Markdown。

> Shared state makes the happy path short, but moves recovery cost into every downstream task.
>
> — Engineering *Notes*


## Figures and Lightbox

Figure 在构建期输出完整的图片、替代文本和说明。JavaScript 只负责放大查看，不参与正文图片创建。

::: figure {src="/images/runtime-architecture.svg" alt="请求经过解析器和任务图进入隔离 Worker，最终写入 Artifact Store 的运行时架构图" caption="Runtime Architecture" layout="normal" width="1600" height="900" srcset="/images/runtime-architecture.svg 1600w" sizes="(max-width: 640px) 100vw, 48rem"}
:::

Wide Figure 可以突破正文宽度，但仍保持在文章阅读网格内。

::: figure {src="/images/runtime-architecture.svg" alt="运行时架构的宽幅视图" caption="Runtime Architecture · Wide" layout="wide" width="1600" height="900"}
:::

Full Figure 使用视口安全边距，并且不能让页面本身产生水平滚动。

::: figure {src="/images/runtime-architecture.svg" alt="运行时架构的全宽视图" caption="Runtime Architecture · Full" layout="full" width="1600" height="900"}
:::

FigurePair 整体只占用一个 Figure 编号。桌面并排比较，移动端改为纵向排列。

::: figure-pair {caption="Workspace Isolation"}
::: figure {src="/images/shared-workspace.svg" alt="三个 Worker 共享同一个工作区并产生隐式状态耦合" label="Before" width="1200" height="800"}
:::

::: figure {src="/images/isolated-workspace.svg" alt="三个 Worker 使用隔离工作区并通过 Artifact Edge 汇合" label="After" width="1200" height="800"}
:::
:::

## Two Columns

Columns 只用于局部比较。第一组比较状态模型；列表、链接与代码都保留完整 Markdown 语义。

::: columns
::: column {title="Before"}
Shared workspace

- Shared state
- [Implicit merge](/)
- Process-wide recovery

```ts
const workspace = createSharedWorkspace()
await workspace.merge()
```
:::

::: column {title="After"}
Isolated workspace

- Explicit task state
- [Artifact edges](/)
- Per-task recovery

```ts
const workspace = createIsolatedWorkspace()
await artifacts.integrate(workspace)
```
:::
:::

第二组用于不等高的决策比较，并用超长标题、长 URL 与较长正文验证列宽不会被内容撑破。

::: columns
::: column {title="Implicit integration with a very long local comparison title that must wrap safely"}
The short path mutates shared state immediately.

It reduces ceremony, but every downstream task inherits recovery work.
:::

::: column {title="Explicit integration"}
The durable path records each artifact edge before a dedicated integration task begins.

1. Persist the isolated result.
2. Record provenance and ownership.
3. Integrate through [a deliberately long diagnostic URL](https://example.com/runtime/integration/artifacts/this-is-a-deliberately-long-unbroken-route-segment-that-must-not-expand-the-column).
4. Resume failed work from the latest durable artifact instead of restarting the workflow.

The extra local step keeps failures bounded and makes the global execution history inspectable.
:::
:::

## Acceptance checklist

- Diff added 与 removed 行可辨识，但仍属于原有 Code Block；
- 复制代码不包含 `[!code ++]` 或 `[!code --]`；
- Table 没有 vertical borders，数字右对齐；
- 小屏幕只在 Table wrapper 内横向滚动；
- 五类 Alert 使用低饱和 label、细线和轻背景；
- 普通 Blockquote 与 Alert 明显不同；
- Figure 与 caption 在无 JavaScript 时仍完整可读；
- FigurePair 在移动端纵向排列且只占用一个编号；
- Columns 在 640px 及以下纵向排列，超长标题、URL、代码和表格不扩张页面；
- Lightbox 支持关闭按钮、Esc、backdrop 与焦点恢复；
- Paper 与 Ink 主题都保持正文可读；
- Full Figure 与 Lightbox 都不产生页面水平溢出。
