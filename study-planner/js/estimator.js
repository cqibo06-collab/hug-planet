/* ============================================================
 * estimator.js — 工时估算器
 * 任务工时三种来源：手动填写 / 按量×速率估算 / 历史节奏校准
 * ============================================================ */
PB.est = (() => {
  const U = PB.util;

  // 内置速率表：unitMin = 每单位建议耗时（分钟）
  const UNITS = [
    { key: 'chapter',   label: '章（教材精读+笔记）', unitMin: 120 },
    { key: 'page',      label: '页（泛读/讲义）',     unitMin: 4 },
    { key: 'problem',   label: '道题（刷题/竞赛题）', unitMin: 35 },
    { key: 'paper',     label: '套卷（限时模拟）',    unitMin: 150 },
    { key: 'word50',    label: '50个单词',            unitMin: 25 },
    { key: 'video',     label: '集网课（45min档）',   unitMin: 60 },
    { key: 'recite',    label: '节背诵（知识点卡片）',unitMin: 30 },
    { key: 'custom',    label: '自定义单位',          unitMin: 30 },
  ];
  const UNIT_LABEL = Object.fromEntries(UNITS.map(u => [u.key, u.label]));

  /* 从已完成任务里校准个人速率：返回 {unitKey: 分钟/单位}
   * 优先用实际记录的耗时（actualHours），没有再用计划投入（doneHours） */
  function calibratedPaces() {
    const s = PB.store.get();
    const acc = {}; // unitKey -> {units, minutes}
    for (const t of s.tasks) {
      const q = t.qty;
      if (!q || !q.n || !q.unit || !UNIT_LABEL[q.unit]) continue;
      const real = t.actualHours != null ? t.actualHours : (t.doneHours || 0);
      if (real < 0.5) continue;               // 投入太少不可信
      const isFinished = PB.engine.taskRemaining(t) <= 0.05;
      if (!isFinished && !t.qtyDone) continue; // 未完成也没报进度，跳过
      const units = isFinished ? q.n : Math.min(q.n, t.qtyDone || 0);
      if (units <= 0) continue;
      if (!acc[q.unit]) acc[q.unit] = { units: 0, minutes: 0 };
      acc[q.unit].units += units;
      acc[q.unit].minutes += real * 60;
    }
    const out = {};
    for (const [k, v] of Object.entries(acc)) {
      if (v.units >= 3) out[k] = Math.round(v.minutes / v.units); // 至少 3 个单位样本才校准
    }
    return out;
  }

  /* 估算偏差：已完成任务的实际耗时 / 原预估 的比值
   * 返回 {count, ratio}，样本 <2 时 count=0 */
  function estimateBias() {
    const s = PB.store.get();
    let est = 0, real = 0, count = 0;
    for (const t of s.tasks) {
      if ((t.estHours || 0) <= 0) continue;
      if (PB.engine.taskRemaining(t) > 0.05) continue; // 只统计已完成的
      const a = t.actualHours != null ? t.actualHours : (t.doneHours || 0);
      if (a <= 0) continue;
      est += t.estHours; real += a; count++;
    }
    if (count < 2 || est <= 0) return { count: 0, ratio: 1 };
    return { count, ratio: Math.round(real / est * 100) / 100 };
  }

  /* 估算：qty = {n, unit, customMin?}
   * 返回 {hours, paceMin, source, detail} */
  function estimate(qty) {
    if (!qty || !qty.n || !qty.unit) return null;
    const paces = calibratedPaces();
    const unitLabel = UNIT_LABEL[qty.unit] || '单位';
    let paceMin, source, detail;
    if (qty.customMin > 0) {
      paceMin = qty.customMin; source = 'manual';
      detail = `${qty.n} × ${unitLabel}（自定义 ${paceMin} 分钟/单位）`;
    } else if (qty.unit === 'custom') {
      paceMin = 30; source = 'default';
      detail = `${qty.n} × 自定义单位（未填耗时，按 30 分钟/单位）`;
    } else if (paces[qty.unit]) {
      paceMin = paces[qty.unit]; source = 'hist';
      detail = `${qty.n} × ${unitLabel}（${paceMin} 分钟/单位，按你的历史节奏校准）`;
    } else {
      paceMin = (UNITS.find(u => u.key === qty.unit) || {}).unitMin || 30; source = 'default';
      detail = `${qty.n} × ${unitLabel}（${paceMin} 分钟/单位，通用估计）`;
    }
    const hours = Math.round(qty.n * paceMin / 6) / 10; // 0.1h 精度
    return { hours, paceMin, source, detail };
  }

  // 任务显示的估算来源标签
  function sourceLabel(t) {
    if (t.qty && t.qty.n) return '按量估算';
    if (t.estFrom === 'ai') return 'AI 估计';
    if (t.estFrom === 'hist') return '历史校准';
    return '手动填写';
  }

  // 单位下拉 options HTML
  function unitOptions(selected) {
    return UNITS.map(u => `<option value="${u.key}" ${u.key === selected ? 'selected' : ''}>${u.label}</option>`).join('');
  }

  return { UNITS, UNIT_LABEL, calibratedPaces, estimateBias, estimate, sourceLabel, unitOptions };
})();
