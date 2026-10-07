/* 资产类计算模块（初级会计实务 · 资产） */
(function () {
  'use strict';
  var fmt = App.fmt, money = App.money, pct = App.pct, table = App.table;

  /* ============ 1. 存货发出计价 ============ */
  function parseOps(text) {
    var arr = [];
    text.split(/\n+/).forEach(function (line) {
      line = line.trim();
      if (!line) return;
      var p = line.split(/[\s,，\t]+/);
      var isIn = p[0].indexOf('入') >= 0 || /^(in|buy)$/i.test(p[0]);
      var qty = Number(p[1]);
      if (!isFinite(qty)) return;
      arr.push({ type: isIn ? 'in' : 'out', qty: qty, price: isIn ? Number(p[2] || 0) : 0 });
    });
    return arr;
  }

  App.register('资产核算', {
    id: 'inventory-cost',
    name: '存货发出计价',
    tip: '按业务流水计算发出存货成本。三种方法结果不同，是单选/不定项选择题高频考点。',
    inputs: [
      { key: 'oq', label: '期初结存数量', value: 100 },
      { key: 'op', label: '期初结存单价', value: 10 },
      {
        key: 'rows', label: '本期业务流水（每行一笔：入库 数量 单价 / 发出 数量）', type: 'textarea', wide: true, rows: 6,
        value: '入库 200 12\n发出 150\n入库 100 11\n发出 200',
        hint: '第一行写"入库"或"发出"，后面跟数量和单价（发出不用写单价）'
      },
      {
        key: 'method', label: '计价方法', type: 'select',
        options: [
          { v: 'fifo', t: '先进先出法' },
          { v: 'weighted', t: '月末一次加权平均法' },
          { v: 'moving', t: '移动加权平均法' }
        ]
      }
    ],
    compute: function (v) {
      var ops = parseOps(v.rows), steps = [];
      var oq = v.oq, op = v.op;
      var outCost = 0, outQty = 0, remain = 0, unit = 0, tableHtml = '';

      if (v.method === 'fifo') {
        var layers = [{ qty: oq, price: op }];
        steps.push('期初结存：' + fmt(oq, 0) + ' 件 × ' + fmt(op) + ' = ' + money(oq * op));
        ops.forEach(function (o, i) {
          if (o.type === 'in') {
            layers.push({ qty: o.qty, price: o.price });
            steps.push('第 ' + (i + 1) + ' 笔 入库 ' + fmt(o.qty, 0) + ' 件 × ' + fmt(o.price) + '，新增一层成本');
          } else {
            var need = o.qty, cost = 0, detail = [];
            while (need > 0 && layers.length) {
              var L = layers[0], take = Math.min(L.qty, need);
              cost += take * L.price;
              L.qty -= take; need -= take;
              detail.push(fmt(take, 0) + '×' + fmt(L.price));
              if (L.qty <= 1e-9) layers.shift();
            }
            outCost += cost; outQty += o.qty;
            steps.push('第 ' + (i + 1) + ' 笔 发出 ' + fmt(o.qty, 0) + ' 件：' + detail.join(' + ') + ' = ' + money(cost) + '（先发出最早入库的批次）');
          }
        });
        remain = layers.reduce(function (s, L) { return s + L.qty * L.price; }, 0);
        var rows = layers.map(function (L, i) {
          return ['第 ' + (i + 1) + ' 层', fmt(L.qty, 0), fmt(L.price), money(L.qty * L.price)];
        });
        tableHtml = table(['结存批次', '数量', '单价', '金额'], rows);
      } else if (v.method === 'weighted') {
        var tq = oq, ta = oq * op;
        ops.forEach(function (o) {
          if (o.type === 'in') { tq += o.qty; ta += o.qty * o.price; }
          else outQty += o.qty;
        });
        unit = tq === 0 ? 0 : ta / tq;
        outCost = outQty * unit;
        remain = ta - outCost;
        steps.push('可供发出存货总成本 = 期初 ' + money(oq * op) + ' + 本期入库 ' + money(ta - oq * op) + ' = ' + money(ta));
        steps.push('可供发出存货总数量 = ' + fmt(oq, 0) + ' + ' + fmt(tq - oq, 0) + ' = ' + fmt(tq, 0) + ' 件');
        steps.push('加权平均单价 = ' + fmt(ta) + ' ÷ ' + fmt(tq, 0) + ' = ' + fmt(unit, 4) + ' 元/件');
        steps.push('本期发出成本 = ' + fmt(outQty, 0) + ' × ' + fmt(unit, 4) + ' = ' + money(outCost));
      } else {
        var bq = oq, ba = oq * op;
        unit = op;
        steps.push('期初结存：' + fmt(oq, 0) + ' 件，金额 ' + money(oq * op) + '，单位成本 ' + fmt(unit));
        ops.forEach(function (o, i) {
          if (o.type === 'in') {
            bq += o.qty; ba += o.qty * o.price;
            unit = bq === 0 ? 0 : ba / bq;
            steps.push('第 ' + (i + 1) + ' 笔 入库 ' + fmt(o.qty, 0) + ' 件 × ' + fmt(o.price) + '，结存 ' + fmt(bq, 0) + ' 件 / ' + money(ba) + '，新单位成本 = ' + fmt(unit, 4));
          } else {
            var c = o.qty * unit;
            outCost += c; outQty += o.qty; bq -= o.qty; ba -= c;
            steps.push('第 ' + (i + 1) + ' 笔 发出 ' + fmt(o.qty, 0) + ' 件 × ' + fmt(unit, 4) + ' = ' + money(c) + '，结存 ' + fmt(bq, 0) + ' 件 / ' + money(ba));
          }
        });
        remain = ba;
      }

      return {
        result: [
          { k: '本期发出存货成本', v: money(outCost) },
          { k: '期末结存存货成本', v: money(remain) },
          { k: '本期发出数量', v: fmt(outQty, 0) + ' 件' },
          { k: '单位成本', v: v.method === 'fifo' ? '见结存批次' : fmt(unit, 4) + ' 元' }
        ],
        steps: steps,
        tableHtml: tableHtml,
        entry: [
          '借：生产成本 / 主营业务成本      ' + fmt(outCost),
          '    贷：原材料 / 库存商品                ' + fmt(outCost),
          '',
          '（提示：制造费用、管理费用领用材料也按此金额结转）'
        ]
      };
    }
  });

  /* ============ 2. 固定资产折旧 ============ */
  App.register('资产核算', {
    id: 'depreciation',
    name: '固定资产折旧',
    tip: '四种折旧方法。双倍余额递减法最后两年改直线、年数总和法分母固定 —— 这是最容易丢分的地方。',
    inputs: [
      { key: 'cost', label: '固定资产原价', value: 120000 },
      { key: 'residual', label: '预计净残值', value: 6000 },
      {
        key: 'method', label: '折旧方法', type: 'select',
        options: [
          { v: 'straight', t: '年限平均法（直线法）' },
          { v: 'units', t: '工作量法' },
          { v: 'ddb', t: '双倍余额递减法' },
          { v: 'syd', t: '年数总和法' }
        ]
      },
      { key: 'years', label: '预计使用年限', value: 5, unit: '年' },
      { key: 'totalWork', label: '预计总工作量', value: 100000, showIf: function (v) { return v.method === 'units'; }, unit: '小时 / 公里等' },
      { key: 'periodWork', label: '本期实际工作量', value: 6000, showIf: function (v) { return v.method === 'units'; } }
    ],
    compute: function (v) {
      var base = v.cost - v.residual, steps = [], rows = [], first = 0, i;
      var years = Math.max(1, Math.round(v.years));

      if (v.method === 'straight') {
        var annual = base / years;
        first = annual;
        steps.push('年折旧额 = (原价 ' + fmt(v.cost) + ' − 净残值 ' + fmt(v.residual) + ') ÷ ' + years + ' = ' + money(annual));
        steps.push('月折旧额 = ' + fmt(annual) + ' ÷ 12 = ' + money(annual / 12));
        var cum = 0, bv = v.cost;
        for (i = 1; i <= years; i++) {
          cum += annual; bv -= annual;
          rows.push(['第 ' + i + ' 年', pct(1 / years), fmt(annual), fmt(cum), fmt(bv)]);
        }
      } else if (v.method === 'units') {
        var per = base / v.totalWork;
        first = per * v.periodWork;
        steps.push('单位工作量折旧额 = ' + fmt(base) + ' ÷ ' + fmt(v.totalWork, 0) + ' = ' + fmt(per, 4));
        steps.push('本期折旧额 = ' + fmt(per, 4) + ' × ' + fmt(v.periodWork, 0) + ' = ' + money(first));
        rows.push(['本期', '—', fmt(first), fmt(first), fmt(v.cost - first)]);
      } else if (v.method === 'ddb') {
        var rate = years > 0 ? 2 / years : 0;
        var bv2 = v.cost, cum2 = 0;
        steps.push('年折旧率 = 2 ÷ ' + years + ' = ' + pct(rate, 2) + '（前期不考虑净残值）');
        for (i = 1; i <= years; i++) {
          var dep;
          if (years <= 2 || i > years - 2) {
            dep = (bv2 - v.residual) / (years <= 2 ? years : 2);
            steps.push('第 ' + i + ' 年（到期前两年改直线法）：(' + fmt(bv2) + ' − ' + fmt(v.residual) + ') ÷ 2 = ' + money(dep));
          } else {
            dep = bv2 * rate;
            steps.push('第 ' + i + ' 年：账面净值 ' + fmt(bv2) + ' × ' + pct(rate) + ' = ' + money(dep));
          }
          dep = Math.max(0, Math.min(dep, bv2 - v.residual));
          if (i === 1) first = dep;
          cum2 += dep; bv2 -= dep;
          rows.push(['第 ' + i + ' 年', i <= years - 2 && years > 2 ? pct(rate) : '—', fmt(dep), fmt(cum2), fmt(bv2)]);
        }
      } else {
        var sum = years * (years + 1) / 2;
        steps.push('年数总和 = ' + years + '×(' + years + '+1)÷2 = ' + fmt(sum, 0));
        var bv3 = v.cost, cum3 = 0;
        for (i = 1; i <= years; i++) {
          var left = years - i + 1;
          var r = left / sum;
          var dep3 = base * r;
          if (i === 1) first = dep3;
          cum3 += dep3; bv3 -= dep3;
          steps.push('第 ' + i + ' 年：折旧率 = 尚可使用 ' + left + ' ÷ ' + fmt(sum, 0) + ' = ' + pct(r, 2) + '，折旧额 = ' + fmt(base) + ' × ' + pct(r, 2) + ' = ' + money(dep3));
          rows.push(['第 ' + i + ' 年', left + '/' + fmt(sum, 0), fmt(dep3), fmt(cum3), fmt(bv3)]);
        }
      }

      return {
        result: [
          { k: v.method === 'units' ? '本期折旧额' : '首年折旧额', v: money(first) },
          { k: '月折旧额（按首年）', v: money(first / 12) },
          { k: '应计折旧总额', v: money(base) },
          { k: '预计使用年限', v: years + ' 年' }
        ],
        steps: steps,
        tableHtml: table(['期间', '折旧率', '折旧额', '累计折旧', '期末账面净值'], rows),
        entry: [
          '借：制造费用 / 管理费用 / 销售费用 / 其他业务成本    ' + fmt(first),
          '    贷：累计折旧                                                    ' + fmt(first),
          '',
          '（提示：当月增加的固定资产当月不计提，从下月起计提；提前报废不再补提）'
        ]
      };
    }
  });

  /* ============ 3. 无形资产摊销 ============ */
  App.register('资产核算', {
    id: 'amortization',
    name: '无形资产摊销',
    tip: '直线法为主。使用寿命不确定的无形资产不摊销，但每年年末要做减值测试。',
    inputs: [
      { key: 'cost', label: '无形资产成本', value: 60000 },
      { key: 'residual', label: '预计残值', value: 0 },
      { key: 'years', label: '预计使用寿命', value: 10, unit: '年' }
    ],
    compute: function (v) {
      var years = Math.max(1, v.years);
      var annual = (v.cost - v.residual) / years;
      return {
        result: [
          { k: '年摊销额', v: money(annual) },
          { k: '月摊销额', v: money(annual / 12) },
          { k: '摊销总额', v: money(v.cost - v.residual) }
        ],
        steps: [
          '年摊销额 = (成本 ' + fmt(v.cost) + ' − 残值 ' + fmt(v.residual) + ') ÷ ' + years + ' = ' + money(annual),
          '月摊销额 = ' + fmt(annual) + ' ÷ 12 = ' + money(annual / 12)
        ],
        entry: [
          '借：管理费用（自用）/ 其他业务成本（出租）/ 制造费用    ' + fmt(annual / 12),
          '    贷：累计摊销                                                        ' + fmt(annual / 12)
        ],
        note: '当月增加的无形资产，当月开始摊销；处置当月不再摊销。'
      };
    }
  });

  /* ============ 4. 坏账准备 ============ */
  App.register('资产核算', {
    id: 'bad-debt',
    name: '坏账准备（备抵法）',
    tip: '核心：先算"期末应有余额"，再倒挤本期计提数。已有贷方余额要先减去。',
    inputs: [
      {
        key: 'method', label: '计提方法', type: 'select',
        options: [{ v: 'balance', t: '应收账款余额百分比法' }, { v: 'aging', t: '账龄分析法' }]
      },
      { key: 'ar_end', label: '期末应收账款余额', value: 1000000, showIf: function (v) { return v.method === 'balance'; } },
      { key: 'rate', label: '坏账计提比例', value: 5, unit: '%', showIf: function (v) { return v.method === 'balance'; } },
      {
        key: 'aging', label: '账龄分档（每行：金额 计提比例%）', type: 'textarea', wide: true, rows: 4,
        value: '600000 2\n300000 5\n100000 10',
        showIf: function (v) { return v.method === 'aging'; }
      },
      { key: 'begin', label: '期初"坏账准备"贷方余额', value: 30000 },
      { key: 'writeoff', label: '本期实际核销的坏账', value: 10000 },
      { key: 'recovery', label: '本期收回已核销的坏账', value: 5000 }
    ],
    compute: function (v) {
      var steps = [], required = 0, rows = [];
      if (v.method === 'aging') {
        v.aging.split(/\n+/).forEach(function (line) {
          line = line.trim(); if (!line) return;
          var p = line.split(/[\s,，\t]+/);
          var amt = Number(p[0]), rt = Number(p[1]);
          if (!isFinite(amt) || !isFinite(rt)) return;
          var need = amt * rt / 100;
          required += need;
          rows.push([fmt(amt), pct(rt), fmt(need)]);
        });
        steps.push('按账龄分档计算应计提坏账准备合计 = ' + money(required));
      } else {
        required = v.ar_end * v.rate / 100;
        steps.push('期末应有坏账准备 = 应收账款余额 ' + fmt(v.ar_end) + ' × ' + pct(v.rate) + ' = ' + money(required));
      }
      var before = v.begin - v.writeoff + v.recovery;
      var provision = required - before;
      steps.push('计提前的坏账准备贷方余额 = 期初 ' + fmt(v.begin) + ' − 核销 ' + fmt(v.writeoff) + ' + 收回 ' + fmt(v.recovery) + ' = ' + money(before));
      steps.push('本期应计提 = 应有 ' + fmt(required) + ' − 已有 ' + fmt(before) + ' = ' + money(provision) + (provision < 0 ? '（负数表示应冲回）' : ''));

      var entry = [];
      if (provision >= 0) {
        entry.push('借：信用减值损失              ' + fmt(provision));
        entry.push('    贷：坏账准备                      ' + fmt(provision));
      } else {
        entry.push('借：坏账准备                  ' + fmt(-provision));
        entry.push('    贷：信用减值损失                  ' + fmt(-provision));
      }
      entry.push('');
      if (v.writeoff > 0) { entry.push('（核销）借：坏账准备  ' + fmt(v.writeoff) + '   贷：应收账款  ' + fmt(v.writeoff)); }
      if (v.recovery > 0) {
        entry.push('（收回）借：应收账款  ' + fmt(v.recovery) + '   贷：坏账准备  ' + fmt(v.recovery));
        entry.push('        借：银行存款  ' + fmt(v.recovery) + '   贷：应收账款  ' + fmt(v.recovery));
      }

      return {
        result: [
          { k: '期末应有坏账准备', v: money(required) },
          { k: provision >= 0 ? '本期应计提' : '本期应冲回', v: money(Math.abs(provision)) },
          { k: '应收账款账面余额', v: money(v.method === 'aging' ? rows.reduce(function (s, r) { return s + Number(r[0].replace(/,/g, '')); }, 0) : v.ar_end) },
          { k: '应收账款账面价值', v: money((v.method === 'aging' ? rows.reduce(function (s, r) { return s + Number(r[0].replace(/,/g, '')); }, 0) : v.ar_end) - required) }
        ],
        steps: steps,
        tableHtml: v.method === 'aging' ? table(['账龄档金额', '计提比例', '应计提金额'], rows) : '',
        entry: entry,
        note: '账面价值 = 应收账款账面余额 − 坏账准备余额。这个等式几乎每年都考。'
      };
    }
  });

  /* ============ 5. 存货跌价准备 ============ */
  App.register('资产核算', {
    id: 'inventory-writedown',
    name: '存货跌价准备',
    tip: '成本与可变现净值孰低。可变现净值 = 估计售价 − 至完工将要发生的成本 − 估计销售费用和税费。',
    inputs: [
      { key: 'cost', label: '存货成本', value: 200000 },
      { key: 'price', label: '估计售价', value: 180000 },
      { key: 'finish', label: '至完工估计将要发生的成本', value: 0, hint: '产成品填 0' },
      { key: 'sell', label: '估计销售费用及相关税费', value: 15000 },
      { key: 'begin', label: '期初"存货跌价准备"贷方余额', value: 0 }
    ],
    compute: function (v) {
      var nrv = v.price - v.finish - v.sell;
      var required = Math.max(0, v.cost - nrv);
      var adjust = required - v.begin;
      var entry = [];
      if (adjust >= 0) {
        entry.push('借：资产减值损失              ' + fmt(adjust));
        entry.push('    贷：存货跌价准备                  ' + fmt(adjust));
      } else {
        entry.push('借：存货跌价准备              ' + fmt(-adjust));
        entry.push('    贷：资产减值损失                  ' + fmt(-adjust));
      }
      return {
        result: [
          { k: '可变现净值', v: money(nrv) },
          { k: '应计提跌价准备', v: money(required) },
          { k: adjust >= 0 ? '本期计提' : '本期转回', v: money(Math.abs(adjust)) },
          { k: '存货账面价值', v: money(v.cost - required) }
        ],
        steps: [
          '可变现净值 = 估计售价 ' + fmt(v.price) + ' − 至完工成本 ' + fmt(v.finish) + ' − 销售费用及税费 ' + fmt(v.sell) + ' = ' + money(nrv),
          '成本 ' + fmt(v.cost) + (v.cost > nrv ? ' > ' : ' ≤ ') + ' 可变现净值 ' + fmt(nrv) + (v.cost > nrv ? '，发生减值' : '，未减值'),
          '期末应有跌价准备 = ' + money(required) + '；调整前已有 ' + fmt(v.begin) + '，本期' + (adjust >= 0 ? '计提 ' : '转回 ') + fmt(Math.abs(adjust))
        ],
        entry: entry,
        note: '以前减记的金额在减值因素消失时可以转回，但转回金额以已计提的跌价准备为限。'
      };
    }
  });

  /* ============ 6. 材料成本差异率 ============ */
  App.register('资产核算', {
    id: 'material-variance',
    name: '材料成本差异率（计划成本法）',
    tip: '超支差异记借方（正数），节约差异记贷方（负数）。差异率分母是计划成本，不是实际成本。',
    inputs: [
      { key: 'bp', label: '期初结存材料计划成本', value: 100000 },
      { key: 'bd', label: '期初材料成本差异', value: 2000, hint: '超支填正数，节约填负数' },
      { key: 'ip', label: '本期入库材料计划成本', value: 300000 },
      { key: 'id', label: '本期入库材料成本差异', value: -4500, hint: '超支填正数，节约填负数' },
      { key: 'op2', label: '本期发出材料计划成本', value: 250000 }
    ],
    compute: function (v) {
      var plan = v.bp + v.ip, diff = v.bd + v.id;
      var rate = plan === 0 ? 0 : diff / plan;
      var outDiff = v.op2 * rate;
      var outActual = v.op2 + outDiff;
      var endPlan = plan - v.op2, endDiff = diff - outDiff;
      return {
        result: [
          { k: '材料成本差异率', v: pct(rate * 100, 2) },
          { k: '发出材料应负担差异', v: money(outDiff) },
          { k: '发出材料实际成本', v: money(outActual) },
          { k: '结存材料实际成本', v: money(endPlan + endDiff) }
        ],
        steps: [
          '本月材料成本差异率 = (期初差异 ' + fmt(v.bd) + ' + 本期入库差异 ' + fmt(v.id) + ') ÷ (期初计划 ' + fmt(v.bp) + ' + 本期入库计划 ' + fmt(v.ip) + ') = ' + pct(rate * 100, 4),
          '发出材料应负担差异 = 发出计划成本 ' + fmt(v.op2) + ' × ' + pct(rate * 100, 4) + ' = ' + money(outDiff),
          '发出材料实际成本 = ' + fmt(v.op2) + ' + (' + fmt(outDiff) + ') = ' + money(outActual)
        ],
        entry: [
          '借：生产成本 / 制造费用 / 管理费用    ' + fmt(outActual),
          '    贷：原材料                                    ' + fmt(v.op2),
          '    贷：材料成本差异                            ' + fmt(outDiff) + '   （节约差异用红字/借方）'
        ],
        note: '差异率为正（超支）时发出材料要加价，为负（节约）时减价。'
      };
    }
  });

  /* ============ 7. 交易性金融资产 ============ */
  App.register('资产核算', {
    id: 'trading-asset',
    name: '交易性金融资产',
    tip: '取得时的交易费用冲减投资收益，已宣告未发放的股利单独确认为应收股利，不计入成本。',
    inputs: [
      { key: 'shares', label: '股数 / 份数', value: 10000 },
      { key: 'bp3', label: '取得时每股买价', value: 12, hint: '价款中含已宣告未发放股利' },
      { key: 'fee', label: '相关交易费用', value: 3000 },
      { key: 'div', label: '已宣告但尚未发放的现金股利', value: 2000 },
      { key: 'ep', label: '期末每股市价', value: 13.5 },
      { key: 'sp', label: '出售时每股市价', value: 15 }
    ],
    compute: function (v) {
      var pay = v.shares * v.bp3;
      var init = pay - v.div;
      var endFV = v.shares * v.ep;
      var fvChange = endFV - init;
      var sellProceeds = v.shares * v.sp;
      var gainOnSale = sellProceeds - endFV;
      var total = gainOnSale - v.fee;
      return {
        result: [
          { k: '初始入账成本', v: money(init) },
          { k: '公允价值变动', v: money(fvChange) },
          { k: '出售时投资收益', v: money(gainOnSale) },
          { k: '该笔投资累计损益', v: money(total) }
        ],
        steps: [
          '支付总价款 = ' + fmt(v.shares, 0) + ' × ' + fmt(v.bp3) + ' = ' + money(pay),
          '初始入账成本 = 总价款 ' + fmt(pay) + ' − 已宣告未发放股利 ' + fmt(v.div) + ' = ' + money(init) + '（交易费用 ' + fmt(v.fee) + ' 计入当期损益）',
          '期末公允价值 = ' + fmt(v.shares, 0) + ' × ' + fmt(v.ep) + ' = ' + money(endFV) + '，公允价值变动 = ' + money(fvChange),
          '出售价款 = ' + fmt(v.shares, 0) + ' × ' + fmt(v.sp) + ' = ' + money(sellProceeds),
          '出售投资收益 = 出售价款 ' + fmt(sellProceeds) + ' − 出售日账面价值 ' + fmt(endFV) + ' = ' + money(gainOnSale)
        ],
        entry: [
          '取得：',
          '借：交易性金融资产—成本          ' + fmt(init),
          '    应收股利                              ' + fmt(v.div),
          '    投资收益                              ' + fmt(v.fee),
          '    贷：其他货币资金                            ' + fmt(pay + v.fee),
          '',
          '期末公允价值变动：',
          (fvChange >= 0 ? '借：交易性金融资产—公允价值变动   ' : '贷：交易性金融资产—公允价值变动   ') + fmt(Math.abs(fvChange)),
          (fvChange >= 0 ? '    贷：公允价值变动损益                        ' : '    借：公允价值变动损益                        ') + fmt(Math.abs(fvChange)),
          '',
          '出售：',
          '借：其他货币资金                  ' + fmt(sellProceeds),
          '    贷：交易性金融资产—成本                ' + fmt(init),
          '    贷：交易性金融资产—公允价值变动      ' + fmt(fvChange),
          '    贷：投资收益                              ' + fmt(gainOnSale)
        ],
        note: '出售时要把"公允价值变动损益"结转至"投资收益"（损益类内部结转，不影响利润总额）。'
      };
    }
  });
})();
