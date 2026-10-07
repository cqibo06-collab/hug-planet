/* ============================================================
 * taskimport.js — 导入外部任务表（自包含 HTML 的种子数据 / tk_data JSON）
 * 映射：分类 cat → 目标；单条任务 → 任务（含独立截止日 due）
 * ============================================================ */
PB.taskimp = (() => {
  const U = PB.util, UI = PB.ui;
  const CATMAP = { '考研复习': '考试', '数模竞赛': '竞赛', '课程作业': '作业', '竞赛': '竞赛', '考试': '考试', '作业': '作业', '技能': '技能' };
  const PRIMAP = { high: 'high', mid: 'med', low: 'low' };
  const DEF_H = 2; // 导入任务默认工时（原表没有工时概念），导入后可在工时清单调整

  // 从自包含 HTML 里提取种子任务数组（tasks=[...] 字面量，括号配平扫描）
  function parseHTML(text) {
    const i = text.indexOf('tasks=[');
    if (i === -1) throw new Error('未找到 tasks=[...] 内置数据');
    const start = text.indexOf('[', i);
    let depth = 0, end = -1, inStr = false, quote = '';
    for (let k = start; k < text.length; k++) {
      const ch = text[k];
      if (inStr) {
        if (ch === '\\') { k++; continue; }
        if (ch === quote) inStr = false;
        continue;
      }
      if (ch === '\'' || ch === '"') { inStr = true; quote = ch; continue; }
      if (ch === '[' || ch === '{') depth++;
      else if (ch === ']' || ch === '}') { depth--; if (depth === 0) { end = k + 1; break; } }
    }
    if (end === -1) throw new Error('内置数据不完整');
    const arr = new Function('return ' + text.slice(start, end))();
    if (!Array.isArray(arr)) throw new Error('内置数据格式异常');
    return arr;
  }

  function parseJSON(text) {
    const j = JSON.parse(text);
    if (Array.isArray(j)) return j;
    if (j && Array.isArray(j.tasks)) return j.tasks;
    throw new Error('JSON 里没找到任务数组（应为 tk_data 的内容）');
  }

  // 归一化：按 cat 分组 → [{cat, category, deadline, priority, estHours, tasks:[...]}]
  function normalize(items) {
    const groups = {};
    for (const t of items) {
      if (!t || !t.name) continue;
      const cat = t.cat || '其他';
      (groups[cat] = groups[cat] || []).push(t);
    }
    const out = [];
    const prioRank = { high: 0, med: 1, low: 2 };
    for (const [cat, list] of Object.entries(groups)) {
      const tasks = list.map(t => {
        const est = DEF_H;
        const prog = Math.max(0, Math.min(100, +t.prog || 0));
        const doneH = t.status === 'done' ? est : Math.round(est * prog / 100 * 10) / 10;
        let note = t.note || '';
        if (prog > 0 && t.status !== 'done') note = `原进度 ${prog}%${note ? ' · ' + note : ''}`;
        return {
          title: t.name, due: t.due || '', estHours: est, doneHours: doneH,
          priority: PRIMAP[t.pri] || 'med', preferred: 'deep', note,
        };
      });
      const dues = tasks.map(x => x.due).filter(Boolean).sort();
      const goalPri = tasks.map(x => x.priority).sort((a, b) => prioRank[a] - prioRank[b])[0] || 'med';
      out.push({
        cat,
        category: CATMAP[cat] || '其他',
        deadline: dues[0] || '',
        priority: goalPri,
        estHours: tasks.reduce((a, x) => a + x.estHours, 0),
        tasks,
      });
    }
    return out;
  }

  function apply(groups) {
    const st = PB.store.get();
    let gCount = 0, tCount = 0;
    for (const g of groups) {
      const gid = PB.store.uid();
      st.goals.push({
        id: gid, title: g.cat, category: g.category, deadline: g.deadline,
        priority: g.priority, estHours: g.estHours, note: '（自任务表导入）', subjectId: null,
        createdAt: U.dateStr(U.today()),
      });
      gCount++;
      for (const t of g.tasks) {
        st.tasks.push({
          id: PB.store.uid(), goalId: gid, title: t.title, estHours: t.estHours,
          doneHours: t.doneHours, qty: null, estFrom: 'manual', due: t.due,
          preferred: t.preferred, priority: t.priority, note: t.note,
        });
        tCount++;
      }
    }
    PB.store.save();
    return { gCount, tCount };
  }

  function modal(onDone) {
    UI.openModal({
      title: '导入任务表',
      bodyHTML: `
        <p class="muted small" style="margin-bottom:8px">两种方式任选：<b>① 上传任务表 HTML 文件</b>（读取其中内置的任务数据）；<b>② 粘贴 JSON</b>——在任务表页面按 <span class="kbd">F12</span> 打开控制台，输入 <span class="kbd">copy(localStorage.tk_data)</span> 回车（任务数据即进入剪贴板），粘贴到下面。若你在任务表里存过更多任务，方式② 才能拿到全部。</p>
        <div class="field"><label>任务表 HTML 文件</label><input type="file" id="tiFile" accept=".html,.htm"></div>
        <div class="field"><label>或粘贴任务 JSON</label><textarea id="tiJson" style="min-height:90px" placeholder='[{"name":"…","cat":"考研复习","pri":"high","due":"2026-10-20","status":"doing","prog":40,"note":"…"}, …]'></textarea></div>
        <div id="tiPreview"></div>`,
      footer: [{ label: '关闭' }],
      onMount: (m, close) => {
        const prev = m.querySelector('#tiPreview');
        let groups = null;
        const handle = (items, srcName) => {
          try {
            groups = normalize(items);
            if (!groups.length) { prev.innerHTML = '<p class="small" style="color:var(--red)">没有可导入的任务</p>'; return; }
            prev.innerHTML = `
              <div class="divider"></div>
              <div class="small" style="margin-bottom:6px"><b>导入预览</b>（来源：${U.esc(srcName)}）——按分类归为目标；原表没有工时概念，每个任务先按 <b>${DEF_H} 小时</b>计，导入后请在工时清单调整：</div>
              ${groups.map(g => `
                <div class="list-item" style="border-bottom:1px dashed var(--line)">
                  <div class="main">
                    <div class="title" style="font-size:13.5px">📁 ${U.esc(g.cat)} <span class="badge gray">${U.esc(g.category)}</span> <span class="badge blue">${g.tasks.length} 个任务</span> ${g.deadline ? `<span class="badge orange">最早截止 ${U.esc(g.deadline)}</span>` : '<span class="badge gray">无截止</span>'}</div>
                    <div class="meta">${g.tasks.map(t => `${U.esc(t.title)}（${t.estHours}h${t.due ? '，' + U.esc(t.due) : ''}）`).join('；')}</div>
                  </div>
                </div>`).join('')}
              <button class="btn primary" id="tiOk" style="margin-top:10px">确认导入 ${groups.reduce((a, g) => a + g.tasks.length, 0)} 个任务</button>`;
            prev.querySelector('#tiOk').onclick = () => {
              const r = apply(groups);
              close();
              UI.toast(`已导入 ${r.gCount} 个目标分类、${r.tCount} 个任务`, 'ok');
              if (onDone) onDone();
            };
          } catch (e) {
            prev.innerHTML = `<p class="small" style="color:var(--red)">${U.esc(e.message)}</p>`;
          }
        };
        m.querySelector('#tiFile').onchange = async e => {
          const f = e.target.files[0];
          if (!f) return;
          try { handle(parseHTML(await f.text()), f.name); }
          catch (err) { prev.innerHTML = `<p class="small" style="color:var(--red)">解析失败：${U.esc(err.message)}</p>`; }
          e.target.value = '';
        };
        const ta = m.querySelector('#tiJson');
        ta.addEventListener('change', () => {
          const txt = ta.value.trim();
          if (!txt) return;
          try { handle(parseJSON(txt), '粘贴 JSON'); }
          catch (err) { prev.innerHTML = `<p class="small" style="color:var(--red)">JSON 解析失败：${U.esc(err.message)}</p>`; }
        });
      },
    });
  }

  return { parseHTML, parseJSON, normalize, apply, modal };
})();
