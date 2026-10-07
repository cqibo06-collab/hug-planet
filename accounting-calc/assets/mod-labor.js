/* 劳动合同法与社会保险模块（经济法基础 · 劳动合同与社会保险法律制度） */
(function () {
  'use strict';
  var fmt = App.fmt, money = App.money, pct = App.pct, table = App.table;

  /* ============ 1. 经济补偿金 ============ */
  App.register('劳动法计算', {
    id: 'severance',
    name: '经济补偿金 / 赔偿金',
    tip: '月工资超过当地上年度职工月平均工资 3 倍的，按 3 倍封顶且年限最多 12 年。这是最容易漏算的一步。',
    inputs: [
      { key: 'years', label: '在本单位工作年限', value: 5.5, unit: '年（可填小数）' },
      { key: 'salary', label: '解除前 12 个月平均工资', value: 12000 },
      { key: 'avg', label: '当地上年度职工月平均工资', value: 8000 },
      {
        key: 'method', label: '解除情形', type: 'select',
        options: [
          { v: 'legal', t: '依法解除/终止（付 N）' },
          { v: 'notice', t: '未提前 30 日通知（N + 1 代通知金）' },
          { v: 'illegal', t: '违法解除（付 2N 赔偿金）' }
        ]
      }
    ],
    compute: function (v) {
      var cap = v.avg * 3;
      var isCapped = v.salary > cap;
      var base = isCapped ? cap : v.salary;
      var y = isCapped ? Math.min(v.years, 12) : v.years;
      var full = Math.floor(y), frac = y - full;
      var coef = full + (frac >= 0.5 ? 1 : (frac > 0 ? 0.5 : 0));
      var comp = base * coef;
      var notice = v.method === 'notice' ? v.salary : 0;
      var penalty = v.method === 'illegal' ? comp * 2 : 0;

      var steps = [];
      steps.push('当地职工月平均工资 3 倍 = ' + fmt(v.avg) + ' × 3 = ' + money(cap) + '，本人工资 ' + money(v.salary) + (isCapped ? ' 超过封顶线，按封顶工资计算且年限不超过 12 年' : ' 未超过封顶线，按本人工资计算'));
      steps.push('折算工作年限：' + fmt(y, 2) + ' 年 → ' + fmt(coef, 2) + ' 个月工资（满 1 年算 1 个月；6 个月以上不满 1 年算 1 个月；不满 6 个月算半个月）');
      steps.push('经济补偿金 = ' + fmt(base) + ' × ' + fmt(coef, 2) + ' = ' + money(comp));
      if (notice > 0) steps.push('代通知金 = 上一个月工资 ' + money(notice) + '（未提前 30 日书面通知，额外支付 1 个月工资）');
      if (penalty > 0) steps.push('赔偿金 = 经济补偿金 × 2 = ' + money(penalty) + '（支付赔偿金后不再支付经济补偿金）');

      var rows = [
        ['经济补偿金（N）', fmt(base) + ' × ' + fmt(coef, 2), money(comp)],
        ['代通知金（+1）', v.method === 'notice' ? money(notice) : '不适用', v.method === 'notice' ? money(notice) : money(0)],
        ['赔偿金（2N）', v.method === 'illegal' ? '经济补偿金 × 2' : '不适用', v.method === 'illegal' ? money(penalty) : money(0)]
      ];

      return {
        result: [
          { k: '月工资计算基数', v: money(base) + (isCapped ? '（已封顶）' : '') },
          { k: '折算月数', v: fmt(coef, 2) + ' 个月' },
          { k: '经济补偿金', v: money(comp) },
          { k: v.method === 'illegal' ? '应支付赔偿金' : '合计应支付', v: money(v.method === 'illegal' ? penalty : comp + notice) }
        ],
        steps: steps,
        tableHtml: table(['项目', '计算式', '金额'], rows),
        note: '经济补偿金在办结工作交接时支付；违法解除支付赔偿金的，不再另行支付经济补偿金。'
      };
    }
  });

  /* ============ 2. 加班工资 ============ */
  App.register('劳动法计算', {
    id: 'overtime',
    name: '加班工资',
    tip: '日工资 = 月工资 ÷ 21.75（月计薪天数）。工作日 150%、休息日 200%、法定节假日 300%。',
    inputs: [
      { key: 'monthly', label: '月工资', value: 6000 },
      { key: 'wh', label: '工作日延时加班小时数', value: 20 },
      { key: 'rd', label: '休息日加班天数', value: 2, hint: '安排补休的可不支付加班费' },
      { key: 'hd', label: '法定休假日加班天数', value: 1, hint: '不得以补休替代' },
      { key: 'hpd', label: '每日工作小时数', value: 8 }
    ],
    compute: function (v) {
      var daily = v.monthly / 21.75;
      var hourly = daily / v.hpd;
      var w = hourly * v.wh * 1.5;
      var r = daily * v.rd * 2;
      var h = daily * v.hd * 3;
      var total = w + r + h;
      var rows = [
        ['工作日延时加班', fmt(hourly, 2) + ' × ' + fmt(v.wh, 0) + ' × 150%', money(w)],
        ['休息日加班', fmt(daily, 2) + ' × ' + fmt(v.rd, 0) + ' × 200%', money(r)],
        ['法定休假日加班', fmt(daily, 2) + ' × ' + fmt(v.hd, 0) + ' × 300%', money(h)]
      ];
      return {
        result: [
          { k: '日工资', v: money(daily) },
          { k: '小时工资', v: money(hourly) },
          { k: '加班工资合计', v: money(total) },
          { k: '当月应发合计', v: money(v.monthly + total) }
        ],
        steps: [
          '日工资 = 月工资 ' + fmt(v.monthly) + ' ÷ 月计薪天数 21.75 = ' + money(daily),
          '小时工资 = 日工资 ' + fmt(daily, 2) + ' ÷ ' + fmt(v.hpd, 0) + ' 小时 = ' + money(hourly, 2),
          '工作日加班工资 = ' + fmt(hourly, 2) + ' × ' + fmt(v.wh, 0) + ' × 150% = ' + money(w),
          '休息日加班工资 = ' + fmt(daily, 2) + ' × ' + fmt(v.rd, 0) + ' × 200% = ' + money(r),
          '法定节假日加班工资 = ' + fmt(daily, 2) + ' × ' + fmt(v.hd, 0) + ' × 300% = ' + money(h)
        ],
        tableHtml: table(['加班类型', '计算式', '金额'], rows),
        note: '法定休假日加班必须支付 300% 工资，不能用补休代替；休息日加班可以先安排补休，不能补休的才付 200%。'
      };
    }
  });
})();
