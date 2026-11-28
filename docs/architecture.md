# 当前架构

## 运行时边界

保持一个 SolidJS / Vite package，默认纯静态，校内系统按需部署。

```text
src/main.tsx → app/showcase/App.tsx → showcase routes
                                      └─ LabRuntimeProvider (local storage / public fixtures)
src/classroom-main.tsx → app/App.tsx → classroom routes + auth / visibility gates
                                      └─ ClassroomRuntime (HTTP adapter)
                 ↓ both hosts
src/features/<lab>/{ui,controller} → shared/lab/runtime + hooks
                 ↓
src/features/<lab>/{domain,lesson} ← server/judge (hidden fixtures + transactions)
```

两个 HTML 入口由 Vite 构建目标选择，分别输出 `dist/` 和 `dist-classroom/`。
默认入口的完整依赖图（包括 lazy imports）不得包含校内页面、认证、API 客户端、任务单或服务端。
实验元数据唯一来源为 `shared/lab/labMetadata.ts`，七个实验均在默认展示版开放。

`LabRuntime` 提供不带班级语义的 scope、学习者种子、就绪状态、自由导航能力，
以及加载、保存、判题、重置和引导确认操作。实验 UI 不访问认证 Context 或班级路径参数。
`AppTopbar` 只渲染宿主注入的账号插槽，默认宿主不注入账号 UI。

公开与校内判题共享 `features/<lab>/lesson/judge.ts` 的纯函数；采样、量化和电路
使用宿主提供的测试数据，餐馆终局使用注入的场景。服务端隐藏数据仍留在 `server/judge/`，
不会进入展示版。本地餐馆终局使用公开练习订单，因此不把校内隐藏答案发布到静态资源中。

浏览器适配器按实验保存版本化 JSON；复用领域 sanitizer，保留草稿 revision、组件 revision
与 reset generation。支持 Web Locks 时串行化跨标签页写入；不支持时仍检查已存版本。
写入失败显示保存错误，不声称已持久化。校内适配器保留原 HTTP 协议及数据库防冲突语义。
本地版本不承担可信考试成绩的职责，不与账号成绩自动合并。

任务单属于可选校内产品，仍位于 `features/task-sheets`，不属于实验运行时。

`server/routes/labRoutes.ts` 是各实验共用的薄管线：GET project 装载
`{currentStage, passedStages, drafts, ...extras}`，PUT draft 防抖持久化，
POST judge 跑隐藏用例并推进 `passedStages`。每个实验只提供 spec（labId、
关卡数、saveDraft、judge）；宿主通过轻量 `LabRuntime` 能力契约连接实验。通过 `LAB_IDS` 与三个类型完备的注册表（`APP_LABS`、`LAB_SPECS`、
`LAB_ROUTES`），新增实验若遗漏路由、实验管理、首页或班级看板接入会在编译和架构测试阶段被拦截。

`POST /reset` 与加载、保存和判题使用同一实验访问守卫，只操作当前登录用户的项目。
`{scope: "stage", stageIndex}` 清除指定关卡及依赖它的关卡记录，保留不受影响的支线；`{scope: "lab"}` 清空整个实验。
部分重置先保存保留关卡的待写草稿，保存失败则不重置。请求携带 `expectedGeneration`；重置更新项目版本，旧的保存和判题请求无法写回已清除的记录。
逻辑回归对所有角色使用相同的顺序解锁规则，旧的 `classroom` 链接参数不再启用跳关。

校内版实验可见性由管理员维护的 `hidden` 与按班开放列表控制：未隐藏的实验向勾选班级的成员开放；
隐藏时非管理员无法访问首页入口、实验页面、实验 API 或教师看板，管理员仍保留预览与看板访问能力。

仍有真实消费者的跨页面基础设施只放在 `src/shared/auth`、`src/shared/api`、
`src/shared/layout` 与 `src/shared/lab`。旧的多实验导航、通用 lesson shell、
参数/公式/可视化面板以及 Slidev 编辑服务没有保留；它们在当前课程集合里不再
形成有价值的边界。

## 教学逻辑与视觉开发边界（B 方案：decoding 局部试点）

`DecodingLabPage` 只包裹 `DecodingWorkspace` 与共享页面布局，校内访问守卫由
路由层的 `GuardedLabRoute` + `LabAccessGate` 统一执行。
`decoding/controller/useDecodingLabController.ts` 负责项目加载、Pyodide 执行、
自动保存、判题和状态转换；`createViewModel.ts` 派生只读展示契约 `viewModel.ts`。

其余六个实验不复制这套分层，入口页继续组合 `useLabSession` 与实验自己的 reducer。
所有实验的项目加载、自动保存、409 冲突恢复、重置和保存指示器只能走
`shared/lab/useLabSession.tsx`，不得再次手接 `useLabProject` + `useAutosaveDraft`。

新增实验默认只建 `domain/lesson/ui` 三层；只有确实需要浏览器内 Python、
独立预览或复杂交互状态机时，才增加 `controller/runtime/preview`。Pyodide worker
统一放在 `runtime/pyodide.worker.ts`，`ui/` 只保留主线程入口与展示组件。

校内开发入口中的 `/__dev/labs/decoding` 仅在 `import.meta.env.DEV` 分支注册，预览模块通过 lazy import
加载并在生产构建中消除。它使用真实 `DecodingWorkspace` 和公开数据生成的固定 fixture，
不调用 Controller hook、认证、存储或服务器隐藏判题。
开发预览跳过身份请求，离开该路由恢复正常认证；校内生产实验入口继续执行访问守卫。
详见 [视觉任务边界与验证](agent/ui-tasks.md)。

## 删除决策

除当前保留的 `calculator`、`decoding`、`lunch-shift`、`stats-foundations`、`logistic-regression`、`image-sampling` 和
`color-quantization` 七个实验外，其他旧实验（包括已退役的 `cpu`、`is-sim`、`audio-encoding` 等）
的 feature 目录、路由、实验 API、专属资产、e2e/单测和 Slidev
构建/编辑链路都已退役。数据库仍保留历史兼容的字段与迁移脚本，以便维持旧部署数据的可读性，
但当前应用不会再读取或写入已删除实验的记录；本次没有做破坏性数据迁移。

被移除实验的教学问题和重新实现门槛见 [retired-labs.md](retired-labs.md)。该记录不
是运行时契约，也不要求恢复任何通用 `LessonRuntime`、`Stepper`、`ScenarioCodec` 或
语义验证框架。
