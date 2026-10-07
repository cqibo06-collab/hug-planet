/* ============================================================
 * llm.js — LLM 集成（OpenAI 兼容接口，浏览器直连）
 * 职责边界：LLM 只负责「理解描述 / 写建议 / 对话调整」，
 * 时间账与冲突判定一律走 engine.js 的规则结果。
 * ============================================================ */
PB.llm = (() => {
  const U = PB.util;

  function cfg() { return PB.store.get().settings.llm; }
  function configured() { const c = cfg(); return !!(c.apiKey && c.baseURL); }

  function endpoint() {
    let base = cfg().baseURL.replace(/\/+$/, '');
    if (!/\/v\d+$/.test(base) && !/\/chat\/completions$/.test(base)) {
      // 常见提供商两种路径都兼容；这里统一尝试补 /v1 失败时由用户在设置里改
      return base + '/chat/completions';
    }
    return base + '/chat/completions';
  }

  // 基础对话调用
  async function chat(messages, { temperature = 0.3, maxTokens = 2000, jsonHint = false } = {}) {
    const c = cfg();
    if (!configured()) throw new Error('未配置 LLM 接口，请到「设置」填写 API 地址与密钥');
    const body = {
      model: c.model,
      messages,
      temperature,
      max_tokens: maxTokens,
    };
    if (jsonHint) body.response_format = { type: 'json_object' };
    let resp;
    try {
      resp = await fetch(endpoint(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + c.apiKey },
        body: JSON.stringify(body),
      });
    } catch (e) {
      throw new Error('网络请求失败（可能是浏览器跨域限制或网络问题）：' + e.message);
    }
    if (!resp.ok) {
      let detail = '';
      try { detail = (await resp.json()).error?.message || ''; } catch (_) {}
      throw new Error(`接口返回 ${resp.status}${detail ? '：' + detail : ''}`);
    }
    const data = await resp.json();
    const text = data.choices?.[0]?.message?.content;
    if (!text) throw new Error('接口未返回内容');
    return text;
  }

  // 宽松 JSON 提取（容忍 ```json 包裹、前后缀文字）
  function extractJSON(text) {
    let t = String(text).replace(/```json/gi, '```').replace(/```/g, '\n');
    const s = t.indexOf('{');
    const s2 = t.indexOf('[');
    let start = (s === -1) ? s2 : (s2 === -1 ? s : Math.min(s, s2));
    if (start === -1) throw new Error('AI 未返回 JSON');
    const e = Math.max(t.lastIndexOf('}'), t.lastIndexOf(']'));
    return JSON.parse(t.slice(start, e + 1));
  }

  function nowContext() {
    const d = U.today();
    return `今天是 ${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日（星期${'日一二三四五六'[d.getDay()]}）`;
  }

  /* ── 1. 解析自然语言目标描述 → 结构化目标/任务 ── */
  async function parseGoals(desc) {
    const sys = `你是学习规划助手。用户会用一段口语化描述说出他的学习目标/备考安排，请把它拆解成结构化 JSON。
规则：
- deadline 用 YYYY-MM-DD；用户说"12月中旬"之类请取月中日期，"下周日"等相对时间按 ${U.dateStr(U.today())} 推算。
- estHours 是完成该目标预计需要的小时数（数字）。用户没说就按常见经验估（如一门期末复习 25-40h，一个竞赛专项 60-100h），并在 note 里注明是估计值。
- priority：有明确截止且重要的填 high；一般填 med；兴趣/拓展填 low。
- category 从这些里选：竞赛 / 考试 / 作业 / 技能 / 其他。
- 如果描述里包含可拆的子任务（如"先过一轮知识点再刷真题"），拆成 tasks，每条带 title 和 estHours；拆不出就 tasks 留空数组。
- 不要编造用户没提的目标；描述含糊时把需要确认的问题放进 questions。
只输出 JSON，格式：
{"goals":[{"title":"...","category":"...","deadline":"YYYY-MM-DD","estHours":40,"priority":"high","note":"...","tasks":[{"title":"...","estHours":10}]}],"questions":["..."]}`;
    const text = await chat([
      { role: 'system', content: sys },
      { role: 'user', content: `${nowContext()}。我的描述：\n${desc}` },
    ], { temperature: 0.2, jsonHint: true });
    const j = extractJSON(text);
    return { goals: j.goals || [], questions: j.questions || [] };
  }

  /* ── 2. 基于规则计算结果，生成深度分析建议 ──── */
  async function advise(report) {
    const sys = `你是学习时间规划顾问。下面会给你一份由程序精确计算出的「时间账」数据（容量、目标需求、缺口、风险都已完成计算，不要重新计算或质疑这些数字）。
请你基于这些事实写一份给大学生看的分析建议，要求：
- 结论先行，第一句话直接说"够不够用"；
- 用大白话，像学长帮学弟分析，不要空话套话；
- 必须给出可执行的取舍建议（明确到具体目标名：哪个降量、哪个延期、怎么用碎片时间）；
- 若数据里没有任何风险，也请给出如何利用富余时间的具体建议；
- 控制在 300 字以内，用 Markdown，可用小标题和列表。`;
    const facts = {
      今日: U.dateStr(U.today()),
      每周可支配时间: report.capH,
      其中整块时间: report.cap.chunkTotal / 60,
      其中碎片时间: report.cap.fragTotal / 60,
      目标总需求: Math.round(report.totalReq * 10) / 10,
      结论: report.verdictCN,
      说明: report.verdictMsg,
      各目标: report.perGoal.map(p => ({
        目标: p.goal.title, 优先级: PB.engine.PRIO_CN[p.goal.priority] || '中',
        截止: p.goal.deadline || '无', 剩余工时: Math.round(p.remaining * 10) / 10,
        距截止天数: p.daysLeft, 每周需要: Math.round((p.requiredPerWeek || 0) * 10) / 10,
        状态: p.statusCN,
      })),
      程序识别的风险: report.risks,
    };
    const text = await chat([
      { role: 'system', content: sys },
      { role: 'user', content: `${nowContext()}。\n时间账数据：\n${JSON.stringify(facts, null, 2)}` },
    ], { temperature: 0.5, maxTokens: 900 });
    return text;
  }

  /* ── 3. 对话式调整：返回结构化操作，由界面确认后应用 ── */
  async function chatAdjust(userMsg, planInfo) {
    const s = PB.store.get();
    const sys = `你是学习规划助手，已接入用户的规划数据。用户会用一句话要求调整（如"周六想留白""数学竞赛提前了""下周想加个英语目标"）。
你可以返回操作列表，程序会先展示给用户确认再执行。可选操作：
{"op":"addGoal","payload":{"title":"...","category":"竞赛|考试|作业|技能|其他","deadline":"YYYY-MM-DD","estHours":数字,"priority":"high|med|low","note":"..."}}
{"op":"updateGoal","payload":{"match":"目标名关键词","deadline":"YYYY-MM-DD","estHours":数字,"priority":"high|med|low"}}
{"op":"removeGoal","payload":{"match":"目标名关键词"}}
{"op":"addTask","payload":{"goalMatch":"目标名关键词","title":"...","estHours":数字,"preferred":"deep|fragment"}}
{"op":"removeTask","payload":{"match":"任务名关键词"}}
{"op":"replan","payload":{"weekOffset":0}}   // 重新生成周计划，weekOffset 0=本周 1=下周
{"op":"updateSetting","payload":{"key":"dailyCapH|dayStart|dayEnd|energy","value":...}}
规则：
- 相对日期按 ${U.dateStr(U.today())} 推算；
- 用户表达"留白/休息"类需求且涉及每天时间，用 updateSetting 调整；涉及某天，回复里建议用户用"单次事件"功能（op 里加 note）；
- 需要重新排计划时才给 replan，否则省略；
- reply 字段用一两句话告诉用户你做了什么判断。
只输出 JSON：{"reply":"...","ops":[...]}`;
    const context = {
      当前目标: s.goals.map(g => ({ title: g.title, deadline: g.deadline, estHours: g.estHours, priority: g.priority })),
      本周计划已排: Math.round(PB.engine.planHours(s.plan) / 60 * 10) / 10 + '小时',
      每日上限: s.settings.dailyCapH + '小时',
      计划情况: planInfo || '',
    };
    const text = await chat([
      { role: 'system', content: sys },
      { role: 'user', content: `${nowContext()}。\n当前数据：${JSON.stringify(context)}\n\n我的要求：${userMsg}` },
    ], { temperature: 0.2, jsonHint: true, maxTokens: 1200 });
    return extractJSON(text);
  }

  async function testConnection() {
    const text = await chat([{ role: 'user', content: '请只回复：连接成功' }], { maxTokens: 20, temperature: 0 });
    return text.trim().slice(0, 50);
  }

  return { configured, chat, parseGoals, advise, chatAdjust, testConnection, extractJSON };
})();
