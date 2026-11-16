# computing-lab

校内信息技术实验运行时：一个 Vite + React SPA，加一个极简 Node API。包含「实现ALU」
（`calculator`）、「解码侦探」（`decoding`）、「设计餐馆系统」（`lunch-shift`）、
「机器学习入门」（`ml-intro`）、「空间采样」（`image-sampling`）和「颜色量化」
（`color-quantization`）六个实验。管理员可通过
`/admin/labs` 管理实验开放状态；隐藏后学生和教师无法访问，管理员仍可访问实验。
另有任务单功能（模板 → 班级布置 → 学生作答 → 批改）。

## 本地开发

```sh
bun install --frozen-lockfile
node server/db/seed.ts
node server/index.ts
bun run dev
```

默认种子会创建班级 `2026-高一信息技术-01`、邀请码 `CLASS26`、管理员账号
`admin` 和教师账号 `teacher`。密码可分别用 `LAB_ADMIN_PASSWORD`、
`LAB_TEACHER_PASSWORD` 覆盖。

学生流程是：管理员创建账号并分配班级 → `/login` 登录 → 首页进入
`/classes/:classId/labs/<lab>`（如 `calculator`）→ 完成各关卡 → 提交，
由服务端隐藏用例判定并解锁后续关卡。教师和管理员可在
`/classes/:classId/dashboard` 查看班级进度；管理员分别在 `/admin`、`/admin/classes`、
`/admin/labs` 管理账号、班级和实验开放状态。

旧实验和 Slidev 在线课件已经从运行时、构建链路和测试中移除；它们的教学 idea 集中
记录在 [docs/retired-labs.md](docs/retired-labs.md)。

## 质量门槛

交接前运行：

```sh
bun run format:check
bun run lint
bun run typecheck
bun run test:run
bun run build
```

`typecheck` 会分别检查前端、Node API 和构建/测试配置；不要用根目录的空
project-reference 配置替代这三个检查。

实现过程中先运行与改动相关的测试和静态检查。涉及浏览器路由、认证、API/持久化
边界或完整用户流程时，在 build 后运行一个相关 Playwright spec；完整的
`bun run test:e2e` 留给 CI、发布验证或明确要求。E2E 需要可用的 Playwright 浏览器。
部署相关检查按需运行：

```sh
bun run test:deploy
bun run test:caddy
```

## 架构边界

- `src/app` 只负责路由和页面编排；每门实验的课程语义在
  `src/features/<lab>/{domain,lesson,ui}` 内闭合，任务单在
  `src/features/task-sheets` 内闭合。
- `server/` 是 Node ≥22.13 单进程，负责认证、草稿、判题和班级看板；隐藏用例只在
  `server/`；各实验的 project/draft/judge 走 `server/routes/labRoutes.ts`
  的共用薄管线，判题协议类型由 `src/features/<lab>/domain` 共享给服务端。
- `src/shared/{auth,api,layout,lab}` 只保留认证、请求、应用顶栏和实验页
  薄封装（加载、自动保存、入口守卫）等仍有真实消费者的基础设施。
- 数据库中的旧 `lab_id` 记录不会被迁移脚本主动删除；它们已没有对应路由或服务端处理器，
  不影响当前 calculator 流程。

部署说明见 [docs/deployment.md](docs/deployment.md)。
