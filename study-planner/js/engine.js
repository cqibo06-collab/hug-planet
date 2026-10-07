/* ============================================================
 * engine.js — 规则引擎：时间盘点 / 可行性算账 / 周计划生成 / 冲突检测
 * 全部为确定性计算，不依赖 LLM
 * ============================================================ */
PB.engine = (() => {
  const U = PB.util;
  const PRIO = { high: 0, med: 1, low: 2 };
  const PRIO_CN = { high: '高', med: '中', low: '低' };

  /* ── 基础：某天的占用与空闲 ──────────────────── */
  const MEAL_CUTS = [{ s: 720, e: 780 }, { s: 1080, e: 1140 }]; // 午餐 12:00-13:00、晚餐 18:00-19:00

  // 返回 {busy:[{s,e,label,type}], free:[{s,e}]}，free 已扣除规划窗口、三餐缓冲外的时段
  function dayLayout(dateStr, st) {
    const d = U.parseDate(dateStr);
    const wd = d.getDay() === 0 ? 7 : d.getDay();
    const s = st || PB.store.get();
    const winS = Math.max(0, U.hm(s.settings.dayStart));
    const winE = Math.min(24 * 60, U.hm(s.settings.dayEnd));
    const busy = [];
    for (const c of s.courses) {
      if (c.day === wd) busy.push({ s: U.hm(c.start), e: U.hm(c.end), label: c.name, type: 'course' });
    }
    for (const ev of s.events) {
      if (ev.date === dateStr) busy.push({ s: U.hm(ev.start), e: U.hm(ev.end), label: ev.name, type: 'event' });
    }
    busy.sort((a, b) => a.s - b.s);
    const cuts = s.settings.meals === false ? busy.slice() : busy.concat(MEAL_CUTS);
    const free = U.subtract([{ s: winS, e: winE }], cuts);
    return { busy, free, winS, winE };
  }

  // 空闲分类：整块（>= chunkMin）与碎片
  function classify(free, chunkMin) {
    const chunks = free.filter(iv => iv.e - iv.s >= chunkMin);
    const frags = free.filter(iv => iv.e - iv.s < chunkMin);
    return { chunks, frags };
  }

  // 某周（从周一 dateStr 开始）的可用时间盘点；ignoreEvents=true 时只看周期课程
  // studyMin/studyTotal：按"每天学习上限"封顶后的实际可投入量（用于可行性）
  function weekCapacity(mondayStr, st, ignoreEvents) {
    const s = st || PB.store.get();
    const capPerDay = s.settings.dailyCapH * 60;
    const byDay = [];
    let total = 0, chunkTotal = 0, fragTotal = 0, studyTotal = 0;
    for (let i = 0; i < 7; i++) {
      const ds = U.dateStr(U.addDays(U.parseDate(mondayStr), i));
      const lay = dayLayout(ds, s);
      let free = lay.free;
      if (ignoreEvents) free = U.subtract([{ s: lay.winS, e: lay.winE }], lay.busy.filter(b => b.type === 'course'));
      const { chunks, frags } = classify(free, s.settings.chunkMin);
      const freeMin = free.reduce((a, b) => a + b.e - b.s, 0);
      const studyMin = Math.min(freeMin, capPerDay);
      byDay.push({ date: ds, free, chunks, frags, freeMin, studyMin });
      total += freeMin; studyTotal += studyMin;
      chunkTotal += chunks.reduce((a, b) => a + b.e - b.s, 0); fragTotal += frags.reduce((a, b) => a + b.e - b.s, 0);
    }
    return { byDay, total, studyTotal, chunkTotal, fragTotal };
  }

  // 周期性课程决定的"典型一周"容量（不受单次事件影响），用于长期可行性
  function typicalWeeklyCapacity(st) {
    const s = st || PB.store.get();
    const anyMonday = U.dateStr(U.mondayOf(U.today()));
    return weekCapacity(anyMonday, s, true);
  }

  /* ── 冲突检测 ───────────────────────────────── */
  // 同一天课程两两重叠 + 事件与课程重叠
  function findConflicts(st) {
    const s = st || PB.store.get();
    const out = [];
    const withDay = [];
    for (const c of s.courses) withDay.push({ kind: 'course', ref: c, day: c.day, s: U.hm(c.start), e: U.hm(c.end), name: c.name });
    const dayNames = ['', '周一', '周二', '周三', '周四', '周五', '周六', '周日'];
    for (let i = 0; i < withDay.length; i++) {
      for (let j = i + 1; j < withDay.length; j++) {
        const a = withDay[i], b = withDay[j];
        if (a.day !== b.day) continue;
        const ov = U.overlap(a, b);
        if (ov > 0) out.push({ level: 'warn', msg: `${dayNames[a.day]}「${a.name}」与「${b.name}」时间重叠 ${ov} 分钟` });
      }
    }
    // 事件落在课内
    for (const ev of s.events) {
      const d = U.parseDate(ev.date); const wd = d.getDay() === 0 ? 7 : d.getDay();
      for (const c of withDay) {
        if (c.kind !== 'course' || c.day !== wd) continue;
        const ov = U.overlap({ s: U.hm(ev.start), e: U.hm(ev.end) }, c);
        if (ov > 0) { out.push({ level: 'info', msg: `${U.fmtCN(ev.date)}「${ev.name}」与课程「${c.name}」重叠 ${ov} 分钟` }); break; }
      }
    }
    return out;
  }

  /* ── 目标/任务统计与可行性 ───────────────────── */
  function goalMap(st) { const m = {}; (st || PB.store.get()).goals.forEach(g => m[g.id] = g); return m; }

  // 任务剩余工时
  function taskRemaining(t) { return Math.max(0, (t.estHours || 0) - (t.doneHours || 0)); }

  // 每个目标的进度/剩余
  function goalStats(st) {
    const s = st || PB.store.get();
    const todayStr = U.dateStr(U.today());
    return s.goals.map(g => {
      const tasks = s.tasks.filter(t => t.goalId === g.id);
      let remaining, total, done;
      if (tasks.length) {
        total = tasks.reduce((a, t) => a + (t.estHours || 0), 0);
        done = tasks.reduce((a, t) => a + (t.doneHours || 0), 0);
        remaining = Math.max(0, total - done);
      } else { total = g.estHours || 0; done = 0; remaining = total; }
      let daysLeft = g.deadline ? U.dayDiff(g.deadline, todayStr) : null;
      const weeksLeft = daysLeft == null ? null : Math.max(1, Math.ceil((daysLeft + 1) / 7));
      const requiredPerWeek = weeksLeft ? remaining / weeksLeft : remaining;
      return { goal: g, total, done, remaining, daysLeft, weeksLeft, requiredPerWeek, taskCount: tasks.length };
    });
  }

  // 可行性报告（不含 LLM）
  function feasibility(st) {
    const s = st || PB.store.get();
    const cap = typicalWeeklyCapacity(s);
    const capH = cap.studyTotal / 60;
    const stats = goalStats(s);
    const todayStr = U.dateStr(U.today());
    const perGoal = [];
    let totalReq = 0, totalRemain = 0;
    for (const g of stats) {
      if (g.remaining <= 0) {
        perGoal.push({ ...g, status: 'done', statusCN: '已完成', advice: '' });
        continue;
      }
      totalRemain += g.remaining;
      if (g.daysLeft != null && g.daysLeft < 0) {
        perGoal.push({ ...g, status: 'overdue', statusCN: '已过期', advice: '截止日已过，请确认是否延期或结项' });
        continue;
      }
      totalReq += g.requiredPerWeek;
      const ratio = capH > 0 ? g.requiredPerWeek / capH : 9;
      let status, statusCN, advice = '';
      if (g.daysLeft != null && g.daysLeft <= 3 && g.remaining > 0) {
        status = 'risk'; statusCN = '临期';
        advice = `距截止仅 ${g.daysLeft} 天，还剩 ${U.fmtHours(g.remaining * 60)}，请优先集中处理`;
      } else if (ratio > 1) { status = 'over'; statusCN = '超载'; advice = `每周需 ${g.requiredPerWeek.toFixed(1)}h，超过全部空闲时间，需要延期或减量`; }
      else if (ratio > 0.6) { status = 'tight'; statusCN = '紧张'; advice = `占掉你约 ${Math.round(ratio * 100)}% 的空闲时间，注意留缓冲`; }
      else if (g.requiredPerWeek > 0.05) { status = 'ok'; statusCN = '可行'; advice = `每周约 ${g.requiredPerWeek.toFixed(1)}h 即可按时完成`; }
      else { status = 'ok'; statusCN = '收尾'; }
      perGoal.push({ ...g, status, statusCN, advice, ratio });
    }
    const usage = capH > 0 ? totalReq / capH : 9;
    let verdict, verdictCN, verdictMsg;
    if (usage > 1) { verdict = 'over'; verdictCN = '时间超载'; verdictMsg = `目标共需 ${totalReq.toFixed(1)} 小时/周，但课表外每周只有约 ${capH.toFixed(1)} 小时，缺口 ${(totalReq - capH).toFixed(1)} 小时。`; }
    else if (usage > 0.85) { verdict = 'warn'; verdictCN = '非常紧张'; verdictMsg = `目标共需 ${totalReq.toFixed(1)} 小时/周，可用约 ${capH.toFixed(1)} 小时/周，占用 ${Math.round(usage * 100)}%，几乎没有缓冲。`; }
    else if (usage > 0.5) { verdict = 'warn'; verdictCN = '可行但紧凑'; verdictMsg = `目标共需 ${totalReq.toFixed(1)} 小时/周，可用约 ${capH.toFixed(1)} 小时/周，占用 ${Math.round(usage * 100)}%，安排得当可以完成。`; }
    else { verdict = 'ok'; verdictCN = '时间充裕'; verdictMsg = `目标共需 ${totalReq.toFixed(1)} 小时/周，可用约 ${capH.toFixed(1)} 小时/周，仅占用 ${Math.round(usage * 100)}%，还有余量。`; }

    // 自动建议（模板，无需 LLM）
    const suggestions = [];
    if (verdict === 'over') {
      const low = perGoal.filter(p => ['ok', 'tight'].includes(p.status) && p.goal.priority === 'low');
      if (low.length) suggestions.push(`低优先级目标（${low.map(p => `《${p.goal.title}》`).join('、')}）可延后到超载目标完成后再启动`);
      suggestions.push('压缩非核心目标的预计工时，或申请延长截止期');
      suggestions.push('把背诵、整理错题等轻任务放进碎片时间，整块时间留给难点');
    } else if (verdict === 'warn') {
      suggestions.push('周中至少留半个下午作为机动缓冲，应对突发任务');
      suggestions.push('优先保证临期与高优先级目标，其余按截止日顺序推进');
    } else {
      suggestions.push('余量充足，可以加入预习、刷题拓展等提升型任务');
      suggestions.push('建议把剩余时间的 20% 用于复盘和错题回顾');
    }
    if (perGoal.some(p => p.status === 'risk')) suggestions.push('存在 3 天内截止的目标，本周计划应向其倾斜');
    if (cap.fragTotal > 180) suggestions.push(`每周碎片时间约 ${U.fmtHours(cap.fragTotal)}，适合用来背单词、过知识点卡片`);

    const risks = [];
    for (const p of perGoal) {
      if (p.status === 'risk') risks.push(`《${p.goal.title}》${p.advice}`);
      if (p.status === 'over') risks.push(`《${p.goal.title}》${p.advice}`);
      if (p.status === 'overdue') risks.push(`《${p.goal.title}》已过截止日（${p.goal.deadline}）`);
    }
    for (const c of findConflicts(s).filter(x => x.level === 'warn')) risks.push(c.msg);

    return { capH, cap, stats, perGoal, totalReq, totalRemain, usage, verdict, verdictCN, verdictMsg, suggestions, risks };
  }

  /* ── 周计划生成（贪心 + 截止日倒排 + 精力匹配） ── */
  function generatePlan(mondayStr, st) {
    const s = st || PB.store.get();
    const todayStr = U.dateStr(U.today());
    const capDays = s.settings.dailyCapH * 60;
    const chunkMin = s.settings.chunkMin;
    const energy = s.settings.energy;
    const goalM = goalMap(s);
    const weekEnd = U.dateStr(U.addDays(U.parseDate(mondayStr), 6));

    // 待排任务：目标未完成 +（有任务则取任务，否则目标整体作为隐式任务）
    const worklist = [];
    for (const g of s.goals) {
      const tasks = s.tasks.filter(t => t.goalId === g.id);
      if (tasks.length) {
        for (const t of tasks) {
          const rem = taskRemaining(t);
          if (rem > 0.05) worklist.push({ kind: 'task', ref: t, goal: g, hours: rem, deadline: g.deadline || weekEnd, priority: t.priority || g.priority });
        }
      } else if ((g.estHours || 0) > 0.05 && g.deadline !== undefined) {
        const dl = g.deadline;
        if (dl && U.dayDiff(dl, todayStr) < 0) continue; // 已过期不排
        worklist.push({ kind: 'goal', ref: g, goal: g, hours: g.estHours, deadline: dl || weekEnd, priority: g.priority });
      }
    }
    // 排序：截止日近者优先，其次优先级，再按剩余工时大者优先
    worklist.sort((a, b) => {
      const da = U.dayDiff(a.deadline, todayStr), db = U.dayDiff(b.deadline, todayStr);
      if (da !== db) return da - db;
      if (PRIO[a.priority] !== PRIO[b.priority]) return PRIO[a.priority] - PRIO[b.priority];
      return b.hours - a.hours;
    });

    // 每天的空闲池（扣掉本周已过时间 / 每日上限）
    const days = [];
    for (let i = 0; i < 7; i++) {
      const ds = U.dateStr(U.addDays(U.parseDate(mondayStr), i));
      const lay = dayLayout(ds, s);
      const isToday = ds === todayStr;
      const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
      let free = lay.free;
      if (isToday) free = free.map(iv => ({ s: Math.max(iv.s, nowMin), e: iv.e })).filter(iv => iv.e - iv.s >= 20);
      else if (U.dayDiff(ds, todayStr) < 0) free = [];
      days.push({ date: ds, free, used: 0, alloc: [] });
    }

    // 槽位排序（精力偏好）
    function orderSlots(free, preferDeep) {
      const arr = free.slice();
      const isChunk = iv => iv.e - iv.s >= chunkMin;
      let scored = arr.map(iv => {
        let score;
        if (energy === 'morning') score = 24 * 60 - iv.s;             // 越早越好
        else if (energy === 'night') score = iv.s;                    // 越晚越好
        else score = 12 * 60 - Math.abs((iv.s + iv.e) / 2 - 15 * 60); // 偏好午后
        if (preferDeep && isChunk(iv)) score += 10000;
        if (!preferDeep && !isChunk(iv)) score += 5000;               // 轻任务优先填碎片
        return { iv, score };
      });
      scored.sort((a, b) => b.score - a.score);
      return scored.map(x => x.iv);
    }

    const unallocated = [];
    for (const w of worklist) {
      let remaining = w.hours * 60;
      const preferDeep = w.kind === 'task' ? (w.ref.preferred !== 'fragment') : true;
      const minBlock = w.kind === 'task' && w.ref.preferred === 'fragment' ? 20 : 40;
      const lastDay = Math.min(6, Math.max(0, U.dayDiff(w.deadline, mondayStr))); // 只排到截止日
      const deepSlots = [];
      const fragSlots = [];
      for (let d = 0; d <= lastDay && remaining > 0; d++) {
        const day = days[d];
        // 每次重新评估当天剩余槽位
        let cands = orderSlots(day.free, preferDeep);
        for (const iv of cands) {
          if (remaining <= 0) break;
          const capLeft = capDays - day.used;
          if (capLeft < minBlock) break;
          let len = iv.e - iv.s;
          const take = Math.min(remaining, len, capLeft);
          if (take < minBlock) continue;
          // 决定块长：尽量占满槽位或剩余需求，但单块不超过 3 小时
          let block = Math.min(take, 180);
          // 若剩余很少且槽位还长，保留槽位余量给别人
          const start = iv.s;
          const end = start + block;
          day.alloc.push({ taskId: w.kind === 'task' ? w.ref.id : null, goalId: w.goal.id, workKind: w.kind, refId: w.ref.id, date: day.date, start, end });
          day.used += block;
          remaining -= block;
          // 收缩槽位
          iv.s = end;
        }
      }
      if (remaining > 0.5) unallocated.push({ workKind: w.kind, ref: w.ref, goal: w.goal, hours: remaining / 60, deadline: w.deadline });
    }

    // 输出（合并进 plan.items，替换同周内容）
    const items = [];
    for (const day of days) {
      for (const a of day.alloc) {
        items.push({ id: PB.store.uid(), taskId: a.taskId, goalId: a.goalId, date: a.date, start: a.start, end: a.end, done: false });
      }
    }
    const warnings = [];
    for (const u of unallocated) {
      const name = u.workKind === 'task' ? u.ref.title : `《${u.goal.title}》(整体推进)`;
      warnings.push(`「${name}」还有约 ${U.fmtHours(u.hours * 60)} 排不进本周（截止 ${u.deadline}），建议减量、延期或提高每日上限`);
    }
    return { weekOf: mondayStr, items, warnings, unallocated };
  }

  // 已排工时（某周）
  function planHours(plan) {
    return (plan.items || []).reduce((a, it) => a + (it.end - it.start), 0);
  }

  /* ── 资料库统计 ──────────────────────────────── */
  function subjectStats(st) {
    const s = st || PB.store.get();
    return s.subjects.map(sub => ({
      subject: sub,
      materials: s.materials.filter(m => m.subjectId === sub.id),
      goals: s.goals.filter(g => g.subjectId === sub.id),
    }));
  }

  return { dayLayout, classify, weekCapacity, typicalWeeklyCapacity, findConflicts, goalStats, feasibility, generatePlan, planHours, subjectStats, taskRemaining, PRIO_CN };
})();
