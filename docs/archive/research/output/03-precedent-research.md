# 03-precedent-research：S/A 级候选实验的外部先例研究汇总

> **Historical external-source index.** The cited interaction observations remain research input, not an instruction to build a shared primitive or adopt a workflow. Pair any future use with the current feature evidence and `docs/architecture.md`.

- **日期**：2026-08-17
- **方法**：对 14 个 S/A 级候选实验（E1–E14）分三组并行外部研究（算法组 / 数据处理组 / 多媒体-AI 组），全部先例经 **web_search 实际检索**核实（未凭记忆编造），关键页面经抓取/curl 实测存活；每个实验只保留 2–4 个**真正相关**的先例。
- **核心问题**：别人是如何把这个抽象概念变成可操作对象的？
- **三组独立检索**：算法（E1/E2/E5/E6/E12）、数据处理（E3/E7/E9/E11/E10）、多媒体/AI（E4/E8/E13/E14）。中间检索工作底稿未版本化；本汇总保留每个候选的相关先例、结论和 URL 索引。

---

## 1. 先例总览（14 实验 × 2–4 先例）

| 实验                 | 同构度最高的先例                                   | 它如何把抽象概念变成可操作对象（一句话）                                                       | 关键借鉴                                                                                                  | 关键避免                                                                                                       |
| -------------------- | -------------------------------------------------- | ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| **E1 循环执行器**    | Python Tutor                                       | 循环变成"逐行步进 + 变量表实时更新 + 可回退"，每次赋值新旧值肉眼可见                           | 单步+变量表黄金范式；CS Circles 的"先填预测才能揭示"硬门控                                                | 四选一预测题（Runestone）；无死循环预警（Python Tutor 的坑）；Scratch 无变量表                                 |
| **E2 枚举·密码锁**   | CS Field Guide Password Guesser                    | 设密码长度/字符集 → 破解器以可见进度逐候选尝试 → 即时给出破解时间数量级                        | 参数化+过程可见+时间反馈三合一；HowSecureIsMyPassword 的即时跳变                                          | 估算模型粗糙须注明"数量级示意"；真枚举不可行须降采样（逐候选闪烁=坑）                                          |
| **E3 筛选判定器**    | Boolean's Pizza Palace                             | 口语点单→翻译成布尔检索式→即时判定（筛选语义的入口任务）                                       | 布尔式翻译任务；运算符卡组合（Boolean Table Game）；集合可视类比（The Boolean Game）                      | **行级判定原因可见无任何先例=我们的空白**；只显示结果=与 Excel 无异；依赖单一网页（The Boolean Game 原站已死） |
| **E4 图像向量化**    | MNIST Digit Playground (UCSD)                      | 亲手画数字 → 页面显示 28×28=784 像素值 → 可导出 CSV 数据行（向量化外显成文件）                 | 中间表示可见可导出；画板↔数组双向联动（MNIST Analyzer）；逐层放大叙事（Google ML Practicum）              | 784 全铺信息过载；无脚手架直接照搬                                                                             |
| **E5 蒙特卡洛 π**    | GeoGebra MC π                                      | 滑块撒点 + 每点命中判定可见（圆内/外分色）+ 估算值随点数波动并收敛                             | 先单点可见再批量累积（PhET Plinko 节奏）；点数滑杆+收敛曲线（OSP@SG）                                     | 纯代码实验判定过程不可见（Runestone lab）；GeoGebra 系无种子/无收敛曲线=我们的增量；UI 老旧无引导（OSP）       |
| **E6 进制位权**      | CS Unplugged Count the Dots                        | 每位一张权重卡（1/2/4/8…），翻转组合卡片表示任意数——位权被具身化                               | 位格直接操纵（Code.org 位开关+溢出反馈）；Cisco 位权按钮手感                                              | 纯速度游戏（Cisco 限时模式=打地鼠）；只判结果不展过程（Khan 练习=计算器化）                                    |
| **E7 公式求值**      | Excel 内置"公式求值"                               | 逐次点击"求值"，当前子表达式加下划线高亮并替换为中间值，直至终值                               | 单步展开+子式高亮=专业界权威范式；改数据→自动重算（Mathspace）                                            | **网页 Excel 克隆（Cengage SAM 最大失败样本：操作繁琐、判定机械、"照着点"）**；调试工具无概念层无预测          |
| **E8 声音试听补强**  | IDMIL Digital Audio Workbench（ACM 论文收录）      | 采样率/位深变滑块 → 波形+频谱 8 面板 + **真实音频渲染**同步，拖一下就听到混叠与量化噪声        | 看+听双通道同步；量化噪声=差值面板可见化；音乐素材做位深试听（DSPFirst）                                  | 伪音频/缩尺（1–8Hz 不可听会误导）；插件依赖（DSPFirst LabVIEW 已死）；夸大听感差异                             |
| **E9 数据表设计**    | CS Unplugged《Databases》寻宝                      | 给定字段集设计检索策略找目标书，比较不同字段"找不找得到"——字段决定可答问题                     | 固定小数据集+即时查询反馈（SQLZoo/SQLBolt）；查询验证游戏化（SQL Murder Mystery）                         | **约束拒脏数据交互无先例=新增量**；查已有库无设计环节；结果黑箱                                                |
| **E10 编码规则设计** | CS Unplugged《Error Detection》                    | 设计/验证"加一位校验位"的规则，翻牌模拟传输出错——规则设计得好就找得出错                        | "设计规则→校验→发现漏洞→修正"闭环教学法；校验码"生成 vs 验证"双模式（GS1/BarcodeFYI）                     | **学籍号类规则设计教学无先例=空白**；纯计算器无叙事                                                            |
| **E11 图表类型匹配** | NYT What's Going On in This Graph                  | 无标题真实图表 → 观察陈述"看到什么规律" → 真相揭晓（读图任务+预测-揭晓）                       | 读图任务+误导反例（Fix This Chart 修复任务；Spot the Spin 误导手法清单）；图型匹配决策向导（Data-to-Viz） | **图型切换器/匹配选择题无任何先例证明教学价值**；讨论制非课堂即时交互                                          |
| **E12 补码自洽性**   | PSU "Signed Integer Representation"（历史 applet） | 同一数值在符号-数值/反码/补码三种表示间切换编辑，同一加法在不同表示下的结果差异可见            | 三表示并排对照（PlanetCalc 数据面板）；位↔数值双向联动（numeric-toy）；进位逐位可见（binaryvisual）       | **现代完整教学交互先例空缺=差异化机会**；Java Applet 已死（插件教训）；纯计算器                                |
| **E13 图像补强**     | 101 Computing Bitmap Simulator                     | 在自己/内置像素画上切分辨率与色深，逐像素二进制、文件大小、色带同步变化                        | 内置图库+自绘双入口；"颜色=数字=位"三级递进（CS Field Guide）；位深滑块产生色带                           | **JPEG 质量滑块教育版无强相关先例→黑箱压缩对照应避免**；授权墙资源（PBS Pixel Play）                           |
| **E14 文本编码链**   | KomuraSoft 编码课程（同构度最高）                  | 按规则亲手把字符组装成 UTF-8 字节（手算编码）+ 字节序列模拟器 + 同一字节被错读成乱码的对照视图 | 两阶段心智模型（编号 vs 编码）；错读/mojibake 冲突演示；随文即时判分防查表式假交互                        | 开发者工具直给（r12a 30+ 编码=信息过载）；查表即全部（坐实 C 级批评）；中文 UTF-8 先例稀缺须自家 fixture 核对  |

---

## 2. 每个实验："别人是如何把这个抽象概念变成可操作对象的"

- **E1 循环执行器**：Python Tutor / CodeLens / CS Circles 把循环变成"**逐行步进 + 变量表实时更新 + 先预测后运行**"，学生控制执行节奏，亲眼看到每次赋值改变变量值；Scratch 证明"三要素可直接编辑"对儿童最自然。
- **E2 枚举·密码锁**：HowSecureIsMyPassword / CS Field Guide 把枚举变成"**输入密码或设长度字符集 → 破解器以可见进度逐候选尝试 → 即时给出破解时间**"，让 10³ vs 26⁵ 的数量级差异直接可感。
- **E3 筛选判定器**：Pizza Palace 等把"筛选=布尔运算"变成"**口语需求→翻译检索式/组合运算符卡→即时判定**"的任务——但**无人把"每行为什么被留下/筛掉"做出来**，行级原因可见是我们的空白。
- **E4 图像向量化**：MNIST Digit Playground 让你亲手画一个数字，然后页面把它显示成 28×28=784 个像素值并允许导出成 CSV——"图是一串数字、顺序即位置"从结论变成你亲手产出文件的动作。
- **E5 蒙特卡洛 π**：GeoGebra / OSP / PhET Plinko 把随机性变成"**逐点撒下、每个点命中判定可见、估算值随点数波动并收敛到 π**"，随机与统计规律的耦合亲手可见。
- **E6 进制位权**：CS Unplugged 卡片 / Cisco 位权按钮 / Code.org 位开关把位权变成"**每位一张权重卡/一个按钮，翻转组合出数字并即时看到总和**"，位置携带权重被具身化。
- **E7 公式求值**：Excel 公式求值把公式变成"**逐次点击展开、当前子式高亮替换**"的对象，证明展开式动画天然成立——但它是调试工具，我们要补"引用是地址"的概念层与预测环节。
- **E8 声音试听**：IDMIL 把采样率和位深变成滑块，拖一下就在波形/频谱面板和真实试听里同时听到、看到混叠与量化噪声——失真不再是名词而是参数与听感的一一对应。
- **E9 数据表设计**：SQLZoo / Murder Mystery 把"查询验证"变成输入即得结果的练习与破案游戏，CS Unplugged 把"字段决定可答问题"变成寻宝操作——但"约束拒脏数据"无交互先例，是我们的新增量。
- **E10 编码规则设计**：CS Unplugged 把校验码变成"**设计规则→翻牌验证→发现漏洞**"的物理闭环，GS1/BarcodeFYI 把校验码变成"生成/验证"即时工具——规则设计闭环有教学法先例，数字化课堂版仍是空白。
- **E11 图表类型匹配**：NYT WGOTIG 把"从图读规律"变成无标题读图任务、Fix This Chart 把误导图变成"重画修正"任务、Data-to-Viz 把图型匹配变成决策树——限时并置与误导反例都有成熟原型可组合。
- **E12 补码自洽性**：PSU applet / PlanetCalc / numeric-toy / binaryvisual 分别把补码变成"三表示并排对照""位↔数值双向联动""进位逐位可见"——但**从未三者合一**，现代完整教学先例空缺是我们的差异化机会。
- **E13 图像补强**：101computing 让你在自己（或内置图库）的像素画上切换分辨率与色深，逐像素二进制、文件大小、色阶断层同步变化——清晰度与数据量的权衡变成同一画面上可调可数的对象。
- **E14 文本编码链**：KomuraSoft 让你按 UTF-8 规则亲手把字符组装成字节，再在模拟器里输入字符串看码位/字节，并直接看到同一字节被错读成乱码——编码约定与冲突都变成你可以亲手做一遍、亲眼看错的步骤。

---

## 3. 被反复证明"非常自然"的 interaction pattern（应优先采用）

三组研究独立得出、高度重合的 pattern 清单（附证据来源）：

| #   | Pattern                                               | 证据（跨组先例）                                                                        | 落点                                            |
| --- | ----------------------------------------------------- | --------------------------------------------------------------------------------------- | ----------------------------------------------- |
| P-A | **单步执行 + 状态/变量表**                            | Python Tutor、Runestone CodeLens、Excel 公式求值、Mathspace                             | E1（骨架）、E7（子式高亮）                      |
| P-B | **预测-揭示硬门控**（先填预测才能步进/揭示）          | CS Circles Reveal、KomuraSoft 随文即时判分、NYT WGOTIG 先猜再揭晓                       | E1/E5/E6/E8 的预测模式应做成门控                |
| P-C | **参数滑块/输入 + 即时数值-视觉反馈**                 | GeoGebra、IDMIL、101computing、HowSecureIsMyPassword、Cisco Binary Game、Plinko         | 全部 14 个实验的通用反馈通道                    |
| P-D | **并置 A/B 对照**（同一对象两种参数，控制变量显性化） | IDMIL（原始 vs 采样 vs 重建）、DSPFirst（原始 vs 量化）、CS Field Guide（UTF 方案对比） | E8 试听 A/B、E13 双图、E14 逐字节对照           |
| P-E | **逐位/逐像素/逐字节展开视图**（"数值即对象"）        | CS Unplugged 卡片、101computing 逐像素二进制、KomuraSoft 手算字节、r12a 逐编码字节      | E4 灰度矩阵、E6 位格、E14 字节链                |
| P-F | **批量随机事件累积成分布/收敛**                       | PhET Plinko、GeoGebra MC、OSP@SG                                                        | E5 收敛曲线节奏（先单点可见、再累积成规律）     |
| P-G | **任务挑战/游戏化目标**                               | SQL Murder Mystery、Boolean's Pizza Palace、Fix This Chart、Cisco Binary Game           | E2 密码破解、E9 侦探题、E10 规则挑战            |
| P-H | **决策向导**（逐题回答走到结论）                      | Data-to-Viz                                                                             | E11 图型匹配骨架                                |
| P-I | **物理化/卡片化操作**                                 | CS Unplugged（Error Detection、Databases、Count the Dots）、Boolean Table Game          | E6/E10/E9 的"规则物化"设计来源                  |
| P-J | **真实素材**（真实照片/音频/信号）                    | Xiph（真实设备演示）、IDMIL（真实音频渲染）、E13 照片图库动机                           | E8 真实 440Hz、E13 真实照片——具身认知的唯一通道 |
| P-K | **双向操作**（画=改值/改值=画；字符↔字节互转）        | MNIST Interactive Model Analyzer、r12a app-encodings、numeric-toy                       | E4 反向还原、E14 双向编码、E12 位↔数值          |

---

## 4. 被证明体验差 / 教学效果存疑、应当避免的方案

| #    | 应避免                                        | 证据/失败样本                                                                       | 对我们的约束                                                                        |
| ---- | --------------------------------------------- | ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Q-1  | **网页 Excel 克隆 / 浏览器内仿真表格**        | Cengage SAM（高校 Office 课程标配，长期被师生批评"操作繁琐、判定机械、照着点按钮"） | E7 硬约束"只读展开式、不做表格编辑器"获得现实背书；E3/E9 也不做 Excel/Access 网页版 |
| Q-2  | **结果黑箱（只显示命中行/结果，不揭示原因）** | Excel 筛选、SQL 结果表、W3Schools TryIt                                             | E3 必须行级布尔判定可见；E9 必须"违规录入被拒+原因"                                 |
| Q-3  | **纯计算器 / 纯转换器形态**                   | PlanetCalc、Khan 二进制练习、各类转换工具                                           | E6/E12 形态禁令的行业印证："算对≠理解"                                              |
| Q-4  | **纯速度/反射游戏**                           | Cisco Binary Game 限时模式（重反射轻理解，不展示位权展开）                          | E6 不能做成打地鼠                                                                   |
| Q-5  | **纯代码运行实验**                            | Runestone π lab（命中判定过程被封装，学生看不到"每点怎么判"）                       | E5"命中判定可见"是硬约束                                                            |
| Q-6  | **选择题式预测**                              | Runestone/Khan 的 MCQ 预测题（排除法猜中率高、反馈粒度粗）                          | E1/E6 预测应输入具体数值而非四选一                                                  |
| Q-7  | **伪音频 / 缩尺音频**                         | 现有 1–8Hz 缩尺不可听（会误导）；Xiph/IDMIL 共识=必须真实可听                       | E8 必须真实 440Hz + 真实采样率                                                      |
| Q-8  | **黑箱压缩 / 黑箱模型对照**                   | JPEG 质量滑块类工具无教育成功先例；脚本训练曲线=伪模型                              | E13 不引入 JPEG 黑箱对照（分辨率×位深直控已覆盖教材目标）；E4 不用伪识别器          |
| Q-9  | **插件 / Java / LabVIEW 依赖**                | PSU 312applets（Java 已死）、DSPFirst LabVIEW（已不可用）                           | 坚持纯 HTML5/WebAudio——技术债决定教学演示寿命                                       |
| Q-10 | **无脚手架开发者工具直给学生**                | r12a（30+ 编码）、UniView、通用 UTF-8 encoder                                       | E14 查表必须嵌进任务链（先问→再查→验证→冲突演示收尾）                               |
| Q-11 | **图型切换器 / 匹配选择题**                   | 无任何先例证明其教学价值；被验证的替代全是任务型                                    | E11 必须"体验任务+误导反例"形态                                                     |
| Q-12 | **视频替代操作**                              | Xiph 权威但不可操作                                                                 | 验证环节必须是学生自己的参数与自己的感官                                            |
| Q-13 | **信息过载全量数据**                          | 784 像素全铺、30+ 编码下拉、IDMIL 8 面板 8 滑块                                     | 缩尺网格、3 种编码、精选滑块是必要裁剪                                              |
| Q-14 | **无引导、无任务的裸工具**                    | GeoGebra/OSP/Crypto Corner/数值玩具                                                 | 所有实验需任务目标+引导问题收口                                                     |
| Q-15 | **依赖单一网页形态**                          | The Boolean Game 原站已死（DNS 不可达）                                             | 交互设计必须能脱离具体站点独立成立，实验页面本身才是载体                            |

---

## 5. 对我们的直接启示（与既有筛选结论的互相印证）

### 5.1 空白点 = 差异化机会（无先例覆盖，做了就是首创）

| 实验 | 空白点                                         | 说明                                                                           |
| ---- | ---------------------------------------------- | ------------------------------------------------------------------------------ |
| E3   | **行级布尔判定原因可见 + 先预测后验证**        | 所有筛选类先例（Excel、SQL、Pizza Palace）都只给结果；"每行为什么被筛掉"无人做 |
| E9   | **约束（唯一/非空/范围）拒绝脏数据的交互教学** | SQL 约束教学只有文字讲解+TryIt，无"录入被拒+原因"机制                          |
| E10  | **学籍号/树牌号类"规则设计"教学交互**          | 校验码先例是计算器或编程作业，无"设计→校验→修正"课堂闭环                       |
| E12  | **补码加法自洽性现代交互**                     | 三表示对照/位值联动/进位可见各自存在，从未合一为教学产品                       |
| E5   | **种子可控 + 收敛曲线**                        | GeoGebra/OSP 均无种子控制与波动收敛历史                                        |
| E1   | **死循环预警**                                 | Python Tutor 的死循环只能手动停止                                              |

这些空白点**逐一对应阶段三筛选时提出的形态硬约束**（行级判定可见、约束拒脏数据、补码加法自洽、种子可控、死循环预警）——说明约束不是拍脑袋，而是建立在"先例缺失处"的差异化判断。

### 5.2 先例直接背书我们的形态约束

- E7 的"只读求值展开" ← Cengage SAM 失败样本（Q-1）
- E5 的"命中判定可见" ← Runestone 纯代码实验之坑（Q-5）
- E8 的"真实 440Hz" ← 伪音频之坑（Q-7）+ Xiph/IDMIL 共识
- E11 的"体验任务而非切换器/选择题" ← Q-11（无先例证明切换器价值）
- E13 的"不引入 JPEG 黑箱" ← Q-8（无教育先例）
- E14 的"三合一、查表嵌进任务链" ← KomuraSoft 两阶段框架 + Q-10

### 5.3 可直接复用的先例设计

- **E1**：Python Tutor 单步+变量表范式 + CS Circles 预测硬门控（先填数值才能步进）。
- **E2**：CS Field Guide Password Guesser 的参数化破解器结构（长度/字符集滑块 + 进度 + 时间）。
- **E4**：MNIST Digit Playground 的"画→784 像素→CSV 导出"——中间表示外显为可导出对象。
- **E5**：PhET Plinko"先单点可见、再批量累积"节奏 + OSP 收敛曲线。
- **E6/E12**：CS Unplugged 权重卡 + Code.org 位开关 + binaryvisual 进位可视化（bit 格原语的设计素材）。
- **E7**：Excel"公式求值"的子式高亮步进 + Mathspace"改数据看重算"。
- **E8**：IDMIL 的"波形/频谱+真实试听"双通道 + 量化噪声差值面板（取子集，不做 8 面板）。
- **E9**：CS Unplugged Databases 寻宝（字段决定可答问题）+ SQL Murder Mystery 任务化。
- **E10**：CS Unplugged Error Detection 的"设计→翻牌验证→发现漏洞"闭环 + 校验码生成/验证双模式。
- **E11**：NYT WGOTIG 读图任务 + Fix This Chart 修复任务 + Spot the Spin 误导手法清单（裁到 3–4 种图型）。
- **E13**：101computing"分辨率/色深双参数 + 逐像素展开 + 文件大小" + CS Field Guide"颜色=数字=位"递进。
- **E14**：KomuraSoft"两阶段心智模型（编号 vs 编码）+ 手算编码 + 错读视图"，编码裁剪到 ASCII/GB2312/UTF-8 三种。

---

## 6. 附：先例 URL 索引（全部经检索核实）

### E1 循环执行器

- Python Tutor — https://pythontutor.com/visualize.html
- Runestone CodeLens / CSAwesome Loop Analysis — https://runestone.academy/ns/books/published/overview/Visualizers/codelens.html ／ https://runestone.academy/ns/books/published/csawesome2/topic-2-12-loop-analysis.html
- CS Circles (Waterloo) — https://cscircles.cemc.uwaterloo.ca/
- Scratch — https://scratch.mit.edu/

### E2 枚举·密码锁

- How Secure Is My Password — https://howsecureismypassword.net
- CS Field Guide Password Guesser — https://www.csfieldguide.org.nz/
- Khan Academy 密码学 / Caesar 破解 — https://zh.khanacademy.org/computing/computer-science/cryptography
- Crypto Corner — https://crypto.interactive-maths.com/

### E3 筛选判定器

- Boolean's Pizza Palace (ACRL) — https://sandbox.acrl.org/resources/booleans-pizza-palace-costumer-orders-search-queries
- Boolean Table Game (Project CORA) — https://projectcora.org/assignment/boolean-table-game
- The Boolean Game（原站已失效；镜像 https://www.silvergames.com/en/boolean-method）

### E4 图像向量化

- MNIST Digit Playground (UCSD) — https://www.ccom.ucsd.edu/~cdeotte/programs/MNIST.html
- Google ML Practicum — https://developers.google.com/machine-learning/practica/image-classification
- MNIST Interactive Model Analyzer — https://github.com/LucaLow/MNIST-Interactive-Model-Analyzer
- friendly-digits-explorer — https://github.com/malminhas/friendly-digits-explorer

### E5 蒙特卡洛 π

- PhET Plinko Probability — https://phet.colorado.edu/simulations/plinko-probability
- GeoGebra Monte Carlo π — https://www.geogebra.org/m/ykduyzqu
- OSP@SG Monte Carlo Pi (HTML5) — https://www.sg.iwant2study.org/ospsgx/index.php/interactive-resources/mathematics/numbers-and-algebra/743-calculopi
- Runestone HTTLaCS π lab — https://runestone.academy/ns/books/published/httlacs/labs_approximating-the-value-of-pi.html

### E6 进制位权

- Cisco Binary Game — https://ciscolearningservices.my.site.com/cln/s/binary-game
- CS Unplugged Count the Dots — https://www.csunplugged.org/en/topics/binary-numbers/how-binary-digits-work-junior/
- Khan Academy 二进制数 — https://en.khanacademy.org/transcript/x61b7dde6ec186dc0
- Code.org CSP Unit 1 Binary/Overflow — https://studio.code.org/courses/csp-2023/units/1/lessons/4

### E7 公式求值

- Excel 公式求值（ExcelJet 演示）— https://exceljet.net/videos/how-to-step-through-complex-formulas-using-evaluate
- Mathspace — https://mathspace.co
- Cengage SAM（反面教材）— https://blog.cengage.com/the-power-of-sam-paths/

### E8 声音试听补强

- IDMIL Digital Audio Workbench — https://idmil.github.io/DigitalAudioWorkbench/
- Circles, Sines and Signals — https://jackschaedler.github.io/circles-sines-signals/
- Xiph "Digital Show & Tell" — https://xiph.org/video/vid2.shtml
- DSPFirst Quantizing demos（已过时，反面教训）— https://www.rose-hulman.edu/DSPFirst/dtsp/chapters/04samplin/demosLV/mp3/02QuantizingSong.htm

### E9 数据表设计

- SQLZoo — https://sqlzoo.net
- SQLBolt — https://sqlbolt.com
- SQL Murder Mystery — https://mystery.knightlab.com
- CS Unplugged《Databases》— https://classic.csunplugged.org/databases/

### E10 编码规则设计

- CS Unplugged《Error Detection》— https://www.csunplugged.org/en/topics/error-detection-and-correction/
- GS1 Check Digit Calculator — https://www.gs1.org/services/check-digit-calculator
- BarcodeFYI Check Digit Calculator — https://barcodefyi.com/tools/check-digit-calculator/

### E11 图表类型匹配

- Data-to-Viz — https://www.data-to-viz.com
- NYT What's Going On in This Graph — https://www.nytimes.com/column/whats-going-on-in-this-graph
- Fix This Chart (Amplify Polypad) — https://polypad.amplify.com/hr/lesson/fix-this-chart
- Spot the Spin (ACRL) — https://sandbox.acrl.org/resources/spot-spin-can-you-trust-data

### E12 补码自洽性

- PSU Signed Integer Representation（历史 applet，仅设计参考）— https://h3turing.vmhost.psu.edu/312applets/Website/EightBitSigned/applet.html
- PlanetCalc 补码计算器 — https://zen.planetcalc.com/747/
- numeric-toy — https://github.com/Novaturion/numeric-toy
- binaryvisual Adders & Subtractors — https://www.binaryvisual.com/digital-logic-design/adders-subtractors

### E13 图像补强

- 101 Computing Bitmap Image Simulator — https://www.101computing.net/bitmap-image-simulator/
- CS Field Guide 5.5 Images and Colours — https://csfieldguide.org.nz/en/chapters/data-representation/
- PBS Pixel Play（授权墙，参考）— https://www.pbslearningmedia.org/resource/buac20-912-sci-ps-pixelplay/how-code-relates-to-images/

### E14 文本编码链

- KomuraSoft 编码课程（同构度最高）— https://comcomponent.com/en/learning/character-encoding/
- r12a app-encodings — https://r12a.github.io/app-encodings/
- r12a UniView — https://r12a.github.io/uniview/
- CS Field Guide 5.4 Text — https://csfieldguide.org.nz/en/chapters/data-representation/

---

## 7. 关键结论（三句话）

1. **先例高度集中于少数几个被反复验证的 pattern**（单步+状态表、预测-揭示门控、参数滑块+即时反馈、并置对照、逐位展开、任务化）——我们的 14 个实验全部落在这些 pattern 的射程内，不存在需要发明全新交互范式的实验。
2. **先例空白点恰好等于我们的差异化机会**：E3 行级判定、E9 约束拒脏数据、E10 规则设计闭环、E12 补码自洽性、E5 种子+收敛曲线、E1 死循环预警——这六个空白点与阶段三的形态硬约束一一对应，说明筛选结论有外部实证支撑。
3. **最大的失败先例是"网页工具克隆"**（Cengage SAM 的 Excel 克隆、纯计算器、图型切换器、黑箱压缩）——它们共同指向一条铁律：**只做"软件黑箱里的机制揭示"，不做"软件的网页替代品"**，这与阶段二 D 的护栏 4 完全一致。
