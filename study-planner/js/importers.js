/* ============================================================
 * importers.js — ICS 日历文件解析 + CSV/文本粘贴解析
 * 输出统一为：{ recurring:[{name,day,start,end,location}], once:[{name,date,start,end,location}] }
 * ============================================================ */
PB.imp = (() => {
  const U = PB.util;

  /* ── ICS ─────────────────────────────────────── */
  const BYDAY = { MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6, SU: 7 };

  function unfold(text) {
    const lines = String(text).replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
    const out = [];
    for (const l of lines) {
      if ((/^[ \t]/.test(l)) && out.length) out[out.length - 1] += l.slice(1);
      else out.push(l);
    }
    return out.filter(x => x.trim());
  }

  // 解析 DTSTART/DTEND 值 -> {date:'YYYY-MM-DD', minutes, utc:bool, allDay:bool}
  function parseDT(v) {
    v = String(v).trim();
    let m = v.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/);
    if (m) {
      const utc = m[7] === 'Z';
      let date = `${m[1]}-${m[2]}-${m[3]}`, minutes = (+m[4]) * 60 + (+m[5]);
      if (utc) { // 转本地时间（课表场景一般为本地，此处兜底）
        const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]));
        date = U.dateStr(d); minutes = d.getHours() * 60 + d.getMinutes();
      }
      return { date, minutes, utc, allDay: false };
    }
    m = v.match(/^(\d{4})(\d{2})(\d{2})$/);
    if (m) return { date: `${m[1]}-${m[2]}-${m[3]}`, minutes: 0, allDay: true };
    return null;
  }

  function parseICS(text) {
    const res = { recurring: [], once: [], skipped: 0 };
    const lines = unfold(text);
    let cur = null;
    for (const line of lines) {
      const ci = line.indexOf(':');
      if (ci < 0) continue;
      const left = line.slice(0, ci).toUpperCase();
      const name = left.split(';')[0];
      const value = line.slice(ci + 1);
      if (name === 'BEGIN' && value.toUpperCase() === 'VEVENT') { cur = {}; continue; }
      if (name === 'END' && value.toUpperCase() === 'VEVENT') {
        if (cur) emit(cur, res);
        cur = null; continue;
      }
      if (!cur) continue;
      if (name === 'SUMMARY') cur.summary = value.replace(/\\,/g, ',').replace(/\\n/g, ' ').trim();
      else if (name === 'LOCATION') cur.location = value.trim();
      else if (name === 'DTSTART') { cur.dtstart = parseDT(value); cur.dtstartRaw = left; }
      else if (name === 'DTEND') cur.dtend = parseDT(value);
      else if (name === 'RRULE') cur.rrule = value.toUpperCase();
      else if (name === 'DURATION') cur.duration = value;
    }
    return res;

    function emit(ev, res) {
      if (!ev.dtstart) { res.skipped++; return; }
      const ds = ev.dtstart;
      let de = ev.dtend;
      if (ds.allDay) { res.skipped++; return; } // 全天事件不占具体时段
      // 结束时间：优先 DTEND，其次 DURATION（PT1H30M），默认 1 小时
      let endMin;
      if (de && de.date === ds.date && !de.allDay) endMin = de.minutes;
      else if (de && !de.allDay && de.date !== ds.date) endMin = 24 * 60;
      else if (ev.duration) {
        const m = ev.duration.toUpperCase().match(/PT(?:(\d+)H)?(?:(\d+)M)?/);
        endMin = ds.minutes + (m ? (+m[1] || 0) * 60 + (+m[2] || 0) : 60);
      } else endMin = ds.minutes + 60;
      if (endMin <= ds.minutes) endMin = Math.min(24 * 60, ds.minutes + 60);

      const item = { name: ev.summary || '（未命名）', location: ev.location || '', start: ds.minutes, end: endMin };
      const rr = ev.rrule || '';
      const freq = (rr.match(/FREQ=(\w+)/) || [])[1];
      if (freq === 'WEEKLY') {
        const bydays = [...rr.matchAll(/BYDAY=([A-Z,]+)/g)];
        let days = [];
        if (bydays.length) days = bydays[0][1].split(',').map(d => BYDAY[d.trim()]).filter(Boolean);
        if (!days.length) { // 无 BYDAY 时按 DTSTART 的星期
          const wd = U.parseDate(ds.date).getDay();
          days = [wd === 0 ? 7 : wd];
        }
        for (const day of days) res.recurring.push({ ...item, day });
      } else if (freq === 'DAILY') {
        for (let day = 1; day <= 7; day++) res.recurring.push({ ...item, day });
      } else if (freq) {
        res.skipped++; // MONTHLY 等复杂规则暂不处理
      } else {
        res.once.push({ ...item, date: ds.date });
      }
    }
  }

  /* ── CSV / 粘贴文本 ───────────────────────────── */
  // 支持表头或固定列序：课程, 星期, 开始, 结束, [地点]
  const DAY_ALIAS = { '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '日': 7, '天': 7, '7': 7 };
  function parseDayCell(s) {
    s = String(s).trim();
    if (/^(sun|sunday)/i.test(s)) return 7;
    if (/^(mon|monday)/i.test(s)) return 1;
    if (/^(tue|tuesday)/i.test(s)) return 2;
    if (/^(wed|wednesday)/i.test(s)) return 3;
    if (/^(thu|thursday)/i.test(s)) return 4;
    if (/^(fri|friday)/i.test(s)) return 5;
    if (/^(sat|saturday)/i.test(s)) return 6;
    if (/^周|星期/.test(s)) { const c = s.replace(/^周|^星期/, '')[0]; return DAY_ALIAS[c] || null; }
    if (/^[1-7]$/.test(s)) return +s;
    if (s === '0') return 7;
    for (const ch of s) if (DAY_ALIAS[ch]) return DAY_ALIAS[ch];
    return null;
  }

  function splitCSVLine(line) {
    const out = []; let cur = '', inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { inQ = !inQ; continue; }
      if ((ch === ',' || ch === '\t' || ch === '，') && !inQ) { out.push(cur); cur = ''; continue; }
      cur += ch;
    }
    out.push(cur);
    return out.map(s => s.trim());
  }

  function parseCSV(text) {
    const res = { recurring: [], once: [], skipped: 0, errors: [] };
    const lines = String(text).replace(/\r\n/g, '\n').split('\n').map(l => l.trim()).filter(Boolean);
    let startIdx = 0;
    if (lines.length && /课程|科目|事件|名称|name|title/i.test(lines[0])) startIdx = 1;
    for (let i = startIdx; i < lines.length; i++) {
      const cols = splitCSVLine(lines[i]);
      if (cols.length < 4) { res.skipped++; continue; }
      const [name, dayCell, sCell, eCell, loc] = cols;
      const start = U.hm(sCell), end = U.hm(eCell);
      if (start == null || end == null) { res.errors.push(`第${i + 1}行：时间「${sCell}~${eCell}」无法识别`); continue; }
      const item = { name: name || '（未命名）', location: loc || '', start, end: end > start ? end : start + 45 };
      // 星期列若为具体日期（YYYY-MM-DD），作为单次事件；否则按星期解析
      const dm = String(dayCell).trim().match(/^(\d{4})[-/年](\d{1,2})[-/月](\d{1,2})/);
      if (dm) {
        res.once.push({ ...item, date: `${dm[1]}-${String(+dm[2]).padStart(2, '0')}-${String(+dm[3]).padStart(2, '0')}` });
        continue;
      }
      const day = parseDayCell(dayCell);
      if (day == null) { res.errors.push(`第${i + 1}行：星期「${dayCell}」无法识别`); continue; }
      res.recurring.push({ ...item, day });
    }
    return res;
  }

  // 去重（与已有课程对照）
  function dedupe(list, existing) {
    const sig = x => `${x.name}|${x.day}|${x.start}|${x.end}`;
    const seen = new Set(existing.map(sig));
    const added = [], dup = 0;
    for (const x of list) {
      const s = sig(x);
      if (seen.has(s)) { dup++; continue; }
      seen.add(s); added.push(x);
    }
    return { added, dup };
  }

  /* ── 正方教务系统课表（.xls 网格） ─────────────── */
  // 默认节次作息（分钟），1-12 节；与多数高校一致，导入后可在课程编辑里微调
  const PERIOD_TIMES = {
    1: [480, 525], 2: [535, 580],    // 08:00-09:40
    3: [600, 645], 4: [655, 700],    // 10:00-11:40
    5: [870, 915], 6: [925, 970],    // 14:30-16:10
    7: [980, 1025], 8: [1035, 1080], // 16:20-18:00
    9: [1140, 1185], 10: [1195, 1240], // 19:00-20:40
    11: [1260, 1305], 12: [1315, 1360], // 21:00-22:40
  };
  function periodRange(p1, p2) {
    const a = PERIOD_TIMES[p1] || PERIOD_TIMES[1];
    const b = PERIOD_TIMES[p2 || p1] || a;
    return { start: a[0], end: Math.max(b[1], a[0] + 40) };
  }

  // 解析单个单元格：可含多个课程块（以「教师()」行为分界）
  // 返回 [{name,teacher,weeks,periods:[a,b],location}]
  function parseZFCell(text) {
    const lines = String(text).split(/\r?\n/).map(x => x.trim()).filter(Boolean);
    if (!lines.length) return [];
    const teacherIdx = [];
    lines.forEach((l, i) => { if (/^[^()（）]{1,25}[（(]\s*[)）]$/.test(l)) teacherIdx.push(i); });
    if (!teacherIdx.length) return [];
    const blocks = [];
    for (let k = 0; k < teacherIdx.length; k++) {
      const start = k === 0 ? Math.max(0, teacherIdx[0] - 1) : teacherIdx[k - 1] + 1;
      const end = k === teacherIdx.length - 1 ? lines.length : teacherIdx[k + 1] - 1;
      blocks.push(lines.slice(start, end));
    }
    const out = [];
    for (const b of blocks) {
      if (b.length < 2) continue;
      const ti = b.findIndex(l => /^[^()（）]{1,25}[（(]\s*[)）]$/.test(l));
      if (ti < 1) continue;
      const name = b[ti - 1].replace(/^【|】$/g, '');
      const teacher = b[ti].replace(/[（(]\s*[)）]$/, '');
      let weeks = '';
      let periods = null;
      let location = '';
      for (const l of b.slice(ti + 1)) {
        if (!weeks && /\[周\]|周\]$/.test(l)) weeks = l;
        if (!periods) {
          const m = l.match(/\[?\s*(\d{1,2})\s*[-~－]\s*(\d{1,2})\s*\]?\s*节/);
          if (m) periods = [+m[1], +m[2]];
        }
        if (!location && /^【/.test(l)) location = l.replace(/[【】]/g, ' ').trim();
      }
      out.push({ name, teacher, weeks, periods, location });
    }
    return out;
  }

  // rows: 二维数组（SheetJS sheet_to_json header:1）
  // 返回 {recurring:[{name,day,start,end,location,teacher,weeks}], once:[], skipped, errors}
  function parseZFGrid(rows) {
    const res = { recurring: [], once: [], skipped: 0, errors: [] };
    if (!rows || !rows.length) { res.errors.push('表格为空'); return res; }
    // 定位表头行：包含 >=5 个 星期X
    let headR = -1;
    const dayCols = {}; // day(1-7) -> col
    for (let r = 0; r < Math.min(rows.length, 10); r++) {
      const row = rows[r] || [];
      const m = {};
      for (let c = 0; c < row.length; c++) {
        const t = String(row[c] || '');
        const dm = t.match(/星期\s*([日一二三四五六天])/);
        if (dm) {
          const dmap = { '日': 7, '天': 7, '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6 };
          m[dmap[dm[1]]] = c;
        }
      }
      if (Object.keys(m).length >= 5) { headR = r; Object.assign(dayCols, m); break; }
    }
    if (headR === -1) { res.errors.push('未找到「星期日~星期六」表头，请确认导出的是学生个人课表'); return res; }
    // 表头行之后的每一行：col0 应为节次标签
    for (let r = headR + 1; r < rows.length; r++) {
      const row = rows[r] || [];
      const label = String(row[0] || '').trim();
      if (!label) continue;
      const rm = label.match(/(\d{1,2})\s*[-~－]\s*(\d{1,2})\s*节/);
      if (!rm) continue; // 备注等非节次行
      const rowPeriods = [+rm[1], +rm[2]];
      for (const [dayStr, col] of Object.entries(dayCols)) {
        const day = +dayStr;
        const cellText = String(row[col] || '');
        if (!cellText.trim()) continue;
        const blocks = parseZFCell(cellText);
        if (!blocks.length) { res.skipped++; continue; }
        for (const b of blocks) {
          const p = b.periods || rowPeriods;
          const { start, end } = periodRange(p[0], p[1]);
          res.recurring.push({
            name: b.name, day, start, end,
            location: b.location || '', teacher: b.teacher || '', weeks: b.weeks || '',
          });
        }
      }
    }
    if (!res.recurring.length && !res.errors.length) res.errors.push('未解析到课程，请确认文件内容');
    // 同一时段（day+start+end）可能有多条按周次轮换的课程，合并为一条避免误报冲突
    const bySlot = {};
    for (const it of res.recurring) {
      const k = `${it.day}|${it.start}|${it.end}`;
      (bySlot[k] = bySlot[k] || []).push(it);
    }
    const merged = [];
    for (const list of Object.values(bySlot)) {
      if (list.length === 1) { merged.push(list[0]); continue; }
      const names = [...new Set(list.map(x => x.name))];
      const weeks = [...new Set(list.map(x => x.weeks).filter(Boolean))];
      const teachers = [...new Set(list.map(x => x.teacher).filter(Boolean))];
      merged.push({
        ...list[0],
        name: names.join('／'),
        weeks: weeks.join('；'),
        teacher: teachers.join('、'),
        location: list.map(x => x.location).find(Boolean) || '',
      });
    }
    res.recurring = merged;
    return res;
  }

  // 用 SheetJS 读工作簿并解析（wb: XLSX.read 的结果）
  function parseZFWorkbook(wb) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' });
    return parseZFGrid(rows);
  }

  return { parseICS, parseCSV, dedupe, parseDayCell, parseZFCell, parseZFGrid, parseZFWorkbook, PERIOD_TIMES, periodRange };
})();
