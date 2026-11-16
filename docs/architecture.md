# 当前架构

## 运行时边界

仓库是一个 Vite 包和一个 Node API 进程。前端入口是 `src/main.tsx`，应用路由集中在
`src/app/router.tsx`；六个在役课程 feature 是 `calculator`、`decoding`、
`lunch-shift`、`ml-intro`、`image-sampling`、`color-quantization`。
另有跨课程的 `task-sheets`（任务单）功能。

```text
src/shared/lab/labMetadata.ts
  └─ 全局唯一实验元数据契约（`LAB_IDS`、`labMetadata`，含可选 `defaultHidden`）

src/app
  ├─ labRegistry.ts（`APP_LABS`: Record<LabId, AppLabEntry>）
  ├─ 页面编排、认证入口，以及由 `LAB_IDS` 自动生成的
  │  `/labs/<id>`（`LabRedirectPage`）与 `/classes/$classId/labs/<id>`（`GuardedLabRoute`）
  └─ 非课程页面（登录、资料、管理、班级看板）

src/features/<lab>（calculator / decoding / lunch-shift / ml-intro / image-sampling / color-quantization）
  ├─ domain：关卡、判题协议与纯计算（前端与服务端共享契约）
  ├─ lesson：URL/课程状态、引导和公开用例
  ├─ controller（按需）：组织 API、时钟、教学交互和界面 ViewModel
  ├─ ui：页面入口与展示组件（访问守卫统一由路由层 `GuardedLabRoute` 挂载）
  └─ preview（按需）：开发环境的公开固定场景，复用真实 Workspace

src/features/task-sheets
  └─ 任务单模板、班级布置、学生作答与批改界面

src/shared/lab
  └─ 各实验页共用的薄封装：useLabProject（加载）、
     useAutosaveDraft（防抖自动保存）、LabAccessGate/SaveIndicator（入口守卫）

server
  ├─ auth/db/http：认证、SQLite 和请求边界
  ├─ labs.ts：`LAB_REGISTRY` 由 `LAB_IDS` / `labMetadata` + `LAB_SPECS` 派生
  ├─ routes：auth、admin、dashboard、task-sheets、task-assignments，
  │          以及 `routes/labRegistry.ts`（`LAB_ROUTES: Record<LabId, ...>`）
  │          经 labRoutes 工厂挂载的各实验管线（project → draft → judge）
  └─ judge：服务端隐藏用例和持久化进度
```

`server/routes/labRoutes.ts` 是各实验共用的薄管线：GET project 装载
`{currentStage, passedStages, drafts, ...extras}`，PUT draft 防抖持久化，
POST judge 跑隐藏用例并推进 `passedStages`。每个实验只提供 spec（labId、
关卡数、saveDraft、judge）；不引入通用 `LessonRuntime`/
`Stepper` 框架。通过 `LAB_IDS` 与三个类型完备的注册表（`APP_LABS`、`LAB_SPECS`、
`LAB_ROUTES`），新增实验若遗漏路由、实验管理、首页或班级看板接入会在编译和架构测试阶段被拦截。

实验可见性由管理员维护的 `hidden` 与按班开放列表控制：未隐藏的实验向勾选班级的成员开放；
隐藏时非管理员无法访问首页入口、实验页面、实验 API 或教师看板，管理员仍保留预览与看板访问能力。

仍有真实消费者的跨页面基础设施只放在 `src/shared/auth`、`src/shared/api`、
`src/shared/layout` 与 `src/shared/lab`。旧的多实验导航、通用 lesson shell、
参数/公式/可视化面板以及 Slidev 编辑服务没有保留；它们在当前课程集合里不再
形成有价值的边界。

## 教学逻辑与视觉开发边界（Decoding 试点）

`DecodingLabPage` 只包裹 `DecodingWorkspace` 与共享页面布局，访问守卫由
路由层的 `GuardedLabRoute` + `LabAccessGate` 统一执行。
`decoding/controller/useDecodingLabController.ts` 负责项目加载、Pyodide 执行、
自动保存、判题和状态转换；`createViewModel.ts` 派生只读展示契约 `viewModel.ts`。

`/__dev/labs/decoding` 仅在 `import.meta.env.DEV` 分支注册，预览模块通过 lazy import
加载并在生产构建中消除。它使用真实 `DecodingWorkspace` 和公开数据生成的固定 fixture，
不调用 Controller hook、认证、存储或服务器隐藏判题。
开发预览跳过身份请求，离开该路由恢复正常认证；生产实验入口继续执行访问守卫。
详见 [视觉任务边界与验证](agent/ui-tasks.md)。

## 删除决策

除当前保留的 `calculator`、`decoding`、`lunch-shift`、`ml-intro`、`image-sampling` 和
`color-quantization` 六个实验外，其他旧实验（包括已退役的 `cpu`、`is-sim`、`audio-encoding` 等）
的 feature 目录、路由、实验 API、专属资产、e2e/单测和 Slidev
构建/编辑链路都已退役。数据库仍保留历史兼容的字段与迁移脚本，以便维持旧部署数据的可读性，
但当前应用不会再读取或写入已删除实验的记录；本次没有做破坏性数据迁移。

被移除实验的教学问题和重新实现门槛见 [retired-labs.md](retired-labs.md)。该记录不
是运行时契约，也不要求恢复任何通用 `LessonRuntime`、`Stepper`、`ScenarioCodec` 或
语义验证框架。
