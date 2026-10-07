/* 成本与管理会计模块（初级会计实务 · 产品成本核算） */
(function () {
  'use strict';
  var fmt = App.fmt, money = App.money, pct = App.pct, table = App.table, round = App.round;

  /* ============ 1. 约当产量比例法 ============ */
  App.register('成本核算', {
    id: 'equivalent-units',
    name: '约当产量比例法',
    tip: '把月末在产品按完工程度折算成"相当于多少件完工产品"，再把费用在完工产品和在产品之间分配。',
    inputs: [
      { key: 'finished', label: '本月完工产品数量', value: 800 },
      { key: 'wip', label: '月末在产品数量', value: 200 },
      { key: 'matRate', label: '在产品材料投料程度', value: 100, unit: '%' },
      { key: 'convRate', label: '在产品加工完工程度', value: 50, unit: '%' },
      { key: 'bm', label: '月初在产品成本 — 直接材料', value: 20000 },
      { key: 'bl', label: '月初在产品成本 — 直接人工', value: 8000 },
      { key: 'bmf', label: '月初在产品成本 — 制造费用', value: 12000 },
      { key: 'cm', label: '本月发生生产费用 — 直接材料', value: 100000 },
      { key: 'cl', label: '本月发生生产费用 — 直接人工', value: 40000 },
      { key: 'cmf', label: '本月发生生产费用 — 制造费用', value: 60000 }
    ],
    compute: function (v) {
      var matEq = v.finished + v.wip * v.matRate / 100;
      var convEq = v.finished + v.wip * v.convRate / 100;
      var unitM = matEq === 0 ? 0 : (v.bm + v.cm) / matEq;
      var unitL = convEq === 0 ? 0 : (v.bl + v.cl) / convEq;
      var unitF = convEq === 0 ? 0 : (v.bmf + v.cmf) / convEq;

      var finM = v.finished * unitM, finL = v.finished * unitL, finF = v.finished * unitF;
      var finCost = finM + finL + finF;
      var wipM = v.wip * v.matRate / 100 * unitM;
      var wipL = v.wip * v.convRate / 100 * unitL;
      var wipF = v.wip * v.convRate / 100 * unitF;
      var wipCost = wipM + wipL + wipF;
      var total = v.bm + v.bl + v.bmf + v.cm + v.cl + v.cmf;

      var rows = [
        ['直接材料', fmt(v.bm), fmt(v.cm), fmt(v.bm + v.cm), fmt(matEq), fmt(unitM, 4), fmt(finM), fmt(wipM)],
        ['直接人工', fmt(v.bl), fmt(v.cl), fmt(v.bl + v.cl), fmt(convEq), fmt(unitL, 4), fmt(finL), fmt(wipL)],
        ['制造费用', fmt(v.bmf), fmt(v.cmf), fmt(v.bmf + v.cmf), fmt(convEq), fmt(unitF, 4), fmt(finF), fmt(wipF)],
        ['合计', fmt(v.bm + v.bl + v.bmf), fmt(v.cm + v.cl + v.cmf), fmt(total), '—', '—', fmt(finCost), fmt(wipCost)]
      ];

      return {
        result: [
          { k: '完工产品总成本', v: money(finCost) },
          { k: '完工产品单位成本', v: v.finished ? money(finCost / v.finished, 4) : '-' },
          { k: '月末在产品成本', v: money(wipCost) },
          { k: '费用合计（勾稽）', v: money(total) }
        ],
        steps: [
          '直接材料约当产量 = 完工 ' + fmt(v.finished, 0) + ' + 在产品 ' + fmt(v.wip, 0) + ' × ' + pct(v.matRate) + ' = ' + fmt(matEq, 0) + ' 件',
          '加工费用约当产量 = 完工 ' + fmt(v.finished, 0) + ' + 在产品 ' + fmt(v.wip, 0) + ' × ' + pct(v.convRate) + ' = ' + fmt(convEq, 0) + ' 件',
          '材料单位成本 = (' + fmt(v.bm) + ' + ' + fmt(v.cm) + ') ÷ ' + fmt(matEq, 0) + ' = ' + fmt(unitM, 4),
          '人工单位成本 = (' + fmt(v.bl) + ' + ' + fmt(v.cl) + ') ÷ ' + fmt(convEq, 0) + ' = ' + fmt(unitL, 4),
          '制造费用单位成本 = (' + fmt(v.bmf) + ' + ' + fmt(v.cmf) + ') ÷ ' + fmt(convEq, 0) + ' = ' + fmt(unitF, 4),
          '完工产品成本 = ' + fmt(v.finished, 0) + ' × (' + fmt(unitM, 4) + ' + ' + fmt(unitL, 4) + ' + ' + fmt(unitF, 4) + ') = ' + money(finCost),
          '月末在产品成本 = ' + money(wipCost) + '（勾稽：完工 + 在产品 = ' + money(finCost + wipCost) + '，应等于费用合计 ' + money(total) + '）'
        ],
        tableHtml: table(['成本项目', '月初在产品', '本月发生', '费用合计', '约当产量', '单位成本', '完工产品成本', '月末在产品成本'], rows),
        entry: [
          '借：库存商品                        ' + fmt(finCost),
          '    贷：生产成本—基本生产成本              ' + fmt(finCost)
        ],
        note: '若原材料在生产开始时一次投入，在产品投料程度按 100% 计算；分工序投入则要分段折算。'
      };
    }
  });

  /* ============ 2. 辅助生产费用分配 ============ */
  App.register('成本核算', {
    id: 'aux-allocation',
    name: '辅助生产费用分配',
    tip: '两个辅助车间互相提供劳务时用。直接分配法不看内部耗用，交互分配法要先对内分一次再对外分。',
    inputs: [
      {
        key: 'method', label: '分配方法', type: 'select',
        options: [{ v: 'direct', t: '直接分配法' }, { v: 'reciprocal', t: '交互分配法' }]
      },
      { key: 'ac', label: '辅助车间 A 待分配费用', value: 48000 },
      { key: 'at', label: '辅助车间 A 提供劳务总量', value: 120000 },
      { key: 'a2b', label: 'A 提供给 B 的数量', value: 20000 },
      { key: 'a2p', label: 'A 提供给基本生产车间的数量', value: 80000 },
      { key: 'a2m', label: 'A 提供给行政管理部门的数量', value: 20000 },
      { key: 'bc', label: '辅助车间 B 待分配费用', value: 36000 },
      { key: 'bt', label: '辅助车间 B 提供劳务总量', value: 90000 },
      { key: 'b2a', label: 'B 提供给 A 的数量', value: 10000 },
      { key: 'b2p', label: 'B 提供给基本生产车间的数量', value: 70000 },
      { key: 'b2m', label: 'B 提供给行政管理部门的数量', value: 10000 }
    ],
    compute: function (v) {
      var steps = [], aRate, bRate, aCost = v.ac, bCost = v.bc;

      if (v.method === 'direct') {
        var aOut = v.at - v.a2b, bOut = v.bt - v.b2a;
        aRate = aOut === 0 ? 0 : v.ac / aOut;
        bRate = bOut === 0 ? 0 : v.bc / bOut;
        steps.push('A 对外供应数量 = ' + fmt(v.at, 0) + ' − ' + fmt(v.a2b, 0) + ' = ' + fmt(aOut, 0) + '，分配率 = ' + fmt(v.ac) + ' ÷ ' + fmt(aOut, 0) + ' = ' + fmt(aRate, 6));
        steps.push('B 对外供应数量 = ' + fmt(v.bt, 0) + ' − ' + fmt(v.b2a, 0) + ' = ' + fmt(bOut, 0) + '，分配率 = ' + fmt(v.bc) + ' ÷ ' + fmt(bOut, 0) + ' = ' + fmt(bRate, 6));
        steps.push('直接分配法不分配辅助车间之间相互提供的劳务，因此分配率被抬高。');
      } else {
        var aIn = v.at === 0 ? 0 : v.ac / v.at;
        var bIn = v.bt === 0 ? 0 : v.bc / v.bt;
        var a2bAmt = aIn * v.a2b, b2aAmt = bIn * v.b2a;
        aCost = v.ac + b2aAmt - a2bAmt;
        bCost = v.bc + a2bAmt - b2aAmt;
        var aOut2 = v.at - v.a2b, bOut2 = v.bt - v.b2a;
        aRate = aOut2 === 0 ? 0 : aCost / aOut2;
        bRate = bOut2 === 0 ? 0 : bCost / bOut2;
        steps.push('第一步（对内交互分配）：A 对内分配率 = ' + fmt(aIn, 6) + '，A 转给 B ' + money(a2bAmt) + '；B 对内分配率 = ' + fmt(bIn, 6) + '，B 转给 A ' + money(b2aAmt));
        steps.push('第二步（计算实际费用）：A 实际费用 = ' + fmt(v.ac) + ' + ' + fmt(b2aAmt) + ' − ' + fmt(a2bAmt) + ' = ' + money(aCost));
        steps.push('　　　　　　　　　　　B 实际费用 = ' + fmt(v.bc) + ' + ' + fmt(a2bAmt) + ' − ' + fmt(b2aAmt) + ' = ' + money(bCost));
        steps.push('第三步（对外分配）：A 分配率 = ' + fmt(aCost) + ' ÷ ' + fmt(aOut2, 0) + ' = ' + fmt(aRate, 6) + '；B 分配率 = ' + fmt(bCost) + ' ÷ ' + fmt(bOut2, 0) + ' = ' + fmt(bRate, 6));
      }

      var aP = aRate * v.a2p, aM = aRate * v.a2m, bP = bRate * v.b2p, bM = bRate * v.b2m;
      var rows = [
        ['基本生产车间', fmt(v.a2p, 0), fmt(aP), fmt(v.b2p, 0), fmt(bP), fmt(aP + bP)],
        ['行政管理部门', fmt(v.a2m, 0), fmt(aM), fmt(v.b2m, 0), fmt(bM), fmt(aM + bM)],
        ['合计', fmt(v.a2p + v.a2m, 0), fmt(aP + aM), fmt(v.b2p + v.b2m, 0), fmt(bP + bM), fmt(aP + aM + bP + bM)]
      ];

      var entry = [];
      if (v.method === 'reciprocal') {
        entry.push('（交互分配）借：生产成本—辅助生产成本(B)   ' + fmt(aRate === 0 ? 0 : (v.ac / (v.at || 1)) * v.a2b));
        entry.push('　　　　　　贷：生产成本—辅助生产成本(A)           ' + fmt((v.ac / (v.at || 1)) * v.a2b));
        entry.push('（交互分配）借：生产成本—辅助生产成本(A)   ' + fmt((v.bc / (v.bt || 1)) * v.b2a));
        entry.push('　　　　　　贷：生产成本—辅助生产成本(B)           ' + fmt((v.bc / (v.bt || 1)) * v.b2a));
        entry.push('');
      }
      entry.push('借：生产成本—基本生产成本      ' + fmt(aP + bP));
      entry.push('　　管理费用                          ' + fmt(aM + bM));
      entry.push('　　贷：生产成本—辅助生产成本(A)      ' + fmt(aP + aM));
      entry.push('　　　　生产成本—辅助生产成本(B)      ' + fmt(bP + bM));

      return {
        result: [
          { k: 'A 车间分配率', v: fmt(aRate, 6) },
          { k: 'B 车间分配率', v: fmt(bRate, 6) },
          { k: '基本生产车间应负担', v: money(aP + bP) },
          { k: '行政管理部门应负担', v: money(aM + bM) }
        ],
        steps: steps,
        tableHtml: table(['受益对象', '耗用 A 量', '分配 A 金额', '耗用 B 量', '分配 B 金额', '合计'], rows),
        entry: entry,
        note: '对外分配总额应等于两个辅助车间待分配费用之和 ' + money(v.ac + v.bc) + '，若不等说明内部耗用量填错了。'
      };
    }
  });

  /* ============ 3. 本量利分析 ============ */
  App.register('成本核算', {
    id: 'cvp',
    name: '本量利分析（拓展）',
    tip: '保本点、安全边际、目标利润销量。注意：2026 年度《初级会计实务》大纲未单列管理会计章节，本模块作为拓展工具保留。',
    inputs: [
      { key: 'price', label: '单价', value: 50 },
      { key: 'uv', label: '单位变动成本', value: 30 },
      { key: 'fixed', label: '固定成本总额', value: 60000 },
      { key: 'qty', label: '预计（实际）销售量', value: 5000 },
      { key: 'target', label: '目标利润', value: 30000 }
    ],
    compute: function (v) {
      var cm = v.price - v.uv;
      var cmRate = v.price === 0 ? 0 : cm / v.price;
      var beQty = cm === 0 ? Infinity : v.fixed / cm;
      var beSales = cmRate === 0 ? Infinity : v.fixed / cmRate;
      var tQty = cm === 0 ? Infinity : (v.fixed + v.target) / cm;
      var profit = v.qty * cm - v.fixed;
      var margin = v.qty - beQty;
      var marginRate = v.qty === 0 ? 0 : margin / v.qty;
      return {
        result: [
          { k: '单位边际贡献', v: money(cm) },
          { k: '边际贡献率', v: pct(cmRate * 100) },
          { k: '保本销售量', v: isFinite(beQty) ? fmt(round(beQty, 0), 0) + ' 件' : '—' },
          { k: '保本销售额', v: isFinite(beSales) ? money(beSales) : '—' },
          { k: '预计利润', v: money(profit) },
          { k: '安全边际率', v: pct(marginRate * 100) },
          { k: '实现目标利润所需销量', v: isFinite(tQty) ? fmt(Math.ceil(tQty), 0) + ' 件' : '—' }
        ],
        steps: [
          '单位边际贡献 = 单价 ' + fmt(v.price) + ' − 单位变动成本 ' + fmt(v.uv) + ' = ' + money(cm),
          '边际贡献率 = ' + fmt(cm) + ' ÷ ' + fmt(v.price) + ' = ' + pct(cmRate * 100),
          '保本销售量 = 固定成本 ' + fmt(v.fixed) + ' ÷ 单位边际贡献 ' + fmt(cm) + ' = ' + fmt(beQty),
          '保本销售额 = 固定成本 ' + fmt(v.fixed) + ' ÷ 边际贡献率 ' + pct(cmRate * 100) + ' = ' + money(beSales),
          '实现目标利润销量 = (' + fmt(v.fixed) + ' + ' + fmt(v.target) + ') ÷ ' + fmt(cm) + ' = ' + fmt(tQty),
          '安全边际量 = ' + fmt(v.qty, 0) + ' − ' + fmt(beQty) + ' = ' + fmt(margin) + '，安全边际率 = ' + pct(marginRate * 100)
        ],
        note: '安全边际率越高越安全：40% 以上很安全，10% 以下要警惕。'
      };
    }
  });
})();
