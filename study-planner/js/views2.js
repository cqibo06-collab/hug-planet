/* ============================================================
 * views2.js — 目标·任务页（含工时估算器、任务工时清单、AI 解析）+ 资料库页
 * ============================================================ */
(() => {
  const U = PB.util, UI = PB.ui;

  /* ── 目标·任务 ──────────────────────────────── */
  function goals(root) {
    const s = PB.store.get();
    root.innerHTML = `
      <div class="page-title">目标 · 任务</div>
      <div class="page-desc">每个任务的工时可手动填写、按量估算（数量×速率），或由 AI 从你的描述估计。</div>
      <div class="card" style="margin-bottom:14px">
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
          <button class="btn primary" id="btnAddGoal">＋ 添加目标</button>
          <button class="btn" id="btnAIParse">✨ 用一句话描述，AI 帮我拆目标</button>
          <span style="flex:1"></span>
          <span class="muted small" id="workloadSummary"></span>
        </div>
      </div>
      <div class="card" style="margin-bottom:14px" id="workloadCard">
        <h3>任务工时清单 <span class="hint">每个任务要花多久、还剩多久</span></h3>
        <div id="workloadTable"></div>
      </div>
      <div id="goalCards"></div>`;

    renderWorkload(root.querySelector('#workloadTable'), root.querySelector('#workloadSummary'));
    renderGoalCards(root.querySelector('#goalCards'), () => goals(root));

    root.querySelector('#btnAddGoal').onclick = () => goalModal(null, () => goals(root));
    root.querySelector('#btnAIParse').onclick = () => aiParseModal(() => goals(root));
    if (!s.goals.length) root.querySelector('#workloadCard').style.display = 'none';
  }

  /* 任务工时清单 */
  function renderWorkload(container, summaryEl) {
    const s = PB.store.get();
    const rows = [];
    for (const g of s.goals) {
      const tasks = s.tasks.filter(t => t.goalId === g.id);
      if (tasks.length) {
        for (const t of tasks) rows.push({ goal: g, task: t, hours: PB.engine.taskRemaining(t), est: t.estHours || 0, done: t.doneHours || 0 });
      } else if ((g.estHours || 0) > 0) {
        rows.push({ goal: g, task: null, hours: g.estHours, est: g.estHours, done: 0 });
      }
    }
    if (!rows.length) { container.innerHTML = '<div class="empty">还没有目标或任务。</div>'; return; }
    const totalEst = rows.reduce((a, r) => a + r.est, 0);
    const totalDone = rows.reduce((a, r) => a + r.done, 0);
    const totalRemain = rows.reduce((a, r) => a + r.hours, 0);
    if (summaryEl) summaryEl.textContent = `预计 ${totalEst.toFixed(1)}h · 已投入 ${totalDone.toFixed(1)}h · 剩余 ${totalRemain.toFixed(1)}h`;
    container.innerHTML = `
      <table class="data">
        <thead><tr><th>任务</th><th>所属目标</th><th>估算方式</th><th>预计</th><th>已投入</th><th>剩余</th><th></th></tr></thead>
        <tbody></tbody></table>`;
    const tb = container.querySelector('tbody');
    for (const r of rows) {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${r.task ? U.esc(r.task.title) : `<i class="muted">（整体推进）</i>`}</td>
        <td><span class="goal-color-dot" style="display:inline-block;vertical-align:-1px;margin-right:5px;background:${PB.views.goalColor(r.goal.id)}"></span>${U.esc(r.goal.title)}</td>
        <td>${r.task ? PB.est.sourceLabel(r.task) + (r.task.qty && r.task.qty.n ? `<br><span class="muted" style="font-size:11px">${U.esc(PB.est.estimate(r.task.qty)?.detail || '')}</span>` : '') : '<span class="muted">目标直接估算</span>'}</td>
        <td>${r.est.toFixed(1)}h</td>
        <td class="muted">${r.done.toFixed(1)}h</td>
        <td><b>${r.hours.toFixed(1)}h</b></td>
        <td>${r.task ? '<button class="btn sm">调整</button>' : ''}</td>`;
      if (r.task) tr.querySelector('button').onclick = () => taskModal(r.task, () => goals(document.getElementById('mainContent')));
      tb.appendChild(tr);
    }
  }

  /* 目标卡片 */
  function renderGoalCards(container, refresh) {
    const s = PB.store.get();
    if (!s.goals.length) {
      container.innerHTML = `<div class="card"><div class="empty"><div class="big">🎯</div>还没有目标。<br>
        <button class="btn primary" id="emptyAddGoal" style="margin-top:10px">添加第一个目标</button>
        <span class="muted" style="margin-left:8px">或点上方「AI 帮我拆目标」</span></div></div>`;
      container.querySelector('#emptyAddGoal').onclick = () => goalModal(null, refresh);
      return;
    }
    const stats = PB.engine.goalStats();
    const order = { high: 0, med: 1, low: 2 };
    const sorted = stats.slice().sort((a, b) => (order[a.goal.priority] - order[b.goal.priority]) || String(a.goal.deadline || '9999').localeCompare(String(b.goal.deadline || '9999')));
    for (const st of sorted) {
      const g = st.goal;
      const pct = st.total > 0 ? Math.min(100, Math.round(st.done / st.total * 100)) : 0;
      const card = document.createElement('div');
      card.className = 'card';
      card.style.marginBottom = '14px';
      const dlBadge = st.daysLeft == null ? '<span class="badge gray">无截止</span>'
        : st.daysLeft < 0 ? `<span class="badge red">已过期 ${-st.daysLeft} 天</span>`
        : st.daysLeft <= 7 ? `<span class="badge red">剩 ${st.daysLeft} 天</span>`
        : `<span class="badge blue">剩 ${st.daysLeft} 天</span>`;
      card.innerHTML = `
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <span class="goal-color-dot" style="background:${PB.views.goalColor(g.id)};width:12px;height:12px"></span>
          <span style="font-size:15px;font-weight:700;flex:1;min-width:0">${U.esc(g.title)}</span>
          <span class="badge gray">${U.esc(g.category || '其他')}</span>
          <span class="badge ${g.priority === 'high' ? 'red' : g.priority === 'low' ? 'gray' : 'orange'}">${g.priority === 'high' ? '高优先' : g.priority === 'low' ? '低优先' : '中优先'}</span>
          ${dlBadge}
          ${st.statusCN === '已完成' ? '<span class="badge green">已完成 🎉</span>' : ''}
          <button class="btn sm" data-act="edit">编辑</button>
          <button class="btn sm danger" data-act="del">删除</button>
        </div>
        <div style="display:flex;align-items:center;gap:10px;margin:10px 0 4px">
          <div style="flex:1;height:8px;background:#eef0f5;border-radius:4px;overflow:hidden">
            <div style="height:100%;width:${pct}%;background:${PB.views.goalColor(g.id)};border-radius:4px"></div>
          </div>
          <span class="muted small">${st.total ? `${st.done.toFixed(1)}/${st.total.toFixed(1)}h（${pct}%）· 每周需 ${st.requiredPerWeek.toFixed(1)}h` : '未设工时'}</span>
        </div>
        ${g.note ? `<div class="muted small" style="margin-bottom:6px">${U.esc(g.note)}</div>` : ''}
        <div class="divider" style="margin:8px 0"></div>
        <div data-tasks></div>
        <button class="btn sm" data-act="addTask" style="margin-top:8px">＋ 添加任务</button>`;
      card.querySelector('[data-act="edit"]').onclick = () => goalModal(g, refresh);
      card.querySelector('[data-act="del"]').onclick = () => {
        const tasks = PB.store.get().tasks.filter(t => t.goalId === g.id);
        UI.confirmBox(`删除目标「${U.esc(g.title)}」？${tasks.length ? `其下 ${tasks.length} 个任务将一并删除。` : ''}`, () => {
          const stt = PB.store.get();
          stt.goals = stt.goals.filter(x => x.id !== g.id);
          stt.tasks = stt.tasks.filter(t => t.goalId !== g.id);
          PB.store.save(); UI.toast('已删除目标', 'ok'); refresh();
        });
      };
      card.querySelector('[data-act="addTask"]').onclick = () => taskModal(null, refresh, g.id);
      renderTasks(card.querySelector('[data-tasks]'), g, refresh);
      container.appendChild(card);
    }
  }

  function renderTasks(container, goal, refresh) {
    const s = PB.store.get();
    const tasks = s.tasks.filter(t => t.goalId === goal.id);
    if (!tasks.length) { container.innerHTML = '<div class="muted small">尚未拆分任务。整体按目标工时推进，或点下方「添加任务」。</div>'; return; }
    for (const t of tasks) {
      const rem = PB.engine.taskRemaining(t);
      const row = document.createElement('div');
      row.className = 'list-item';
      row.innerHTML = `
        <input type="checkbox" ${rem <= 0.05 ? 'checked' : ''} style="width:16px;height:16px;accent-color:var(--accent)">
        <div class="main">
          <div class="title" style="font-size:13.5px">${U.esc(t.title)}</div>
          <div class="meta">${PB.est.sourceLabel(t)} · 预计 ${(t.estHours || 0).toFixed(1)}h · 已投入 ${(t.doneHours || 0).toFixed(1)}h · 剩余 <b style="color:${rem <= 0.05 ? 'var(--green)' : 'var(--ink)'}">${rem.toFixed(1)}h</b>${t.qty && t.qty.n ? ` · ${U.esc(t.qty.n)}×${U.esc(PB.est.UNIT_LABEL[t.qty.unit] || '单位')}` : ''} · ${t.preferred === 'fragment' ? '适合碎片' : '优先整块'}</div>
        </div>
        <button class="btn sm">编辑</button>`;
      row.querySelector('input[type=checkbox]').onchange = e => {
        const st = PB.store.get();
        const tt = st.tasks.find(x => x.id === t.id);
        if (e.target.checked) { tt.doneHours = tt.estHours; UI.toast('任务已标记完成', 'ok'); }
        else { tt.doneHours = 0; }
        PB.store.save(); refresh();
      };
      row.querySelector('button').onclick = () => taskModal(t, refresh);
      container.appendChild(row);
    }
  }

  /* ── 弹窗：目标 ─────────────────────────────── */
  function goalModal(existing, onDone) {
    const s = PB.store.get();
    const g = existing || {};
    UI.openModal({
      title: existing ? '编辑目标' : '添加目标',
      bodyHTML: `
        <div class="field"><label>目标名称</label><input id="fTitle" value="${U.esc(g.title || '')}" placeholder="如：全国大学生数学竞赛（非数学类）"></div>
        <div class="inline-form">
          <div class="field" style="flex:1"><label>类别</label><select id="fCat">${['竞赛','考试','作业','技能','其他'].map(c=>`<option ${g.category===c?'selected':''}>${c}</option>`).join('')}</select></div>
          <div class="field" style="flex:1"><label>截止日期</label><input id="fDl" type="date" value="${g.deadline || ''}"></div>
          <div class="field" style="flex:1"><label>优先级</label><select id="fPrio">${[['high','高'],['med','中'],['low','低']].map(([v,t])=>`<option value="${v}" ${g.priority===v?'selected':''}>${t}</option>`).join('')}</select></div>
        </div>
        <div class="inline-form">
          <div class="field" style="flex:1"><label>预计总工时（小时）</label><input id="fEst" type="number" min="0" step="0.5" value="${g.estHours ?? 20}"></div>
          <div class="field" style="flex:2"><label>关联科目（可选，来自资料库）</label><select id="fSub"><option value="">不关联</option>${s.subjects.map(x=>`<option value="${x.id}" ${g.subjectId===x.id?'selected':''}>${U.esc(x.name)}</option>`).join('')}</select></div>
        </div>
        <div class="field"><label>备注（可选）</label><textarea id="fNote" style="min-height:56px">${U.esc(g.note || '')}</textarea></div>`,
      footer: [
        { label: '取消' },
        { label: '保存', cls: 'primary', onClick: (close) => {
          const title = UI.fv(document, '#fTitle');
          if (!title) { UI.toast('请填目标名称', 'err'); return; }
          const data = {
            title, category: UI.fv(document, '#fCat'), deadline: UI.fv(document, '#fDl'),
            priority: UI.fv(document, '#fPrio'), estHours: +UI.fv(document, '#fEst') || 0,
            subjectId: UI.fv(document, '#fSub') || null, note: UI.fv(document, '#fNote'),
          };
          const st = PB.store.get();
          if (existing) Object.assign(st.goals.find(x => x.id === existing.id), data);
          else st.goals.push({ id: PB.store.uid(), createdAt: U.dateStr(U.today()), ...data });
          PB.store.save(); close(); UI.toast('已保存，记得看看分析报告', 'ok'); if (onDone) onDone();
        } },
      ],
    });
  }

  /* ── 弹窗：任务（含工时估算器） ─────────────── */
  function taskModal(existing, onDone, presetGoalId) {
    const s = PB.store.get();
    const t = existing || {};
    UI.openModal({
      title: existing ? '编辑任务' : '添加任务',
      bodyHTML: `
        <div class="field"><label>任务名称</label><input id="fTitle" value="${U.esc(t.title || '')}" placeholder="如：刷完错题本（高数上）"></div>
        <div class="field"><label>所属目标</label><select id="fGoal">${s.goals.map(g=>`<option value="${g.id}" ${(t.goalId||presetGoalId)===g.id?'selected':''}>${U.esc(g.title)}</option>`).join('')}</select></div>
        <div class="divider"></div>
        <div class="muted small" style="margin-bottom:6px"><b>工时估算</b>：填工作量按"数量 × 速率"自动算，或直接填预计小时数（二选一，估算优先）</div>
        <div class="inline-form">
          <div class="field" style="flex:1"><label>工作量（数量）</label><input id="fQtyN" type="number" min="0" step="1" value="${t.qty?.n ?? ''}" placeholder="如 60"></div>
          <div class="field" style="flex:2"><label>单位</label><select id="fQtyU">${PB.est.unitOptions(t.qty?.unit || 'problem')}</select></div>
          <div class="field" style="flex:1"><label>单位耗时(分)<br><span class="muted">留空用默认/历史</span></label><input id="fQtyMin" type="number" min="1" value="${t.qty?.customMin ?? ''}" placeholder="自动"></div>
        </div>
        <div id="estPreview" class="small" style="min-height:20px;margin:4px 0 10px;color:var(--ink2)"></div>
        <div class="inline-form">
          <div class="field" style="flex:1"><label>预计工时（小时）</label><input id="fEst" type="number" min="0" step="0.5" value="${t.estHours ?? 5}"></div>
          <div class="field" style="flex:1"><label>时间偏好</label><select id="fPref">${[['deep','优先整块时间'],['fragment','适合碎片时间']].map(([v,l])=>`<option value="${v}" ${t.preferred===v?'selected':''}>${l}</option>`).join('')}</select></div>
          <div class="field" style="flex:1"><label>优先级</label><select id="fPrio">${[['high','随目标'],['high','高'],['med','中'],['low','低']].slice(1).map(([v,l])=>`<option value="${v}" ${t.priority===v?'selected':''}>${l}</option>`).join('')}</select></div>
        </div>`,
      onMount: (m) => {
        const upd = () => {
          const n = +UI.fv(m, '#fQtyN') || 0;
          const unit = UI.fv(m, '#fQtyU');
          const customMin = +UI.fv(m, '#fQtyMin') || 0;
          const prev = m.querySelector('#estPreview');
          if (!n) { prev.innerHTML = '不按量估算时，将使用下方「预计工时」。'; return; }
          const r = PB.est.estimate({ n, unit, customMin: customMin || undefined });
          if (r) prev.innerHTML = `≈ <b>${r.hours.toFixed(1)} 小时</b>（${U.esc(r.detail)}）<br>点「保存」会把该结果写入预计工时。`;
        };
        m.querySelector('#fQtyN').addEventListener('input', upd);
        m.querySelector('#fQtyU').addEventListener('change', upd);
        m.querySelector('#fQtyMin').addEventListener('input', upd);
        upd();
      },
      footer: existing ? [
        { label: '删除任务', cls: 'danger', onClick: (close) => { close(); UI.confirmBox('删除该任务？', () => {
          const st = PB.store.get();
          st.tasks = st.tasks.filter(x => x.id !== existing.id);
          PB.store.save(); UI.toast('已删除', 'ok'); if (onDone) onDone();
        }); } },
        { label: '保存', cls: 'primary', onClick: (close) => {
          const title = UI.fv(document, '#fTitle');
          if (!title) { UI.toast('请填任务名称', 'err'); return; }
          const n = +UI.fv(document, '#fQtyN') || 0;
          const unit = UI.fv(document, '#fQtyU');
          const customMin = +UI.fv(document, '#fQtyMin') || 0;
          const qty = n > 0 ? { n, unit, ...(customMin ? { customMin } : {}) } : null;
          let estHours = +UI.fv(document, '#fEst') || 0, estFrom = 'manual';
          if (qty) {
            const r = PB.est.estimate(qty);
            if (r) { estHours = r.hours; estFrom = r.source === 'hist' ? 'hist' : 'qty'; }
          }
          const st = PB.store.get();
          Object.assign(st.tasks.find(x => x.id === existing.id), {
            title, goalId: UI.fv(document, '#fGoal'), estHours, qty, estFrom,
            preferred: UI.fv(document, '#fPref'), priority: UI.fv(document, '#fPrio'),
          });
          PB.store.save(); close(); UI.toast(`已保存，预计 ${estHours.toFixed(1)} 小时`, 'ok'); if (onDone) onDone();
        } },
      ] : [
        { label: '取消' },
        { label: '保存', cls: 'primary', onClick: (close) => {
          const title = UI.fv(document, '#fTitle');
          const goalId = UI.fv(document, '#fGoal');
          if (!title) { UI.toast('请填任务名称', 'err'); return; }
          if (!goalId) { UI.toast('请先创建目标', 'err'); return; }
          const n = +UI.fv(document, '#fQtyN') || 0;
          const unit = UI.fv(document, '#fQtyU');
          const customMin = +UI.fv(document, '#fQtyMin') || 0;
          const qty = n > 0 ? { n, unit, ...(customMin ? { customMin } : {}) } : null;
          let estHours = +UI.fv(document, '#fEst') || 0, estFrom = 'manual';
          if (qty) {
            const r = PB.est.estimate(qty);
            if (r) { estHours = r.hours; estFrom = r.source === 'hist' ? 'hist' : 'qty'; }
          }
          const st = PB.store.get();
          st.tasks.push({ id: PB.store.uid(), title, goalId, estHours, doneHours: 0, qty, estFrom, preferred: UI.fv(document, '#fPref'), priority: UI.fv(document, '#fPrio') });
          PB.store.save(); close(); UI.toast(`已添加，预计 ${estHours.toFixed(1)} 小时`, 'ok'); if (onDone) onDone();
        } },
      ],
    });
  }

  /* ── AI 解析描述 ────────────────────────────── */
  function aiParseModal(onDone) {
    UI.openModal({
      title: '一句话描述你的安排',
      bodyHTML: `
        <p class="muted small" style="margin-bottom:8px">例如："12月中旬参加全国大学生数学建模竞赛，想从现在开始每周做一套真题；另外12月底有高数期末，得留时间复习。"</p>
        <div class="field"><textarea id="aiDesc" style="min-height:110px" placeholder="把你的情况、目标、时间点都写出来……"></textarea></div>
        <div id="aiResult"></div>`,
      footer: [
        { label: '取消' },
        { label: 'AI 解析', cls: 'primary', id: 'parseBtn', onClick: null },
      ],
      onMount: (m, close) => {
        const btn = m.querySelector('.actions .btn.primary');
        btn.textContent = 'AI 解析';
        btn.onclick = async () => {
          const desc = UI.fv(m, '#aiDesc');
          if (!desc) { UI.toast('先写一段描述', 'err'); return; }
          if (!PB.llm.configured()) { UI.toast('未配置 AI 接口：请到「设置」填写 API 地址与密钥（手动添加目标不受影响）', 'err'); return; }
          btn.disabled = true; btn.textContent = '解析中…';
          const box = m.querySelector('#aiResult');
          box.innerHTML = '<p class="muted small">正在解析…</p>';
          try {
            const r = await PB.llm.parseGoals(desc);
            btn.disabled = false; btn.textContent = 'AI 解析';
            if (!r.goals.length) { box.innerHTML = '<p class="small" style="color:var(--red)">AI 未能识别出目标，试试把截止时间和事项说清楚。</p>'; return; }
            box.innerHTML = `
              <div class="divider"></div>
              <div class="small" style="margin-bottom:6px"><b>解析结果</b>（确认后导入）：</div>
              ${r.goals.map((g, i) => `
                <div class="list-item" style="border-bottom:1px dashed var(--line)">
                  <div class="main">
                    <div class="title" style="font-size:13.5px">${i + 1}. ${U.esc(g.title)} <span class="badge gray">${U.esc(g.category || '其他')}</span> <span class="badge blue">${U.esc(g.deadline || '无截止')}</span> <span class="badge orange">${g.estHours ?? '?'}h</span></div>
                    <div class="meta">${g.tasks && g.tasks.length ? '拆分：' + g.tasks.map(t => `${U.esc(t.title)}(${t.estHours}h)`).join('、') : (g.note ? U.esc(g.note) : '不拆子任务')}</div>
                  </div>
                </div>`).join('')}
              ${r.questions && r.questions.length ? `<div class="small" style="margin-top:8px;color:var(--orange)">AI 想确认：${r.questions.map(U.esc).join('；')}</div>` : ''}`;
            const confirmBtn = document.createElement('button');
            confirmBtn.className = 'btn primary'; confirmBtn.style.marginTop = '10px';
            confirmBtn.textContent = `确认导入 ${r.goals.length} 个目标`;
            confirmBtn.onclick = () => {
              const st = PB.store.get();
              for (const g of r.goals) {
                const gid = PB.store.uid();
                const taskHours = (g.tasks || []).reduce((a, t) => a + (+t.estHours || 0), 0);
                st.goals.push({ id: gid, title: g.title, category: g.category || '其他', deadline: g.deadline || '', priority: g.priority || 'med', estHours: +g.estHours || taskHours || 5, note: g.note || '', subjectId: null, createdAt: U.dateStr(U.today()) });
                for (const t of (g.tasks || [])) {
                  st.tasks.push({ id: PB.store.uid(), goalId: gid, title: t.title, estHours: +t.estHours || 2, doneHours: 0, qty: null, estFrom: 'ai', preferred: 'deep', priority: g.priority || 'med' });
                }
              }
              PB.store.save(); close(); UI.toast(`已导入 ${r.goals.length} 个目标`, 'ok'); if (onDone) onDone();
            };
            box.appendChild(confirmBtn);
          } catch (err) {
            btn.disabled = false; btn.textContent = 'AI 解析';
            box.innerHTML = `<p class="small" style="color:var(--red)">${U.esc(err.message)}</p>`;
          }
        };
      },
    });
  }

  /* ── 资料库 ─────────────────────────────────── */
  function materials(root) {
    const s = PB.store.get();
    root.innerHTML = `
      <div class="page-title">资料库</div>
      <div class="page-desc">按科目整理竞赛/课程资料。文件类资料（PDF 等）建议放网盘或链接，这里记录入口与用途。</div>
      <div class="card" style="margin-bottom:14px">
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn primary" id="btnAddSub">＋ 添加科目</button>
          <span class="muted small" style="align-self:center">科目可被目标关联（如"数学竞赛"科目 ← 竞赛目标），资料供规划时参考。</span>
        </div>
      </div>
      <div id="subCards"></div>`;

    const container = root.querySelector('#subCards');
    const stats = PB.engine.subjectStats();
    if (!stats.length) {
      container.innerHTML = `<div class="card"><div class="empty"><div class="big">📚</div>还没有科目。<br>
        <button class="btn primary" id="emptyAddSub" style="margin-top:10px">添加科目（如：数学竞赛 / 数据结构）</button></div></div>`;
      container.querySelector('#emptyAddSub').onclick = () => subjectModal(null, () => materials(root));
      return;
    }
    for (const st of stats) {
      const sub = st.subject;
      const card = document.createElement('div');
      card.className = 'card';
      card.style.marginBottom = '14px';
      card.innerHTML = `
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <span style="font-size:15px;font-weight:700;flex:1">${U.esc(sub.name)}</span>
          ${sub.target ? `<span class="badge blue">关键时间：${U.esc(sub.target)}</span>` : ''}
          <button class="btn sm" data-act="addMat">＋ 添加资料</button>
          <button class="btn sm" data-act="edit">编辑</button>
          <button class="btn sm danger" data-act="del">删除</button>
        </div>
        ${sub.note ? `<div class="muted small" style="margin-top:6px">${U.esc(sub.note)}</div>` : ''}
        <div class="divider" style="margin:8px 0"></div>
        <div data-mats></div>
        ${st.goals.length ? `<div class="muted small" style="margin-top:8px">关联目标：${st.goals.map(g => U.esc(g.title)).join('、')}</div>` : ''}`;
      const mats = card.querySelector('[data-mats]');
      if (!st.materials.length) mats.innerHTML = '<div class="muted small">暂无资料。</div>';
      else {
        for (const mt of st.materials) {
          const row = document.createElement('div');
          row.className = 'list-item';
          row.innerHTML = `
            <span>${mt.type === 'link' ? '🔗' : '📝'}</span>
            <div class="main">
              <div class="title" style="font-size:13.5px">${mt.type === 'link' ? `<a href="${U.esc(mt.url)}" target="_blank" rel="noopener">${U.esc(mt.title)}</a>` : U.esc(mt.title)}</div>
              ${mt.content ? `<div class="meta">${U.esc(mt.content)}</div>` : ''}
            </div>
            <button class="btn sm">删除</button>`;
          row.querySelector('button').onclick = () => UI.confirmBox(`删除资料「${U.esc(mt.title)}」？`, () => {
            const stt = PB.store.get();
            stt.materials = stt.materials.filter(x => x.id !== mt.id);
            PB.store.save(); materials(root);
          });
          mats.appendChild(row);
        }
      }
      card.querySelector('[data-act="addMat"]').onclick = () => materialModal(sub.id, null, () => materials(root));
      card.querySelector('[data-act="edit"]').onclick = () => subjectModal(sub, () => materials(root));
      card.querySelector('[data-act="del"]').onclick = () => UI.confirmBox(`删除科目「${U.esc(sub.name)}」及其所有资料？`, () => {
        const stt = PB.store.get();
        stt.subjects = stt.subjects.filter(x => x.id !== sub.id);
        stt.materials = stt.materials.filter(x => x.subjectId !== sub.id);
        PB.store.save(); UI.toast('已删除', 'ok'); materials(root);
      });
      container.appendChild(card);
    }
    root.querySelector('#btnAddSub').onclick = () => subjectModal(null, () => materials(root));
  }

  function subjectModal(existing, onDone) {
    const sub = existing || {};
    UI.openModal({
      title: existing ? '编辑科目' : '添加科目',
      bodyHTML: `
        <div class="field"><label>科目名称</label><input id="fName" value="${U.esc(sub.name || '')}" placeholder="如：数学竞赛 / 大学物理"></div>
        <div class="field"><label>关键时间（可选）</label><input id="fTarget" type="date" value="${sub.target || ''}"></div>
        <div class="field"><label>说明（可选）</label><textarea id="fNote" style="min-height:56px">${U.esc(sub.note || '')}</textarea></div>`,
      footer: [
        { label: '取消' },
        { label: '保存', cls: 'primary', onClick: (close) => {
          const name = UI.fv(document, '#fName');
          if (!name) { UI.toast('请填科目名称', 'err'); return; }
          const st = PB.store.get();
          const data = { name, target: UI.fv(document, '#fTarget'), note: UI.fv(document, '#fNote') };
          if (existing) Object.assign(st.subjects.find(x => x.id === existing.id), data);
          else st.subjects.push({ id: PB.store.uid(), ...data });
          PB.store.save(); close(); UI.toast('已保存', 'ok'); if (onDone) onDone();
        } },
      ],
    });
  }

  function materialModal(subjectId, existing, onDone) {
    const mt = existing || {};
    UI.openModal({
      title: existing ? '编辑资料' : '添加资料',
      bodyHTML: `
        <div class="field"><label>类型</label><select id="fType">${[['link','链接（网盘/网站/在线文档）'],['note','笔记说明']].map(([v,l])=>`<option value="${v}" ${mt.type===v?'selected':''}>${l}</option>`).join('')}</select></div>
        <div class="field"><label>标题</label><input id="fTitle" value="${U.esc(mt.title || '')}" placeholder="如：历年真题合集 2018-2025"></div>
        <div class="field" id="urlField"><label>链接 URL</label><input id="fUrl" value="${U.esc(mt.url || '')}" placeholder="https://…"></div>
        <div class="field"><label>内容说明（可选）</label><textarea id="fContent" style="min-height:60px">${U.esc(mt.content || '')}</textarea></div>`,
      footer: [
        { label: '取消' },
        { label: '保存', cls: 'primary', onClick: (close) => {
          const title = UI.fv(document, '#fTitle');
          if (!title) { UI.toast('请填标题', 'err'); return; }
          const st = PB.store.get();
          const data = { type: UI.fv(document, '#fType'), title, url: UI.fv(document, '#fUrl'), content: UI.fv(document, '#fContent') };
          if (existing) Object.assign(st.materials.find(x => x.id === existing.id), data);
          else st.materials.push({ id: PB.store.uid(), subjectId, ...data });
          PB.store.save(); close(); UI.toast('已保存', 'ok'); if (onDone) onDone();
        } },
      ],
    });
  }

  PB.views.goals = goals;
  PB.views.materials = materials;
  PB.views.taskModal = taskModal;
})();
