/* ============================================================
 * views3.js — 周计划页（生成/调整/AI 对话）+ 分析报告页 + 设置页
 * ============================================================ */
(() => {
  const U = PB.util, UI = PB.ui;
  let curMonday = null; // 计划页当前查看的周

  function getMonday() {
    if (!curMonday) curMonday = U.dateStr(U.mondayOf(U.today()));
    return curMonday;
  }

  /* ── 周计划页 ───────────────────────────────── */
  function plan(root) {
    const s = PB.store.get();
    const monday = getMonday();
    root.innerHTML = `
      <div class="page-title">周计划 <span class="muted" style="font-weight:400;font-size:13px">${U.fmtCN(monday)} 起</span></div>
      <div class="page-desc">按截止日倒排、整块/碎片匹配、精力曲线排序。生成只动「学习块」，课程与占用不受影响。</div>
      <div class="card" style="margin-bottom:14px">
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
          <button class="btn" id="wPrev">‹ 上一周</button>
          <button class="btn" id="wNow">本周</button>
          <button class="btn" id="wNext">下一周 ›</button>
          <span style="width:1px;height:22px;background:var(--line);margin:0 4px"></span>
          <button class="btn primary" id="btnGen">${s.plan.weekOf === monday ? '重新生成本页计划' : '生成本页计划'}</button>
          ${s.plan.items.length ? `<button class="btn danger" id="btnClearPlan">清空计划</button>` : ''}
          <span style="flex:1"></span>
          <span class="muted small" id="planStat"></span>
        </div>
      </div>
      <div class="card" id="planGridCard"></div>
      <div class="legend">
        <span><i style="background:var(--gray-block);border:1px solid #cdd3e0"></i>课程</span>
        <span><i style="background:repeating-linear-gradient(45deg,#eceef3,#eceef3 6px,#e2e6ee 6px,#e2e6ee 12px)"></i>单次占用</span>
        <span><i style="background:#4f7cff"></i>学习块（颜色 = 目标，点击可标完成/删除）</span>
      </div>
      <div id="planWarn"></div>
      <div class="card" style="margin-top:14px">
        <h3>让 AI 调整 <span class="hint">如"周六想留白" "数学竞赛延到12月20日" "下周每天少排点"</span></h3>
        <div class="chatbar">
          <input id="chatInput" placeholder="${PB.llm.configured() ? '说一句你想怎么调整…' : '未配置 AI 接口（到设置页配置后可用），手动调整可点色块或改目标'}">
          <button class="btn primary" id="chatSend">发送</button>
        </div>
        <div id="chatResult"></div>
      </div>`;

    renderPlanGrid(root.querySelector('#planGridCard'), monday, root);
    updatePlanStat(root.querySelector('#planStat'), monday);
    renderPlanWarnings(root.querySelector('#planWarn'));

    root.querySelector('#wPrev').onclick = () => { curMonday = U.dateStr(U.addDays(U.parseDate(monday), -7)); plan(root); };
    root.querySelector('#wNext').onclick = () => { curMonday = U.dateStr(U.addDays(U.parseDate(monday), 7)); plan(root); };
    root.querySelector('#wNow').onclick = () => { curMonday = null; plan(root); };
    root.querySelector('#btnGen').onclick = () => {
      UI.confirmBox(`${s.plan.weekOf === monday ? '重新生成将替换' : '生成'} ${U.fmtCN(monday)} 这一周的学习安排（不影响课程），继续？`, () => {
        const r = PB.engine.generatePlan(monday);
        const st = PB.store.get();
        st.plan = { weekOf: r.weekOf, items: r.items, warnings: r.warnings };
        PB.store.save();
        UI.toast(r.warnings.length ? `已生成，但有 ${r.warnings.length} 条排不下的提醒` : '本周计划已生成', r.warnings.length ? 'err' : 'ok');
        plan(root);
      }, { danger: false, okLabel: '生成' });
    };
    const clearBtn = root.querySelector('#btnClearPlan');
    if (clearBtn) clearBtn.onclick = () => UI.confirmBox('清空当前保存的周计划？', () => {
      const st = PB.store.get();
      st.plan = { weekOf: '', items: [], warnings: [] };
      PB.store.save(); plan(root);
    });

    // AI 对话调整
    const sendBtn = root.querySelector('#chatSend');
    sendBtn.onclick = async () => {
      const input = root.querySelector('#chatInput');
      const msg = input.value.trim();
      if (!msg) return;
      if (!PB.llm.configured()) { UI.toast('未配置 AI 接口：请到「设置」填写 API 地址与密钥', 'err'); return; }
      sendBtn.disabled = true; sendBtn.textContent = '思考中…';
      const box = root.querySelector('#chatResult');
      box.innerHTML = '<p class="muted small">AI 正在分析你的要求…</p>';
      try {
        const r = await PB.llm.chatAdjust(msg);
        sendBtn.disabled = false; sendBtn.textContent = '发送';
        box.innerHTML = `<div class="divider"></div><p class="small">${U.esc(r.reply || '已收到。')}</p>`;
        const ops = r.ops || [];
        if (!ops.length) { box.innerHTML += '<p class="muted small">没有需要执行的操作。</p>'; return; }
        const descs = ops.map(o => opDesc(o));
        box.innerHTML += `
          <div class="small" style="margin:6px 0">将执行 <b>${ops.length}</b> 项操作：</div>
          ${descs.map(d => `<div class="risk-item"><span>•</span><span>${U.esc(d)}</span></div>`).join('')}
          <div style="margin-top:10px;display:flex;gap:8px">
            <button class="btn primary" id="opsOk">确认执行</button>
            <button class="btn" id="opsNo">取消</button>
          </div>`;
        box.querySelector('#opsNo').onclick = () => { box.innerHTML = ''; };
        box.querySelector('#opsOk').onclick = () => {
          const replanOffset = applyOps(ops);
          box.innerHTML = '<p class="small" style="color:var(--green)">✅ 已执行。</p>';
          if (replanOffset != null) {
            curMonday = U.dateStr(U.addDays(U.mondayOf(U.today()), replanOffset * 7));
            const rr = PB.engine.generatePlan(getMonday());
            const st = PB.store.get();
            st.plan = { weekOf: rr.weekOf, items: rr.items, warnings: rr.warnings };
            PB.store.save();
          }
          plan(root);
        };
      } catch (err) {
        sendBtn.disabled = false; sendBtn.textContent = '发送';
        box.innerHTML = `<p class="small" style="color:var(--red)">${U.esc(err.message)}</p>`;
      }
      input.value = '';
    };
  }

  function opDesc(o) {
    const p = o.payload || {};
    switch (o.op) {
      case 'addGoal': return `新增目标「${p.title}」（截止 ${p.deadline || '无'}，预计 ${p.estHours || '?'}h，${p.priority === 'high' ? '高' : p.priority === 'low' ? '低' : '中'}优先）`;
      case 'updateGoal': return `调整目标「${p.match}」：${[p.deadline && `截止→${p.deadline}`, p.estHours != null && `工时→${p.estHours}h`, p.priority && `优先级→${p.priority}`].filter(Boolean).join('，') || '（无变化字段）'}`;
      case 'removeGoal': return `删除目标「${p.match}」`;
      case 'addTask': return `给「${p.goalMatch}」添加任务「${p.title}」（${p.estHours || '?'}h）`;
      case 'removeTask': return `删除任务「${p.match}」`;
      case 'updateSetting': return `调整设置：${p.key} → ${p.value}`;
      case 'replan': return `重新生成${(+p.weekOffset || 0) === 0 ? '本周' : '目标周'}计划`;
      default: return `未知操作 ${o.op}`;
    }
  }

  function applyOps(ops) {
    const st = PB.store.get();
    let replanOffset = null;
    for (const o of ops) {
      const p = o.payload || {};
      try {
        if (o.op === 'addGoal') {
          st.goals.push({ id: PB.store.uid(), title: p.title || '未命名目标', category: p.category || '其他', deadline: p.deadline || '', priority: p.priority || 'med', estHours: +p.estHours || 5, note: p.note || '', subjectId: null, createdAt: U.dateStr(U.today()) });
        } else if (o.op === 'updateGoal') {
          const g = st.goals.find(x => x.title.includes(p.match));
          if (g) { if (p.deadline) g.deadline = p.deadline; if (p.estHours != null) g.estHours = +p.estHours; if (p.priority) g.priority = p.priority; if (p.note) g.note = p.note; if (p.category) g.category = p.category; }
        } else if (o.op === 'removeGoal') {
          const g = st.goals.find(x => x.title.includes(p.match));
          if (g) { st.goals = st.goals.filter(x => x.id !== g.id); st.tasks = st.tasks.filter(t => t.goalId !== g.id); }
        } else if (o.op === 'addTask') {
          const g = st.goals.find(x => x.title.includes(p.goalMatch));
          if (g) st.tasks.push({ id: PB.store.uid(), goalId: g.id, title: p.title || '新任务', estHours: +p.estHours || 2, doneHours: 0, qty: null, estFrom: 'ai', preferred: p.preferred || 'deep', priority: g.priority });
        } else if (o.op === 'removeTask') {
          st.tasks = st.tasks.filter(t => !t.title.includes(p.match));
        } else if (o.op === 'updateSetting') {
          if (['dailyCapH', 'dayStart', 'dayEnd', 'energy'].includes(p.key)) {
            st.settings[p.key] = p.key === 'dailyCapH' ? (+p.value || 10) : p.value;
          }
        } else if (o.op === 'replan') {
          replanOffset = +p.weekOffset || 0;
        }
      } catch (e) { console.warn('op failed', o, e); }
    }
    PB.store.save();
    return replanOffset;
  }

  function updatePlanStat(el, monday) {
    const s = PB.store.get();
    const isCurrent = s.plan.weekOf === monday;
    const h = isCurrent ? PB.engine.planHours(s.plan) / 60 : 0;
    const cap = PB.engine.weekCapacity(monday);
    el.textContent = isCurrent
      ? `已排 ${h.toFixed(1)}h / 本页可投入 ${U.fmtHours(cap.studyTotal)}`
      : `本页可投入 ${U.fmtHours(cap.studyTotal)}（未生成该周计划）`;
  }

  function renderPlanGrid(card, monday, root) {
    const s = PB.store.get();
    const blocks = [];
    for (const c of s.courses) {
      blocks.push({
        date: U.dateStr(U.addDays(U.parseDate(monday), (c.day - 1 + 7) % 7)),
        start: U.hm(c.start), end: U.hm(c.end), label: c.name, cls: 'course',
      });
    }
    for (const ev of s.events) {
      blocks.push({ date: ev.date, start: U.hm(ev.start), end: U.hm(ev.end), label: ev.name, cls: 'event' });
    }
    const isCurrent = s.plan.weekOf === monday;
    if (isCurrent) {
      for (const it of s.plan.items) {
        const g = s.goals.find(x => x.id === it.goalId);
        const t = s.tasks.find(x => x.id === it.taskId);
        blocks.push({
          date: it.date, start: it.start, end: it.end,
          label: t ? t.title : `推进《${g ? g.title : '?'}》`,
          sub: it.done ? '已完成' : (g ? g.title : ''),
          cls: 'task', color: PB.views.goalColor(it.goalId),
          onClick: () => planItemModal(it, () => plan(root)),
        });
      }
    }
    PB.views.weekGrid(card, monday, { blocks, showFree: true, showNow: true });
    if (!isCurrent && !s.courses.length && !s.events.length) {
      card.insertAdjacentHTML('beforeend', '<div class="empty">这一周还没有课表与计划数据。</div>');
    }
    if (isCurrent && !s.plan.items.length) {
      card.insertAdjacentHTML('beforeend', `<div class="empty">还没生成本周学习安排。${s.goals.length ? '点上方「生成本页计划」。</div>' : '先到「目标·任务」添加目标。</div>'}`);
    }
  }

  function planItemModal(it, onDone) {
    const s = PB.store.get();
    const t = s.tasks.find(x => x.id === it.taskId);
    const g = s.goals.find(x => x.id === it.goalId);
    const h = (it.end - it.start) / 60;
    UI.openModal({
      title: '学习块',
      bodyHTML: `
        <p style="font-size:14.5px"><b>${U.esc(t ? t.title : '整体推进')}</b></p>
        <p class="muted small">${U.fmtCN(it.date)} ${U.hmStr(it.start)}~${U.hmStr(it.end)}（${h.toFixed(1)} 小时）${g ? ` · 目标：${U.esc(g.title)}` : ''}</p>
        ${t ? `<p class="muted small">任务进度：已投入 ${(t.doneHours || 0).toFixed(1)}h / 预计 ${(t.estHours || 0).toFixed(1)}h</p>` : ''}`,
      footer: [
        ...(t ? [{
          label: it.done ? '撤销完成' : '✓ 标记完成（计入投入）', cls: it.done ? '' : 'primary',
          onClick: (close) => {
            const st = PB.store.get();
            const tt = st.tasks.find(x => x.id === it.taskId);
            const item = st.plan.items.find(x => x.id === it.id);
            if (tt && item) {
              if (it.done) tt.doneHours = Math.max(0, (tt.doneHours || 0) - h);
              else tt.doneHours = (tt.doneHours || 0) + h;
              item.done = !it.done;
              PB.store.save();
              UI.toast(it.done ? '已撤销' : `已计入 ${h.toFixed(1)} 小时投入`, 'ok');
            }
            close(); if (onDone) onDone();
          },
        }] : []),
        { label: '删除该块', cls: 'danger', onClick: (close) => {
          const st = PB.store.get();
          st.plan.items = st.plan.items.filter(x => x.id !== it.id);
          PB.store.save(); close(); if (onDone) onDone();
        } },
        { label: '关闭' },
      ],
    });
  }

  function renderPlanWarnings(container) {
    const s = PB.store.get();
    const warns = s.plan.warnings || [];
    if (!warns.length) { container.innerHTML = ''; return; }
    container.innerHTML = `
      <div class="card" style="margin-top:14px;border-color:#f2c6c8;background:#fffafa">
        <h3 style="color:var(--red)">排不下的任务（${warns.length}）</h3>
        ${warns.map(w => `<div class="risk-item"><span>📉</span><span>${U.esc(w)}</span></div>`).join('')}
      </div>`;
  }

  /* ── 分析报告页 ─────────────────────────────── */
  function report(root) {
    const s = PB.store.get();
    const f = PB.engine.feasibility();
    root.innerHTML = `
      <div class="page-title">分析报告</div>
      <div class="page-desc">时间账由规则引擎精确计算；AI 建议基于这份账单撰写，不重新算数。</div>
      <div class="verdict ${f.verdict === 'ok' ? 'ok' : f.verdict === 'warn' ? 'warn' : 'over'}">
        <div class="big">${s.goals.length ? f.verdictCN : '还没有目标'}</div>
        <div class="desc">${s.goals.length ? U.esc(f.verdictMsg) : '先到「目标·任务」添加目标或用一句话让 AI 拆解，再来生成报告。'}</div>
      </div>
      <div class="stats" style="margin-bottom:14px">
        <div class="stat"><div class="num">${f.capH.toFixed(1)}h</div><div class="lbl">每周可投入（整块 ${(f.cap.chunkTotal / 60).toFixed(1)}h + 碎片 ${(f.cap.fragTotal / 60).toFixed(1)}h 之内）</div></div>
        <div class="stat"><div class="num">${f.totalReq.toFixed(1)}h</div><div class="lbl">目标需求/周</div></div>
        <div class="stat"><div class="num">${Math.round(f.usage * 100)}%</div><div class="lbl">时间占用率</div></div>
        <div class="stat"><div class="num">${f.totalRemain.toFixed(1)}h</div><div class="lbl">全部剩余工作量</div></div>
      </div>
      <div class="card" style="margin-bottom:14px">
        <h3>目标明细</h3>
        ${f.perGoal.length ? `<table class="data">
          <thead><tr><th>目标</th><th>优先级</th><th>截止</th><th>剩余</th><th>每周需</th><th>状态</th><th>说明</th></tr></thead>
          <tbody>${f.perGoal.map(p => `
            <tr>
              <td><span class="goal-color-dot" style="display:inline-block;vertical-align:-1px;margin-right:5px;background:${PB.views.goalColor(p.goal.id)}"></span>${U.esc(p.goal.title)}</td>
              <td>${PB.engine.PRIO_CN[p.goal.priority] || '中'}</td>
              <td>${p.goal.deadline ? U.esc(p.goal.deadline) : '—'}</td>
              <td>${p.remaining.toFixed(1)}h</td>
              <td>${p.requiredPerWeek ? p.requiredPerWeek.toFixed(1) + 'h' : '—'}</td>
              <td><span class="badge ${p.status === 'ok' || p.status === 'done' ? 'green' : p.status === 'tight' ? 'orange' : p.status === 'overdue' ? 'gray' : 'red'}">${p.statusCN}</span></td>
              <td class="muted small">${U.esc(p.advice || '')}</td>
            </tr>`).join('')}</tbody></table>` : '<div class="empty">暂无目标。</div>'}
      </div>
      <div class="row">
        <div class="card grow">
          <h3>风险与冲突 <span class="hint">规则检测</span></h3>
          ${f.risks.length ? f.risks.map(r => `<div class="risk-item"><span>⚠️</span><span>${U.esc(r)}</span></div>`).join('') : '<div class="muted">暂无风险。</div>'}
        </div>
        <div class="card grow">
          <h3>规则建议 <span class="hint">自动生成</span></h3>
          ${f.suggestions.map(sg => `<div class="risk-item"><span>💡</span><span>${U.esc(sg)}</span></div>`).join('')}
        </div>
      </div>
      <div class="card" style="margin-top:14px">
        <h3>AI 深度建议 <span class="hint">${PB.llm.configured() ? '基于上方时间账' : '需在设置中配置 AI 接口'}</span></h3>
        <div id="aiAdvice"><div class="muted small">点击按钮生成：AI 会结合你的时间账、目标优先级给出取舍建议。</div></div>
        <button class="btn primary" id="btnAdvice" style="margin-top:10px" ${s.goals.length ? '' : 'disabled'}>生成 AI 深度建议</button>
      </div>`;

    const btn = root.querySelector('#btnAdvice');
    if (s.goals.length) btn.onclick = async () => {
      btn.disabled = true; btn.textContent = '生成中…';
      const box = root.querySelector('#aiAdvice');
      box.innerHTML = '<p class="muted small">AI 正在结合你的时间账撰写建议…</p>';
      try {
        const text = await PB.llm.advise(f);
        box.innerHTML = `<div class="md">${U.md(text)}</div>`;
        btn.textContent = '重新生成';
      } catch (err) {
        box.innerHTML = `<p class="small" style="color:var(--red)">${U.esc(err.message)}</p>`;
        btn.textContent = '重试';
      }
      btn.disabled = false;
    };
  }

  /* ── 设置页 ─────────────────────────────────── */
  function settings(root) {
    const s = PB.store.get();
    const st = s.settings;
    root.innerHTML = `
      <div class="page-title">设置</div>
      <div class="page-desc">所有数据仅保存在本机浏览器（localStorage），可随时导出备份。</div>
      <div class="row">
        <div class="card grow">
          <h3>时间与精力</h3>
          <div class="inline-form">
            <div class="field" style="flex:1"><label>每天规划起点</label><input id="fDayStart" type="time" value="${st.dayStart}"></div>
            <div class="field" style="flex:1"><label>每天规划终点</label><input id="fDayEnd" type="time" value="${st.dayEnd}"></div>
          </div>
          <div class="inline-form">
            <div class="field" style="flex:1"><label>整块时间阈值（分钟）</label><input id="fChunk" type="number" min="30" step="10" value="${st.chunkMin}"></div>
            <div class="field" style="flex:1"><label>每天学习上限（小时）</label><input id="fCap" type="number" min="1" max="16" value="${st.dailyCapH}"></div>
            <div class="field" style="flex:1"><label>精力类型</label><select id="fEnergy">
              ${[['morning', '早型（上午效率高）'], ['balanced', '均衡'], ['night', '夜型（晚上效率高）']].map(([v, l]) => `<option value="${v}" ${st.energy === v ? 'selected' : ''}>${l}</option>`).join('')}
            </select></div>
            <div class="field" style="flex:1"><label>三餐缓冲</label><select id="fMeals">
              <option value="1" ${st.meals !== false ? 'selected' : ''}>扣除 午12:00-13:00 晚18:00-19:00</option>
              <option value="0" ${st.meals === false ? 'selected' : ''}>不扣除（全天可排）</option>
            </select></div>
          </div>
          <button class="btn primary" id="btnSaveSetting">保存时间设置</button>
          <div class="foot-hint">精力类型影响计划生成时对时段的偏好：早型优先排上午，夜型优先排晚上。</div>
        </div>
        <div class="card grow">
          <h3>AI 接口（OpenAI 兼容）</h3>
          <div class="field"><label>API 地址 Base URL</label><input id="fBase" value="${U.esc(st.llm.baseURL)}" placeholder="https://api.deepseek.com"></div>
          <div class="field"><label>API Key</label><input id="fKey" type="password" value="${U.esc(st.llm.apiKey)}" placeholder="sk-…"></div>
          <div class="field"><label>模型</label><input id="fModel" value="${U.esc(st.llm.model)}" placeholder="deepseek-chat"></div>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <button class="btn primary" id="btnSaveLLM">保存 AI 配置</button>
            <button class="btn" id="btnTestLLM">测试连接</button>
          </div>
          <div class="foot-hint">常用地址：DeepSeek <span class="kbd">https://api.deepseek.com</span> · 智谱 <span class="kbd">https://open.bigmodel.cn/api/paas/v4</span>（模型如 glm-4-flash）。Key 只存本机浏览器，调用由你的浏览器直连服务商；若服务商不允许浏览器跨域会失败，属服务商策略。</div>
        </div>
      </div>
      <div class="card" style="margin-top:14px">
        <h3>数据管理</h3>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn" id="btnExport">导出备份（JSON）</button>
          <button class="btn" id="btnImport">导入备份</button>
          <button class="btn" id="btnDemo">载入示例数据</button>
          <button class="btn danger" id="btnReset">清空全部数据</button>
        </div>
        <input type="file" id="importFile" accept=".json" style="display:none">
        <div class="foot-hint">版本 v${PB.version} · 单文件本地应用，无需服务器。</div>
      </div>`;

    root.querySelector('#btnSaveSetting').onclick = () => {
      const dst = UI.fv(root, '#fDayStart'), den = UI.fv(root, '#fDayEnd');
      if (U.hm(den) - U.hm(dst) < 240) { UI.toast('规划窗口至少要有 4 小时', 'err'); return; }
      const stt = PB.store.get().settings;
      stt.dayStart = dst; stt.dayEnd = den;
      stt.chunkMin = Math.max(30, +UI.fv(root, '#fChunk') || 90);
      stt.dailyCapH = Math.min(16, Math.max(1, +UI.fv(root, '#fCap') || 10));
      stt.energy = UI.fv(root, '#fEnergy');
      stt.meals = UI.fv(root, '#fMeals') !== '0';
      PB.store.save(); UI.toast('已保存', 'ok');
    };
    root.querySelector('#btnSaveLLM').onclick = () => {
      const stt = PB.store.get().settings.llm;
      stt.baseURL = UI.fv(root, '#fBase');
      stt.apiKey = UI.fv(root, '#fKey');
      stt.model = UI.fv(root, '#fModel') || 'deepseek-chat';
      PB.store.save(); UI.toast('已保存 AI 配置', 'ok');
    };
    root.querySelector('#btnTestLLM').onclick = async (e) => {
      const b = e.target;
      b.disabled = true; b.textContent = '测试中…';
      try {
        const reply = await PB.llm.testConnection();
        UI.toast('连接成功：' + reply, 'ok');
      } catch (err) {
        UI.toast('连接失败：' + err.message, 'err');
      }
      b.disabled = false; b.textContent = '测试连接';
    };
    root.querySelector('#btnExport').onclick = () => {
      const blob = new Blob([JSON.stringify(PB.store.get(), null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `shiguang-backup-${U.dateStr(U.today()).replaceAll('-', '')}.json`;
      a.click();
    };
    root.querySelector('#btnImport').onclick = () => root.querySelector('#importFile').click();
    root.querySelector('#importFile').onchange = async e => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const data = JSON.parse(await file.text());
        if (!data || (!data.goals && !data.courses)) throw new Error('文件格式不对');
        UI.confirmBox('导入将覆盖当前全部数据，继续？', () => {
          PB.store.replaceAll(data);
          UI.toast('导入成功', 'ok');
          PB.app.nav('dashboard');
        }, { danger: false, okLabel: '覆盖导入' });
      } catch (err) { UI.toast('导入失败：' + err.message, 'err'); }
      e.target.value = '';
    };
    root.querySelector('#btnDemo').onclick = () => UI.confirmBox('载入示例数据将<b>覆盖</b>当前数据，继续？', () => {
      PB.demo.load(); UI.toast('示例数据已载入', 'ok'); PB.app.nav('dashboard');
    }, { danger: false, okLabel: '载入' });
    root.querySelector('#btnReset').onclick = () => UI.confirmBox('确定清空<b>全部</b>数据（目标/任务/课表/计划/资料）？不可恢复！', () => {
      PB.store.reset(); UI.toast('已清空', 'ok'); PB.app.nav('dashboard');
    });
  }

  PB.views.plan = plan;
  PB.views.report = report;
  PB.views.settings = settings;
})();
