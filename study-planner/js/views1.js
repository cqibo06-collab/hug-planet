/* ============================================================
 * views1.js — 共享周网格组件 + 总览页 + 课表页（含 ICS/CSV 导入）
 * ============================================================ */
PB.views = PB.views || {};
(() => {
  const U = PB.util, UI = PB.ui;
  const PXPM = 0.9; // 每分钟像素

  const GOAL_COLORS = ['#4f7cff', '#22b07d', '#f59e0b', '#e5585e', '#8b5cf6', '#14b8a6', '#f97316', '#6366f1'];
  const _colorCache = {};
  function goalColor(goalId) {
    if (!_colorCache[goalId]) {
      const s = PB.store.get();
      const ids = s.goals.map(g => g.id);
      const idx = Math.max(0, ids.indexOf(goalId));
      _colorCache[goalId] = GOAL_COLORS[idx % GOAL_COLORS.length];
    }
    return _colorCache[goalId];
  }

  /* ── 共享周网格 ────────────────────────────────
   * opts: { blocks:[{date,start,end,label,sub,cls,color,onClick}], showFree, showNow } */
  function weekGrid(root, mondayStr, opts = {}) {
    const s = PB.store.get();
    const winS = Math.max(0, U.hm(s.settings.dayStart));
    const winE = Math.min(24 * 60, U.hm(s.settings.dayEnd));
    const px = m => (m - winS) * PXPM;
    const H = Math.max(60, (winE - winS) * PXPM);
    const todayStr = U.dateStr(U.today());
    const chunkMin = s.settings.chunkMin;

    const wrap = document.createElement('div');
    wrap.className = 'weekgrid-wrap';
    const grid = document.createElement('div');
    grid.className = 'weekgrid';
    grid.style.display = 'grid';
    grid.style.gridTemplateColumns = '52px repeat(7, minmax(96px, 1fr))';
    grid.style.gridTemplateRows = `32px ${H}px`;
    wrap.appendChild(grid);

    // 表头
    const corner = document.createElement('div');
    corner.className = 'wg-head'; corner.style.gridColumn = '1'; corner.style.gridRow = '1';
    grid.appendChild(corner);
    for (let i = 0; i < 7; i++) {
      const d = U.addDays(U.parseDate(mondayStr), i);
      const ds = U.dateStr(d);
      const head = document.createElement('div');
      head.className = 'wg-head' + (ds === todayStr ? ' today' : '');
      head.style.gridColumn = String(i + 2); head.style.gridRow = '1';
      head.innerHTML = `<span class="d">${U.DAY_CN[d.getDay()]}</span><span class="cn">${d.getMonth() + 1}/${d.getDate()}</span>`;
      grid.appendChild(head);
    }

    // 时间轴刻度
    const gutter = document.createElement('div');
    gutter.style.gridColumn = '1'; gutter.style.gridRow = '2';
    gutter.style.position = 'relative'; gutter.style.background = 'var(--card)';
    grid.appendChild(gutter);
    for (let h = Math.ceil(winS / 60); h <= Math.floor(winE / 60); h++) {
      const t = document.createElement('div');
      t.className = 'wg-time';
      t.style.position = 'absolute'; t.style.top = (px(h * 60) - 7) + 'px'; t.style.right = '4px'; t.style.left = '0';
      t.textContent = U.hmStr(h * 60);
      gutter.appendChild(t);
    }

    // 七列
    for (let i = 0; i < 7; i++) {
      const date = U.dateStr(U.addDays(U.parseDate(mondayStr), i));
      const cell = document.createElement('div');
      cell.style.gridColumn = String(i + 2); cell.style.gridRow = '2';
      cell.style.position = 'relative';
      cell.style.height = H + 'px';
      cell.style.borderRight = '1px solid var(--line)';
      cell.style.backgroundImage = 'repeating-linear-gradient(to bottom, var(--line) 0 1px, transparent 1px ' + Math.round(60 * PXPM) + 'px)';
      grid.appendChild(cell);

      // 空闲时间底色
      if (opts.showFree) {
        const lay = PB.engine.dayLayout(date);
        for (const iv of lay.free) {
          const f = document.createElement('div');
          const chunk = iv.e - iv.s >= chunkMin;
          f.style.cssText = `position:absolute;left:0;right:0;top:${px(iv.s)}px;height:${(iv.e - iv.s) * PXPM}px;pointer-events:none;background:${chunk ? '#e9f5ee' : '#f4f8f4'};`;
          cell.appendChild(f);
        }
      }

      // 时间块
      for (const b of (opts.blocks || []).filter(x => x.date === date)) {
        const el = document.createElement('div');
        el.className = 'wg-block ' + (b.cls || '');
        el.style.top = px(b.start) + 'px';
        el.style.height = Math.max(16, (b.end - b.start) * PXPM - 2) + 'px';
        if (b.color) { el.style.background = b.color; el.style.color = '#fff'; el.style.borderColor = 'rgba(0,0,0,.08)'; }
        el.innerHTML = `<span class="t">${U.esc(b.label)}</span><br><span class="mini">${U.hmStr(b.start)}~${U.hmStr(b.end)}${b.sub ? ' · ' + U.esc(b.sub) : ''}</span>`;
        if (b.onClick) el.onclick = () => b.onClick(b);
        cell.appendChild(el);
      }

      // 当前时间线
      if (opts.showNow && date === todayStr) {
        const now = new Date();
        const nowMin = now.getHours() * 60 + now.getMinutes();
        if (nowMin >= winS && nowMin <= winE) {
          const line = document.createElement('div');
          line.className = 'now-line';
          line.style.top = px(nowMin) + 'px';
          cell.appendChild(line);
        }
      }
    }
    root.appendChild(wrap);
  }

  /* ── 共享：AI 配置引导 ─────────────────────── */
  function aiGuideModal() {
    UI.openModal({
      title: 'AI 功能需要先配置接口',
      bodyHTML: `
        <p>AI 只负责三件事：<b>理解你的描述拆目标、写深度建议、对话式调整计划</b>。时间账、冲突检测、计划生成全部是本地规则，没有 AI 也完整可用。</p>
        <div class="divider"></div>
        <p class="muted small">配置方法：到「设置」填 OpenAI 兼容接口的地址、Key 和模型（DeepSeek / 智谱等都行）。Key 只存本机浏览器。</p>`,
      footer: [
        { label: '手动添加就行' },
        { label: '去配置', cls: 'primary', onClick: (close) => { close(); PB.app.nav('settings'); } },
      ],
    });
  }

  /* ── 共享：时间账推演说明 ──────────────────── */
  function capExplainHTML(f) {
    const e = f.capExplain;
    return `计算过程：课表与三餐之外的空闲 <b>${e.rawFreeH}h</b>（整块 ${e.chunkH}h + 碎片 ${e.fragH}h）→ 受「每天学习上限 ${e.capPerDay}h」约束 → 每周可投入 <b>${e.studyH}h</b>。上限可在「设置」调整，建议留出缓冲。`;
  }

  /* ── 共享：导出备份 ────────────────────────── */
  function exportBackup() {
    PB.store.markBackup();
    const blob = new Blob([JSON.stringify(PB.store.get(), null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `shiguang-backup-${U.dateStr(U.today()).replaceAll('-', '')}.json`;
    a.click();
    UI.toast('备份已导出', 'ok');
  }

  /* ── 共享：完成学习块（记录实际耗时） ──────── */
  function completeBlockFlow(item, onDone) {
    const s = PB.store.get();
    const t = s.tasks.find(x => x.id === item.taskId);
    const g = s.goals.find(x => x.id === item.goalId);
    const h = (item.end - item.start) / 60;
    const started = item.startedAt ? (Date.now() - item.startedAt) / 3600000 : null;
    const defH = started ? Math.max(0.1, Math.round(started * 10) / 10) : h;
    UI.openModal({
      title: '完成学习块',
      bodyHTML: `
        <p style="font-size:14.5px"><b>${U.esc(t ? t.title : '推进《' + (g ? g.title : '?') + '》')}</b></p>
        <p class="muted small">${U.fmtCN(item.date)} ${U.hmStr(item.start)}~${U.hmStr(item.end)}（计划 ${h.toFixed(1)}h）${t ? ` · 任务进度：已投入 ${(t.doneHours || 0).toFixed(1)}/${(t.estHours || 0).toFixed(1)}h` : ''}</p>
        ${started ? `<p class="small">从开始到现在约 <b>${defH.toFixed(1)}h</b>，已自动填入。</p>` : ''}
        <div class="field" style="margin-top:8px"><label>实际用时（小时）——会用于校准你的估算节奏</label><input id="fActual" type="number" min="0" step="0.1" value="${defH}"></div>`,
      footer: [
        { label: '取消' },
        { label: '✓ 标记完成', cls: 'primary', onClick: (close) => {
          const a = Math.max(0, +UI.fv(document, '#fActual') || 0);
          const st = PB.store.get();
          const tt = st.tasks.find(x => x.id === item.taskId);
          const it = st.plan.items.find(x => x.id === item.id);
          if (it) {
            if (!it.done && tt) tt.doneHours = (tt.doneHours || 0) + h;
            if (tt && a > 0) tt.actualHours = (tt.actualHours || 0) + a;
            it.done = true; it.actualHours = a; delete it.startedAt;
            PB.store.save();
            UI.toast(`已完成，记录实际 ${a.toFixed(1)}h${tt ? '（任务已投 ' + tt.actualHours.toFixed(1) + 'h）' : ''}`, 'ok');
          }
          close(); if (onDone) onDone();
        } },
      ],
    });
  }

  /* ── 共享：延期单个学习块 ──────────────────── */
  function deferBlockFlow(item, onDone) {
    const tomorrow = U.dateStr(U.addDays(U.today(), 1));
    UI.openModal({
      title: '顺延这个学习块',
      bodyHTML: `
        <p class="muted small" style="margin-bottom:8px">保持时长 ${(item.end - item.start) / 60}h，自动放到目标日第一个放得下的空闲时段。</p>
        <div class="field"><label>顺延到</label><input id="fDate" type="date" value="${tomorrow}"></div>
        <div id="deferHint" class="muted small"></div>`,
      footer: [
        { label: '取消' },
        { label: '顺延', cls: 'primary', onClick: (close) => {
          const nd = UI.fv(document, '#fDate');
          if (!nd) { UI.toast('请选日期', 'err'); return; }
          const st = PB.store.get();
          const it = st.plan.items.find(x => x.id === item.id);
          if (!it) { close(); return; }
          const dur = it.end - it.start;
          // 目标日空闲：扣除课程/事件/三餐 + 已排块
          const lay = PB.engine.dayLayout(nd);
          const busyPlan = st.plan.items.filter(x => x.date === nd && !x.done && x.id !== it.id).map(x => ({ s: x.start, e: x.end }));
          const free = U.subtract(lay.free, busyPlan);
          let start = null;
          const same = free.find(iv => it.start >= iv.s && it.start + dur <= iv.e);
          if (same) start = it.start;
          else {
            const fit = free.find(iv => iv.e - iv.s >= dur);
            if (!fit) {
              UI.confirmBox(`${U.fmtCN(nd)} 找不到 ${dur} 分钟的连续空闲。仍要挪过去（允许与已排块相邻挤压）吗？`, () => {
                it.date = nd; delete it.startedAt;
                PB.store.save(); UI.toast('已顺延（未自动找位）', 'ok'); if (onDone) onDone();
              }, { danger: false, okLabel: '仍要顺延' });
              return;
            }
            start = fit.s;
          }
          it.date = nd; it.start = start; it.end = start + dur; delete it.startedAt;
          PB.store.save();
          UI.toast(`已顺延到 ${U.fmtCN(nd)} ${U.hmStr(start)}`, 'ok');
          close(); if (onDone) onDone();
        } },
      ],
    });
  }

  /* ── 共享：重新安排本周（保留已完成/锁定块，带预览） ── */
  function replanWeekPreview(onDone) {
    const s = PB.store.get();
    const monday = U.dateStr(U.mondayOf(U.today()));
    const r = PB.engine.generatePlan(monday, null, true); // 试算，不落库
    const cur = s.plan.weekOf === monday ? s.plan.items : [];
    const kept = cur.filter(i => i.done || i.locked);
    const keptH = kept.reduce((a, i) => a + i.end - i.start, 0);
    const keptDone = kept.filter(i => i.done).length;
    const keptLock = kept.length - keptDone;
    UI.openModal({
      title: '重新安排本周计划',
      bodyHTML: `
        <p class="small">调整方式：<b>已完成 ${keptDone} 块 + 已锁定 ${keptLock} 块</b>（共 ${U.fmtHours(keptH)}）原样保留；其余任务的剩余工时重新排入空闲时间。</p>
        <div class="divider"></div>
        <div class="small"><b>新安排：</b>${r.items.length - r.preservedCount} 个学习块（共 ${U.fmtHours((r.items.length - r.preservedCount) > 0 ? r.items.filter(i => !(i.done || i.locked)).reduce((a, i) => a + i.end - i.start, 0) : 0)}）</div>
        ${r.warnings.length ? `<div class="divider"></div><div class="small" style="color:var(--red)">${r.warnings.map(w => '⚠ ' + U.esc(w)).join('<br>')}</div>` : ''}`,
      footer: [
        { label: '取消' },
        { label: '应用新安排', cls: 'primary', onClick: (close) => {
          PB.store.snapshot();
          const st = PB.store.get();
          st.plan = { weekOf: r.weekOf, items: r.items, warnings: r.warnings };
          PB.store.save();
          close();
          UI.toast(`已重新安排（保留 ${r.preservedCount} 块）`, r.warnings.length ? 'err' : 'ok', {
            label: '撤销',
            onClick: () => { PB.store.undo(); PB.app.nav(PB.app.current || 'dashboard'); },
          });
          if (onDone) onDone();
        } },
      ],
    });
  }

  /* ── 总览页（今日执行） ─────────────────────── */
  function dashboard(root) {
    const s = PB.store.get();
    const todayStr = U.dateStr(U.today());
    root.innerHTML = '';

    // 空状态引导：先问每日投入，再给三步
    if (!s.courses.length && !s.events.length && !s.goals.length) {
      root.innerHTML = `
        <div class="page-title">欢迎使用拾光规划</div>
        <div class="page-desc">课表只是时间参考——这里帮你算清可用时间、评估目标可行性、生成并解释每周安排。</div>
        <div class="card" style="margin-bottom:14px">
          <h3>先告诉我：课外每天大概能投入多久？</h3>
          <div class="muted small">这决定计划排多满，之后随时可以在「设置」里改。建议留点缓冲，别选极限值。</div>
          <div class="cap-q">
            ${[['2', '约 2 小时'], ['4', '约 4 小时'], ['6', '约 6 小时'], ['10', '8 小时以上']].map(([v, l]) => `<button class="btn" data-cap="${v}">${l}</button>`).join('')}
          </div>
        </div>
        <div class="card">
          <div class="onboard">
            <div class="step"><span class="n">1</span><div class="t">导入课表</div><div class="d">到「课表」页导入教务系统 .xls、ICS 文件、粘贴文本，或手动添加。它只用来扣除已占用时间。</div></div>
            <div class="step"><span class="n">2</span><div class="t">写下目标</div><div class="d">到「目标·任务」用一句话描述（如"12月中旬数学竞赛"），AI 帮你拆成带工时的任务；手动添加也完全可以。</div></div>
            <div class="step"><span class="n">3</span><div class="t">看分析与计划</div><div class="d">「分析报告」先告诉你时间够不够、怎么取舍，「周计划」给出具体到时段的安排。</div></div>
          </div>
          <div style="margin-top:14px;display:flex;gap:10px;flex-wrap:wrap">
            <button class="btn primary" id="obDemo">载入示例数据，先看看效果</button>
            <button class="btn" id="obTT">去导入课表</button>
          </div>
        </div>`;
      root.querySelectorAll('[data-cap]').forEach(b => {
        b.onclick = () => {
          const st = PB.store.get();
          st.settings.dailyCapH = +b.dataset.cap;
          st.settings.onboardCapDone = true;
          PB.store.save();
          UI.toast(`已设为每天约 ${b.dataset.cap} 小时，随时可在「设置」调整`, 'ok');
          dashboard(root);
        };
      });
      root.querySelector('#obDemo').onclick = () => { PB.demo.load(); PB.app.nav('dashboard'); };
      root.querySelector('#obTT').onclick = () => PB.app.nav('timetable');
      return;
    }

    const f = PB.engine.feasibility();
    const monday = U.dateStr(U.mondayOf(U.today()));
    const planCurrent = s.plan.weekOf === monday;
    const plannedH = planCurrent ? PB.engine.planHours(s.plan) / 60 : 0;

    // 备份提醒
    const hasData = s.courses.length || s.events.length || s.goals.length || s.tasks.length;
    const lastB = s.meta.lastBackup;
    const backupDays = lastB ? U.dayDiff(todayStr, lastB) : null;
    const needBackup = hasData && (lastB == null || backupDays >= 7);

    const vColor = { over: 'var(--red)', ok: 'var(--green)', warn: 'var(--orange)', empty: 'var(--ink2)', nocap: 'var(--red)' };
    root.innerHTML = `
      <div class="page-title">总览 <span class="muted" style="font-weight:400;font-size:13px">${U.fmtCN(todayStr)}</span></div>
      <div class="page-desc">今天做什么、时间账是否平衡。</div>
      ${needBackup ? `<div class="banner"><span>💾 数据只保存在这台浏览器里（上次备份：${lastB || '从未'}）。建议定期导出备份文件。</span><button class="btn sm" id="bkBtn">导出备份</button></div>` : ''}
      <div class="stats">
        <div class="stat"><div class="num">${f.capExplain.studyH}h</div><div class="lbl">每周可投入</div></div>
        <div class="stat"><div class="num">${f.totalReq ? f.totalReq.toFixed(1) + ' h' : '—'}</div><div class="lbl">目标需求（每周）</div></div>
        <div class="stat ${planCurrent ? 'ok' : ''}"><div class="num">${planCurrent ? U.fmtHours(plannedH * 60) : '未生成'}</div><div class="lbl">本周计划已排</div></div>
        <div class="stat"><div class="num" style="color:${vColor[f.verdict] || 'var(--ink)'};font-size:${f.verdictCN.length > 4 ? '17px' : '24px'}">${f.verdictCN}</div><div class="lbl">可行性结论</div></div>
      </div>
      <div class="muted small" style="margin:8px 2px 0">${capExplainHTML(f)}</div>
      <div class="row" style="margin-top:14px">
        <div class="card grow" style="flex:2 1 460px">
          <h3>今日执行 <span class="hint">开始 / 完成（记实际用时）/ 顺延</span></h3>
          <div id="todayRun"></div>
          <div id="dueToday"></div>
          <div id="replanRow"></div>
        </div>
        <div class="col" style="flex:1 1 280px">
          <div class="card">
            <h3>风险与提醒</h3>
            <div id="riskList"></div>
            <button class="btn sm" style="margin-top:8px" id="goReport">查看完整分析报告</button>
          </div>
          <div class="card">
            <h3>快捷操作</h3>
            <div style="display:flex;gap:8px;flex-wrap:wrap">
              <button class="btn sm" id="qaGoal">添加目标</button>
              <button class="btn sm" id="qaTT">导入课表</button>
              <button class="btn sm" id="qaPlan">去周计划</button>
            </div>
            <div class="foot-hint">没配 AI 也能用全部功能；AI 只负责理解描述和写建议。</div>
          </div>
        </div>
      </div>`;

    if (needBackup) root.querySelector('#bkBtn').onclick = exportBackup;

    renderTodayRun(root.querySelector('#todayRun'), todayStr, planCurrent);
    renderDueToday(root.querySelector('#dueToday'), todayStr, planCurrent);

    // 重新安排入口
    const rr = root.querySelector('#replanRow');
    const undoneToday = planCurrent ? s.plan.items.filter(i => i.date === todayStr && !i.done) : [];
    const overdueTasks = s.tasks.filter(t => t.due && t.due < todayStr && PB.engine.taskRemaining(t) > 0.05);
    if (planCurrent && (undoneToday.length || overdueTasks.length)) {
      rr.innerHTML = `<div class="divider" style="margin:10px 0"></div>
        <button class="btn" id="btnReplan">🔄 把没完成的重新安排${overdueTasks.length ? `（含 ${overdueTasks.length} 个已过期任务）` : ''}</button>
        <span class="muted small" style="margin-left:8px">已完成和锁定的时段会原样保留，调整前先给你看预览</span>`;
      rr.querySelector('#btnReplan').onclick = () => replanWeekPreview(() => dashboard(root));
    }

    // 风险
    const rl = root.querySelector('#riskList');
    if (!f.risks.length) rl.innerHTML = '<div class="muted">暂无风险，按计划推进即可。</div>';
    else rl.innerHTML = f.risks.slice(0, 4).map(r => `<div class="risk-item"><span>⚠️</span><span>${U.esc(r)}</span></div>`).join('');

    root.querySelector('#goReport').onclick = () => PB.app.nav('report');
    root.querySelector('#qaGoal').onclick = () => { PB.app.nav('goals'); };
    root.querySelector('#qaTT').onclick = () => PB.app.nav('timetable');
    root.querySelector('#qaPlan').onclick = () => PB.app.nav('plan');
  }

  /* 今日执行列表 */
  function renderTodayRun(container, todayStr, planCurrent) {
    const s = PB.store.get();
    const lay = PB.engine.dayLayout(todayStr);
    const planItems = planCurrent ? s.plan.items.filter(it => it.date === todayStr) : [];
    const rows = [
      ...lay.busy.map(b => ({ kind: b.type, start: b.s, end: b.e, label: b.label, item: null })),
      ...planItems.map(it => {
        const g = s.goals.find(x => x.id === it.goalId);
        const t = s.tasks.find(x => x.id === it.taskId);
        return { kind: 'task', start: it.start, end: it.end, label: t ? t.title : `推进《${g ? g.title : '?'}》`, item: it, t, g };
      }),
    ].sort((a, b) => a.start - b.start);
    if (!rows.length) {
      container.innerHTML = `<div class="empty">今天还没有安排。${s.goals.length ? '去「周计划」生成。' : '先到「目标·任务」添加目标。'}</div>`;
      return;
    }
    const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
    for (const r of rows) {
      const row = document.createElement('div');
      row.className = 'list-item';
      if (r.kind === 'course' || r.kind === 'event') {
        row.innerHTML = `
          <span class="muted" style="width:96px;flex-shrink:0">${U.hmStr(r.start)}~${U.hmStr(r.end)}</span>
          <div class="main"><div class="title" style="font-weight:500">${U.esc(r.label)}</div></div>
          <span class="badge ${r.kind === 'course' ? 'gray' : 'blue'}">${r.kind === 'course' ? '课程' : '占用'}</span>
          ${nowMin >= r.start && nowMin < r.end ? '<span class="badge red">进行中</span>' : ''}`;
      } else {
        const it = r.item;
        const h = (it.end - it.start) / 60;
        const t = r.t;
        const dueBadge = t && t.due ? `<span class="badge ${t.due < todayStr ? 'red' : t.due === todayStr ? 'orange' : 'blue'}">截止 ${t.due}</span>` : '';
        if (it.done) {
          row.innerHTML = `
            <span class="muted" style="width:96px;flex-shrink:0">${U.hmStr(it.start)}~${U.hmStr(it.end)}</span>
            <span class="goal-color-dot" style="background:${goalColor(it.goalId)}"></span>
            <div class="main"><div class="title done" style="text-decoration:line-through;color:var(--ink3);font-weight:600">${U.esc(r.label)}</div>
            <div class="meta">计划 ${h.toFixed(1)}h${it.actualHours != null ? ` · 实际 ${it.actualHours.toFixed(1)}h` : ''}${r.g ? ' · ' + U.esc(r.g.title) : ''}</div></div>
            <span class="badge green">已完成</span>`;
        } else {
          const runningMin = it.startedAt ? Math.round((Date.now() - it.startedAt) / 60000) : null;
          row.innerHTML = `
            <span class="muted" style="width:96px;flex-shrink:0">${U.hmStr(it.start)}~${U.hmStr(it.end)}</span>
            <span class="goal-color-dot" style="background:${goalColor(it.goalId)}"></span>
            <div class="main"><div class="title" style="font-weight:600">${U.esc(r.label)}</div>
            <div class="meta">预计 ${h.toFixed(1)}h${r.g ? ' · ' + U.esc(r.g.title) : ''}${t && t.due ? ' · 截止 ' + t.due : ''}</div></div>
            ${runningMin != null ? `<span class="run-badge">▶ 已开始 ${runningMin} 分钟</span>` : ''}
            <div class="action-btns">
              ${runningMin == null ? '<button class="btn sm" data-act="start">▶ 开始</button>' : ''}
              <button class="btn sm primary" data-act="done">✓ 完成</button>
              <button class="btn sm" data-act="defer">⏩ 顺延</button>
            </div>`;
          const startBtn = row.querySelector('[data-act="start"]');
          if (startBtn) startBtn.onclick = () => {
            const st = PB.store.get();
            const target = st.plan.items.find(x => x.id === it.id);
            target.startedAt = Date.now();
            PB.store.save();
            UI.toast('已开始计时，完成时会自动填入实际用时', 'ok');
            dashboard(document.getElementById('mainContent'));
          };
          row.querySelector('[data-act="done"]').onclick = () => completeBlockFlow(it, () => dashboard(document.getElementById('mainContent')));
          row.querySelector('[data-act="defer"]').onclick = () => deferBlockFlow(it, () => dashboard(document.getElementById('mainContent')));
        }
      }
      container.appendChild(row);
    }
  }

  /* 今天截止的任务 */
  function renderDueToday(container, todayStr, planCurrent) {
    const s = PB.store.get();
    const inPlan = new Set(planCurrent ? s.plan.items.filter(i => i.date === todayStr && i.taskId).map(i => i.taskId) : []);
    const due = s.tasks.filter(t => t.due === todayStr && PB.engine.taskRemaining(t) > 0.05 && !inPlan.has(t.id));
    const overdue = s.tasks.filter(t => t.due && t.due < todayStr && PB.engine.taskRemaining(t) > 0.05);
    if (!due.length && !overdue.length) return;
    const all = [...overdue.map(t => ({ t, late: true })), ...due.map(t => ({ t, late: false }))];
    const box = document.createElement('div');
    box.innerHTML = '<div class="sec-title">到期/逾期任务</div>';
    for (const { t, late } of all) {
      const g = s.goals.find(x => x.id === t.goalId);
      const row = document.createElement('div');
      row.className = 'list-item';
      row.innerHTML = `
        <span class="goal-color-dot" style="background:${goalColor(t.goalId)}"></span>
        <div class="main"><div class="title" style="font-weight:600">${U.esc(t.title)}</div>
        <div class="meta">${g ? U.esc(g.title) + ' · ' : ''}剩余 ${PB.engine.taskRemaining(t).toFixed(1)}h · ${late ? '<span style="color:var(--red)">已过期（' + t.due + '）</span>' : '今天截止'}</div></div>
        <div class="action-btns">
          <button class="btn sm primary" data-act="done">✓ 完成</button>
          <button class="btn sm" data-act="push">改期</button>
        </div>`;
      row.querySelector('[data-act="done"]').onclick = () => {
        PB.store.snapshot();
        const st = PB.store.get();
        const tt = st.tasks.find(x => x.id === t.id);
        const a = PB.engine.taskRemaining(tt);
        tt.doneHours = tt.estHours;
        tt.actualHours = (tt.actualHours || 0) + a;
        PB.store.save();
        UI.toast(`已完成「${t.title}」，实际记 ${a.toFixed(1)}h`, 'ok', { label: '撤销', onClick: () => { PB.store.undo(); PB.app.nav(PB.app.current || 'dashboard'); } });
        dashboard(document.getElementById('mainContent'));
      };
      row.querySelector('[data-act="push"]').onclick = () => {
        UI.openModal({
          title: '修改任务截止日',
          bodyHTML: `<div class="field"><label>新截止日（${U.esc(t.title)}）</label><input id="fDue" type="date" value="${t.due}"></div>`,
          footer: [
            { label: '取消' },
            { label: '保存', cls: 'primary', onClick: (close) => {
              const nd = UI.fv(document, '#fDue');
              if (!nd) return;
              PB.store.snapshot();
              const st = PB.store.get();
              st.tasks.find(x => x.id === t.id).due = nd;
              PB.store.save(); close();
              UI.toast(`截止日改为 ${nd}，周计划重新生成后会按新日期安排`, 'ok', { label: '撤销', onClick: () => { PB.store.undo(); PB.app.nav(PB.app.current || 'dashboard'); } });
              dashboard(document.getElementById('mainContent'));
            } },
          ],
        });
      };
      box.appendChild(row);
    }
    container.appendChild(box);
  }

  /* ── 课表页 ─────────────────────────────────── */
  function timetable(root) {
    const s = PB.store.get();
    const monday = U.dateStr(U.mondayOf(U.today()));
    root.innerHTML = `
      <div class="page-title">课表（时间参考）</div>
      <div class="page-desc">课表在这里只负责"圈占"时间：绿底是空闲，深绿是整块时间。点击色块可编辑。</div>
      <div class="card" style="margin-bottom:14px">
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
          <button class="btn primary" id="btnAddCourse">＋ 添加课程</button>
          <button class="btn" id="btnAddEvent">＋ 单次占用（讲座/考试/事务）</button>
          <span style="width:1px;height:22px;background:var(--line);margin:0 4px"></span>
          <button class="btn" id="btnICS">导入 ICS 日历文件</button>
          <button class="btn" id="btnZF">导入教务系统课表（.xls/.xlsx）</button>
          <button class="btn" id="btnPaste">粘贴文本 / CSV 导入</button>
          <button class="btn" id="btnTpl">下载 CSV 模板</button>
          ${s.courses.length || s.events.length ? '<button class="btn danger" id="btnClearTT" style="margin-left:auto">清空课表</button>' : ''}
        </div>
        <input type="file" id="icsFile" accept=".ics,text/calendar" style="display:none">
        <input type="file" id="xlsFile" accept=".xls,.xlsx" style="display:none">
      </div>
      <div class="card" id="ttGridCard"></div>
      <div class="legend">
        <span><i style="background:var(--gray-block);border:1px solid #cdd3e0"></i>课程</span>
        <span><i style="background:repeating-linear-gradient(45deg,#eceef3,#eceef3 6px,#e2e6ee 6px,#e2e6ee 12px)"></i>单次占用</span>
        <span><i style="background:#e9f5ee"></i>整块空闲（≥${s.settings.chunkMin} 分钟）</span>
        <span><i style="background:#f4f8f4"></i>碎片空闲</span>
      </div>
      <div class="row" style="margin-top:14px">
        <div class="card grow" style="flex:2 1 480px">
          <h3>课程列表 <span class="hint">共 ${s.courses.length} 门</span></h3>
          <div id="courseList"></div>
        </div>
        <div class="card grow" style="flex:1 1 260px">
          <h3>单次占用 <span class="hint">共 ${s.events.length} 条</span></h3>
          <div id="eventList"></div>
        </div>
      </div>`;

    // 周网格
    const gridCard = root.querySelector('#ttGridCard');
    const blocks = [];
    for (const c of s.courses) {
      blocks.push({
        date: U.dateStr(U.addDays(U.parseDate(monday), (c.day - 1 + 7) % 7)),
        start: U.hm(c.start), end: U.hm(c.end),
        label: c.name, sub: c.location, cls: 'course',
        onClick: () => courseModal(c),
      });
    }
    for (const ev of s.events) {
      blocks.push({
        date: ev.date, start: U.hm(ev.start), end: U.hm(ev.end),
        label: ev.name, cls: 'event', onClick: () => eventModal(ev),
      });
    }
    weekGrid(gridCard, monday, { blocks, showFree: true, showNow: true });

    // 冲突提示
    const conflicts = PB.engine.findConflicts().filter(c => c.level === 'warn');
    if (conflicts.length) {
      const card = document.createElement('div');
      card.className = 'card';
      card.style.cssText = 'margin-top:14px;border-color:#f2c6c8;background:#fffafa';
      card.innerHTML = `<h3 style="color:var(--red)">检测到 ${conflicts.length} 处时间冲突</h3>` +
        conflicts.map(c => `<div class="risk-item"><span>⏰</span><span>${U.esc(c.msg)}</span></div>`).join('');
      root.appendChild(card);
    }

    // 列表
    const cl = root.querySelector('#courseList');
    if (!s.courses.length) cl.innerHTML = '<div class="empty">还没有课程。导入或手动添加。</div>';
    else {
      const byDay = {};
      for (const c of s.courses) (byDay[c.day] = byDay[c.day] || []).push(c);
      for (let d = 1; d <= 7; d++) {
        for (const c of (byDay[d] || [])) {
          const row = document.createElement('div');
          row.className = 'list-item';
          row.innerHTML = `
            <span class="badge gray" style="width:44px;text-align:center">${U.DAY_CN[d % 7]}</span>
            <div class="main"><div class="title">${U.esc(c.name)}${c.weeks ? ` <span class="muted" style="font-weight:400;font-size:11.5px">${U.esc(c.weeks)}</span>` : ''}</div>
            <div class="meta">${U.hmStr(U.hm(c.start))}~${U.hmStr(U.hm(c.end))}${c.teacher ? ' · ' + U.esc(c.teacher) : ''}${c.location ? ' · ' + U.esc(c.location) : ''}</div></div>
            <button class="btn sm">编辑</button>`;
          row.querySelector('button').onclick = () => courseModal(c);
          cl.appendChild(row);
        }
      }
    }
    const el = root.querySelector('#eventList');
    if (!s.events.length) el.innerHTML = '<div class="empty">暂无单次占用。</div>';
    else {
      const sorted = s.events.slice().sort((a, b) => a.date.localeCompare(b.date));
      for (const ev of sorted) {
        const row = document.createElement('div');
        row.className = 'list-item';
        row.innerHTML = `
          <div class="main"><div class="title">${U.esc(ev.name)}</div>
          <div class="meta">${U.fmtCN(ev.date)} ${U.hmStr(U.hm(ev.start))}~${U.hmStr(U.hm(ev.end))}</div></div>
          <button class="btn sm">删除</button>`;
        row.querySelector('button').onclick = () => UI.confirmBox(`删除「${U.esc(ev.name)}」？`, () => {
          const st = PB.store.get();
          st.events = st.events.filter(x => x.id !== ev.id);
          PB.store.save(); timetable(root);
        });
        el.appendChild(row);
      }
    }

    // 工具栏事件
    root.querySelector('#btnAddCourse').onclick = () => courseModal(null, () => timetable(root));
    root.querySelector('#btnAddEvent').onclick = () => eventModal(null, () => timetable(root));
    root.querySelector('#btnICS').onclick = () => root.querySelector('#icsFile').click();
    root.querySelector('#icsFile').onchange = async e => {
      const file = e.target.files[0];
      if (!file) return;
      const text = await file.text();
      try { importPreview(PB.imp.parseICS(text), () => timetable(root)); }
      catch (err) { UI.toast('解析 ICS 失败：' + err.message, 'err'); }
      e.target.value = '';
    };
    root.querySelector('#btnZF').onclick = () => {
      if (typeof XLSX === 'undefined') { UI.toast('表格解析库未加载，请刷新页面重试', 'err'); return; }
      root.querySelector('#xlsFile').click();
    };
    root.querySelector('#xlsFile').onchange = async e => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const buf = new Uint8Array(await file.arrayBuffer());
        const wb = XLSX.read(buf, { type: 'array' });
        importPreview(PB.imp.parseZFWorkbook(wb), () => timetable(root));
      } catch (err) { UI.toast('解析课表失败：' + err.message, 'err'); }
      e.target.value = '';
    };
    root.querySelector('#btnPaste').onclick = () => pasteImport(() => timetable(root));
    root.querySelector('#btnTpl').onclick = () => {
      const bom = '\ufeff';
      const csv = '课程,星期,开始,结束,地点\n高等数学,周一,08:00,09:40,教1-201\n数据结构,周三,14:00,15:40,教2-105\n';
      const blob = new Blob([bom + csv], { type: 'text/csv' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = '课表模板.csv'; a.click();
    };
    const clearBtn = root.querySelector('#btnClearTT');
    if (clearBtn) clearBtn.onclick = () => UI.confirmBox('确定清空所有课程和单次占用？此操作不可撤销。', () => {
      PB.store.snapshot();
      const st = PB.store.get();
      st.courses = []; st.events = [];
      PB.store.save();
      UI.toast('已清空', 'ok', { label: '撤销', onClick: () => { PB.store.undo(); PB.app.nav(PB.app.current || 'timetable'); } });
      timetable(root);
    });
  }

  /* ── 弹窗：课程 ─────────────────────────────── */
  function courseModal(existing, onDone) {
    const c = existing || {};
    UI.openModal({
      title: existing ? '编辑课程' : '添加课程',
      bodyHTML: `
        <div class="field"><label>课程名称</label><input id="fName" value="${U.esc(c.name || '')}" placeholder="如：高等数学"></div>
        <div class="inline-form">
          <div class="field" style="flex:1"><label>教师（可选）</label><input id="fTeacher" value="${U.esc(c.teacher || '')}"></div>
          <div class="field" style="flex:1"><label>周次（可选，如 1-16周）</label><input id="fWeeks" value="${U.esc(c.weeks || '')}"></div>
        </div>
        <div class="field"><label>地点（可选）</label><input id="fLoc" value="${U.esc(c.location || '')}"></div>
        <div class="inline-form">
          <div class="field" style="flex:1"><label>星期</label><select id="fDay">${[1,2,3,4,5,6,7].map(d=>`<option value="${d}" ${c.day===d?'selected':''}>周${'一二三四五六日'[d-1]}</option>`).join('')}</select></div>
          <div class="field" style="flex:1"><label>开始</label><input id="fStart" type="time" value="${c.start || '08:00'}"></div>
          <div class="field" style="flex:1"><label>结束</label><input id="fEnd" type="time" value="${c.end || '09:40'}"></div>
        </div>`,
      footer: existing ? [
        { label: '删除课程', cls: 'danger', onClick: (close) => { close(); UI.confirmBox(`删除课程「${U.esc(existing.name)}」？`, () => {
          PB.store.snapshot();
          const st = PB.store.get();
          st.courses = st.courses.filter(x => x.id !== existing.id);
          PB.store.save();
          UI.toast('已删除', 'ok', { label: '撤销', onClick: () => { PB.store.undo(); PB.app.nav(PB.app.current || 'timetable'); } });
          if (onDone) onDone();
        }); } },
        { label: '保存', cls: 'primary', onClick: (close) => {
          const name = UI.fv(document, '#fName');
          const start = UI.fv(document, '#fStart'), end = UI.fv(document, '#fEnd');
          if (!name) { UI.toast('请填课程名称', 'err'); return; }
          if (U.hm(end) <= U.hm(start)) { UI.toast('结束时间需晚于开始时间', 'err'); return; }
          const st = PB.store.get();
          const extra = { teacher: UI.fv(document, '#fTeacher'), weeks: UI.fv(document, '#fWeeks') };
          const target = st.courses.find(x => x.id === existing.id);
          Object.assign(target, { name, location: UI.fv(document, '#fLoc'), day: +UI.fv(document, '#fDay'), start, end }, extra);
          PB.store.save(); close(); UI.toast('已保存', 'ok'); if (onDone) onDone();
        } },
      ] : [
        { label: '取消' },
        { label: '保存', cls: 'primary', onClick: (close) => {
          const name = UI.fv(document, '#fName');
          const start = UI.fv(document, '#fStart'), end = UI.fv(document, '#fEnd');
          if (!name) { UI.toast('请填课程名称', 'err'); return; }
          if (U.hm(end) <= U.hm(start)) { UI.toast('结束时间需晚于开始时间', 'err'); return; }
          const st = PB.store.get();
          st.courses.push({ id: PB.store.uid(), name, location: UI.fv(document, '#fLoc'), teacher: UI.fv(document, '#fTeacher'), weeks: UI.fv(document, '#fWeeks'), day: +UI.fv(document, '#fDay'), start, end });
          PB.store.save(); close(); UI.toast('已添加', 'ok'); if (onDone) onDone();
        } },
      ],
    });
  }

  /* ── 弹窗：单次占用 ─────────────────────────── */
  function eventModal(existing, onDone) {
    const ev = existing || {};
    UI.openModal({
      title: existing ? '编辑单次占用' : '添加单次占用',
      bodyHTML: `
        <div class="field"><label>名称</label><input id="fName" value="${U.esc(ev.name || '')}" placeholder="如：数学竞赛初赛 / 讲座 / 班会"></div>
        <div class="inline-form">
          <div class="field" style="flex:1"><label>日期</label><input id="fDate" type="date" value="${ev.date || U.dateStr(U.today())}"></div>
          <div class="field" style="flex:1"><label>开始</label><input id="fStart" type="time" value="${ev.start || '14:00'}"></div>
          <div class="field" style="flex:1"><label>结束</label><input id="fEnd" type="time" value="${ev.end || '16:00'}"></div>
        </div>`,
      footer: [
        ...(existing ? [{ label: '删除', cls: 'danger', onClick: (close) => { close(); UI.confirmBox('删除该占用？', () => {
          PB.store.snapshot();
          const st = PB.store.get();
          st.events = st.events.filter(x => x.id !== existing.id);
          PB.store.save();
          UI.toast('已删除占用', 'ok', { label: '撤销', onClick: () => { PB.store.undo(); PB.app.nav(PB.app.current || 'timetable'); } });
          if (onDone) onDone();
        }); } }] : []),
        { label: '取消' },
        { label: '保存', cls: 'primary', onClick: (close) => {
          const name = UI.fv(document, '#fName');
          const start = UI.fv(document, '#fStart'), end = UI.fv(document, '#fEnd');
          const date = UI.fv(document, '#fDate');
          if (!name || !date) { UI.toast('请填名称和日期', 'err'); return; }
          if (U.hm(end) <= U.hm(start)) { UI.toast('结束时间需晚于开始时间', 'err'); return; }
          const st = PB.store.get();
          if (existing) {
            Object.assign(st.events.find(x => x.id === existing.id), { name, date, start, end });
          } else {
            st.events.push({ id: PB.store.uid(), name, date, start, end });
          }
          PB.store.save(); close(); UI.toast('已保存', 'ok'); if (onDone) onDone();
        } },
      ],
    });
  }

  /* ── 导入预览（含冲突预检） ─────────────────── */
  function importPreview(parsed, onDone) {
    const { recurring, once, skipped, errors } = parsed;
    if (!recurring.length && !once.length) {
      UI.openModal({
        title: '导入结果',
        bodyHTML: `<p>没有识别到可导入的时段。</p>${errors && errors.length ? `<div class="muted">${errors.map(U.esc).join('<br>')}</div>` : ''}<p class="muted" style="margin-top:8px">跳过 ${skipped || 0} 条（全天事件、复杂重复规则等不占具体时段）。</p>`,
        footer: [{ label: '知道了' }],
      });
      return;
    }
    // 冲突预检：把"将导入 + 已有"放在一起跑冲突检测（不落库）
    const st0 = PB.store.get();
    const newCourses = recurring.map(x => ({ id: 'new', name: x.name, day: x.day, start: U.hmStr(x.start), end: U.hmStr(x.end) }));
    const newEvents = once.map(x => ({ id: 'newE', name: x.name, date: x.date, start: U.hmStr(x.start), end: U.hmStr(x.end) }));
    const conflicts = PB.engine.findConflicts({ ...st0, courses: st0.courses.concat(newCourses), events: st0.events.concat(newEvents) }).filter(c => c.level === 'warn');
    const pastEvents = once.filter(x => x.date < U.dateStr(U.today()));
    const todayStr = U.dateStr(U.today());
    const sample = [
      ...recurring.slice(0, 6).map(x => `周期：${U.DAY_CN[x.day % 7]} ${U.hmStr(x.start)}~${U.hmStr(x.end)} ${U.esc(x.name)}${x.weeks ? '（' + U.esc(x.weeks) + '）' : ''}${x.teacher ? ' · ' + U.esc(x.teacher) : ''}`),
      ...(recurring.length > 6 ? [`……共 ${recurring.length} 条周期课程`] : []),
      ...once.slice(0, 4).map(x => `单次：${x.date} ${U.hmStr(x.start)}~${U.hmStr(x.end)} ${U.esc(x.name)}`),
      ...(once.length > 4 ? [`……共 ${once.length} 条单次占用`] : []),
    ];
    UI.openModal({
      title: '确认导入',
      bodyHTML: `
        <p>识别到 <b>${recurring.length}</b> 条周期课程、<b>${once.length}</b> 条单次占用${skipped ? `，跳过 ${skipped} 条（全天事件等）` : ''}。</p>
        <div class="divider"></div>
        ${sample.map(x => `<div class="small muted">${x}</div>`).join('')}
        ${errors && errors.length ? `<div class="divider"></div><div class="small" style="color:var(--red)">${errors.map(U.esc).join('<br>')}</div>` : ''}
        ${pastEvents.length ? `<div class="divider"></div><div class="small" style="color:var(--orange)">注意：${pastEvents.length} 条单次占用的日期已经过去（${pastEvents.map(x => U.esc(x.name) + ' ' + x.date).join('、')}），导入后不影响未来计划。</div>` : ''}
        ${conflicts.length ? `<div class="divider"></div><div class="small" style="color:var(--red)"><b>保存前发现 ${conflicts.length} 处时间冲突：</b><br>${conflicts.map(c => U.esc(c.msg)).join('<br>')}<br><span class="muted">若属于"单双周轮换"（同一时段不同周次），可合并周次后导入；否则请调整后再导。</span></div>` : ''}`,
      footer: [
        { label: '取消' },
        { label: conflicts.length ? '仍要导入' : '确认导入', cls: 'primary', onClick: (close) => {
          PB.store.snapshot();
          const st = PB.store.get();
          const courses = recurring.map(x => ({ id: PB.store.uid(), name: x.name, location: x.location || '', teacher: x.teacher || '', weeks: x.weeks || '', day: x.day, start: U.hmStr(x.start), end: U.hmStr(x.end) }));
          const events = once.map(x => ({ id: PB.store.uid(), name: x.name, date: x.date, start: U.hmStr(x.start), end: U.hmStr(x.end) }));
          const d1 = PB.imp.dedupe(courses, st.courses);
          const d2 = PB.imp.dedupe(events, st.events);
          st.courses.push(...d1.added);
          st.events.push(...d2.added);
          PB.store.save();
          close();
          const conflicts = PB.engine.findConflicts().filter(c => c.level === 'warn').length;
          UI.toast(`导入课程 ${d1.added.length} 条、占用 ${d2.added.length} 条${d1.dup + d2.dup ? `，忽略重复 ${d1.dup + d2.dup} 条` : ''}${conflicts ? `；注意：现有 ${conflicts} 处时间冲突` : ''}`, conflicts ? 'err' : 'ok', {
            label: '撤销', onClick: () => { PB.store.undo(); PB.app.nav(PB.app.current || 'timetable'); },
          });
          if (onDone) onDone();
        } },
      ],
    });
  }

  function pasteImport(onDone) {
    UI.openModal({
      title: '粘贴文本 / CSV 导入',
      bodyHTML: `
        <p class="muted small" style="margin-bottom:8px">每行一条：课程, 星期, 开始, 结束, 地点（地点可省）。星期支持「周一 / 星期三 / 3 / Mon」，也可整行粘贴带表头的 CSV。</p>
        <div class="field"><textarea id="pasteArea" placeholder="高等数学,周一,08:00,09:40,教1-201&#10;数据结构,周三,14:00,15:40,教2-105&#10;大学英语,周五,10:00,11:40"></textarea></div>`,
      footer: [
        { label: '取消' },
        { label: '解析并导入', cls: 'primary', onClick: (close) => {
          const text = UI.fv(document, '#pasteArea');
          if (!text) { UI.toast('请先粘贴内容', 'err'); return; }
          close();
          try { importPreview(PB.imp.parseCSV(text), onDone); }
          catch (err) { UI.toast('解析失败：' + err.message, 'err'); }
        } },
      ],
    });
  }

  PB.views.goalColor = goalColor;
  PB.views.weekGrid = weekGrid;
  PB.views.dashboard = dashboard;
  PB.views.timetable = timetable;
  PB.views.courseModal = courseModal;
  PB.views.eventModal = eventModal;
  PB.views.aiGuideModal = aiGuideModal;
  PB.views.capExplainHTML = capExplainHTML;
  PB.views.completeBlockFlow = completeBlockFlow;
  PB.views.deferBlockFlow = deferBlockFlow;
  PB.views.replanWeekPreview = replanWeekPreview;
  PB.views.exportBackup = exportBackup;
})();
