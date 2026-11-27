# 部署

## 纯前端在线实验（默认）

```sh
bun install --frozen-lockfile
bun run build
```

发布 `dist/` 即可，不启动 Node API、SQLite 或认证服务。Vercel 使用仓库中的
`vercel.json`，构建命令为 `bun run build`，输出目录为 `dist`。其他静态平台需配置
SPA history fallback：`/labs/*` 等页面地址回退到 `/index.html`，`assets/` 和 `vendor/`
中的文件按原路径提供。子路径部署在构建时设置 `VITE_BASE_PATH=/your-path/`。

不要遗漏 `public/vendor` 中的 Pyodide、ONNX 与 BGE 模型资源。`postinstall` 从固定依赖
同步 Pyodide，BGE 权重由仓库携带，`bun run sync:embed` 可校验它们。
首次加载 AI 模型体积较大，静态托管需允许相应文件大小与 WASM MIME 类型。
浏览器会本地保存进度，服务商不需要配置 `/api` 重写或会话 Cookie。

## 校内课堂与服务端自托管（按需启用）

前置条件：Node 24.15+ LTS、Bun 1.2.17、SQLite 数据目录的写权限。

```sh
bun install --frozen-lockfile
bun run build:classroom
bun run build:server
# 初次部署按环境配置凭据后初始化数据
node server/db/seed.ts
LAB_DB_PATH=/path/to/lab.db LAB_HOST=127.0.0.1 LAB_PORT=8788 bun run start:server
```

`dist-classroom/` 是校内 SPA，`dist-server/` 是可选 Node 服务端。发布 API 时还需
`package.json`、锁文件和生产依赖；也可保留源码直接 `node server/index.ts`。
必须让初始化与运行时使用同一个 `LAB_DB_PATH`。请通过环境注入管理员/教师密码，
演示种子不适合作为生产账号配置。配置项参见 `.env.example`。

API 进程同时提供 `dist-classroom/` 的页面回退；拆分部署则将 `/api/*` 代理到 API，
静态资源和其他页面路径转交校内 SPA。同源代理保留原有会话认证和权限验证。
默认展示版 `dist/` 与校内 SPA 不可互换；本地浏览器进度与校内账号进度各自独立。

CI 分别构建两套前端和 API。SSH 校内发布默认关闭，只有部署人员配置仓库变量
`ENABLE_CLASSROOM_DEPLOY=true` 并配置 `production` 环境 secrets 后才会执行。
`deploy/reconcile.sh` 显式执行 `build:classroom --outDir dist`，沿用发布目录协议中的
`current/dist`；这是校内发布的暂存路径，不是仓库默认展示版构建。
所有仓库内配置均为通用模板；真实主机信息、密钥和校内配置放在 `local/deploy/` 或外部密钥管理中。

## 验证

```sh
bun run format:check
bun run lint
bun run typecheck
bun run test:run
bun run build
bun run build:classroom
bun run build:server
bunx playwright test --config playwright.showcase.config.ts --workers=1
bunx playwright test tests/e2e/routes.e2e.ts --workers=1
```

展示版 E2E 只启动静态预览，检查全部实验匿名访问、无 `/api` 请求、草稿刷新恢复、
本地运行与判题解锁和重置；校内 E2E 使用临时数据库及真实 API。

# 可选校内发布模板

Only after setting the repository variable `ENABLE_CLASSROOM_DEPLOY=true`, successful push CI on `main` GitHub Actions asks the Debian host for its
cached Git commit. It sends a Git bundle containing the objects needed for the
target SHA. An empty cache receives a full bundle. The job waits for the joint
release to finish rather than reporting success when a trigger is accepted.
To retry, manually run **Deploy production over SSH** from `main` with the full
SHA of a successful push CI run on `main`.

### Provisioning

- Install `release.sh`, `bundle-cache.sh`, and `receive-release.sh` from `deploy/` under
  `/usr/local/libexec/computing-lab/`, owned by root and not writable by the
  publisher. Keep the existing coordinated reconciler and API deployer.
- Create a locked system account `computing-lab-git` without login or sudo, and
  `install -d -m 0700 -o computing-lab-git -g computing-lab-git /var/cache/computing-lab-git`.
  Install the executable cache helper and release script first, then the receiver.
  The cache account only needs write access to its cache. The receiver parses Git
  objects as that account and supplies the resulting archive to the joint release.
- Use a dedicated `computing-lab-push` account with a locked password and a
  root-owned home and `.ssh` directory. Its one authorized key must use
  `restrict,command="/usr/bin/sudo -n /usr/local/libexec/computing-lab/receive-release.sh"`.
  In sudoers, allow this account to run only that receiver as root with no
  arguments (`/usr/local/libexec/computing-lab/receive-release.sh ""`).
- Limit the Actions `production` environment to the `main` branch. Set its
  `DEPLOY_SSH_HOST`, `DEPLOY_SSH_KEY`, and `DEPLOY_SSH_KNOWN_HOSTS` secrets.
  Pin the Ed25519 public host key obtained through a trusted admin connection;
  do not generate `known_hosts` in the runner by scanning the deployment host.
  Treat the CI key as production release authority; never reuse an admin key.

### Release and fallback

The receiver bounds the upload and checks its SHA-256. For bundles it checks the
advertised target, imports the objects and computes the reconstructed archive digest.
An older receiver or a cache reconstruction failure uses the full source archive
protocol. A failure during publication is reported to Actions. The cached SHA
can precede or follow the active SHA because it describes available objects.
To rebuild the cache, clear it between deliveries. Check phase durations for the
release lock, static preparation, API release, and activation in the release journal.

The receiver hands the archive to the
root-owned joint release service. The release checks that the SHA belongs to
`main` and advances both active versions. It stages and smoke-tests the static
build with Bun 1.2.17, rehearses the API migration and checks live API routes,
then activates the static build. The checksum covers transfer integrity; the
restricted CI key authorizes the contents of the archive.

Check the active versions in `/srv/computing-lab/state/current.sha` and
`/srv/computing-lab-api/state/deployed.sha`. Inspect a push release with
`journalctl -u computing-lab-push-<sha>.service`. If SSH delivery is unavailable,
an administrator can still start `computing-lab-release@<sha>.service` to
download directly from GitHub. A SHA already serving both frontend and API is
a health-checked no-op.
