---
version: 1
name: computing-lab
description: Visual design system for the computing-lab teaching platform.
colors:
  canvas: "#f4f7fb"
  surface: "#ffffff"
  subtle: "#edf2f8"
  border: "#dbe3ee"
  primary: "#17283d"
  secondary: "#526579"
  muted: "#5f6e81"
  accent: "#4f46e5"
  accent-soft: "#eeedff"
  accent-ink: "#3730a3"
  accent-line: "#bfc2ff"
  focus: "#818cf8"
  focus-ring: "#4338ca"
  border-strong: "#b8c3ce"
  success: "#17845b"
  success-soft: "#f0fdf4"
  success-fill: "#dcfce7"
  success-ink: "#166534"
  success-border: "#86efac66"
  warning: "#b7791f"
  warning-soft: "#fef3c7"
  warning-border: "#f0dcae"
  warning-ink: "#92400e"
  danger: "#b42318"
  danger-soft: "#fdf1ef"
  danger-border: "#f0cfcb"
  danger-ink: "#991b1b"
  code-surface: "#0f172a"
  code-line: "#334155"
  code-ink: "#e2e8f0"
  code-accent: "#fbbf24"
  error-surface: "#450a0a"
  error-ink: "#fecaca"
  scrim: "rgb(15 23 42 / 25%)"
  scrim-deep: "rgb(0 0 0 / 60%)"
  marker: "#fde8a8"
  paper: "#e8ddc7"
  cpu-lamp: "#e0457b"
  ir-op: "#fde8d8"
  ir-reg: "#e0ecfd"
  ir-operand: "#ddf2e4"
elevation:
  shadow-sm: "0 4px 14px rgb(23 40 61 / 5%)"
  shadow-md: "0 16px 40px rgb(23 40 61 / 8%)"
rounded:
  mini: 4px
  control: 8px
  panel: 12px
  pill: 999px
spacing:
  space-1: 4px
  space-2: 8px
  space-3: 12px
  space-4: 16px
  space-5: 20px
  space-6: 24px
  space-8: 32px
layout:
  page-max: 1240px
  page-gutter: 24px # 16px below 680px viewport
components:
  page-shell: AppPageLayout
  content-container: .page-content
  topbar: .app-topbar
---

# Design System

本文件是项目样式的唯一事实来源。新增页面或改动样式前必须先读这里；
规则冲突时以本文件为准并更新它，而不是绕过它。

## Layout contract

所有页面共用同一个外壳，页面只渲染 content：

```
┌──────────────────────────────────────────┐
│ .app-topbar        (surface, 底边分隔线) │
├──────────────────────────────────────────┤
│        .page-content (居中, ≤1240px)      │
│                                          │
│   <—— 页面自己的 main/section 在这里 ——> │
│                                          │
└──────────────────────────────────────────┘
```

- 页面一律用 `AppPageLayout`（`src/shared/layout/AppTopbar.tsx`）包裹，
  **禁止**直接渲染 `<AppTopbar>` 或自建页面外壳。
- 顶栏定制通过 `topbarProps`（title/subtitle/showAccount）和 `topbar`
  slot（右侧自定义内容，如保存状态指示器）完成。
- 内容容器一律挂 `.page-content`，它提供居中、最大宽度 `1240px`、
  统一的上下左右内边距。页面类（如 `.profile-main`）只可**收窄**
  `max-width` 或调整 `padding-top`，不得重复定义水平 padding/margin。

### 硬规则：不许贴边

- `.app-topbar` 和 `.page-content` 的左右内边距来自 `--page-gutter`
  （桌面 24px，≤680px 视口降为 16px）。**任何页面内容不得直接接触
  视口左右边缘**——贴边是 bug，不是风格。
- 需要不同 gutter 时改 `--page-gutter` token，不要在页面里写死像素值。
- `main`/容器元素永远先写 `className="page-content"` 再叠加页面自己的类。

### 网格型页面（实验台）

rail + workspace 两栏页面（三个 lab）把网格容器本身做成 content 容器：

```tsx
<AppPageLayout className="quant-lab" topbar={...} topbarProps={{...}}>
  <div className="page-content quant-layout">
    <aside className="quant-rail">…</aside>
    <main className="quant-workspace">…</main>
  </div>
</AppPageLayout>
```

rail 的竖向分隔线画在网格内部（`border-right`），内容仍然受 gutter 约束。
≤960px 视口折叠为单栏。

## Color roles

颜色只按角色使用，不按字面含义：

| Token                                                                 | 用途                                           |
| --------------------------------------------------------------------- | ---------------------------------------------- |
| `--canvas`                                                            | 页面背景（topbar/卡片之外的区域）              |
| `--surface`                                                           | 卡片、面板、topbar、弹层                       |
| `--subtle`                                                            | 次级填充：hover 底、图表槽位、禁用态           |
| `--border`                                                            | 所有描边、分隔线                               |
| `--primary`                                                           | 正文标题、重要文字                             |
| `--secondary`                                                         | 说明文字                                       |
| `--muted`                                                             | 弱化提示、placeholder 级文字                   |
| `--accent` / `--accent-soft`                                          | 主交互色及其浅底（按钮、当前态）               |
| `--focus` / `--focus-ring`                                            | hover 边框 / `:focus-visible` 描边             |
| `--success`/`--warning`/`--danger`                                    | 状态语义色，仅用于状态                         |
| `--success-soft`/`--success-border`/`--danger-soft`/`--danger-border` | 状态提示条的底色与描边                         |
| `--success-fill`/`--warning-soft`                                     | 状态徽章、图例的实底（比 -soft 深一档）        |
| `--success-ink`/`--warning-ink`/`--danger-ink`                        | 状态浅底上的 AA 文字色                         |
| `--accent-ink`/`--accent-line`                                        | 深一号主色文字 / accent 族浅描边               |
| `--border-strong`                                                     | 比 `--border` 深一级的灰线、禁用底             |
| `--code-surface`/`--code-line`/`--code-ink`/`--code-accent`           | 深色代码面板的底、描边、文字、高亮             |
| `--error-surface`/`--error-ink`                                       | 深色错误终端面板                               |
| `--scrim`/`--scrim-deep`                                              | 色块描边 / 色块内文字阴影                      |
| `--marker`/`--paper`/`--cpu-lamp`/`--ir-*`                            | 领域色：高亮标记、小票纸、进位灯、指令字段底色 |

`--muted` 在 canvas/surface/subtle/accent-soft 上均满足 WCAG AA 4.5:1 对比度要求。与 `--secondary` 的层级主要靠字号/字重区分。

不要在组件里写死近似色（如 `#e2e8f0`）。需要新颜色时先加 token；
领域色（指示灯、图纸、字段底色）也用命名 token，不写散落的 hex。

## Typography & radius

- UI 字体：system 栈（`base.css` 统一设置）。标题字重 650–760，
  正文 400–500，强调用 `font-weight` 而不是颜色加深。
- 圆角四档：`--radius-mini`（swatch、mark 等小元素）4px，
  `--radius-control`（按钮、输入、菜单）8px，
  `--radius-panel`（卡片、面板、弹层）12px，
  `--radius-pill`（chip/badge 胶囊）999px——只用于胶囊形小件，不用于面板。
- 阴影只有两档：`--shadow-sm`（静态卡片）/ `--shadow-md`（弹层、下拉）。

## Components

- 按钮：`.button` + `.button-primary` / `.button-secondary`（base.css）。
  页面不要发明第三种按钮样式。
- 状态提示条：`.test-error`（错误/失败提示）与 `.stage-takeaway`（通关收获）定义在 base.css，跨页面使用，feature CSS 不得重定义。
  关卡说明段落的正文字号（`.stage-brief p`，13px）也在 base.css 统一；
  个别实验需要别的颜色或行高时仍由本地规则覆盖。
- 关卡栏原语：`.stage-list`、`.stage-branch*`、`.lab-stage-link.is-optional` 定义在 shared/layout/app-layout.css，feature CSS 不得重定义。
- 下拉菜单：`.account-menu-*`（`shared/auth/account-menu.css`）。
  全局导航入口（班级看板、账号管理、个人资料、退出）只放在右上角
  `AccountMenu`，不在首页铺管理卡片。
- 面板/卡片：`border: 1px solid var(--border)` +
  `border-radius: var(--radius-panel)` + `background: var(--surface)`，
  需要浮起感时加 `--shadow-sm`。
- 场景链接按钮：`ScenarioLinkButton`（`shared/lab/`，样式在 `design/base.css`）。
  位于实验页 explorer 下方，仅教师/管理员可见，用于复制可重现的场景链接。
  编码的场景参数即判题提交内容，因此不对学生暴露。

## Icons

- 所有 UI 图标统一用 `src/shared/ui/Icon.tsx` 的内联 SVG 集
  （`stroke: currentColor`，24×24 viewBox，按 `size` prop 缩放）：
  `check` / `x` / `chevron-down` / `circle` / `lock` / `warning` / `arrow-right`。
- **禁止**用字符当图标：`✓` `×` `⚠` `🔒` `○` `⌄` 等一律换成 `Icon`。
- 下拉箭头一律是向下的 chevron（与原生 `<select>` 箭头一致），
  展开态用 CSS `rotate(180deg)`，不要换字符。
- 文本语义的符号保留为字符：`64×64` 的乘号、代码输出里的
  `choose_size(...) → 16`、`label → value` 这类不是图标。
- 需要新图标时往 `Icon.tsx` 的 `PATHS` 里加 stroke 风格 path，
  不要引入 emoji 或第三方图标库。

## Forms

- 带标签的下拉用 `.field-select`（label 包 select，label 文字在上）。
  表单类控件放在**内容区**，不放 topbar——topbar 只放品牌、
  页面标题、保存状态和账号菜单。

## CSS 组织

- 共享样式只放 `src/design/`（tokens/base）和 `src/shared/`（layout、auth）。
- 每个 feature 的样式必须带**独立前缀**（`quant-`、`sampling-`、
  `calculator-`），避免全局类名碰撞；页面样式放 `src/app/pages/*.css`。
- 样式文件随组件 `import "./x.css"` 引入，不建集中式样式入口。
- 数值优先用 token（`var(--space-6)` 而非 `24px`）；只有一次性的、
  无语义的微调（如 `margin-top: 1px` 对齐）才允许写死。

## Responsive

- 断点约定：≤680px gutter 收缩；≤760px topbar 折行；≤960px
  lab 网格折为单栏。新页面沿用这三档，不要自造断点。
- 移动端 topbar 保留 `16px` gutter，不得归零。

## Accessibility

- 可交互元素保留 `:focus-visible` 描边（`--focus-ring`）。
- 下拉菜单用 `role="menu"` / `menuitem`，Esc 与外部点击关闭。
- 状态变化用 `aria-live="polite"` 播报（保存指示、判题结果）。
- 不用颜色单独承载信息——状态提示要有文字（✓/⚠ 图标 + 文案）。
