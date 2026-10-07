/* ============================================================
 * core.js — 全局命名空间、状态存储、时间工具、UI 基础组件
 * ============================================================ */
window.PB = { version: '1.0.0' };

/* ── 时间/日期工具 ─────────────────────────────── */
PB.util = (() => {
  const pad = n => String(n).padStart(2, '0');
  const DAY_CN = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

  // "08:30" -> 510（分钟）
  function hm(s) {
    if (typeof s === 'number') return s;
    const m = String(s || '').trim().match(/^(\d{1,2})[:：点](\d{1,2})?/);
    if (!m) return null;
    return (+m[1]) * 60 + (+(m[2] || 0));
  }
  // 510 -> "08:30"
  function hmStr(min) {
    min = Math.max(0, Math.round(min));
    return pad(Math.floor(min / 60) % 24) + ':' + pad(min % 60);
  }
  function dateStr(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
  function parseDate(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }
  function today() { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
  function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
  // 本周一（周一开始）
  function mondayOf(d) {
    const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
    return x;
  }
  function fmtCN(s) {
    const d = typeof s === 'string' ? parseDate(s) : s;
    return `${d.getMonth() + 1}月${d.getDate()}日 ${DAY_CN[d.getDay()]}`;
  }
  function dayDiff(aStr, bStr) { // a - b（天数）
    return Math.round((parseDate(aStr) - parseDate(bStr)) / 86400000);
  }
  // 区间相减：base、cuts 均为 [{s,e}]（分钟），返回剩余区间
  function subtract(base, cuts) {
    let out = base.map(x => ({ s: x.s, e: x.e }));
    for (const c of cuts) {
      const next = [];
      for (const iv of out) {
        if (c.e <= iv.s || c.s >= iv.e) { next.push(iv); continue; }
        if (c.s > iv.s) next.push({ s: iv.s, e: c.s });
        if (c.e < iv.e) next.push({ s: c.e, e: iv.e });
      }
      out = next;
    }
    return out.filter(iv => iv.e - iv.s > 0);
  }
  function overlap(a, b) { return Math.max(0, Math.min(a.e, b.e) - Math.max(a.s, b.s)); }
  function fmtHours(min) {
    const h = min / 60;
    return h >= 10 ? Math.round(h) + ' 小时' : (Math.round(h * 10) / 10) + ' 小时';
  }
  function esc(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  // 极简 Markdown 渲染（标题/加粗/列表/行内代码/换行），先转义防注入
  function md(src) {
    const lines = esc(src || '').split(/\r?\n/);
    let html = '', inList = false;
    const closeList = () => { if (inList) { html += '</ul>'; inList = false; } };
    for (let raw of lines) {
      const line = raw.trimEnd();
      if (!line.trim()) { closeList(); continue; }
      let h = line.match(/^(#{1,4})\s+(.*)$/);
      if (h) { closeList(); html += `<h3>${inline(h[2])}</h3>`; continue; }
      if (/^[-*•]\s+/.test(line)) {
        if (!inList) { html += '<ul>'; inList = true; }
        html += `<li>${inline(line.replace(/^[-*•]\s+/, ''))}</li>`; continue;
      }
      closeList();
      html += `<p>${inline(line)}</p>`;
    }
    closeList();
    function inline(s) {
      return s
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/`([^`]+)`/g, '<code>$1</code>');
    }
    return html;
  }
  return { hm, hmStr, dateStr, parseDate, today, addDays, mondayOf, fmtCN, dayDiff, subtract, overlap, fmtHours, esc, md, DAY_CN };
})();

/* ── 状态存储（localStorage） ───────────────────── */
PB.store = (() => {
  const KEY = 'shiguang.v1';
  const U = PB.util;

  function defaults() {
    return {
      settings: {
        dayStart: '07:30',   // 每天规划起点
        dayEnd: '23:00',     // 每天规划终点
        chunkMin: 90,        // 整块时间阈值（分钟）
        dailyCapH: 10,       // 每天学习时长上限（小时）
        energy: 'balanced',  // morning | balanced | night
        meals: true,         // 是否扣除三餐缓冲（12:00-13:00 / 18:00-19:00）
        llm: { baseURL: 'https://api.deepseek.com', apiKey: '', model: 'deepseek-chat' },
      },
      courses: [],     // {id,name,teacher,location,day(1-7),start,end}
      events: [],      // 单次占用 {id,name,date,start,end}
      goals: [],       // {id,title,category,deadline,priority,estHours,note,subjectId,createdAt}
      tasks: [],       // {id,goalId,title,estHours,doneHours,priority,preferred}
      subjects: [],    // {id,name,target,note}
      materials: [],   // {id,subjectId,type:'link'|'note',title,url,content,createdAt}
      plan: { weekOf: '', items: [] }, // items: {id,taskId,goalId,date,start,end,done}
    };
  }

  let state = load();

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return defaults();
      const saved = JSON.parse(raw);
      const d = defaults();
      // 浅合并 + 关键字段兜底
      const s = { ...d, ...saved };
      s.settings = { ...d.settings, ...(saved.settings || {}) };
      s.settings.llm = { ...d.settings.llm, ...((saved.settings || {}).llm || {}) };
      s.plan = { ...d.plan, ...(saved.plan || {}) };
      for (const k of ['courses', 'events', 'goals', 'tasks', 'subjects', 'materials'])
        if (!Array.isArray(s[k])) s[k] = [];
      return s;
    } catch (e) {
      console.error('读取本地数据失败', e);
      return defaults();
    }
  }

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); }
    catch (e) { PB.ui.toast('保存失败：' + e.message, 'err'); }
  }

  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

  function replaceAll(newState) { state = newState; save(); }

  return {
    get: () => state,
    save,
    uid,
    replaceAll,
    reset: () => { state = defaults(); save(); },
  };
})();

/* ── UI 基础：弹窗 / toast / 确认 ───────────────── */
PB.ui = (() => {
  const U = PB.util;

  function toast(msg, type = '') {
    const root = document.getElementById('toastRoot');
    const el = document.createElement('div');
    el.className = 'toast ' + type;
    el.textContent = msg;
    root.appendChild(el);
    setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .3s'; }, 2600);
    setTimeout(() => el.remove(), 3000);
  }

  // openModal({title, bodyHTML, onMount(modalEl), footer:[{label, cls, onClick(close)}]})
  function openModal({ title, bodyHTML = '', footer = [], onMount }) {
    const root = document.getElementById('modalRoot');
    const mask = document.createElement('div');
    mask.className = 'modal-mask';
    mask.innerHTML = `
      <div class="modal">
        <h3>${U.esc(title)}</h3>
        <div class="modal-body">${bodyHTML}</div>
        <div class="actions"></div>
      </div>`;
    const actions = mask.querySelector('.actions');
    const close = () => mask.remove();
    for (const f of footer) {
      const b = document.createElement('button');
      b.className = 'btn ' + (f.cls || '');
      b.textContent = f.label;
      b.onclick = () => f.onClick ? f.onClick(close) : close();
      actions.appendChild(b);
    }
    if (!footer.length) actions.style.display = 'none';
    mask.addEventListener('mousedown', e => { if (e.target === mask) close(); });
    root.appendChild(mask);
    if (onMount) onMount(mask.querySelector('.modal'), close);
    return { close };
  }

  function confirmBox(msg, onOk, { title = '确认操作', okLabel = '确定', danger = true } = {}) {
    openModal({
      title,
      bodyHTML: `<p style="font-size:14px">${msg}</p>`,
      footer: [
        { label: '取消' },
        { label: okLabel, cls: danger ? 'danger' : 'primary', onClick: (close) => { close(); onOk(); } },
      ],
    });
  }

  // 表单取值
  function fv(root, sel) { const el = root.querySelector(sel); return el ? el.value.trim() : ''; }

  return { toast, openModal, confirmBox, fv };
})();
