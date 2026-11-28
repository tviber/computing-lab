# 前端体积预算

`bun run build` 后执行：

```sh
bun run bundle:check
bun run bundle:check -- dist-classroom
```

脚本读取 `dist/.vite/manifest.json`，用 gzip -9 分别测量：

- 入口的递归静态 JS 闭包；
- 每个实验路由在入口之外新增的递归静态 JS 闭包；
- Python 编辑器、AI intake Worker、KaTeX 渲染器等重资源；
- `dist/vendor/` 离线资产，只报告、不计入 JS 预算。

超限时 CI 失败，并列出最大的 5 个 JS chunk 及 manifest 来源。预算配置在
`scripts/check-bundle-budget.mjs` 的 `BUNDLE_BUDGETS`。展示版与校内版分别使用入口上限，
因为校内入口还包含认证与账号壳；实验路由和重资源共用上限。修改预算需要在 PR 中说明
基线变化，不能用无意义拆包来规避。

## 入口拆分

复核时发现 `labRegistry` 为了取逻辑回归的看板关卡标题，静态导入了完整
`domain/stages.ts`。该模块在初始化时调用分词器，于是 `cnLexicon.ts` 的 10,016 个词
被带进首屏入口。现在 `labRegistry` 只读取轻量
`domain/dashboardStages.ts`，并由单测保证它与完整关卡定义同步；完整词典与语料只随
逻辑回归路由加载。

同一份脚本指标（入口递归 JS，gzip -9）：

| 指标              |                 拆分前 |               拆分后 |             变化 |
| ----------------- | ---------------------: | -------------------: | ---------------: |
| 入口 gzip         | 131,677 B（128.6 KiB） | 89,737 B（87.6 KiB） |           −31.8% |
| 入口 raw          |              331,215 B |            239,007 B |           −27.8% |
| 逻辑回归路由 gzip |              361,960 B |            403,467 B | 词典移入按需路由 |

校内版拆分后的入口为 353.1 KiB raw / 132.0 KiB gzip，单列为 140 KiB 上限。

拆分后的主要 chunk：

| 产物                             |       raw |      gzip |
| -------------------------------- | --------: | --------: |
| 入口 `index-*.js`                | 149,763 B |  55.6 KiB |
| 共享 Solid runtime `web-*.js`    |  89,244 B |  32.1 KiB |
| 逻辑回归词典/语料 `state-*.js`   | 252,107 B | 120.7 KiB |
| `LogisticRegressionLabPage-*.js` | 122,351 B |  36.1 KiB |
| `MathFormula-*.js`（KaTeX）      | 259,155 B |  74.2 KiB |
| `pythonCode-*.js`                | 340,680 B | 111.5 KiB |
| `embed.worker-*.js`              | 546,787 B | 152.1 KiB |

`public/vendor/models/` 的 BGE 模型约 23.4 MiB，`ort` WASM 约 26.8 MiB，二者都是
离线自托管资产，不属于前端 JS 预算。

## 当前边界

逻辑回归首次进入时仍会加载完整词典和公开语料，因为它们参与关卡初始化、分词与训练。
若还要继续压缩该路由，下一步应把“关卡展示数据”和“首次需要文本分词的交互”拆开，
在 UI 交互边界按需加载词典；不能在 `domain/` 中使用动态 import。
