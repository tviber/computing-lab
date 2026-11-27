# 计算实验室

默认是一个纯前端 SolidJS + Vite 在线实验站，使用 Bun 1.2.17，保持单一 package。
访客无需账号即可完整体验七个实验：实现 ALU、解码侦探、设计餐馆系统、统计基础、
逻辑回归、空间采样、颜色量化。进度与草稿保存在当前浏览器；本地判题通过后解锁关卡。

## 纯前端在线实验（默认）

```sh
bun install --frozen-lockfile
bun run dev
bun run build
bun run vite preview
```

将 `dist/` 发布到 Vercel 或任何支持 SPA 回退的静态托管服务即可。仓库提供
`vercel.json`；其他平台将页面路径回退到 `index.html`，资源路径仍直接提供静态文件。
默认开发服务器不代理 `/api`，构建产物不包含登录、班级、教师看板、管理后台、任务单
或校内 API 客户端，也不需要设置后端环境变量。

浏览器存储按实验隔离，刷新后可继续；清除网站数据会清除本地进度，设备间不会自动同步。
本地模式使用公开练习数据；校内模式使用服务端隐藏用例，两者复用相同判题函数与关卡规则。
Pyodide 与 AI 模型均随静态站点发布，不依赖校内服务。

## 校内课堂与服务端自托管（可选）

使用 Node 24 LTS（至少 24.15）和 Bun 1.2.17：

```sh
node server/db/seed.ts
bun run dev:server
# 在另一终端运行校内版前端
bun run dev:classroom
```

种子仅用于本地演示。部署时配置 `LAB_DB_PATH`、`LAB_ADMIN_PASSWORD`、
`LAB_TEACHER_PASSWORD` 等变量；真实账号、域名、密钥与运维材料放在 gitignored `local/`。

```sh
bun run build:classroom  # dist-classroom/
bun run build:server     # dist-server/index.js + schema.sql
bun run start:server
```

也可直接 `node server/index.ts` 启动 API。它自动提供同级的 `dist-classroom/`；
分开部署时由反向代理将 `/api/*` 转发给 API，其他路径提供校内前端。
构建后的 API 仍需要生产 npm 依赖与可写的 SQLite 数据目录。
校内版保留账号认证、实验可见性、草稿版本冲突保护、隐藏用例判题、教师看板、班级成员和任务单闭环。
部署流程与可选 SSH 发布模板见 [docs/deployment.md](docs/deployment.md)。

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

- 默认入口 `src/main.tsx → src/app/showcase`；校内入口 `src/classroom-main.tsx → src/app/App.tsx`。
  Vite 在构建时选择 HTML 入口，两个产物目录独立；前端运行时不按环境变量隐藏后台页面。
- `src/features/<lab>/{domain,lesson}` 保存单一关卡、纯计算和判题规则。实验 UI 使用
  `src/shared/lab/runtime.tsx` 注入的能力，不读取账号、班级路由或 HTTP 客户端。
- `src/app/showcase` 提供浏览器存储和公开数据；`src/app/classroom` 提供 API 适配器。
  `server/judge` 保留隐藏用例与数据库事务，调用同一组纯判题函数。
- `src/shared/layout` 通过账号插槽接收宿主 UI；默认构建不会沿顶栏引入认证模块。
- 架构测试遍历包括动态导入的依赖图，确保展示版不触达校内模块和服务端。

详细说明见 [docs/architecture.md](docs/architecture.md)。
