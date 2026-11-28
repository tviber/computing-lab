# Human pre-flight protocol

Status: prepared for a first blind round with 2–4 real Chinese high-school students. The first round tests spontaneous discoverability, explanation, and unseen transfer; it is not a human learning-effect study. Teacher evaluation is a separate cohort and is never pooled with learner results.

## Cohorts and reporting

### Learner pre-flight

- Recruit 2–4 students who are not familiar with this project.
- Report student observations separately by participant; do not summarize teachers and students as one percentage.
- Measure spontaneous discoverability, human legibility, mental model, unseen transfer, and help requirement.

### Teacher evaluation

Run teacher sessions separately, with their own participant IDs and notes. They do not need to follow the same blind protocol. Ask teachers to evaluate:

- where the Lab belongs in a lesson;
- where a student is likely to stop or form a wrong model;
- what exact question the teacher would ask;
- which evidence is worth pausing the class to inspect;
- whether one teaching beat can fit into 5–15 minutes.

Teacher observations must not enter learner discoverability or transfer statistics. If only teachers are available for an initial visit, label it `teacher cohort` and do not report it as learner evidence.

## First round — blind learner pre-flight

Give each student only the URL and this neutral instruction:

> 请自由尝试这个实验，觉得有意思的地方可以多试几次。完成后，请用自己的话说说你看到了什么，以及你认为这些变化是怎样发生的。

Do not give students the current target-revealing PRE questions. Do not name the target mechanism, point to the intended control, or explain the vocabulary before exploration. The moderator may repeat the neutral instruction, but should not turn it into a guided lesson.

### Session flow

1. **Spontaneous exploration:** let the student choose the first action and continue until they say they have an explanation or stop making progress.
2. **Explanation:** ask only neutral follow-ups such as “你刚才注意到了什么？” and “你会怎样向同学解释？” Record the student’s own words before introducing any course term.
3. **Unseen transfer:** use the frozen canonical stimulus below, word for word. Give every learner the same item and the same information. Do not change the numbers or choose an easier item based on the student’s performance.
4. **Usability debrief:** ask which word, button, chart, or result was hardest to understand.

Do not count quiet thinking by itself as being blocked. Start the 60-second help rule only when the student shows no new action or hypothesis, says they do not know what to do, or asks for help. Then give the smallest possible intervention and record the exact words. Do not correct the student’s explanation during the session.

### First-round success signals

- Finds a meaningful control or evidence trail without being told where to click.
- Notices a change and can point to the visible evidence that supports it.
- Explains the observed mechanism in their own words, without merely repeating moderator vocabulary.
- Applies the explanation to the same frozen unseen-transfer item.
- Can identify what remains uncertain or what additional evidence they would need.

## First-round worksheets

The student receives no target-bearing PRE question. These are observer prompts and neutral debrief prompts only.

### Protocol Process

Observe whether the student discovers the prediction control, event queue, timeout evidence, and sender/receiver distinction without a cue.

After exploration, ask:

1. 你刚才注意到了哪些变化？
2. 哪一步让你最想解释？你会怎样向同学说明？
3. 按照下面的 Protocol canonical item 作答；请逐字给出题目，不要临时改数字。
4. 哪个词、按钮或图最难理解？

### Audio Encoding

Observe whether the student discovers the source, sampling, quantization, view, and playback controls, and whether they connect a visible change to the setting they changed.

After exploration, ask:

1. 你刚才看到哪些设置会改变结果？
2. 你会怎样向同学解释波形、采样点或试听声音的变化？
3. 按照下面的 Audio canonical item 作答；请逐字给出题目，不要临时改数字。
4. 哪个词、按钮或图最难理解？

### Relational Data

Observe whether the student discovers query steps, result rows, source records, and the later constraint evidence without being told where the explanation is.

After exploration, ask:

1. 你刚才看到哪些记录留下了，哪些记录消失了？
2. 你会怎样向同学解释一条结果是怎样得到的？
3. 按照下面的 Relational canonical item 作答；请逐字给出题目，不要临时改数字。
4. 哪个词、按钮或表格最难理解？

## Frozen unseen-transfer stimuli

Freeze these items before recruiting the first student. Give every learner the canonical item verbatim, with no extra hints and no changed numbers. The backup is used only if the student has already seen the canonical item through another session or materials; never select it to match a student’s ability.

### Protocol canonical item

**Participant prompt — read exactly:**

> 新的情境（页面中没有出现过）：
>
> - 0：发送方发送编号 `Q7` 的消息。
> - 2：接收方收到并处理 `Q7`。
> - 8：发送方仍没有看到确认，于是再次发送 `Q7`。
> - 10：接收方收到第二次 `Q7`。
>
> 请回答：接收方总共处理几次？在第 8 个时间单位，发送方能确定什么？请说明你的依据，不要求使用专业术语。

**Observer-only scoring reference:** one receiver-side processing; at time 8 the sender knows only that no confirmation has been observed, not whether the receiver processed the first message. Record the student’s reasoning, not just the final number.

**Backup — read exactly only for contamination:**

> 另一个新的情境：
>
> - 0：发送方发送编号 `Q8` 的消息，但第一份消息没有到达接收方。
> - 7：发送方仍没有看到确认，于是再次发送 `Q8`。
> - 9：接收方第一次收到 `Q8`。
> - 12：发送方看到确认。
>
> 请回答：接收方总共处理几次？在第 7 个时间单位，发送方能确定什么？请说明你的依据，不要求使用专业术语。

**Backup scoring reference:** one receiver-side processing; at time 7 the sender cannot know whether the first message was processed or lost, and the later confirmation supplies the missing evidence.

### Audio canonical item

**Participant prompt — read exactly:**

> 新的声音设置（页面中没有出现过这个组合）：
>
> - 纯音频率：`500 Hz`
> - 每秒取样：`800` 次
> - 每个采样值用 `3` 位表示
>
> **核心问题：**
>
> 1. 会不会发生混叠？为什么？
> 2. 如果想减少或避免这种现象，你会先改变哪个设置？
> 3. 每个采样值有多少个可选的量化级别？
>
> **可选的加强问题：** 如果你能根据刚才实验里看到的折叠规律判断，它大约会显示成多少 Hz？这道题不影响核心 transfer 结果。请说明你的依据，不要求使用专业术语。

**Observer-only scoring reference:** core transfer requires recognizing that 500 Hz is above the 400 Hz half-rate boundary, explaining that the sampling setting is too low for this component, suggesting a higher sampling frequency or a lower source frequency, and deriving 8 levels from 3 bits. The approximate 300 Hz folded result is a stronger optional transfer signal, not a core failure condition. Accept an equivalent explanation in the student’s own words.

**Backup — read exactly only for contamination:**

> 另一组新的声音设置：
>
> - 纯音频率：`700 Hz`
> - 每秒取样：`1200` 次
> - 每个采样值用 `4` 位表示
>
> **核心问题：**
>
> 1. 会不会发生混叠？为什么？
> 2. 如果想减少或避免这种现象，你会先改变哪个设置？
> 3. 每个采样值有多少个可选的量化级别？
>
> **可选的加强问题：** 如果你能根据刚才实验里看到的折叠规律判断，它大约会显示成多少 Hz？这道题不影响核心 transfer 结果。请说明你的依据，不要求使用专业术语。

**Backup scoring reference:** core transfer requires recognizing that 700 Hz is above the 600 Hz half-rate boundary, explaining that the sampling setting is too low for this component, suggesting a higher sampling frequency or a lower source frequency, and deriving 16 levels from 4 bits. The approximate 500 Hz folded result is a stronger optional transfer signal, not a core failure condition.

### Relational Data canonical item

The core transfer is stated in natural language because the Lab teaches relational behavior and source evidence, not SQL syntax. SQL is an optional secondary representation and is never required for the core score.

**Participant prompt — read exactly:**

> 下面是页面中没有出现过的三张小表。
>
> `players`
>
> | id  | name   |
> | --- | ------ |
> | p1  | 林     |
> | p2  | `NULL` |
> | p3  | `""`   |
>
> `teams`
>
> | id  | name     |
> | --- | -------- |
> | t7  | 机器人社 |
>
> `registrations`
>
> | player_id | team_id |
> | --------- | ------- |
> | p1        | t7      |
> | p2        | t7      |
> | p3        | t7      |
> | p4        | t7      |
>
> 现在把 `registrations` 中的每一条记录分别去 `players` 和 `teams` 中寻找相同的 id。只有两边都能找到对应记录时，这条报名才进入结果。结果中显示玩家姓名和社团名称。
>
> 请预测结果有几行，哪一条报名记录不会出现在结果中，以及 `NULL` 和 `""` 在结果中会怎样出现。请说明你的依据，不要求使用专业术语。

**Observer-only scoring reference:** three result rows; the `p4` registration disappears because there is no `players` row for `p4`; `NULL` and the empty string remain distinct values in the rows for `p2` and `p3`. Do not count SQL reading as part of this score.

**Optional secondary representation — do not read before the core answer:** if the student volunteers SQL knowledge or asks how the rule would be written, show this exact equivalent after recording the core response:

`SELECT players.name, teams.name FROM registrations JOIN players ON registrations.player_id = players.id JOIN teams ON registrations.team_id = teams.id`

**Backup — read exactly only for contamination:**

> 另一组三张小表：
>
> `visitors`
>
> | id  | name   |
> | --- | ------ |
> | v1  | 周     |
> | v2  | `NULL` |
> | v3  | `""`   |
>
> `rooms`
>
> | id  | name   |
> | --- | ------ |
> | r4  | 创客室 |
>
> `visits`
>
> | visitor_id | room_id |
> | ---------- | ------- |
> | v1         | r4      |
> | v2         | r4      |
> | v3         | r4      |
> | v9         | r4      |
>
> 现在把 `visits` 中的每一条记录分别去 `visitors` 和 `rooms` 中寻找相同的 id。只有两边都能找到对应记录时，这条访问才进入结果。结果中显示访客姓名和房间名称。
>
> 请预测结果有几行，哪一条访问记录不会出现在结果中，以及 `NULL` 和 `""` 在结果中会怎样出现。请说明你的依据，不要求使用专业术语。

**Backup scoring reference:** three result rows; the `v9` visit disappears because there is no `visitors` row for `v9`; `NULL` and the empty string remain distinct values. Do not count SQL reading as part of this score.

**Optional secondary representation — do not read before the core answer:** if the student volunteers SQL knowledge or asks how the rule would be written, show this exact equivalent after recording the core response:

`SELECT visitors.name, rooms.name FROM visits JOIN visitors ON visits.visitor_id = visitors.id JOIN rooms ON visits.room_id = rooms.id`

## Shared learner observer fields

- Participant ID / student background:
- Date / version:
- Device / viewport:
- Stimulus used: canonical / backup:
- If backup, contamination reason:
- First self-chosen action:
- Time to first meaningful action:
- Evidence trail found without a cue:
- First spontaneous explanation, verbatim:
- Frozen transfer response, verbatim:
- Confidence / uncertainty stated by student:
- Ignored control:
- First request for help:
- Whether 60 seconds reflected true blockage or quiet thinking:
- Moderator intervention and exact words:
- Surprising moment:
- Incorrect mental model:
- Could the student explain the mechanism from visible evidence?
- Could the student transfer the explanation to the frozen unseen case?

## Separate teacher observer fields

- Teacher ID / teaching background:
- Date / version:
- Intended class and lesson position:
- Likely student stopping point:
- Exact teacher question the Lab invites:
- Evidence worth pausing the class to inspect:
- Can one teaching beat fit in 5–15 minutes?
- Teacher’s suggested intervention, verbatim:

## Separate later cohort — PRE/POST study

If a measurable PRE/POST comparison is needed, run it with a separate cohort or after the blind learner round. Do not use these questions in the first blind round: they name the target concept or point students toward the intended distinction before exploration.

### Protocol Process PRE

1. 如果消息发出后一直没有回复，发送方能确定什么？
2. 同一条消息到达两次，接收方一定会执行两次吗？

### Audio Encoding PRE

1. 每秒取更多样本，可能改变什么？
2. 每个样本允许更多等级，可能改变什么？

### Relational Data PRE

1. 空文本和“没有值”是同一件事吗？
2. 子表记录找不到对应父表记录时，查询结果会怎样？

### Protocol Process POST

1. 你觉得这个实验主要想说明什么？
2. 哪一步让你改变了原来的想法？
3. 第一次数据 0 ms 发出并丢失；100 ms 超时；重试 40 ms 后到达。接收方执行几次？发送方何时成功？
4. 哪个词、按钮或图最难理解？

### Audio Encoding POST

1. 你觉得这个实验主要想说明什么？
2. 18 kHz 声音用 30 kHz 采样时，为什么可能听成较低频率？改哪个条件？
3. 哪个词、按钮或图最难理解？

### Relational Data POST

1. 你觉得这个实验主要想说明什么？
2. 这条结果来自哪些原始记录？哪条缺失会让结果消失？
3. 一个外键值是 `""`，另一个是 `NULL`；你会如何处理？
4. 哪个词、按钮或表格最难理解？

Use these later-study POST questions only after the relevant exploration, and keep them separate from the blind-round notes. They must not be presented as hints during the first session.
