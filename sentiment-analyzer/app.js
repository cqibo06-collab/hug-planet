/* ============ 心晴分析 · 中文情感分析器 ============
 * 方法学依据：
 *  - 《文本情感分析综述》软件学报 2010, 21(8): 1834-1848（情感词典法路线）
 *  - 徐琳宏, 林鸿飞等. 情感词汇本体的构造. 情报学报, 2008
 *    （大连理工情感本体：7 大类情感 乐/好/怒/哀/惧/恶/惊，词强 1~7 级）
 *  - 通用规则：情感分 = 词强 × 程度副词权重 × 否定反转（奇数次取反），
 *    辅以表情符号与标点（感叹号增强）特征
 */
"use strict";

/* ---------- 七大类情感（大连理工体系） ---------- */
const EMOTIONS = {
  joy:      { name: "乐 · 快乐", color: "#f6b73c", icon: "😄" },
  love:     { name: "好 · 喜爱", color: "#f28bb1", icon: "🥰" },
  anger:    { name: "怒 · 愤怒", color: "#e05252", icon: "😡" },
  sadness:  { name: "哀 · 悲伤", color: "#7a8bd9", icon: "😢" },
  fear:     { name: "惧 · 恐惧", color: "#5fb0a0", icon: "😨" },
  disgust:  { name: "恶 · 厌恶", color: "#9c7bd8", icon: "🤢" },
  surprise: { name: "惊 · 惊讶", color: "#58b1e8", icon: "😲" },
};

/* ---------- 情感词典（强度 1~7，仿情感词汇本体） ---------- */
const RAW = {
  joy: {
    开心: 5, 高兴: 5, 快乐: 5, 愉快: 5, 欢乐: 5, 喜悦: 5, 兴奋: 5, 激动: 5,
    幸福: 6, 陶醉: 4, 欣喜: 5, 狂喜: 7, 舒畅: 4, 爽: 4, 得意: 4, 满足: 4,
    安心: 4, 放心: 3, 舒服: 4, 轻松: 3, 甜: 3, 美滋滋: 5, 喜出望外: 6,
    心花怒放: 7, 兴高采烈: 6, 手舞足蹈: 5, 乐呵呵: 4, 笑嘻嘻: 3, 憧憬: 3,
    期待: 3, 乐观: 3, 自豪: 4, 骄傲: 4, 庆幸: 4, 释放: 2, 解压: 3, 痛快: 4,
    过瘾: 4, 来劲: 3, 起劲: 3, 尽兴: 4, 治愈: 4, 萌: 3, 有趣: 3, 好玩: 3,
    笑: 3, 微笑: 3, 欢笑: 4, 精彩: 4, 顺利: 3, 圆满: 4, 成功: 4, 赢: 4, 中奖: 5, 发财: 5,
    /* 网络用语 */
    yyds: 6, 绝绝子: 5, 笑死: 4, 笑不活了: 4, xswl: 4, 好耶: 4, 芜湖: 3,
    哇塞: 4, 不错: 3, 有趣: 3,
    奥利给: 4, 上头: 4, 磕到了: 4, 真香: 3, 爷青回: 5, 双厨狂喜: 5,
    梦幻联动: 4, awsl: 5, nsdd: 4, 冲鸭: 3, 干饭: 2, 拿捏: 2, 甜哭: 4, 暖哭: 4, 加薪: 5,
    放假: 4, 惊喜: 5, 惊艳: 5, 爽快: 4, 帅气: 3, 灵感: 3, 顿悟: 4, 豁然开朗: 5,
  },
  love: {
    喜欢: 4, 爱: 6, 热爱: 6, 心爱: 5, 喜爱: 4, 宠爱: 4, 恋爱: 4, 心动: 4,
    想念: 3, 思念: 3, 迷恋: 4, 着迷: 4, 沉迷: 3, 陶醉: 4, 羡慕: 3, 尊敬: 4,
    尊重: 3, 敬佩: 5, 佩服: 4, 赞: 3, 赞美: 4, 赞扬: 4, 表扬: 4, 夸: 3,
    感谢: 4, 感激: 5, 感恩: 5, 温暖: 4, 温馨: 4, 贴心: 4, 暖心: 4, 幸运: 4,
    可爱: 3, 美: 3, 美丽: 4, 漂亮: 4, 好看: 3, 帅: 3, 优秀: 4, 出色: 4, 卓越: 5,
    好: 3, 精美: 4, 精致: 4, 便宜: 2, 快: 2, 优雅: 3, 高: 1, 顺利: 3,
    完美: 5, 棒: 4, 厉害: 4, 牛: 4, 强: 3, 靠谱: 3, 信任: 4, 可靠: 3,
    亲切: 3, 友善: 3, 热情: 3, 真诚: 4, 善良: 4, 正能量: 4, 支持: 3,
    认可: 3, 肯定: 3, 推荐: 3, 值得: 3, 心疼: 3, 守护: 3, 陪伴: 3, 拥抱: 3,
    磕cp: 3, 神仙: 4, 宝藏: 3, 天花板: 4, 氛围感: 3, 出片: 3, 回购: 3,
    美味: 4, 好吃: 4, 香: 3, 新鲜: 3, 干净: 3, 整洁: 3, 舒适: 4, 方便: 3,
  },
  anger: {
    生气: 5, 愤怒: 6, 气愤: 5, 恼火: 4, 恼怒: 5, 火大: 5, 暴怒: 7, 狂怒: 7,
    气死: 6, 可恶: 5, 讨厌: 4, 厌烦: 4, 烦人: 4, 烦: 3, 易怒: 4, 暴躁: 4,
    气人: 4, 无语: 3, 无奈: 3, 憋屈: 4, 愤慨: 5, 义愤填膺: 6, 怒吼: 5,
    忍无可忍: 6, 火冒三丈: 6, 怒发冲冠: 6, 欺负: 4, 欺骗: 5, 骗: 4, 背叛: 6,
    辜负: 4, 抵触: 3, 反感: 4, 抗议: 4, 抱怨: 3, 埋怨: 3, 责怪: 3, 谴责: 4,
    差劲: 4, 离谱: 4, 过分: 4, 过度: 2, 混蛋: 5, 垃圾: 4, 蠢: 4, 恶心人: 4,
    /* 网络用语（强度恒为正，极性由桶决定） */
    栓Q: 3, 服了: 2.5, 拉胯: 3, 下头: 3, 翻车: 3, 割韭菜: 4, 韭菜: 3,
    抬杠: 3, 杠精: 4, 阴阳怪气: 4, yygq: 3, PUA: 4, 醉了: 2.5, 离大谱: 4,
    麻烦: 2.5, 烦死: 3.5, 急死: 3, 愁死: 3, 累死: 3.5,
  },
  sadness: {
    难过: 5, 伤心: 5, 悲伤: 5, 悲痛: 6, 哀伤: 5, 哭: 4, 泪: 3, 眼泪: 3,
    痛苦: 6, 痛心: 6, 心痛: 5, 心碎: 6, 绝望: 7, 失望: 4, 失落: 4, 沮丧: 4,
    消沉: 4, 低落: 3, 忧伤: 4, 忧郁: 4, 郁闷: 4, 愁: 3, 苦恼: 4, 烦恼: 4,
    孤独: 4, 寂寞: 4, 空虚: 4, 无助: 4, 委屈: 4, 心酸: 4, 辛酸: 4, 可怜: 3,
    惋惜: 3, 遗憾: 3, 抱歉: 2, 愧疚: 4, 内疚: 4, 后悔: 4, 悔恨: 5, 怀念: 3,
    想哭: 4, 崩溃: 5, 破防: 4, 累: 3, 疲惫: 3, 疲倦: 3, 心累: 4, 无力: 3,
    压抑: 4, 消极: 4, 颓废: 4, 摆烂: 3, 凉: 2, 寒心: 5, 沮丧透顶: 6,
    勉强: 2, 无可奈何: 3, 一蹶不振: 5, 黯然: 4, 泪崩: 5, 泪目: 3, 心如刀割: 6, 万念俱灰: 7,
    /* 网络用语 */
    emo: 3, emo了: 3, 裂开: 3, 破大防: 4, 扎心: 3, 酸了: 2, 柠檬了: 2,
    麻了: 2, 蚌埠住了: 1.5, 绷不住了: 1.5, 累觉不爱: 3, 舔狗: 3, 内卷: 2.5,
    糟糕: 5, 失败: 4, 差评: 4, 恶劣: 4, 低: 1,
    /* 口语吐槽 */
    死掉了: 3, 要死了: 3, 咋办: 2, 怎么办: 2, 咋弄: 2, 没招: 2, 没辙: 2,
    头大: 2, 抓瞎: 2, 无力吐槽: 3, 崩溃了: 3, 晕: 1.5,
  },
  fear: {
    害怕: 5, 恐惧: 6, 恐慌: 6, 惊恐: 6, 畏惧: 5, 胆怯: 4, 紧张: 3, 焦虑: 4,
    焦躁: 4, 不安: 4, 担心: 3, 担忧: 4, 忧虑: 4, 心慌: 4, 慌张: 4, 慌: 3,
    压力: 3, 煎熬: 5, 折磨: 5, 不知所措: 4, 手足无措: 4, 忐忑: 4, 提心吊胆: 5,
    心惊胆战: 5, 畏缩: 3, 逃避: 3, 不敢: 3, 危险: 3, 威胁: 4, 可怕: 4,
    恐怖: 5, 阴森: 4, 惶恐: 5, 焦头烂额: 4, 心力交瘁: 5, 坐立不安: 4,
    发抖: 4, 发愁: 3, 心惊肉跳: 5, 胆战心惊: 5, 毛骨悚然: 5,
    /* 网络用语 */
    社死: 3.5, 尴尬死了: 3, 汗流浃背: 2, 寄了: 3, 凉凉: 3,
  },
  disgust: {
    厌恶: 5, 憎恶: 6, 憎恨: 6, 恨: 5, 讨厌透顶: 6, 唾弃: 5, 鄙视: 4, 轻蔑: 4,
    看不起: 3, 嘲笑: 4, 嘲讽: 4, 讽刺: 4, 挖苦: 4, 羞辱: 5, 侮辱: 5,
    恶心: 4, 呕吐: 3, 反胃: 3, 腥臭: 3, 臭: 3, 脏: 3, 邋遢: 3, 丑: 3,
    难看: 3, 难吃: 4, 难闻: 3, 腐烂: 3, 变质: 3, 虚伪: 4, 假: 2, 装腔作势: 4,
    无耻: 5, 卑鄙: 5, 龌龊: 5, 肮脏: 4, 庸俗: 3, 低俗: 3, 无聊: 3, 乏味: 3,
    差: 3, 烂: 4, 垃圾: 4, 劣质: 4, 假货: 4, 坑: 3, 骗子: 5, 黑心: 5, 贵: 3,
  },
  surprise: {
    惊讶: 0, 吃惊: 0, 惊呆: 0, 惊奇: 0, 惊诧: 0, 震惊: 0, 意外: 0,
    不可思议: 0, 目瞪口呆: 0, 瞠目结舌: 0, 万万没想到: 0, 居然: 0, 竟然: 0,
    没想到: 0, 出乎意料: 0, 突然: 0, 难以置信: 0, 罕见: 0, 稀奇: 0, 新奇: 0,
    眼见为实: 0, 惊掉下巴: 0, 美观: 0,
  },
};

/* 程度副词（权重系数） */
const DEGREES = {
  极其: 2, 极为: 2, 极端: 2, 极度: 2, 万分: 2, 最: 1.9, 太: 1.8, 超: 1.8, 狂: 1.8,
  非常: 1.75, 特别: 1.75, 十分: 1.75, 异常: 1.75, 格外: 1.6, 相当: 1.5,
  很: 1.5, 蛮: 1.4, 挺: 1.4, 颇: 1.4, 比较: 1.3, 较为: 1.3, 较: 1.25,
  更: 1.2, 越发: 1.5, 越来越: 1.5, 日益: 1.4, 有点: 0.6, 有点儿: 0.6,
  有些: 0.6, 稍微: 0.5, 稍稍: 0.5, 略微: 0.5, 略: 0.5, 一点: 0.7, 一点点: 0.6,
};
/* 否定词（出现奇数次 → 极性反转） */
const NEGATIONS = ["不", "没", "没有", "无", "非", "未", "别", "莫", "勿", "毫不", "从不", "从未", "并不", "绝不", "从不曾", "并不曾"];
/* 转折词（其后 50 字内的情感词权重 ×1.5，文献通用增强） */
const TRANSITIONS = ["但是", "可是", "然而", "不过", "偏偏", "只是", "却", "但"];
const TRANS_BOOST = 1.5, TRANS_WINDOW = 50;

/* ---------- 对象词库（方面级情感分析：情感词归给同句最近的名词对象） ---------- */
const ASPECTS = {
  service: { name: "服务态度", color: "#58b1e8",
    words: ["服务态度", "服务", "态度", "客服", "店员", "服务员", "小哥", "老板", "前台", "售后"] },
  food:    { name: "味道菜品", color: "#f6b73c",
    words: ["菜品", "味道", "口味", "食物", "咖啡", "奶茶", "甜品", "汤", "米饭", "火锅", "烧烤", "小吃", "食材", "分量", "上菜", "菜"] },
  price:   { name: "价格", color: "#9c7bd8",
    words: ["性价比", "价格", "价钱", "价位", "收费", "客单价"] },
  env:     { name: "环境", color: "#5fb0a0",
    words: ["环境", "装修", "装潢", "卫生", "座位", "店面", "空间"] },
  logi:    { name: "物流配送", color: "#f28bb1",
    words: ["快递", "配送", "物流", "发货", "送货", "送餐", "包裹"] },
  speed:   { name: "速度效率", color: "#8aa8b8",
    words: ["速度", "效率", "出餐", "工期", "进度"] },
  quality: { name: "质量做工", color: "#d99a2b",
    words: ["质量", "品质", "做工", "材质", "包装", "质感", "手感"] },
};
const ASP_LOOKUP = {};
for (const [key, a] of Object.entries(ASPECTS)) for (const w of a.words) ASP_LOOKUP[w] = key;
const ASP_KEYS = Object.keys(ASP_LOOKUP).sort((a, b) => b.length - a.length);

/* 表情符号 [分值, 情绪]（分值单位与词强一致，负=消极） */
const EMOJI = {
  "😀": 2, "😃": 2, "😄": 2.5, "😁": 2, "😆": 2, "🤣": 3, "😂": 3, "🙂": 1.5,
  "😉": 1.5, "😊": 2, "🥰": 3, "😍": 3, "🤩": 3, "😘": 2.5, "😗": 2, "😎": 2,
  "🤗": 2, "🎉": 2.5, "🎊": 2, "❤️": 3, "🧡": 2.5, "💛": 2.5, "💙": 2.5,
  "💜": 2.5, "💖": 3, "💗": 3, "💕": 3, "🌹": 2, "👍": 2, "🙏": 1.5, "✌️": 2,
  "🔥": 1.5, "⭐": 1.5, "🌈": 1.5, "☀️": 1.5, "🎁": 1.5, "🏆": 2.5, "💪": 2,
  "😢": -2.5, "😭": -3.5, "🥺": -2, "🙁": -1.5, "😞": -2.5, "😔": -2.5,
  "😟": -2, "😕": -1.5, "☹️": -2.5, "😣": -2.5, "😖": -2.5, "😫": -3,
  "😩": -3, "🥲": -2, "💔": -4, "🔪": -1, "😤": -2.5, "😡": -4, "🤬": -4.5,
  "💢": -2, "🖕": -3, "👎": -2.5, "😱": -3.5, "😨": -3, "😰": -3, "😥": -2,
  "😓": -2, "🤦": -1.5, "🙈": -1, "🤢": -3.5, "🤮": -4, "💩": -2.5,
  "😷": -1, "🥵": -2, "🥶": -1.5, "😶": -0.5, "🙄": -1.5, "翻白眼": -1.5,
};

/* ---------- 工具 ---------- */
const $ = (id) => document.getElementById(id);
let toastT = null;
function toast(t) {
  const el = $("toast"); el.textContent = t; el.classList.add("show");
  clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove("show"), 2200);
}
function esc(s) { return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }
const LS = {
  get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

/* ---------- 预处理：展平词典 + 用户自定义词典，按词长降序（贪婪最长匹配） ---------- */
let WORDS = {};     /* 词 -> {e, i, pol} */
let WORD_KEYS = [];
function rebuildWordIndex() {
  WORDS = {};
  for (const [emo, ws] of Object.entries(RAW)) {
    const pol = emo === "joy" || emo === "love" ? 1 : emo === "surprise" ? 0 : -1;
    for (const [w, i] of Object.entries(ws)) WORDS[w] = { e: emo, i: Math.abs(i), pol };
  }
  /* 用户自定义：{词: ±强度}，正→乐，负→哀 */
  for (const [w, v] of Object.entries(LS.get("xin_dict", {}))) {
    if (typeof v !== "number" || !v) continue;
    WORDS[w] = { e: v > 0 ? "joy" : "sadness", i: Math.min(7, Math.abs(v)), pol: v > 0 ? 1 : -1 };
  }
  WORD_KEYS = Object.keys(WORDS).sort((a, b) => b.length - a.length);
}
const DEG_KEYS = Object.keys(DEGREES).sort((a, b) => b.length - a.length);
const TRA_KEYS = [...TRANSITIONS].sort((a, b) => b.length - a.length);

const maxLen = (arr) => arr.reduce((m, k) => Math.max(m, k.length), 1);

/* 在 text 的 pos 处尝试匹配词表 */
function matchAt(text, pos, dict) {
  for (const k of dict) {
    if (k.length <= text.length - pos && text.startsWith(k, pos)) return k;
  }
  return null;
}

/* ---------- 人格画像（大五模型 · LIWC 式词频法） ----------
 * 方法学：词频类别统计与人格稳定相关（Mehl, Gosling & Pennebaker, 2006；
 * C-LIWC 中文词表思路）；框架为大五 OCEAN，词条参考中文人格特质词研究 */
const PERS = {
  o: { name: "开放性", hi: "创意脑", lo: "务实派", words: {
    想象: 3, 创意: 4, 创造: 4, 创新: 4, 好奇: 3, 探索: 3, 尝试: 2, 新鲜: 2,
    艺术: 3, 设计: 2, 学习: 2, 读书: 2, 思考: 3, 哲学: 3, 科幻: 3, 旅行: 3,
    体验: 2, 灵感: 3, 脑洞: 4, 文艺: 3, 摄影: 2, 画画: 2, 研究: 2, 原理: 2,
    为什么: 1, 独特: 3, 改变: 2, 挑战: 2, 折腾: 2, 自学: 3,
  } },
  c: { name: "尽责性", hi: "自律型", lo: "随性派", words: {
    计划: 4, 安排: 2, 认真: 4, 仔细: 3, 负责: 4, 坚持: 4, 自律: 4, 努力: 3,
    勤奋: 3, 整理: 2, 按时: 3, 准时: 3, 完成: 2, 目标: 3, 执行: 2, 细节: 2,
    稳妥: 2, 提前: 3, 规划: 3, 条理: 3, 拖延: -3, 懒: -3, 敷衍: -4,
    马虎: -3, 磨蹭: -2, 摆烂: -2,
  } },
  e: { name: "外向性", hi: "外向", lo: "内向", words: {
    朋友: 3, 聚会: 4, 聊天: 2, 热闹: 3, 出去玩: 3, 社交: 4, 认识: 2, 大家: 1,
    一起: 2, 分享: 3, 唱歌: 2, 团建: 3, 撸串: 3, 见面: 2, 出门: 2, 主动: 2,
    热情: 2, 一个人: -2, 独处: -2, 宅: -2, 安静: -1, 孤独: -2,
  } },
  a: { name: "宜人性", hi: "暖心", lo: "直率", words: {
    谢谢: 4, 感谢: 3, 抱歉: 2, 不好意思: 2, 帮: 2, 帮忙: 4, 体谅: 3, 理解: 2,
    温柔: 3, 耐心: 3, 安慰: 3, 鼓励: 3, 辛苦: 2, 对不起: 3, 随和: 2, 商量: 2,
    陪伴: 2, 原谅: 2, 计较: -3, 嘲讽: -2, 自私: -4, 冷漠: -3, 抬杠: -3,
  } },
  n: { name: "神经质", hi: "敏感", lo: "沉稳", words: {
    焦虑: 4, 担心: 2, 压力: 3, 失眠: 3, 烦: 2, 敏感: 3, 胡思乱想: 4, 心慌: 2,
    内耗: 4, 纠结: 3, 犹豫: 2, 情绪化: 3, 想太多: 3, 紧张: 2, 崩溃: 3,
    委屈: 3, 淡定: -3, 从容: -3, 稳: -1, 无所谓: -2,
  } },
};

const NEG_SORTED = [...NEGATIONS].sort((a, b) => b.length - a.length);
/* 数否定词：先匹配长词并占位，防止"从不"里的"不"被重复计数 */
function countNeg(str) {
  let neg = 0;
  for (const n of NEG_SORTED) {
    let idx = str.indexOf(n);
    while (idx !== -1) {
      neg++;
      str = str.slice(0, idx) + "#".repeat(n.length) + str.slice(idx + n.length);
      idx = str.indexOf(n);
    }
  }
  return neg;
}

const PERS_LOOKUP = {};
for (const [k, cfg] of Object.entries(PERS)) for (const w of Object.keys(cfg.words)) PERS_LOOKUP[w] = k;
const PERS_KEYS = Object.keys(PERS_LOOKUP).sort((a, b) => b.length - a.length);

function computePersonality(text, aux) {
  const raw = { o: 0, c: 0, e: 0, a: 0, n: 0 };
  const evid = { o: 0, c: 0, e: 0, a: 0, n: 0 };

  /* 子句切分：问句里的词是"在问"不是"在说"，跳过 */
  const clauses = [];
  {
    let start = 0;
    for (let idx = 0; idx <= text.length; idx++) {
      const ch = text[idx];
      if (idx === text.length || /[。！？!?；;，,\n]/.test(ch)) {
        clauses.push({ s: start, e: idx, q: /[？?]/.test(text.slice(start, idx + 1)) });
        start = idx + 1;
      }
    }
  }
  const inQuestion = (pos) => {
    const c = clauses.find(cc => pos >= cc.s && pos < cc.e);
    return c ? c.q : false;
  };

  /* 句首人名指他：句子以"类人名短词+程度/否定"开头且无自我指涉 → 整句在说别人 */
  const SUBJ_STOP = new Set(["今天", "昨天", "前天", "明天", "最近", "现在", "平时", "日常",
    "大家", "自己", "我们", "感觉", "觉得", "发现", "果然", "居然", "其实", "突然",
    "还是", "真的", "就是", "生活", "工作", "学习", "上班", "上课", "考试", "项目",
    "手机", "电脑", "这次", "那次", "有时候", "老板娘", "别的", "其他"]);
  function sentenceAboutOther(sentence) {
    if (/[我]|自己/.test(sentence)) return false; /* 有自我指涉 → 不算纯说别人 */
    const s = sentence.replace(/^[^\u4e00-\u9fa5A-Za-z0-9]+/, "");
    for (const len of [3, 2]) {
      const tok = s.slice(0, len);
      if (!tok || !/^[\u4e00-\u9fa5]+$/.test(tok)) continue;
      if (SUBJ_STOP.has(tok)) return false;
      const follow = s.slice(len, len + 1);
      if ("太很真最超好不还也".includes(follow)) return true;
    }
    return false;
  }
  const otherSentences = [];
  {
    let start = 0;
    for (let idx = 0; idx <= text.length; idx++) {
      const ch = text[idx];
      if (idx === text.length || /[。！？!?]/.test(ch)) {
        const sent = text.slice(start, idx);
        if (sent && sentenceAboutOther(sent)) otherSentences.push([start, idx]);
        start = idx + 1;
      }
    }
  }
  const inOtherSentence = (pos) => otherSentences.some(([s, e]) => pos >= s && pos < e);

  let i = 0;
  while (i < text.length) {
    const w = matchAt(text, i, PERS_KEYS);
    if (!w) { i++; continue; }
    const dim = PERS_LOOKUP[w];
    let wt = PERS[dim].words[w];

    /* 否定反转 + 程度加权（回看 3 字，先剔除程度词防误匹配） */
    let deg = 1;
    let back = text.slice(Math.max(0, i - 3), i);
    for (const d of DEG_KEYS) {
      const idx = back.indexOf(d);
      if (idx !== -1) { deg *= DEGREES[d]; back = back.slice(0, idx) + "#" + back.slice(idx + d.length); }
    }
    const neg = countNeg(back);
    if (neg % 2 === 1) wt = -wt;
    wt *= deg;

    /* 疑问子句 → 在问不是在说；指他句 → 在说别人 */
    let skip = inQuestion(i) || inOtherSentence(i);
    const back6 = text.slice(Math.max(0, i - 6), i);
    const otherIdx = Math.max(...["你", "您", "他", "她", "它"].map(c => back6.lastIndexOf(c)));
    const selfIdx = Math.max(back6.lastIndexOf("我"), back6.lastIndexOf("自己"));
    if (otherIdx > selfIdx) skip = true;

    if (!skip) {
      raw[dim] += wt;
      evid[dim] += Math.abs(wt);
    }
    i += w.length;
  }

  /* 行为信号（LIWC 式补充特征） */
  const q = (text.match(/[？?]/g) || []).length;
  const excl = (text.match(/[！!]/g) || []).length;
  const you = (text.match(/[你您]/g) || []).length;
  const haha = (text.match(/哈哈|嘿嘿|嘻嘻/g) || []).length;
  raw.o += Math.min(q, 5) * 0.8;                       /* 提问多 → 好奇 */
  raw.e += Math.min(excl, 5) * 0.8 + Math.min(haha, 5) * 0.6;
  raw.a += Math.min(you, 6) * 0.5;                     /* 关注对方 */
  if (aux && aux.hitPos + aux.hitNeg > 0 && aux.hitNeg >= 2) {
    raw.n += (aux.hitNeg / (aux.hitPos + aux.hitNeg)) * 8 - 2; /* 消极词占比（至少2个消极词才计） */
  }
  for (const k of Object.keys(raw)) raw[k] = Math.max(-10, Math.min(10, raw[k]));

  const scores = {}, tags = [];
  for (const k of Object.keys(PERS)) {
    /* 证据量置信度：单个词不足以拉动画像 */
    const conf = Math.min(1, evid[k] / 6);
    scores[k] = Math.round(50 + 45 * Math.tanh(raw[k] / 6) * conf);
    if (scores[k] >= 65) tags.push(PERS[k].hi);
    else if (scores[k] <= 35) tags.push(PERS[k].lo);
  }
  if (!tags.length) tags.push("均衡");
  return { scores, tags };
}

function renderRadar(scores) {
  const svg = $("persRadar");
  const cx = 130, cy = 122, R = 84;
  const dims = ["o", "c", "e", "a", "n"];
  const labels = { o: "开放", c: "尽责", e: "外向", a: "宜人", n: "情绪" };
  const angle = (i) => -Math.PI / 2 + i * 2 * Math.PI / 5;
  const pt = (i, r) => [cx + Math.cos(angle(i)) * r, cy + Math.sin(angle(i)) * r];
  let rings = "";
  for (const f of [0.25, 0.5, 0.75, 1]) {
    const pts = dims.map((_, i) => pt(i, R * f).map(v => v.toFixed(1)).join(",")).join(" ");
    rings += `<polygon points="${pts}" fill="${f === 1 ? "rgba(158,168,247,0.06)" : "none"}" stroke="#d9ddf5" stroke-width="1"/>`;
  }
  let axes = "";
  dims.forEach((_, i) => {
    const [x, y] = pt(i, R);
    axes += `<line x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="#d9ddf5"/>`;
  });
  const dataPts = dims.map((k, i) => pt(i, R * scores[k] / 100).map(v => v.toFixed(1)).join(",")).join(" ");
  const verts = dims.map((k, i) => {
    const [x, y] = pt(i, R + 17);
    const [px, py] = pt(i, R * scores[k] / 100);
    return `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="middle" dominant-baseline="middle" font-size="13" fill="#3a3f5c" font-weight="600">${labels[k]}</text>` +
      `<circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="3.5" fill="#6b7ff2"/>`;
  }).join("");
  svg.innerHTML = rings + axes +
    `<polygon points="${dataPts}" fill="rgba(107,127,242,0.25)" stroke="#6b7ff2" stroke-width="2"/>` + verts;
}

function renderPersonality(text, aux) {
  const p = computePersonality(text, aux);
  renderRadar(p.scores);
  $("persBars").innerHTML = Object.entries(PERS).map(([k, cfg]) => `
    <div class="pers-row">
      <span class="pname">${cfg.name}</span>
      <div class="ptrack"><div class="pfill" style="width:${p.scores[k]}%"></div></div>
      <span class="pval">${p.scores[k]}</span>
    </div>`).join("");
  $("persSummary").textContent = "画像关键词：" + p.tags.join(" · ") +
    (text.length < 40 ? "（文本较短，仅供参考）" : "");
  $("persSection").hidden = false;
  return p;
}

/* ---------- 核心：分析一段文字 ---------- */
function analyzeOne(text) {
  const marks = [];       /* 高亮标注 {s,e,cls} */
  let total = 0, energy = 0;
  const emoEnergy = {};   /* 情绪 -> 能量 */
  let hitPos = 0, hitNeg = 0;

  const excl = (text.match(/[！!]/g) || []).length;
  const boost = 1 + Math.min(excl, 4) * 0.08;

  /* 转折词位置：其后窗口内的情感词加权 */
  const transPos = [];
  for (const t of TRANSITIONS) {
    let idx = text.indexOf(t);
    while (idx !== -1) { transPos.push([idx, t.length]); idx = text.indexOf(t, idx + t.length); }
  }

  /* 对象词扫描（方面级）：先找出所有名词对象位置 */
  const aspectHits = [];
  {
    let j = 0;
    while (j < text.length) {
      const w = matchAt(text, j, ASP_KEYS);
      if (w) { aspectHits.push({ s: j, e: j + w.length, key: ASP_LOOKUP[w] }); j += w.length; continue; }
      j++;
    }
  }
  for (const a of aspectHits) marks.push({ s: a.s, e: a.e, cls: "a" });

  /* 情感词配对最近的对象（同逗号子句内 20 字内），否则不配对 */
  const SEP = /[。！？!?；;，,\n]/;
  function nearestAspect(pos, wlen) {
    let best = null, bd = 1e9;
    for (const a of aspectHits) {
      const dist = a.s >= pos ? a.s - (pos + wlen) : pos - a.e;
      if (dist < 0 || dist > 20) continue;
      const lo = Math.min(a.e, pos), hi = Math.max(a.e, pos + wlen);
      if (SEP.test(text.slice(lo, hi))) continue;
      if (dist < bd) { bd = dist; best = a; }
    }
    return best;
  }
  const aspEnergy = {}, aspScore = {};

  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    /* 表情 */
    if (EMOJI[ch] !== undefined) {
      const [v, e] = EMOJI[ch];
      const s = v * (v >= 0 ? 1 : 1); /* 直接分值 */
      total += s; energy += Math.abs(s);
      emoEnergy[e] = (emoEnergy[e] || 0) + Math.abs(s);
      if (s > 0) hitPos++; else if (s < 0) hitNeg++;
      marks.push({ s: i, e: i + ch.length, cls: s >= 0 ? "p" : "n" });
      i += ch.length; continue;
    }
    /* 情感词 */
    const w = matchAt(text, i, WORD_KEYS);
    if (w) {
      const info = WORDS[w];
      /* 回看 4 字找程度副词与否定词（先剔除转折词/程度词片段，防止误匹配，如"非常"里的"非"、"不过"里的"不"） */
      let deg = 1;
      let back = text.slice(Math.max(0, i - 4), i);
      for (const [tp, tl] of transPos) {
        const rel = tp - (i - 4); /* 转折词在回看窗内的相对位置 */
        for (let k = rel; k < rel + tl; k++) if (k >= 0 && k < back.length) back = back.slice(0, k) + "#" + back.slice(k + 1);
      }
      for (const d of DEG_KEYS) {
        let idx = back.indexOf(d);
        while (idx !== -1) { deg *= DEGREES[d]; back = back.slice(0, idx) + "□".repeat(d.length) + back.slice(idx + d.length); idx = back.indexOf(d); }
      }
      const neg = countNeg(back);
      const base = (info.i / 7) * 2;             /* ±2 封顶 */
      let s = base * info.pol * deg * (neg % 2 === 1 ? -1 : 1);
      if (info.pol === 0) s = base * 0.15 * deg; /* 惊讶类：几乎不改变极性 */
      if (transPos.some(([tp]) => tp < i && i - tp <= TRANS_WINDOW)) s *= TRANS_BOOST;
      /* 方面级：挂到最近的对象上 */
      if (Math.abs(s) > 0.05 && info.pol !== 0) {
        const a = nearestAspect(i, w.length);
        if (a) {
          aspScore[a.key] = (aspScore[a.key] || 0) + s;
          aspEnergy[a.key] = (aspEnergy[a.key] || 0) + Math.abs(s);
        }
      }
      total += s; energy += Math.abs(s);
      emoEnergy[info.e] = (emoEnergy[info.e] || 0) + Math.abs(s);
      if (s > 0.05) hitPos++; else if (s < -0.05) hitNeg++;
      marks.push({ s: i, e: i + w.length, cls: s > 0.05 ? "p" : s < -0.05 ? "n" : "d" });
      i += w.length; continue;
    }
    /* 转折词（紫色高亮） */
    const tr = matchAt(text, i, TRA_KEYS);
    if (tr) { marks.push({ s: i, e: i + tr.length, cls: "t" }); i += tr.length; continue; }
    /* 程度副词 / 否定词（单独高亮） */
    const d = matchAt(text, i, DEG_KEYS);
    if (d) { marks.push({ s: i, e: i + d.length, cls: "d" }); i += d.length; continue; }
    const n = matchAt(text, i, NEGATIONS);
    if (n) { marks.push({ s: i, e: i + n.length, cls: "x" }); i += n.length; continue; }
    i++;
  }

  total *= boost;
  /* tanh 平滑 + 证据置信度：单个情感词不足以支撑极端判定（与人格画像同一原则） */
  const hits = hitPos + hitNeg;
  const conf = 0.55 + 0.45 * Math.min(1, hits / 3);
  const norm = Math.tanh(total / (0.9 * energy + 1.5)) * conf;
  const score = Math.round(norm * 100);

  /* 情绪构成 */
  const emoTotal = Object.values(emoEnergy).reduce((a, b) => a + b, 0);
  const emotions = {};
  for (const k of Object.keys(EMOTIONS)) emotions[k] = emoTotal ? Math.round((emoEnergy[k] || 0) / emoTotal * 100) : 0;

  const label = score >= 60 ? "非常积极" : score >= 25 ? "偏积极" : score > -25 ? "中性" : score > -60 ? "偏消极" : "非常消极";
  const weather = score >= 60 ? "☀️ 阳光灿烂" : score >= 25 ? "🌤️ 晴到多云" : score > -25 ? "⛅ 平静多云" : score > -60 ? "🌧️ 小雨绵绵" : "⛈️ 雷雨交加";

  /* 方面级结果归一化 */
  const aspects = {};
  for (const k of Object.keys(aspEnergy)) {
    aspects[k] = {
      score: Math.round(Math.tanh(aspScore[k] / (0.9 * aspEnergy[k] + 1)) * 100),
      energy: Math.round(aspEnergy[k] * 10) / 10,
    };
  }

  return { score, label, weather, emotions, aspects, marks, hitPos, hitNeg, energy: Math.round(energy * 10) / 10 };
}

/* ---------- 逐句分析 ---------- */
function splitSentences(text) {
  return text.split(/(?<=[。！？!?；;\n])/).map(s => s.trim()).filter(s => s.length > 0);
}

/* ---------- 高亮 HTML ---------- */
function renderHighlight(text, marks) {
  marks.sort((a, b) => a.s - b.s);
  let html = "", pos = 0;
  for (const m of marks) {
    if (m.s < pos) continue;
    html += esc(text.slice(pos, m.s));
    const inner = esc(text.slice(m.s, m.e));
    html += m.cls === "a" ? `<span class="a">${inner}</span>` : `<mark class="${m.cls}">${inner}</mark>`;
    pos = m.e;
  }
  html += esc(text.slice(pos));
  return html;
}

/* ---------- 情绪轨迹图 ---------- */
function renderTraj(scores) {
  const svg = $("trajSvg");
  const W = 600, H = 96, pad = 10;
  const n = scores.length;
  const x = (i) => (n === 1 ? W / 2 : pad + (W - 2 * pad) * i / (n - 1));
  const y = (s) => H / 2 - (s / 100) * (H / 2 - 12);
  const pts = scores.map((s, i) => `${x(i).toFixed(1)},${y(s).toFixed(1)}`).join(" ");
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.innerHTML = `
    <line x1="${pad}" y1="${H / 2}" x2="${W - pad}" y2="${H / 2}" stroke="#c9cde8" stroke-dasharray="5 5"/>
    <polyline points="${pts}" fill="none" stroke="#6b7ff2" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
    ${scores.map((s, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(s).toFixed(1)}" r="4" fill="${s >= 25 ? "#22a06b" : s <= -25 ? "#e05252" : "#9aa8b8"}"/>`).join("")}`;
}

/* ---------- 自定义词典 ---------- */
$("btnDictApply").addEventListener("click", () => {
  const dict = {};
  for (let line of $("dictInput").value.split("\n")) {
    line = line.trim();
    if (!line) continue;
    const m = line.match(/^(\S{1,16})\s*([+-]?\d+(?:\.\d+)?)$/);
    if (!m) { toast(`这行看不懂：「${line.slice(0, 12)}」（格式：词语 ±强度）`); return; }
    dict[m[1]] = Math.max(-7, Math.min(7, parseFloat(m[2])));
  }
  LS.set("xin_dict", dict);
  rebuildWordIndex();
  toast(`已应用 ${Object.keys(dict).length} 条自定义词条 ✅`);
  runAnalysis();
});
$("btnDictReset").addEventListener("click", () => {
  LS.set("xin_dict", {});
  $("dictInput").value = "";
  rebuildWordIndex();
  toast("已恢复默认词典");
  runAnalysis();
});

/* ---------- 单篇分析 UI ---------- */
let analyzeTimer = null, commitTimer = null;
function runAnalysis() {
  const text = $("inputText").value.trim();
  const card = $("resultCard");
  if (!text) { card.hidden = true; return; }
  card.hidden = false;

  const r = analyzeOne(text);

  /* 仪表盘 */
  $("gaugeNeedle").style.left = (50 + r.score / 2.4) + "%"; /* -100..100 → 8%..92% */
  const num = $("scoreNum");
  num.textContent = (r.score > 0 ? "+" : "") + r.score;
  num.style.color = r.score >= 25 ? "var(--pos)" : r.score <= -25 ? "var(--neg)" : "var(--text-soft)";
  $("scoreLabel").textContent = r.label;
  $("weatherLine").textContent = r.weather;

  /* 情绪条 */
  const bars = $("emoBars");
  const sorted = Object.entries(r.emotions).sort((a, b) => b[1] - a[1]);
  bars.innerHTML = sorted.map(([k, v]) => `
    <div class="emo-row">
      <span class="name">${EMOTIONS[k].icon} ${EMOTIONS[k].name}</span>
      <div class="track"><div class="fill" style="background:${EMOTIONS[k].color};width:${v}%"></div></div>
      <span class="val">${v}%</span>
    </div>`).join("");

  /* 对象情感（方面级） */
  const aspEntries = Object.entries(r.aspects || {})
    .filter(([k, v]) => v.energy > 0.05)
    .sort((a, b) => b[1].energy - a[1].energy);
  const aspSec = $("aspSection"), aspList = $("aspList");
  if (aspEntries.length) {
    aspSec.hidden = false;
    aspList.innerHTML = aspEntries.map(([k, v]) => {
      const A = ASPECTS[k];
      const c = v.score >= 25 ? "var(--pos)" : v.score <= -25 ? "var(--neg)" : "var(--text-soft)";
      const half = Math.min(50, Math.abs(v.score) / 2);
      const fill = v.score >= 0
        ? `left:50%;width:${half}%;background:${A.color}`
        : `right:50%;width:${half}%;background:${A.color}`;
      const judge = v.score >= 25 ? "好评" : v.score <= -25 ? "差评" : "一般";
      return `<div class="asp-row">
        <span class="chip" style="background:${A.color}">${A.name}</span>
        <div class="asp-bar"><div class="asp-fill" style="${fill}"></div></div>
        <span class="asp-val" style="color:${c}">${v.score > 0 ? "+" : ""}${v.score} ${judge}</span>
      </div>`;
    }).join("");
  } else aspSec.hidden = true;

  /* 说话人情感（检测到对话时按人分析） */
  const spkSec = $("spkSection"), spkList = $("spkList");
  if (isDialogue(text)) {
    const { msgs, speakers } = parseDialogue(text);
    const rows = speakers.map(name => {
      const mine = msgs.filter(m => m.s === name);
      const joined = mine.map(m => m.t).join("。");
      const sr = analyzeOne(joined);
      const pp = computePersonality(joined, sr);
      const topEmo = Object.entries(sr.emotions).sort((a, b) => b[1] - a[1])[0];
      return { name, count: mine.length, sr, topEmo, tags: pp.tags };
    });
    spkSec.hidden = false;
    spkList.innerHTML = rows.map(r2 => {
      const c = r2.sr.score >= 25 ? "var(--pos)" : r2.sr.score <= -25 ? "var(--neg)" : "var(--text-soft)";
      const emoName = EMOTIONS[r2.topEmo[0]].name.split(" · ")[1];
      const emo = r2.topEmo[1] > 0 ? `${EMOTIONS[r2.topEmo[0]].icon} ${emoName} ${r2.topEmo[1]}%` : "无明显情绪";
      return `<div class="spk-row">
        <span class="spk-ava" style="background:${speakerColor(r2.name)}">${esc(r2.name.slice(0, 1))}</span>
        <span class="spk-info"><span class="spk-name">${esc(r2.name)}<span class="pers-tags">${esc(r2.tags.join(" / "))}</span></span><span class="spk-meta">${r2.count} 条 · 主导情绪 ${emo}</span></span>
        <span class="spk-score"><b style="color:${c}">${r2.sr.score > 0 ? "+" : ""}${r2.sr.score}</b><span>${r2.sr.label}</span></span>
      </div>`;
    }).join("");
  } else spkSec.hidden = true;

  /* 人格画像 */
  renderPersonality(text, r);

  /* 高亮 */
  $("hlText").innerHTML = renderHighlight(text, r.marks);

  /* 逐句 */
  const sents = splitSentences(text);
  const sec = $("sentSection"), list = $("sentList");
  const sentScores = [];
  if (sents.length > 1) {
    sec.hidden = false;
    list.innerHTML = sents.map((s) => {
      const sr = analyzeOne(s);
      sentScores.push(sr.score);
      const c = sr.score >= 25 ? "var(--pos)" : sr.score <= -25 ? "var(--neg)" : "var(--text-soft)";
      return `<div class="sent-row"><span class="sent-score" style="color:${c}">${sr.score > 0 ? "+" : ""}${sr.score}</span><p>${esc(s)}</p></div>`;
    }).join("");
  } else sec.hidden = true;

  /* 情绪轨迹（3 句以上才有意义） */
  const tsec = $("trajSection");
  if (sentScores.length >= 3) {
    tsec.hidden = false;
    renderTraj(sentScores);
  } else tsec.hidden = true;

  $("statLine").textContent = `共 ${text.length} 字 · 识别积极表达 ${r.hitPos} 处 · 消极表达 ${r.hitNeg} 处 · 情绪能量 ${r.energy}`;
}

/* ---------- 历史 ---------- */
function saveHistory(text, r) {
  const his = LS.get("xin_history", []);
  his.unshift({ t: Date.now(), text: text.slice(0, 60), score: r.score, label: r.label });
  LS.set("xin_history", his.slice(0, 20));
  renderHistory();
}
function timeStr(t) {
  const d = new Date(t);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
function renderHistory() {
  const his = LS.get("xin_history", []);
  const box = $("hisList");
  if (!his.length) { box.innerHTML = `<p class="empty">还没有记录，分析一段文字后会自动保存在本机。</p>`; return; }
  box.innerHTML = his.map(h => {
    const icon = h.score >= 60 ? "☀️" : h.score >= 25 ? "🌤️" : h.score > -25 ? "⛅" : h.score > -60 ? "🌧️" : "⛈️";
    const c = h.score >= 25 ? "var(--pos)" : h.score <= -25 ? "var(--neg)" : "var(--text-soft)";
    return `<div class="his-row"><span class="his-emoji">${icon}</span><span class="his-txt">${esc(h.text)}</span><span class="his-score" style="color:${c}">${h.score > 0 ? "+" : ""}${h.score}</span><span class="his-time">${timeStr(h.t)}</span></div>`;
  }).join("");
}

/* ---------- 输入联动 ---------- */
$("inputText").addEventListener("input", () => {
  const v = $("inputText").value;
  $("charCount").textContent = `${v.length} / 2000`;
  clearTimeout(analyzeTimer); clearTimeout(commitTimer);
  analyzeTimer = setTimeout(runAnalysis, 250);
  const text = v.trim();
  if (text) {
    commitTimer = setTimeout(() => {
      const r = analyzeOne(text);
      saveHistory(text, r);
    }, 1500);
  }
});
$("btnClear").addEventListener("click", () => {
  $("inputText").value = ""; $("charCount").textContent = "0 / 2000";
  $("resultCard").hidden = true;
});
$("btnClearHis").addEventListener("click", () => { LS.set("xin_history", []); renderHistory(); toast("历史已清空"); });

/* ---------- 对话检测与说话人分析 ----------
 * 支持两种格式：
 *  A. 同行式：昵称：内容
 *  B. 微信合并转发块式：昵称行 / 日期时间行 / 内容行（可多行），消息间空行 */
const DIALOGUE_LINE = /^([^\s：:]{1,16})[：:]\s*(.*)$/;
const SPEAKER_COLORS = ["#6b7ff2", "#f28bb1", "#5fb0a0", "#f6b73c", "#9c7bd8", "#e0885f", "#58b1e8"];

function isDTLine(l) {
  return /^\d{4}[-/年]\d{1,2}[-/月]\d{1,2}日?\s*\d{1,2}:\d{2}(:\d{2})?\s*$/.test(l)
      || /^\d{1,2}:\d{2}(:\d{2})?\s*$/.test(l);
}

function parseDialogue(text) {
  /* 格式 A：同行式 */
  const msgs = [], speakers = [];
  for (let line of text.split(/\r?\n/)) {
    line = line.trim();
    if (!line) continue;
    const m = line.match(DIALOGUE_LINE);
    if (m) {
      const content = cleanOneLine(m[2]);
      if (content) {
        if (!speakers.includes(m[1])) speakers.push(m[1]);
        msgs.push({ s: m[1], t: content });
      }
    }
  }
  if (msgs.length >= 3 && speakers.length >= 2) return { msgs, speakers };
  /* 格式 B：块式（名字行 + 时间行 + 内容行） */
  const b = parseWeChatBlocks(text);
  if (b.msgs.length >= 3 && b.speakers.length >= 2) return b;
  return { msgs: [], speakers: [] };
}

function parseWeChatBlocks(text) {
  const lines = text.split(/\r?\n/).map(l => l.trim());
  const msgs = [], speakers = [];
  let name = null, parts = [];
  const flush = () => {
    if (name && parts.length) {
      if (!speakers.includes(name)) speakers.push(name);
      msgs.push({ s: name, t: parts.join(" ") });
    }
    parts = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (!l) continue;
    if (SYS_LINE.test(l)) continue;
    if (isDTLine(l)) continue;
    /* 名字行判定：短行 + 下一个非空行是时间戳 */
    let j = i + 1;
    while (j < lines.length && !lines[j]) j++;
    const next = j < lines.length ? lines[j] : "";
    if (l.length <= 20 && isDTLine(next)) {
      flush();
      name = l;
      continue;
    }
    if (l === name) continue; /* 孤立的重名行 */
    const content = cleanOneLine(l).replace(NICK_PREFIX, "");
    if (content) parts.push(content);
  }
  flush();
  return { msgs, speakers };
}

function isDialogue(text) {
  const { msgs, speakers } = parseDialogue(text);
  return msgs.length >= 3 && speakers.length >= 2;
}
function speakerColor(name) {
  let h = 0;
  for (const c of name) h = (h * 31 + c.codePointAt(0)) >>> 0;
  return SPEAKER_COLORS[h % SPEAKER_COLORS.length];
}

/* ---------- 聊天记录格式清理 ----------
 * 支持微信"合并转发"复制出来的典型格式：
 *  - 纯时间戳行 / 行首日期时间（2025-10-05 12:30:45 / 10月5日 12:30）
 *  - 昵称前缀（小明： / 张三: ）——对话模式下保留昵称
 *  - 系统占位符：[图片][表情][语音][视频][文件][链接][红包][转账] 等
 *  - 合并转发头、条数提示、撤回提示等系统行 */
const SYS_LINE = /^(以下为新消息|以上是打招呼的内容|——?\s*merged?|【?微信】?$|\d+\s*条新消息$|.*撤回了一条消息.*$)/i;
const PLACEHOLDER = /\[[^\[\]]{1,10}\](?:\s*\d{1,2}:\d{2})?/g;
const DATETIME_HEAD = /^\s*(\d{4}[-/年]\d{1,2}[-/月]\d{1,2}日?|\d{1,2}月\d{1,2}日|\d{1,2}:\d{2}(:\d{2})?)\s*\d{0,2}:?\d{0,2}:?\d{0,2}\s*$/;
const DATETIME_PREFIX = /^\s*(\d{4}[-/年]\d{1,2}[-/月]\d{1,2}日?|\d{1,2}月\d{1,2}日)?\s*\d{1,2}:\d{2}(:\d{2})?\s+/;
const NICK_PREFIX = /^[^\s：:]{1,16}[：:]\s*/;

function cleanOneLine(line) {
  line = line.trim();
  if (!line) return "";
  if (DATETIME_HEAD.test(line)) return "";
  if (SYS_LINE.test(line)) return "";
  line = line.replace(DATETIME_PREFIX, "");
  line = line.replace(PLACEHOLDER, "");
  return line.trim();
}
function cleanChat(raw) {
  /* 对话模式：统一解析（两种格式都支持）→ 规范化为"昵称：内容"行 */
  if (isDialogue(raw)) {
    const { msgs } = parseDialogue(raw);
    return msgs.map(m => `${m.s}：${m.t}`).join("\n");
  }
  /* 非对话：原逻辑（剥昵称） */
  const out = [];
  for (let line of raw.split(/\r?\n/)) {
    line = cleanOneLine(line);
    if (!line) continue;
    line = line.replace(NICK_PREFIX, "").trim();
    if (line) out.push(line);
  }
  return out.join("\n");
}
function doClean(target) {
  const el = $(target);
  const cleaned = cleanChat(el.value);
  if (!el.value.trim()) { toast("先粘贴聊天记录进来"); return; }
  const removed = el.value.split(/\r?\n/).filter(s => s.trim()).length - cleaned.split("\n").filter(Boolean).length;
  el.value = cleaned;
  el.dispatchEvent(new Event("input"));
  toast(removed > 0 ? `清理完成，去掉 ${removed} 行杂项 🧹` : "没发现需要清理的时间戳/昵称前缀");
}
$("btnClean").addEventListener("click", () => doClean("inputText"));
$("btnClean2").addEventListener("click", () => doClean("batchText"));

/* ---------- 示例 ---------- */
const DEMOS = [
  "今天拿到了心仪已久的 offer，开心到飞起！感谢所有帮助过我的人，感觉人生终于步入了正轨，激动得有点睡不着。",
  "考试挂了，心情跌到谷底。复习了那么久还是这个结果，又委屈又不甘心。室友一直安慰我，虽然很温暖，但还是很难过。",
  "这家店的服务态度极差，等了一个小时才上菜，菜又冷又难吃，再也不来了！！",
  "嗯，还行吧，不好也不坏。",
  "万万没想到结局居然是这样！前面以为很可怕，其实温情得不得了，又哭又笑，强烈推荐！",
];
let demoIdx = 0;
$("btnDemo").addEventListener("click", () => {
  $("inputText").value = DEMOS[demoIdx % DEMOS.length];
  demoIdx++;
  $("inputText").dispatchEvent(new Event("input"));
});

/* ---------- 批量分析 ---------- */
$("btnBatchGo").addEventListener("click", () => {
  const lines = $("batchText").value.split("\n").map(s => s.trim()).filter(Boolean);
  const box = $("batchResult");
  if (!lines.length) { toast("先输入几行文字（每行一条）"); return; }
  box.hidden = false;

  const results = lines.map((line, idx) => ({ idx: idx + 1, line, r: analyzeOne(line) }));
  const pos = results.filter(x => x.r.score >= 25).length;
  const neg = results.filter(x => x.r.score <= -25).length;
  const neu = results.length - pos - neg;
  const avg = Math.round(results.reduce((a, x) => a + x.r.score, 0) / results.length);
  const best = results.reduce((a, b) => (b.r.score > a.r.score ? b : a));
  const worst = results.reduce((a, b) => (b.r.score < a.r.score ? b : a));

  $("batchSummary").innerHTML =
    `共 <b>${results.length}</b> 条 · <span style="color:var(--pos)">积极 ${pos}</span> · 中性 ${neu} · <span style="color:var(--neg)">消极 ${neg}</span><br>` +
    `平均情绪分 <b>${avg > 0 ? "+" : ""}${avg}</b>（${avg >= 25 ? "整体积极 😄" : avg <= -25 ? "整体消极 😟" : "整体平稳 ⛅"}）<br>` +
    `最积极：${esc(best.line.slice(0, 18))}（+${best.r.score}） · 最消极：${esc(worst.line.slice(0, 18))}（${worst.r.score}）`;

  window.__batchResults = results;
  $("batchList").innerHTML = results.map(x => {
    const c = x.r.score >= 25 ? "var(--pos)" : x.r.score <= -25 ? "var(--neg)" : "var(--text-soft)";
    return `<div class="batch-row"><span class="idx">${x.idx}.</span><p>${esc(x.line)}</p><span class="r" style="color:${c}">${x.r.score > 0 ? "+" : ""}${x.r.score} ${x.r.label}</span></div>`;
  }).join("");
});
$("btnBatchCopy").addEventListener("click", () => {
  if (!window.__batchResults) return;
  const lines = ["序号\t内容\t情绪分\t判定",
    ...window.__batchResults.map(x => `${x.idx}\t${x.line}\t${x.r.score}\t${x.r.label}`)];
  navigator.clipboard.writeText(lines.join("\n"))
    .then(() => toast("结果已复制，可直接粘贴到表格"))
    .catch(() => toast("这台设备不允许复制"));
});

/* ---------- 页签 ---------- */
document.querySelectorAll(".tab").forEach(b => b.addEventListener("click", () => {
  document.querySelectorAll(".tab").forEach(x => x.classList.remove("active"));
  document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
  b.classList.add("active");
  $( "tab-" + b.dataset.tab).classList.add("active");
}));

/* ---------- 启动 ---------- */
rebuildWordIndex();
(function loadDict() {
  const d = LS.get("xin_dict", {});
  $("dictInput").value = Object.entries(d).map(([w, v]) => `${w} ${v > 0 ? "+" : ""}${v}`).join("\n");
})();
renderHistory();

if ("serviceWorker" in navigator && /^https?:$/.test(location.protocol)) {
  window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(() => {}));
}
