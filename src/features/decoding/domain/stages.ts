/**
 * Stage contracts for the decoding lab — one thread through three encodings:
 * characters, binary representation, and a real BMP file. The single concept
 * every stage reinforces: **data + decoding rule → information** — a byte
 * stream has no built-in meaning until a decoder interprets it.
 *
 * Stage kinds drive both the payload shape and the console layout:
 *   "codes"       – a list of decimal integers → text decoder
 *   "bits"        – a list of 8-bit binary strings → bits→int→text decoder
 *   "bmp"         – a constrained 24-bit BMP byte stream → pixel decoder
 *   "bmp-script"  – same BMP, but a ready-made decode_bmp() is provided so
 *                   the student's code composes decoders instead
 *   "files"       – three mystery payloads, two provided decoders, judgment
 *
 * Concept prompts are server-verified option questions (same authority model
 * as the cpu lab's guided answers): passing means a complete all-correct set.
 */

export type DecodingKind = "codes" | "bits" | "bmp" | "bmp-script" | "files";

export type DecodingPrompt = {
  id: string;
  prompt: string;
  /** Exactly one option is correct; wrong picks may carry a note. */
  options: { label: string; correct?: boolean; note?: string }[];
  /** The "aha" line shown once answered correctly. */
  reveal: string;
};

export type DecodingStageDef = {
  index: number;
  id: string;
  title: string;
  englishTitle: string;
  track: "core" | "challenge";
  railAfter?: number;
  unlockAfter?: number[];
  kind: DecodingKind;
  mission: string;
  description?: string;
  /** What a submission is judged on, shown up front. */
  task: string;
  hint?: string;
  judgeNote: string;
  /** One-line concept recap shown when the stage passes. */
  takeaway: string;
  starterCode: string;
  /** Alternate cloze templates, picked per user — same concepts, different fills. */
  starterVariants?: readonly string[];
  example?: {
    input: string;
    output?: string;
    run?: boolean;
    /** __(n)__ blanks in `input` start prefilled with these expressions — students can edit and re-run. */
    blankDefaults?: Record<string, string>;
  };
  prompts?: DecodingPrompt[];
};

export const DECODING_STAGES: DecodingStageDef[] = [
  // ---------- 01 — 第一张密码纸 ----------
  {
    index: 1,
    id: "cipher-note",
    title: "第一张密码纸",
    englishTitle: "The Cipher Note",
    track: "core",
    kind: "codes",
    mission:
      "桌上有一张纸条，只留下一串数字，没有署名，也没有单词。旁边贴着课堂上那张字符编码表。它到底在说什么？",
    task: "提交 decode(data) 还原出的单词。每个人的密码纸都不一样，它随你的账号生成。",
    hint: "Python 的 chr(code) 返回 code 对应的字符。",
    judgeNote: "判定比对你提交的字符串与本关为你生成的那张密码纸。别人抄不了你的答案。",
    takeaway: "字符编码是「字符 ↔ 数值」的约定：一串数看不懂，配上约定就变成了单词。",
    example: {
      input: "data = [67, 65, 84]\ndecode(data)",
      output: '"CAT"',
    },
    starterCode: `def decode(data):
    # data: 一串十进制整数, 每个数对应编码表里的一个字符
    answer = ""
    for code in data:
        answer += __(1)__
    return answer
`,
    starterVariants: [
      `def decode(data):
    # data: 一串十进制整数, 每个数对应编码表里的一个字符
    answer = ""
    for n in data:
        answer += __(1)__
    return answer
`,
    ],
    prompts: [
      {
        id: "what-is-encoding",
        prompt: "把 67 还原成 'C'，靠的是什么？",
        options: [
          { label: "一张大家约定好的「数 → 字符」对照表", correct: true },
          {
            label: "数字 67 天生就长得像 C",
            note: "数只是数，是约定给了它含义。",
          },
          {
            label: "计算机自己认得所有字符",
            note: "没有对照表，计算机眼里也只有一堆数。",
          },
        ],
        reveal: "字符编码就是约定：同一个数换一张表可能变成别的字符。约定本身才叫编码。",
      },
    ],
  },

  // ---------- 02 — 0 和 1 没换密码 ----------
  {
    index: 2,
    id: "same-digits",
    title: "0 和 1 没换密码",
    englishTitle: "Same Number, New Suit",
    track: "core",
    kind: "bits",
    mission:
      "第二张密码纸上全是 0 和 1。发送方留言：还是同一张编码表，只是把每个数换成了二进制写法。",
    description:
      "每 8 位是一个字节。比如 01001000 写成十进制是 72、对应字符 'H'；int(s, 2) 可以把二进制字符串 s 转成十进制数。",
    task: "提交 decode(data) 还原出的整句话。data 是一组 8 位 0/1 字符串。",
    judgeNote: "判定比对你提交的句子与本关密文；概念题也必须全部答对。",
    takeaway: "二进制和十进制是同一个数的两种写法。写法是一层，数值对应哪个字符是另一层。",
    example: {
      input: 'data = ["01001000", "01101001"]\ndecode(data)',
      output: '"Hi"',
    },
    starterCode: `def decode(data):
    # data: 8 位一组的 0/1 字符串, 例如 ["01001000", "01101001"]
    answer = ""
    for s in data:
        # s 是一个二进制字符串
        n = int(s, 2)
        answer += __(1)__
    return answer
`,
    starterVariants: [
      `def decode(data):
    # data: 8 位一组的 0/1 字符串, 例如 ["01001000", "01101001"]
    answer = ""
    for s in data:
        # s 是一个二进制字符串
        n = __(1)__
        answer += chr(n)
    return answer
`,
    ],
    prompts: [
      {
        id: "repr-vs-encoding",
        prompt: "72 和 01001000 的关系是：",
        options: [
          { label: "同一个数的两种写法", correct: true },
          {
            label: "两套不同的字符编码",
            note: "编码表没变，变的只是数的写法。",
          },
          {
            label: "一个是明文，一个是密码",
            note: "它们表示的是同一个数。",
          },
        ],
        reveal: "把数写成二进制还是十进制只是写法不同，它对应的字符没有变。",
      },
      {
        id: "where-encoding",
        prompt: "字符编码真正起作用的是哪一步？",
        options: [
          { label: "把数解释成字符那一步", correct: true },
          {
            label: "把 bit 排成 8 位一组那一步",
            note: "分组只决定这个数是多少。",
          },
          {
            label: "把 0 和 1 写下来那一步",
            note: "写下写法不等于解释含义。",
          },
        ],
        reveal: "进制是数值的表示方式；编码是数值到字符的约定。两件事发生在不同层次。",
      },
    ],
  },

  // ---------- 03 — 救回一张 BMP ----------
  {
    index: 3,
    id: "rescue-bmp",
    title: "救回一张 BMP",
    englishTitle: "Rescue the Bitmap",
    track: "core",
    kind: "bmp",
    mission:
      "收到一个没有扩展名的文件：一长串字节，来源不明。前两个字节按字符表一读是 'BM'。这是张 BMP 图，目标就是右边那只猫。",
    description:
      "不用从零写：把格式约定逐条对到代码里的空上。题面会用到两种「倒序」写法：reversed(xs) 给出倒着取的 xs（常用在 for 里，原列表不变），xs.reverse() 则把 xs 这个列表就地翻转。",
    task: "补全 decode(data) 里的空，提交它还原出的像素矩阵。",
    hint: "像素数据的起点不用背，它写在文件头里：data[10] 开始存着一个整数。约定本身（B、G、R 顺序、最下面一行在最前面）都写在代码注释里，逐条对上去；翻转列表用 xs.reverse()（就地翻转原列表；reversed(xs) 只是倒着取、不改动它）。",
    judgeNote: "判定比对整张像素矩阵。",
    takeaway: "你一个字节都没改：数据没变，换的是解释规则。不同的 decoder 恢复出不同的信息。",
    example: {
      input: [
        "data = [0] * 54",
        "data[0:2] = [66, 77]  # 'BM'",
        "data[10] = 54         # 文件头写着: 像素数据从第 54 字节开始",
        "data[18] = 8          # 宽 = 8",
        "data[22] = 8          # 高 = 8",
        "for y in reversed(range(8)):  # BMP 从下往上存: 最后一行写在最前面",
        "    for x in range(8):",
        "        v = __(1)__           # 灰度值表达式, 可改: 第 0 行最亮, 第 7 行最暗",
        "        data += [v, v, v]     # 每像素 3 字节 B,G,R, 同值就是灰色",
        "print(data)",
      ].join("\n"),
      run: true,
      blankDefaults: { "1": "255 - y * 28" },
    },
    starterCode: `def decode(data):
    # data: 一个 BMP 文件的全部字节
    # 已确认的格式约定:
    #   像素数据的起点写在文件头里: data[10] 开始的字节存着一个整数
    #   每个像素 3 字节, 顺序是 B, G, R
    #   宽 8 高 8, 图像最下面一行存在最前面
    width = 8
    height = 8
    body = data[__(1)__:]
    pixels = []
    for y in range(height):
        row = []
        for x in range(width):
            i = (y * width + x) * 3
            b = body[i]
            g = body[i + 1]
            r = body[__(2)__]
            row.append([r, g, b])
        pixels.append(row)
    pixels.__(3)__
    return pixels
`,
    starterVariants: [
      `def decode(data):
    # data: 一个 BMP 文件的全部字节
    # BMP 约定:
    #   - 像素数据的起点写在文件头里: data[10] 开始的字节存着一个整数
    #   - 每个像素 3 个字节, 顺序是 B, G, R
    #   - 最下面一行存在最前面
    width = 8
    height = 8
    body = data[__(1)__:]
    pixels = []
    for y in range(height):
        row = []
        for x in range(width):
            i = (y * width + x) * 3
            b = body[i]
            g = body[__(2)__]
            r = body[i + 2]
            row.append([r, g, b])
        pixels.append(row)
    pixels.__(3)__
    return pixels
`,
      `def decode(data):
    # data: 一个 BMP 文件的全部字节
    # BMP 约定:
    #   - 像素数据的起点写在文件头里: data[10] 开始的字节存着一个整数
    #   - 每个像素 3 个字节, 顺序是 B, G, R
    #   - 最下面一行存在最前面
    width = 8
    height = 8
    body = data[data[10]:]
    pixels = []
    for y in range(height):
        row = []
        for x in range(width):
            i = (y * width + x) * 3
            b = __(1)__
            g = body[i + 1]
            r = __(2)__
            row.append([r, g, b])
        pixels.append(row)
    __(3)__
    return pixels
`,
    ],
    prompts: [
      {
        id: "signature-meaning",
        prompt: "你从字节流里读出的 'BM' 是：",
        options: [
          { label: "按字符规则解释开头两个字节的结果", correct: true },
          {
            label: "文件名的一部分",
            note: "文件名根本不在字节流里。",
          },
          {
            label: "图片自己打印的文字",
            note: "它只是两个数值，字符表一解释才成了标记。",
          },
        ],
        reveal: "签名是写文件的程序留下的约定：开头几个数值，用字符表一解释就成了 'BM'。",
      },
      {
        id: "data-untouched",
        prompt: "解码这张图的过程中，原始字节被改动过吗？",
        options: [
          { label: "没有，只是换了另一种解释规则", correct: true },
          {
            label: "改了，BGR 被换成了 RGB",
            note: "重排是解释方式；原字节流一个字节都没动。",
          },
          {
            label: "改了一个坏掉的字节",
            note: "这份数据完好无损；问题不在数据，而在解释。",
          },
        ],
        reveal: "同一份字节数据配上不同 decoder，恢复出的信息就不同。「这是什么」取决于怎么读。",
      },
    ],
  },

  // ---------- 04 — 同一串 bytes ----------
  {
    index: 4,
    id: "whose-bytes",
    title: "同一串 bytes",
    englishTitle: "Whose Bytes Are These",
    track: "challenge",
    railAfter: 3,
    unlockAfter: [3],
    kind: "files",
    mission:
      "三个没有扩展名的片段摆在面前。手里有两个现成的 decoder：decode_as_text 和 decode_as_image。",
    task: "为每个文件选定正确的 decoder，并提交该 decoder 的真实输出。",
    hint: "两个 decoder 用在错误的输入上「也能跑」。跑得出结果不代表解释对了。元数据是发送方留下的提示。",
    judgeNote: "判定核对每个文件的 decoder 选择与对应的解码输出。",
    takeaway: "bytes 本身没有类型魔法：文件格式、字符编码和元数据，才告诉程序该怎么解释它们。",
    starterCode: "",
    prompts: [
      {
        id: "how-to-decide",
        prompt: "两个 decoder 都跑出了结果，凭什么定哪个是真的？",
        options: [
          { label: "看哪个结果有意义，并且和元数据一致", correct: true },
          { label: "看哪个跑得快", note: "速度跟解释对不对没有关系。" },
          {
            label: "看哪个结果更长",
            note: "输出长度说明不了含义。",
          },
        ],
        reveal:
          "「能跑」不能作为证据。结果有意义，并且与元数据一致，才能说明解释正确。格式、编码规则和元数据共同决定解释方式。",
      },
    ],
  },

  // ---------- X1 — 图里藏了一句话 ----------
  {
    index: 5,
    id: "channel-secret",
    title: "图里藏了一句话",
    englishTitle: "A Message in the Channel",
    track: "challenge",
    railAfter: 3,
    unlockAfter: [3],
    kind: "bmp-script",
    mission:
      "这张 BMP 看着和第 3 关没什么不同。但情报说：发送方每隔一个像素，就往 R 通道里藏了一个字符编码，用 0 收尾。",
    description: "现成的 decode_bmp(data) 已经备好，它返回像素矩阵。你要做的只是取出藏着的情报。",
    task: "补全 decode(data) 里的空，提交它还原出的那句话。",
    hint: "像素矩阵先按行摊平；R 是 [r, g, b] 里的第 0 个分量；取出的编码值用 chr() 变回字符。",
    judgeNote: "判定比对提取出的字符串。",
    takeaway: "同一份文件里，不同区域可以有不同解释规则。decoder 也可以串起来用。",
    example: {
      input: [
        "data = [0] * 54",
        "data[0:2] = [66, 77]  # 'BM'",
        "data[10] = 54         # 像素数据从第 54 字节开始",
        "data[18] = data[22] = 8  # 宽 = 高 = 8",
        "msg = __(1)__         # 要藏进图里的话(编码表里的字符)",
        'assert len(msg) <= 31, "每隔一个像素只有 32 个槽, 还要留一个 0 收尾"',
        "flat = []",
        "for y in range(8):    # 先画一张图: 暖色渐变, R 恒亮",
        "    for x in range(8):",
        "        flat.append([220, 60 + y * 15, 120 + x * 10])",
        "for i in range(0, 64, 2):  # 每隔一个像素是一个槽位",
        "    slot = i // 2",
        "    flat[i][0] = ord(msg[slot]) if slot < len(msg) else 0  # 编码写进 R, 0 收尾",
        "for y in reversed(range(8)):  # BMP 从下往上存",
        "    for x in range(8):",
        "        p = flat[y * 8 + x]",
        "        data += [p[2], p[1], p[0]]  # 按 B, G, R 写",
        "print(data)",
      ].join("\n"),
      run: true,
      blankDefaults: { "1": '"HI"' },
    },
    starterCode: `def decode(data):
    # 提供了 decode_bmp(data): 返回像素矩阵 [[[r, g, b], ...], ...]
    pixels = decode_bmp(data)
    flat = []
    for row in pixels:
        for pixel in row:
            flat.append(pixel)
    message = ""
    for i in range(0, len(flat), __(1)__):   # 每隔一个像素取一个
        code = flat[i][__(2)__]              # R 是 [r, g, b] 里的第几个分量?
        if code == 0:
            break
        message += chr(__(3)__)
    return message
`,
    starterVariants: [
      `def decode(data):
    # 提供了 decode_bmp(data): 返回像素矩阵 [[[r, g, b], ...], ...]
    pixels = decode_bmp(data)
    flat = []
    for row in pixels:
        for pixel in row:
            flat.append(pixel)
    message = ""
    for i in range(0, len(flat), 2):        # 每隔一个像素取一个
        code = flat[i][0]                    # R 分量
        if code == __(1)__:
            break
        message += __(2)__
    return message
`,
    ],
  },

  // ---------- X2 — 修好坏掉的 decoder ----------
  {
    index: 6,
    id: "fix-the-decoder",
    title: "修好坏掉的 decoder",
    englishTitle: "Fix the Decoder",
    track: "challenge",
    railAfter: 3,
    unlockAfter: [3],
    kind: "bmp",
    mission:
      "同事留下的 decoder 信誓旦旦能解 BMP，跑出来的却是一团乱。代码就在编辑器里，逐行找出它哪里读错了。",
    description: "和第 3 关确认的格式约定逐行对照。注释里是同事写错的版本。",
    task: "修好 decode(data)，提交它跑出的像素矩阵。还原出的应该还是那只猫。",
    hint: "同事的错法各不相同：起点写死了、行列对调了、读错了数组、通道顺序记反了、行序漏了。每个空都对回第 3 关的约定。行序那空要把列表就地翻转：pixels.reverse()。",
    judgeNote: "判定比对整张像素矩阵，每个空都不能错。",
    takeaway: "decoder 里每个常量都是一条约定。写错任何一条，同一份数据就变成乱码。",
    example: {
      input: [
        "data = [0] * 54",
        "data[0:2] = [66, 77]  # 'BM'",
        "data[10] = 54         # 像素数据从第 54 字节开始",
        "data[18] = data[22] = 8  # 宽 = 高 = 8",
        "glyph = [  # 一支向上的箭, 8x8 位图",
        '    "...#....",',
        '    "..###...",',
        '    ".#####..",',
        '    "...#....",',
        '    "...#....",',
        '    "...#....",',
        '    "..###...",',
        '    ".#####..",',
        "]",
        "ink = __(1)__         # 箭的颜色, 按 R, G, B 写",
        "for y in reversed(range(8)):  # BMP 从下往上存",
        "    for x in range(8):",
        '        c = ink if glyph[y][x] == "#" else [245, 245, 245]',
        "        data += [c[2], c[1], c[0]]  # 每像素按 B, G, R 写",
        "print(data)",
      ].join("\n"),
      run: true,
      blankDefaults: { "1": "[220, 40, 40]" },
    },
    starterCode: `def decode(data):
    # data: 一个 BMP 文件的全部字节
    # 同事的版本解出来是乱图; 注释里是他写错的写法, 把空填对
    width = 8
    height = 8
    body = data[__(1)__:]      # 同事写的是 45
    pixels = []
    for y in range(height):
        row = []
        for x in range(width):
            i = (__(2)__) * 3  # 同事写的是 (x * height + y), 行列对调了
            b = __(3)__        # 同事写的是 data[i], 读进文件头里了
            g = body[i + 1]
            r = __(4)__        # 同事写的是 body[i], 他记成了 R, G, B
            row.append([r, g, b])
        pixels.append(row)
    __(5)__                    # 同事什么都没写; 想想行序约定
    return pixels
`,
  },
];

export const DECODING_CORE_STAGES = DECODING_STAGES.filter((s) => s.track === "core");

export function getDecodingStage(index: number): DecodingStageDef | undefined {
  return DECODING_STAGES.find((s) => s.index === index);
}

/**
 * Which cloze template this user gets: the canonical starter plus its
 * variants, picked deterministically by seed so neighbours can't read the
 * blanks off each other's screens.
 */
export function starterCodeFor(stage: DecodingStageDef, seed: number): string {
  const pool = [stage.starterCode, ...(stage.starterVariants ?? [])];
  return pool[seed % pool.length];
}

/** Core stages unlock linearly; challenges need their explicit prerequisites. */
export function decodingStageUnlocked(passedStages: readonly number[], index: number): boolean {
  const stage = getDecodingStage(index);
  if (!stage) return false;
  if (stage.unlockAfter) return stage.unlockAfter.every((i) => passedStages.includes(i));
  return index === 1 || passedStages.includes(index - 1);
}

/**
 * Next stage to work on: the main line walks core stages only — passing 1-3
 * finishes the classwork. Once the main line is done, the pointer flows
 * into the first unpassed side stage so the rail never dead-ends.
 */
export function nextDecodingStage(passedStages: readonly number[]): number {
  for (const stage of DECODING_CORE_STAGES) {
    if (!passedStages.includes(stage.index)) return stage.index;
  }
  for (const stage of DECODING_STAGES) {
    if (!passedStages.includes(stage.index)) return stage.index;
  }
  return DECODING_STAGES.length + 1;
}
