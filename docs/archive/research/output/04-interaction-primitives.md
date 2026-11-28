# 04-interaction-primitives：Lab Primitive 交互基础设施聚类

> **Superseded as an extraction recommendation.** This is a prospective hypothesis registry derived from a future-course roadmap, not an approved implementation backlog. The current single-feature architecture found no need to retain a shared lesson primitive. Retain this file only to reopen a narrowly defined hypothesis when future feature-local implementations supply real compatible consumers.

- **日期**：2026-08-17
- **目的**：回答"如果未来 computing-lab 有 30 个实验，应优先开发哪些通用 Lab Primitive，让后面的实验快速组合出来"。
- **方法**：① 把 14 个 S/A 级实验（02-candidate-evaluation.md）逐一拆解为原子交互操作；② 跨实验聚类出交互范式簇（**不从教材章节组织**）；③ 每簇映射为一个无语义 Lab Primitive（职责边界、服务实验、先例背书）；④ 给出需求矩阵与建设顺序；⑤ 以 30 个实验视角验证组合性。
- **上游事实**：03-precedent-research.md 的 11 个被验证 pattern（P-A～P-K）与 15 个应避免项；阶段二工程工作底稿（未版本化）.md 的 5 个原语建议；此前的 shared 无语义原语迁移方向。

---

## 1. 14 个 S/A 级实验的原子交互操作拆解

| 实验             | 学生操纵什么                       | 系统反馈什么                                 | 过程/机制要素                        |
| ---------------- | ---------------------------------- | -------------------------------------------- | ------------------------------------ |
| E1 循环执行器    | 三要素编辑（初值/终值/步长）       | 变量表、循环展开表、执行路径高亮             | 步进、预测门控、死循环预警           |
| E2 枚举·密码锁   | 位数/字符集参数                    | 尝试计数、破解进度、对数柱状空间对比         | 逐项过程可见、剪枝前后对照           |
| E3 筛选判定器    | 条件构建（字段+运算符+值、AND/OR） | 表格行级布尔标注、结果统计                   | 逐行判定、预测某行留不留             |
| E4 图像向量化    | 像素画板（画数字）                 | 灰度矩阵、一维数组、还原图像                 | 展平动画、双向映射（像素↔数值↔位置） |
| E5 蒙特卡洛 π    | 投点数滑块、种子、步进/播放        | 散点画布、命中判定、π 收敛曲线               | 点判定可见、批量累积、随机可复现     |
| E6 进制位权      | 位格翻转、数值输入                 | 位权展开、数值联动、逐位判定                 | 预测（1101 是几）                    |
| E7 公式求值      | 公式选择/输入、源数据修改          | 求值步进（子式高亮）、引用区域高亮、错误传播 | 展开式、自动重算                     |
| E8 声音试听      | 频率/采样率/位深滑块               | 波形图、真实播放、量化噪声差值               | 播放控制、A/B 试听、先预测音质       |
| E9 数据表设计    | 字段增删、类型/约束配置、数据录入  | 查询验证结果、违规拒绝+原因（issue）         | 字段→查询闭环、约束判定              |
| E10 编码规则设计 | 规则部件拼装（字段+取值域）        | 编码生成、撞码/超容量校验（issue）           | 规则→校验→修正闭环                   |
| E11 图表类型匹配 | 图型选择、读图任务作答             | 图表渲染、表格 vs 图表并置、判定             | 限时任务、误导反例                   |
| E12 补码自洽性   | 位格编辑、运算选择                 | 三种表示并排、加法进位可见、0 唯一对照       | 位↔数值双向联动                      |
| E13 图像补强     | 分辨率/位深滑块                    | 双图并排、像素展开、文件大小                 | 参数→双图对照→总结闭环               |
| E14 文本编码链   | 字符输入、编码方案选择、手算步骤   | 码位/字节序列、错读乱码对照                  | 双向查表、逐字节展开                 |

---

## 2. 聚类结果：13 个交互范式簇 → Lab Primitive

（每簇列出成员实验的"共同交互需求"，即该原语必须提供的机制。）

### 簇 1：格阵操纵（Bit/Byte/Pixel Grid）→ **BitGrid**

- 成员：E6（位权格）、E12（补码位网格）、E4（像素矩阵）、E13（像素网格）、E14（字节序列）
- 共同需求：以"格子"为基本单位渲染（一维位串 / 二维像素阵 / 字节行）；每格有**位置索引、值、高亮态**；支持**点选/翻转**与**双向绑定**（位↔数值/字符/颜色/像素位置）；可缩放。
- 先例背书：P-E（逐位/逐像素/逐字节展开）、P-K（双向操作）；CS Unplugged 权重卡、Code.org 位开关、101computing 逐像素展开、numeric-toy 位↔数值联动。
- 现状：image feature 的 div grid 像素阵是雏形（需抽象出"格阵"通用层）。

### 簇 2：参数面板（Parameter → Live Result）→ **ParameterPanel**

- 成员：E1（三要素）、E2（位数/字符集）、E5（点数）、E6（数值）、E8（频率/采样率/位深）、E13（分辨率/位深）、E3（条件值）、E9（约束配置）、E7（源数据）
- 共同需求：**多类型参数控件**（整数滑块、对数滑块、开关、下拉、分段选择、文本输入）+ 参数预设（scenario preset）+ URL 场景编解码 + clamp + 即时派生结果。
- 先例背书：P-C（参数+即时反馈，全部先例的通用通道）；HowSecureIsMyPassword、GeoGebra、IDMIL、Plinko。
- 现状：ParameterControl 仅支持整数滑块——需扩展为多类型参数面板（并吸收 ScenarioCodec）。

### 簇 3：步进模拟器（Step-through Simulator）→ **Stepper**

- 成员：E1（循环执行）、E7（求值展开）、E5（批量投点）、E2（枚举过程）、E14（手算编码步骤）
- 共同需求：**状态序列**（每一步的完整状态快照）+ 前进/后退 + 单步/自动（可暂停）+ 当前步高亮 + 步计数 + 状态表联动。
- 先例背书：P-A（单步+状态表）；Python Tutor、Excel 公式求值、CS Circles、KomuraSoft 手算。
- 注意区分：Stepper 是**离散状态推进**（无时间概念）；连续时间轴属于簇 4。

### 簇 4：播放控制条（Timeline / Playback）→ **Transport**

- 成员：E8（声音重做核心：play/pause/scrub/loop/A-B）、E5（投点批量动画，可选）、E2（破解速度控制）
- 共同需求：播放/暂停/单步/拖动/循环/变速 + 时间或进度显示 + 多路同步（A/B 同源播放）。
- 先例背书：P-D 的并置同步；IDMIL 真实音频渲染、DSPFirst A/B 试听；course-model-reset 将 playback 定为声音 feature 的核心（Transport 作为无语义原语可在声音重做中提取）。
- 注意：course-model-reset 曾倾向"transport 观望、先 feature-local"——本聚类证明 E8/E5/E2 三个 S/A 级实验都需要，**升级为共享原语的条件已满足**（≥3 消费者）。

### 簇 5：并排对照器（Before/After Comparator）→ **Comparator**

- 成员：E8（原始 vs 重建试听）、E13（双图参数对照）、E14（同字节不同编码错读对照）、E12（三表示并排）、E11（表格 vs 图表）、E2（剪枝前后对比）
- 共同需求：2+ 个参数化副本**并排渲染** + **同步联动**（同源参数/滚动/播放）+ **差异高亮** + 控制变量锁定（只差一个变量）。
- 先例背书：P-D（并置对照）；IDMIL、DSPFirst、CS Field Guide UTF 方案对比、Fix This Chart 前后对照。
- 说明：这是被先例验证最充分、横跨实验最多的范式之一（6 个 S/A 级实验），应优先建设。

### 簇 6：预测-揭示门控（Prediction → Reveal）→ **PredictionGate**

- 成员：E1（先猜执行次数/结果）、E6（先猜数值）、E5（先猜精度）、E8（先预测音质）、E3（先猜某行留不留）、E2（先猜尝试次数）
- 共同需求：预测输入（数值/选择）+ **硬门控**（不填预测不能继续）+ 揭示 + 预测 vs 实际对照显示（含差距标注）。
- 先例背书：P-B（预测-揭示硬门控）；CS Circles Reveal、KomuraSoft 即时判分、NYT WGOTIG。
- 说明：阶段二/三反复强调"预测模式"，且 6 个实验都需要——这是**我们区别于大多数先例的差异化机制**，应做成交互原语而非各实验自制。

### 簇 7：校验反馈（Validate → Issue）→ **Validator**

- 成员：E9（约束拒脏数据）、E10（编码规则校验）、E3（行级判定，变体）、E6（逐位判定，变体）
- 共同需求：`validate → {valid, issues[]}` 模式 + issue 列表渲染（含原因）+ **行/字段/格级错误标注** + 修正后反馈更新。
- 先例背书：home-network 已实现该模式（invalid-cidr/duplicate-ip…）；CS Unplugged Error Detection"设计→翻牌验证→发现漏洞"。
- 说明：先例研究确认 E9/E10 的校验交互无外部先例——Validator 是差异化原语，且 home-network 已有实现可提取。

### 簇 8：图表组件族（Chart Family）→ **Chart**

- 成员：E5（π 收敛折线）、E2（密码空间对数柱状）、E11（条形/折线/饼图型比较）、E13（文件大小，弱）、E9（统计，弱）
- 共同需求：折线（含**数据点追加动画**、收敛曲线）、条形（含**对数轴**）、饼、柱状（起步 3–4 种）；轴/刻度/图例/坐标标签为共享子组件；教学尺度 ≤30 点。
- 先例背书：P-C/P-F；OSP 收敛曲线、HowSecureIsMyPassword 条形、Data-to-Viz 图例。
- 现状：无（禁止引图表库，SVG 手写——阶段二工程工作底稿（未版本化） 的 P3 原语）。

### 簇 9：节点边视图（Node-Edge Graph）→ **GraphView**

- 成员：E1（控制结构执行路径高亮，简化版）、（未来：#18 流程图、home-network 拓扑重做、3.19 模块图）
- 共同需求：节点/连线渲染 + **执行路径高亮**（当前节点游标）+ 只读模板数据 + 方向箭头（marker）。
- 先例背书：home-network SVG 拓扑（现状）、Python Tutor 的栈帧图（弱相关）、P-A 的执行高亮。
- 注意：首版只做"只读渲染 + 路径高亮"，**不做编辑器**（拖拽/连线/布局后置——02-eval 与 03 先例一致：流程图编辑器=真实工具重复劳动）。

### 簇 10：拼装构建器（Builder / Jigsaw）→ **Builder**

- 成员：E10（编码规则部件拼装）、E3（条件构建，简化）、E9（字段/约束配置，简化）、E14（手算步骤，简化）
- 共同需求：部件库 + 点选/排序组装（**首版不用拖拽**，成本与 a11y 考量）+ 结构合法性校验 + "运行/校验"入口。
- 先例背书：P-I（卡片化）；CS Unplugged、Boolean Table Game、KomuraSoft 手算步骤。
- 注意：Builder 与 Validator 常配对使用（拼装→校验→修正闭环）。

### 簇 11：白名单公式求值（Formula Evaluation）→ **FormulaEvaluator**

- 成员：E7（SUM/AVERAGE/MAX/MIN/IF/嵌套 IF）、E1（循环通项公式）、（未来：3.13 条件表达式、2.9 扩展）
- 共同需求：白名单函数求值（**白名单由实验配置，解析器本身无语义**）+ 求值步进（子式高亮）+ 循环引用检测 + 错误传播（#DIV/0!）。
- 先例背书：Excel 公式求值（步进+子式高亮范式）、Mathspace。
- 说明：阶段二工程工作底稿（未版本化） 曾判 feature-local（"白名单与解析器捆绑"）——本聚类修正为**共享原语**：白名单参数化后解析器无语义，且 E7/E1 两个 S/A 级实验都需要，避免重复实现与重复测试（解析器是测试成本最高点，做一次测一次）。

### 簇 12：URL 场景编解码（Scenario Codec）→ **ScenarioCodec**

- 成员：全部 14 个实验
- 共同需求：`default → preset → explicit → clamp` 解析链 + 首值语义 + fail-closed + 序列化（只读，不透写）。
- 现状：三个 feature 各复制了一份（image/audio/network 的 scenario.ts）——**提取为共享工具**，所有新实验直接复用。
- 先例背书：README"Query scenarios are shareable"；course-model-reset"URL transport 保留为 app opaque"。

### 簇 13：种子随机（Seeded PRNG）→ **SeedPRNG**

- 成员：E5（投点可复现）、E2（枚举轨迹可复现）、（未来：4.6 真实小模型若复活）
- 共同需求：可种子伪随机数（mulberry32 等 ~10 行纯函数）+ 与 URL 场景配合（同一种子=同一结果序列）。
- 先例背书：P-C 的确定性要求；GeoGebra/OSP 均无种子=先例空白。

---

## 3. Lab Primitive 清单（分层）

### L0 工具原语（纯函数，无 UI）

| 原语               | 能力                                                                               | 服务实验          |
| ------------------ | ---------------------------------------------------------------------------------- | ----------------- |
| `SeedPRNG`         | 种子随机数（mulberry32）                                                           | E5、E2            |
| `ScenarioCodec`    | URL 场景 parse/serialize（default→preset→explicit→clamp）                          | 全部              |
| `FormulaEvaluator` | 白名单表达式求值 + 步进展开 + 循环引用检测（纯逻辑，UI 由 Stepper/DataTable 呈现） | E7、E1、未来 3.13 |
| `number`（已有）   | clamp 等数值工具                                                                   | 全部              |

### L1 显示原语（无语义渲染，shared 层）

| 原语        | 渲染什么                                              | 关键能力                                                                      | 服务实验              |
| ----------- | ----------------------------------------------------- | ----------------------------------------------------------------------------- | --------------------- |
| `BitGrid`   | 一维位串 / 二维像素阵 / 字节行                        | 索引标注、分区色、高亮态、点选翻转、双向绑定、缩放                            | E6、E12、E4、E13、E14 |
| `DataTable` | 数据表格（只读起步）                                  | 行/单元格级状态标注、列元数据（字段/类型/约束标记）、选中高亮、轻编辑（渐进） | E3、E7、E9、E2、E13   |
| `Chart`     | 折线/条形/饼/柱状                                     | 轴/刻度/图例子组件、数据点追加动画、对数轴                                    | E5、E2、E11、E13、E9  |
| `GraphView` | 节点/连线/执行路径                                    | 路径高亮、当前节点游标、只读模板                                              | E1、未来 3.3/网络     |
| `IssueFeed` | issue 列表（并入 `Validator` 的可选拆分，矩阵不单列） | 原因文本、严重度、定位跳转                                                    | E9、E10、E3           |

### L2 交互机制原语（无课程语义的交互机制，shared 层）

| 原语             | 机制              | 关键能力                                                           | 服务实验                   |
| ---------------- | ----------------- | ------------------------------------------------------------------ | -------------------------- |
| `ParameterPanel` | 参数→即时派生结果 | 多类型控件（滑块/对数滑块/开关/下拉/分段/文本）、预设、clamp、ARIA | 全部                       |
| `Stepper`        | 离散状态推进      | 状态序列、前进/后退、单步/自动（可暂停）、当前步高亮、步计数       | E1、E7、E5、E2、E14        |
| `Transport`      | 连续时间轴播放    | play/pause/step/scrub/loop/speed、进度显示、多路同步               | E8、E5、E2                 |
| `Comparator`     | 并排对照          | 2+ 面板、同步联动（参数/滚动/播放）、差异高亮、控制变量锁定        | E8、E13、E14、E12、E11、E2 |
| `PredictionGate` | 预测-揭示         | 预测输入、硬门控、揭示、预测 vs 实际对照                           | E1、E6、E5、E8、E3、E2     |
| `Validator`      | 校验-反馈         | validate→issues、行/字段/格级错误标注、修正更新                    | E9、E10、E3、E6            |
| `Builder`        | 拼装构建          | 部件库、点选/排序组装（首版无拖拽）、结构校验、运行入口            | E10、E3、E9、E14           |

### L3 未来原语（30 实验视角，当前 S/A 级无强需求，但已见需求苗头）

| 原语                                    | 需求来源                                                         | 说明                                                                                                 |
| --------------------------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `TopologyCanvas`                        | home-network 重做（course-model-reset 冻结方向）、未来网络类实验 | GraphView 的交互升级：拖拽连线、设备图标、可配置拓扑（drag-and-drop topology）                       |
| `PacketFlow`                            | 网络重做的 probe/path 诊断                                       | 数据包沿路径流动画、当前 hop/决策标注（packet/flow）                                                 |
| `VirtualControlPanel`                   | 洗衣机/设备模拟类（未来 3.3 流程实验、密码锁转盘）               | 旋钮/开关/表盘风格控件组（virtual device / control panel）                                           |
| `SamplingChain`（组合范式，非独立原语） | E8/E5/E13 共性                                                   | "参数 → 采样 → 可视化"链由 ParameterPanel + BitGrid/Chart + Stepper 组合实现，可作为**组合模板**沉淀 |

**关于用户示例中的 "encoding/decoding"**：它不是一个独立原语，而是 **BitGrid 双向绑定 + DataTable 查表 + Comparator 错读对照** 的组合能力（E14/E12/E4 的"可逆性"由双向绑定提供）——归入 L1/L2 组合，不单列。

---

## 4. 需求矩阵（原语 × 14 实验）

●=核心依赖　○=可选/辅助（**计数 = ● 数**）

| 原语 \ 实验      | E1  | E2  | E3  | E4  | E5  | E6  | E7  | E8  | E9  | E10 | E11 | E12 | E13 | E14 | 计数        |
| ---------------- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | ----------- |
| ParameterPanel   | ●   | ●   | ●   | ○   | ●   | ●   | ●   | ●   | ●   | ●   | ○   | ○   | ●   | ●   | 11          |
| BitGrid          | ○   |     |     | ●   |     | ●   |     |     |     |     |     | ●   | ●   | ●   | 5           |
| DataTable        | ●   | ○   | ●   |     |     |     | ●   |     | ●   |     | ○   |     | ○   |     | 7           |
| Chart            |     | ●   | ○   |     | ●   |     | ○   |     | ○   |     | ●   |     | ●   |     | 7           |
| GraphView        | ●   |     |     |     |     |     |     |     |     |     |     |     |     |     | 1（未来多） |
| Stepper          | ●   | ●   | ○   | ○   | ●   | ○   | ●   |     |     |     |     |     |     | ●   | 8           |
| Transport        | ○   | ○   |     |     | ●   |     |     | ●   |     |     |     |     |     |     | 2           |
| Comparator       | ○   | ●   |     | ○   |     | ○   |     | ●   |     |     | ●   | ●   | ●   | ●   | 9           |
| PredictionGate   | ●   | ●   | ●   | ○   | ●   | ●   |     | ●   |     |     |     | ○   |     |     | 7           |
| Validator        | ○   |     | ●   |     |     | ●   | ○   |     | ●   | ●   |     |     |     |     | 6           |
| Builder          |     |     | ●   |     |     |     |     |     | ●   | ●   |     |     |     | ●   | 4           |
| FormulaEvaluator | ●   |     |     |     |     |     | ●   |     |     |     |     |     |     |     | 2（未来多） |
| ScenarioCodec    | ●   | ●   | ●   | ●   | ●   | ●   | ●   | ●   | ●   | ●   | ●   | ●   | ●   | ●   | 14          |
| SeedPRNG         |     | ●   |     |     | ●   |     |     |     |     |     |     |     |     |     | 2           |

**解读**：

- **4 个"全谱系"原语**（ParameterPanel、ScenarioCodec、Comparator、Stepper）横跨 ≥8 个实验，是投资回报最高的第一梯队。
- **5 个"聚类核心"原语**（BitGrid、DataTable、Chart、PredictionGate、Validator）各服务 5–7 个实验，是让"同族实验快速组合"的关键；**Builder**（4 个消费者）作为 E10 的专用核心一并建设。
- **3 个"专用但关键"原语**（Transport 服务声音重做验收；FormulaEvaluator 服务测试成本最高的解析器；SeedPRNG 服务于随机类）按里程碑接入。
- **GraphView 当前仅 E1 一个强消费者**——但它是未来网络/流程图实验的底座（course-model-reset 明确要重做 topology），列为"随 E1 建简化版、随网络重做升级"。

---

## 5. 建设顺序（4 批，每批以首个验收实验为准）

### 第一批：公共底座（P0，4 个原语 + 1 工具）——对应第一批实验 E3/E6/E1

| 原语                       | 验收实验      | 理由                                                                                  |
| -------------------------- | ------------- | ------------------------------------------------------------------------------------- |
| `ScenarioCodec`            | 任何新实验    | 提取三个 feature 的重复代码，先做（半天）                                             |
| `ParameterPanel`           | E6/E3         | 几乎所有实验的前置；现有 ParameterControl 扩展为多类型                                |
| `BitGrid`                  | E6 进制位权   | E6 是 bit 格首个载体（阶段二工程工作底稿（未版本化） P1），完成后 E12/E4/E13/E14 顺带 |
| `DataTable`（只读+行标注） | E3 筛选判定器 | 行级布尔判定是表格原语首个载体（P2），完成后 E7/E9 顺带                               |
| `SeedPRNG`                 | E5（可提前）  | ~10 行，随时可做                                                                      |

### 第二批：核心机制（P1，3 个原语）——对应 E1/E5/E2

| 原语             | 验收实验                       | 理由                                                          |
| ---------------- | ------------------------------ | ------------------------------------------------------------- |
| `Stepper`        | E1 循环执行器                  | 循环执行器是全票 S 最高优先；步进+变量表是黄金范式            |
| `PredictionGate` | E1/E6                          | 6 个实验需要预测模式；与 Stepper 天然配对                     |
| `Chart`          | E11 图表匹配（或 E5 收敛曲线） | 须早于 E5/E2（阶段二工程工作底稿（未版本化） P3：图表族先行） |

### 第三批：聚类扩展（P2，3 个原语）——对应 E7/E9/E10/E13

| 原语               | 验收实验                | 理由                                              |
| ------------------ | ----------------------- | ------------------------------------------------- |
| `FormulaEvaluator` | E7 公式求值             | 测试成本最高点，做一次测一次；白名单参数化        |
| `Validator`        | E9 数据表设计（或 E10） | 从 home-network validate→issues 提取；E9/E10 共用 |
| `Builder`          | E10 编码规则设计        | 首版点选+排序（无拖拽）；与 Validator 配对成闭环  |

### 第四批：感官对照（P3，2 个原语）——对应 E8/E13/E14/E12

| 原语         | 验收实验                       | 理由                                                        |
| ------------ | ------------------------------ | ----------------------------------------------------------- |
| `Comparator` | E13 图像双图对照（先做视觉版） | 视觉版成本低；随后服务 E14 错读对照、E12 三表示             |
| `Transport`  | E8 声音重做（验收边界测试）    | 随 course-model-reset 钦定的声音重做落地；WebAudio 平台决策 |

### 原语依赖关系

```
ScenarioCodec ──┬── ParameterPanel ──┬── Comparator
                │                    ├── PredictionGate ──┬── Stepper
                │                    └── Validator ──┬─────┘
                │                                   └── Builder
                ├── BitGrid ──── FormulaEvaluator
                ├── DataTable ──┘
                └── SeedPRNG ── Chart ── Transport ── GraphView
```

---

## 6. 30 个实验视角：组合验证（原语如何让未来实验快速组合）

以未覆盖知识点（00-knowledge-inventory §3）抽样验证——每个未来实验都由上述原语**组合**而成，无需新原语：

| 未来实验（未覆盖知识点）      | 组合方式                                                     | 新增工作量         |
| ----------------------------- | ------------------------------------------------------------ | ------------------ |
| 1.9 二进制算术（竖式）        | BitGrid + Stepper + ParameterPanel                           | 仅领域逻辑         |
| 1.11 汉字编码冲突演示         | BitGrid + Comparator + DataTable                             | 仅 fixture         |
| 2.10 排序面板（并入 E7）      | DataTable + Stepper + Comparator                             | 仅排序逻辑         |
| 2.12 透视表聚合               | DataTable + Chart + Builder（字段拖入行/列/值=Builder 变体） | 聚合引擎           |
| 3.13 条件表达式               | FormulaEvaluator + DataTable（真值表）+ PredictionGate       | 仅表达式白名单扩展 |
| 3.14 选择结构分支             | Stepper + GraphView（分支路径高亮）+ PredictionGate          | 仅领域逻辑         |
| 3.16 列表下标                 | BitGrid（一维）+ Stepper（迭代指针）+ Validator（越界）      | 仅领域逻辑         |
| 3.17 函数调用栈               | Stepper + GraphView（调用树）+ DataTable（参数表）           | 调用栈展开逻辑     |
| 3.18 csv/嵌套列表             | DataTable + Stepper（读取步骤）+ BitGrid（嵌套展开）         | 仅领域逻辑         |
| 4.4 MNIST 切分（并入 E4）     | BitGrid + ParameterPanel + Comparator                        | 仅数据             |
| 2.7 关系表字段设计（并入 E9） | DataTable + Builder + Validator                              | 仅领域逻辑         |
| 洗衣机流程（3.3/3.4 附属）    | GraphView + Stepper + ParameterPanel + Transport             | 仅领域逻辑         |
| 1.15 音频格式对比（说明级）   | Comparator + ParameterPanel + Transport                      | 仅素材             |

**结论**：14 个原语（含 3 个未来原语）可以组合覆盖当前全部 S/A 级实验与绝大多数未覆盖知识点；**新增实验的工程主体 = 领域逻辑（domain 层纯函数）+ fixture，交互层零开发或极轻组合**。这正是"30 个实验"规模下 Lab Primitive 策略的价值。

---

## 7. 与现有代码 / 冻结方向的关系

1. **course-model-reset 合规性**：本清单全部原语均为**无语义**（不携带 phase/step/submit 等课程语义，不携带任何教材概念）——符合冻结方向"shared 只允许无语义渲染原语"。课程语义仍留在 feature 的 domain/lesson 层。
2. **现有 shared 组件的处置**：
   - `ParameterControl`（整数滑块）→ 升级为 `ParameterPanel` 的滑块类型（冻结方向允许无语义控件共享）；
   - `VisualizationPanel`/`FormulaPanel` → 不升级为原语；Comparator/DataTable 等新原语承担其职责后，这两个可随冻结方向降级 feature-local；
   - `LabShell` → 维持 children-only 收敛计划不变，原语不依赖 LabShell 插槽。
3. **新增原语的放置**：L0 进 `src/shared/lib`（纯函数）；L1/L2 进 `src/shared/primitives`（或按 frozen 方向命名的无语义层）；不 import feature/app。
4. **与 阶段二工程工作底稿（未版本化） 原语建议的差异**（本聚类的新增/修正）：
   - **新增**：`Comparator`（被 6 个实验需要的并置对照，先例背书最强却被前几轮遗漏）、`PredictionGate`（差异化机制）、`Validator`（E9/E10 核心）、`Builder`（E10 核心）、`ScenarioCodec`（消除三份重复代码）、`SeedPRNG`；
   - **修正**：`FormulaEvaluator` 从 feature-local 升为共享（E7/E1 双消费者 + 白名单参数化后无语义）；
   - **合并**：原"表格网格"= DataTable；原"bit 格"= BitGrid；原"SVG 图表族"= Chart；原"只读流程图渲染器"= GraphView（简化版）。
5. **避免项映射**（03-precedent Q1–Q15）：ParameterPanel 不做成 Excel 克隆（Q-1）；Comparator 不做黑箱对照（Q-8，机制必须可见）；Stepper 禁被动播放（Q-5/Q-6，配合 PredictionGate）；Builder 首版无拖拽（Q-15、a11y 成本）；Transport 坚持纯 WebAudio（Q-9）。

---

## 8. 结论

1. **第一梯队（立即投资，4 个）**：`ScenarioCodec`、`ParameterPanel`、`BitGrid`、`DataTable`——覆盖全部 14 个实验的公共底座，对应第一批实验 E3/E6/E1。
2. **第二梯队（随 E1/E5/E2 落地，3 个）**：`Stepper`、`PredictionGate`、`Chart`——第三单元三件套的机制核心。
3. **第三梯队（随 E7/E9/E10 落地，3 个）**：`FormulaEvaluator`、`Validator`、`Builder`——表格/规则类实验的聚类扩展。
4. **第四梯队（随 E8/E13 落地，2 个）**：`Comparator`、`Transport`——感官对照类（声音重做验收）。
5. **未来梯队（3 个）**：`TopologyCanvas`、`PacketFlow`、`VirtualControlPanel`——随 home-network 重做与设备模拟类实验立项。
6. **铁律**：原语无语义；新增实验 = 领域逻辑 + fixture + 原语组合；不做任何"网页工具克隆"。
