/* 税法计算模块（经济法基础 · 增值税 / 消费税 / 所得税 / 小税种） */
(function () {
  'use strict';
  var fmt = App.fmt, money = App.money, pct = App.pct, table = App.table, prog = App.progressive;

  var is = function () {
    var list = Array.prototype.slice.call(arguments);
    return function (v) { return list.indexOf(v.method) >= 0; };
  };

  /* ============ 1. 增值税 ============ */
  App.register('税法计算', {
    id: 'vat',
    name: '增值税',
    tip: '一般纳税人一般计税、简易计税、进口与视同销售的组成计税价格。注意区分含税价与不含税价。',
    inputs: [
      {
        key: 'method', label: '计税情形', type: 'select',
        options: [
          { v: 'general', t: '一般纳税人 — 一般计税' },
          { v: 'simple', t: '简易计税 / 小规模纳税人' },
          { v: 'import', t: '进口货物（组成计税价格）' },
          { v: 'deemed', t: '视同销售（组成计税价格）' }
        ]
      },
      {
        key: 'salesType', label: '销售额口径', type: 'select',
        options: [{ v: 'excl', t: '不含税销售额' }, { v: 'incl', t: '含税销售额（需换算）' }],
        showIf: is('general', 'simple')
      },
      { key: 'sales', label: '销售额', value: 1130000, showIf: is('general', 'simple') },
      {
        key: 'rate', label: '适用税率', type: 'select', value: 13,
        options: [{ v: 13, t: '13%（销售货物、加工修理修配、有形动产租赁）' }, { v: 9, t: '9%（交通运输、建筑、不动产、农产品等）' }, { v: 6, t: '6%（现代服务、金融服务、生活服务等）' }],
        showIf: function (v) { return v.method === 'general'; }
      },
      {
        key: 'levy', label: '征收率', type: 'select', value: 3,
        options: [{ v: 3, t: '3%' }, { v: 5, t: '5%（不动产、劳务派遣差额等）' }],
        showIf: function (v) { return v.method === 'simple'; }
      },
      { key: 'inputVat', label: '本期可抵扣进项税额', value: 80000, showIf: function (v) { return v.method === 'general'; } },
      { key: 'transferOut', label: '进项税额转出', value: 5000, showIf: function (v) { return v.method === 'general'; } },
      { key: 'prevCredit', label: '上期留抵税额', value: 2000, showIf: function (v) { return v.method === 'general'; } },
      { key: 'customs', label: '关税完税价格', value: 500000, showIf: function (v) { return v.method === 'import'; } },
      { key: 'tariff', label: '关税', value: 50000, showIf: function (v) { return v.method === 'import'; } },
      { key: 'ctax', label: '消费税', value: 0, showIf: function (v) { return v.method === 'import'; } },
      { key: 'irate', label: '进口货物适用税率', value: 13, unit: '%', showIf: function (v) { return v.method === 'import'; } },
      { key: 'dcost', label: '产品成本', value: 100000, showIf: function (v) { return v.method === 'deemed'; } },
      { key: 'dprofit', label: '成本利润率', value: 10, unit: '%', showIf: function (v) { return v.method === 'deemed'; } },
      { key: 'dctax', label: '消费税税率（非应税消费品填 0）', value: 0, unit: '%', showIf: function (v) { return v.method === 'deemed'; } },
      { key: 'drate', label: '增值税税率', value: 13, unit: '%', showIf: function (v) { return v.method === 'deemed'; } }
    ],
    compute: function (v) {
      var steps = [], res = [], payableAmt = 0;
      if (v.method === 'general') {
        var excl = v.salesType === 'incl' ? v.sales / (1 + v.rate / 100) : v.sales;
        if (v.salesType === 'incl') steps.push('不含税销售额 = ' + fmt(v.sales) + ' ÷ (1 + ' + pct(v.rate) + ') = ' + money(excl));
        var output = excl * v.rate / 100;
        var deductible = v.inputVat - v.transferOut;
        var payable = output - deductible - v.prevCredit;
        steps.push('销项税额 = ' + fmt(excl) + ' × ' + pct(v.rate) + ' = ' + money(output));
        steps.push('可抵扣进项税额 = ' + fmt(v.inputVat) + ' − 进项转出 ' + fmt(v.transferOut) + ' = ' + money(deductible));
        steps.push('应纳税额 = 销项 ' + fmt(output) + ' − 进项 ' + fmt(deductible) + ' − 上期留抵 ' + fmt(v.prevCredit) + ' = ' + money(payable));
        res = [
          { k: '不含税销售额', v: money(excl) },
          { k: '销项税额', v: money(output) },
          { k: '可抵扣进项税额', v: money(deductible) },
          { k: payable >= 0 ? '应纳增值税' : '期末留抵税额', v: money(Math.abs(payable)) }
        ];
        payableAmt = Math.max(0, payable);
        if (payable < 0) steps.push('结果为负，本期不需缴纳，留抵下期继续抵扣（或按规定申请留抵退税）。');
      } else if (v.method === 'simple') {
        var ex2 = v.salesType === 'incl' ? v.sales / (1 + v.levy / 100) : v.sales;
        if (v.salesType === 'incl') steps.push('不含税销售额 = ' + fmt(v.sales) + ' ÷ (1 + ' + pct(v.levy) + ') = ' + money(ex2));
        var pay2 = ex2 * v.levy / 100;
        steps.push('应纳税额 = ' + fmt(ex2) + ' × ' + pct(v.levy) + ' = ' + money(pay2) + '（简易计税不得抵扣进项税额）');
        payableAmt = pay2;
        res = [{ k: '不含税销售额', v: money(ex2) }, { k: '征收率', v: pct(v.levy) }, { k: '应纳增值税', v: money(pay2) }];
      } else if (v.method === 'import') {
        var composed = v.customs + v.tariff + v.ctax;
        var pay3 = composed * v.irate / 100;
        steps.push('组成计税价格 = 关税完税价格 ' + fmt(v.customs) + ' + 关税 ' + fmt(v.tariff) + ' + 消费税 ' + fmt(v.ctax) + ' = ' + money(composed));
        steps.push('应纳税额 = ' + fmt(composed) + ' × ' + pct(v.irate) + ' = ' + money(pay3));
        payableAmt = pay3;
        res = [{ k: '组成计税价格', v: money(composed) }, { k: '应纳增值税', v: money(pay3) }];
      } else {
        var comp = v.dcost * (1 + v.dprofit / 100);
        steps.push('组成计税价格 = 成本 ' + fmt(v.dcost) + ' × (1 + 成本利润率 ' + pct(v.dprofit) + ') = ' + money(comp));
        if (v.dctax > 0) {
          comp = comp / (1 - v.dctax / 100);
          steps.push('属于应税消费品，组成计税价格 = ' + money(comp) + '（再除以 1 − 消费税税率 ' + pct(v.dctax) + '）');
        }
        var pay4 = comp * v.drate / 100;
        steps.push('应纳税额 = ' + fmt(comp) + ' × ' + pct(v.drate) + ' = ' + money(pay4));
        payableAmt = pay4;
        res = [{ k: '组成计税价格', v: money(comp) }, { k: '应纳增值税', v: money(pay4) }];
      }
      return {
        result: res,
        steps: steps,
        entry: [
          '借：应交税费—应交增值税（转出未交增值税）   ' + fmt(payableAmt),
          '    贷：应交税费—未交增值税                                  ' + fmt(payableAmt),
          '',
          '（实际缴纳）借：应交税费—未交增值税   ' + fmt(payableAmt),
          '　　　　　　　　贷：银行存款                            ' + fmt(payableAmt)
        ],
        note: '进项税额转出常见于：用于简易计税项目、免征增值税项目、集体福利或个人消费的购进货物。'
      };
    }
  });

  /* ============ 2. 消费税 ============ */
  App.register('税法计算', {
    id: 'consumption-tax',
    name: '消费税',
    tip: '从价、从量、复合三种基本方法，以及自产自用 / 委托加工 / 进口三种组成计税价格。',
    inputs: [
      {
        key: 'method', label: '计税方式', type: 'select',
        options: [
          { v: 'advalorem', t: '从价定率' },
          { v: 'specific', t: '从量定额' },
          { v: 'compound', t: '复合计税（卷烟、白酒）' },
          { v: 'selfuse', t: '自产自用（组成计税价格）' },
          { v: 'consign', t: '委托加工（组成计税价格）' },
          { v: 'import', t: '进口（组成计税价格）' }
        ]
      },
      { key: 'sales', label: '销售额（不含增值税）', value: 200000, showIf: is('advalorem', 'compound') },
      { key: 'qty', label: '销售数量', value: 1000, showIf: is('specific', 'compound') },
      { key: 'unitTax', label: '单位税额', value: 0.5, hint: '白酒 0.5 元/500 克；卷烟 0.003 元/支', showIf: is('specific', 'compound', 'consign') },
      { key: 'adRate', label: '比例税率', value: 20, unit: '%', showIf: is('advalorem', 'compound', 'selfuse', 'consign', 'import') },
      { key: 'cost', label: '产品成本', value: 80000, showIf: function (v) { return v.method === 'selfuse'; } },
      { key: 'profitRate', label: '成本利润率', value: 10, unit: '%', showIf: function (v) { return v.method === 'selfuse'; } },
      { key: 'material', label: '材料成本', value: 50000, showIf: function (v) { return v.method === 'consign'; } },
      { key: 'processing', label: '加工费', value: 20000, showIf: function (v) { return v.method === 'consign'; } },
      { key: 'cqty', label: '委托加工收回数量', value: 1000, showIf: function (v) { return v.method === 'consign'; } },
      { key: 'customs', label: '关税完税价格', value: 300000, showIf: function (v) { return v.method === 'import'; } },
      { key: 'tariff', label: '关税', value: 30000, showIf: function (v) { return v.method === 'import'; } },
      { key: 'iqty', label: '进口数量', value: 1000, showIf: function (v) { return v.method === 'import'; } }
    ],
    compute: function (v) {
      var steps = [], tax = 0, comp = 0;
      if (v.method === 'advalorem') {
        tax = v.sales * v.adRate / 100;
        steps.push('应纳税额 = 销售额 ' + fmt(v.sales) + ' × ' + pct(v.adRate) + ' = ' + money(tax));
      } else if (v.method === 'specific') {
        tax = v.qty * v.unitTax;
        steps.push('应纳税额 = 销售数量 ' + fmt(v.qty, 0) + ' × 单位税额 ' + fmt(v.unitTax) + ' = ' + money(tax));
      } else if (v.method === 'compound') {
        var a = v.sales * v.adRate / 100, b = v.qty * v.unitTax;
        tax = a + b;
        steps.push('从价部分 = ' + fmt(v.sales) + ' × ' + pct(v.adRate) + ' = ' + money(a));
        steps.push('从量部分 = ' + fmt(v.qty, 0) + ' × ' + fmt(v.unitTax) + ' = ' + money(b));
        steps.push('应纳税额 = ' + fmt(a) + ' + ' + fmt(b) + ' = ' + money(tax));
      } else if (v.method === 'selfuse') {
        comp = v.cost * (1 + v.profitRate / 100) / (1 - v.adRate / 100);
        tax = comp * v.adRate / 100;
        steps.push('组成计税价格 = 成本 ' + fmt(v.cost) + ' × (1 + ' + pct(v.profitRate) + ') ÷ (1 − ' + pct(v.adRate) + ') = ' + money(comp));
        steps.push('应纳税额 = ' + fmt(comp) + ' × ' + pct(v.adRate) + ' = ' + money(tax));
      } else if (v.method === 'consign') {
        comp = (v.material + v.processing + v.cqty * v.unitTax) / (1 - v.adRate / 100);
        tax = comp * v.adRate / 100 + v.cqty * v.unitTax;
        steps.push('组成计税价格 = (材料成本 ' + fmt(v.material) + ' + 加工费 ' + fmt(v.processing) + ' + 数量 ' + fmt(v.cqty, 0) + ' × 单位税额 ' + fmt(v.unitTax) + ') ÷ (1 − ' + pct(v.adRate) + ') = ' + money(comp));
        steps.push('应纳税额 = ' + fmt(comp) + ' × ' + pct(v.adRate) + ' + ' + fmt(v.cqty, 0) + ' × ' + fmt(v.unitTax) + ' = ' + money(tax));
        steps.push('这是受托方代收代缴的消费税；收回后直接销售的不再缴纳，连续生产应税消费品的可以抵扣。');
      } else {
        comp = (v.customs + v.tariff + v.iqty * v.unitTax) / (1 - v.adRate / 100);
        tax = comp * v.adRate / 100 + v.iqty * v.unitTax;
        steps.push('组成计税价格 = (关税完税价格 ' + fmt(v.customs) + ' + 关税 ' + fmt(v.tariff) + ' + 数量 ' + fmt(v.iqty, 0) + ' × 单位税额 ' + fmt(v.unitTax) + ') ÷ (1 − ' + pct(v.adRate) + ') = ' + money(comp));
        steps.push('应纳税额 = ' + fmt(comp) + ' × ' + pct(v.adRate) + ' + ' + fmt(v.iqty, 0) + ' × ' + fmt(v.unitTax) + ' = ' + money(tax));
      }
      return {
        result: [
          { k: '应纳消费税', v: money(tax) },
          { k: '组成计税价格', v: comp ? money(comp) : '—' },
          { k: '比例税率', v: pct(v.adRate) }
        ],
        steps: steps,
        note: '消费税是价内税，销售额中已含消费税；计算增值税时不要重复扣除。'
      };
    }
  });

  /* ============ 3. 企业所得税 ============ */
  App.register('税法计算', {
    id: 'cit',
    name: '企业所得税',
    tip: '在会计利润基础上做纳税调整。业务招待费、广宣费、公益捐赠、三项经费都有扣除限额，这是必考的调整项。',
    inputs: [
      { key: 'revenue', label: '销售（营业）收入', value: 5000000, hint: '业务招待费、广宣费的扣除限额基数' },
      { key: 'profit', label: '会计利润总额', value: 800000, hint: '公益性捐赠的扣除限额基数' },
      { key: 'wages', label: '工资薪金总额', value: 1200000, hint: '三项经费的扣除限额基数' },
      { key: 'entertain', label: '业务招待费发生额', value: 60000 },
      { key: 'ad', label: '广告费和业务宣传费', value: 900000 },
      {
        key: 'adRate', label: '广宣费扣除比例', type: 'select', value: 15,
        options: [{ v: 15, t: '15%（一般企业）' }, { v: 30, t: '30%（化妆品制造/医药制造/饮料制造，不含酒类）' }]
      },
      { key: 'donation', label: '公益性捐赠支出', value: 100000 },
      { key: 'welfare', label: '职工福利费', value: 200000 },
      { key: 'union', label: '工会经费', value: 30000 },
      { key: 'edu', label: '职工教育经费', value: 120000 },
      { key: 'rd', label: '研发费用（未形成无形资产）', value: 100000, hint: '按 100% 加计扣除' },
      { key: 'penalty', label: '税收滞纳金、罚金罚款、赞助支出', value: 20000 },
      { key: 'bond', label: '国债利息收入等免税收入', value: 30000 },
      { key: 'loss', label: '以前年度可弥补亏损', value: 50000 },
      {
        key: 'rate', label: '适用税率', type: 'select', value: 25,
        options: [{ v: 25, t: '25%（基本税率）' }, { v: 20, t: '20%（小型微利企业实际税负）' }, { v: 15, t: '15%（高新技术企业等）' }]
      }
    ],
    compute: function (v) {
      var rows = [], addUp = 0, subDown = 0;
      function adj(name, amount, limit, note) {
        var d = amount - Math.min(amount, limit);
        rows.push([name, fmt(amount), fmt(limit), (d > 0 ? '调增 ' : d < 0 ? '调减 ' : '') + fmt(Math.abs(d)) + (d === 0 ? '（无需调整）' : ''), note]);
        if (d > 0) addUp += d;
      }
      var eLimit = Math.min(v.entertain * 0.6, v.revenue * 0.005);
      adj('业务招待费', v.entertain, eLimit, '发生额 60% 与收入 5‰ 孰低');
      adj('广告费和业务宣传费', v.ad, v.revenue * v.adRate / 100, '收入 ' + pct(v.adRate) + '，超部分可结转以后年度');
      adj('公益性捐赠支出', v.donation, v.profit * 0.12, '利润总额 12%，超部分可结转三年');
      adj('职工福利费', v.welfare, v.wages * 0.14, '工资薪金总额 14%');
      adj('工会经费', v.union, v.wages * 0.02, '工资薪金总额 2%');
      adj('职工教育经费', v.edu, v.wages * 0.08, '工资薪金总额 8%，超部分可结转');

      rows.push(['研发费用加计扣除', fmt(v.rd), '据实扣除后再加计 ' + fmt(v.rd), '调减 ' + fmt(v.rd), '未形成无形资产的按 100% 加计']);
      subDown += v.rd;
      rows.push(['税收滞纳金、罚款、赞助支出', fmt(v.penalty), '0', '调增 ' + fmt(v.penalty), '不得税前扣除']);
      addUp += v.penalty;
      rows.push(['国债利息收入等免税收入', fmt(v.bond), '全额免税', '调减 ' + fmt(v.bond), '免税收入']);
      subDown += v.bond;

      var beforeLoss = v.profit + addUp - subDown;
      var lossUsed = Math.max(0, Math.min(v.loss, beforeLoss));
      rows.push(['弥补以前年度亏损', fmt(v.loss), fmt(lossUsed), '调减 ' + fmt(lossUsed), '最长结转 5 年']);
      subDown += lossUsed;

      var taxable = Math.max(0, v.profit + addUp - subDown);
      var tax = taxable * v.rate / 100;

      return {
        result: [
          { k: '会计利润总额', v: money(v.profit) },
          { k: '调增合计', v: money(addUp) },
          { k: '调减合计', v: money(subDown) },
          { k: '应纳税所得额', v: money(taxable) },
          { k: '应纳企业所得税', v: money(tax) }
        ],
        steps: [
          '应纳税所得额 = 会计利润 ' + fmt(v.profit) + ' + 调增 ' + fmt(addUp) + ' − 调减 ' + fmt(subDown) + ' = ' + money(taxable),
          '应纳所得税额 = ' + fmt(taxable) + ' × ' + pct(v.rate) + ' = ' + money(tax)
        ],
        tableHtml: table(['调整项目', '账载金额', '扣除限额', '纳税调整', '说明'], rows),
        entry: [
          '借：所得税费用                        ' + fmt(tax),
          '    贷：应交税费—应交企业所得税              ' + fmt(tax),
          '',
          '（结转）借：本年利润  ' + fmt(tax) + '   贷：所得税费用  ' + fmt(tax)
        ],
        note: '业务招待费的"两个限额孰低"是最经典的陷阱：60% 和 5‰ 都要算，取小的那个。'
      };
    }
  });

  /* ============ 4. 个人所得税 ============ */
  var IIT = [
    { up: 36000, rate: 0.03, deduct: 0 },
    { up: 144000, rate: 0.10, deduct: 2520 },
    { up: 300000, rate: 0.20, deduct: 16920 },
    { up: 420000, rate: 0.25, deduct: 31920 },
    { up: 660000, rate: 0.30, deduct: 52920 },
    { up: 960000, rate: 0.35, deduct: 85920 },
    { up: Infinity, rate: 0.45, deduct: 181920 }
  ];

  App.register('税法计算', {
    id: 'iit',
    name: '个人所得税（综合所得）',
    tip: '劳务报酬、稿酬、特许权使用费要先打折计入收入额：劳务和特许权 ×80%，稿酬 ×80%×70%。',
    inputs: [
      {
        key: 'method', label: '计算方式', type: 'select',
        options: [{ v: 'annual', t: '年度汇算清缴' }, { v: 'withhold', t: '工资薪金累计预扣法' }]
      },
      { key: 'salary', label: '工资薪金收入', value: 200000, showIf: function (v) { return v.method === 'annual'; } },
      { key: 'labor', label: '劳务报酬收入', value: 50000, showIf: function (v) { return v.method === 'annual'; }, hint: '按收入 ×(1−20%) 计入' },
      { key: 'royalty', label: '稿酬收入', value: 20000, showIf: function (v) { return v.method === 'annual'; }, hint: '按收入 ×(1−20%)×70% 计入' },
      { key: 'franchise', label: '特许权使用费收入', value: 30000, showIf: function (v) { return v.method === 'annual'; }, hint: '按收入 ×(1−20%) 计入' },
      { key: 'social', label: '专项扣除（三险一金等）', value: 36000, showIf: function (v) { return v.method === 'annual'; } },
      { key: 'additional', label: '专项附加扣除合计', value: 48000, showIf: function (v) { return v.method === 'annual'; } },
      { key: 'other', label: '其他扣除', value: 0, showIf: function (v) { return v.method === 'annual'; } },
      { key: 'prepaid', label: '已预缴税额', value: 15000, showIf: function (v) { return v.method === 'annual'; } },
      { key: 'month', label: '当前月份（第几个月）', value: 6, showIf: function (v) { return v.method === 'withhold'; } },
      { key: 'cIncome', label: '累计收入', value: 120000, showIf: function (v) { return v.method === 'withhold'; } },
      { key: 'cSocial', label: '累计专项扣除', value: 18000, showIf: function (v) { return v.method === 'withhold'; } },
      { key: 'cAdd', label: '累计专项附加扣除', value: 24000, showIf: function (v) { return v.method === 'withhold'; } },
      { key: 'cOther', label: '累计其他扣除', value: 0, showIf: function (v) { return v.method === 'withhold'; } },
      { key: 'cPrepaid', label: '累计已预扣预缴税额', value: 3000, showIf: function (v) { return v.method === 'withhold'; } }
    ],
    compute: function (v) {
      var steps = [], taxable, tax, res;
      if (v.method === 'annual') {
        var labor = v.labor * 0.8, royal = v.royalty * 0.8 * 0.7, fran = v.franchise * 0.8;
        var income = v.salary + labor + royal + fran;
        taxable = Math.max(0, income - 60000 - v.social - v.additional - v.other);
        var p = prog(taxable, IIT);
        tax = p.tax;
        steps.push('收入额 = 工资薪金 ' + fmt(v.salary) + ' + 劳务 ' + fmt(v.labor) + '×80% = ' + fmt(labor) + ' + 稿酬 ' + fmt(v.royalty) + '×80%×70% = ' + fmt(royal) + ' + 特许权 ' + fmt(v.franchise) + '×80% = ' + fmt(fran));
        steps.push('综合所得收入额合计 = ' + money(income));
        steps.push('应纳税所得额 = ' + fmt(income) + ' − 基本减除费用 60,000 − 专项扣除 ' + fmt(v.social) + ' − 专项附加扣除 ' + fmt(v.additional) + ' − 其他扣除 ' + fmt(v.other) + ' = ' + money(taxable));
        steps.push('应纳税额 = ' + fmt(taxable) + ' × ' + pct(p.rate * 100) + ' − 速算扣除数 ' + fmt(p.deduct) + ' = ' + money(tax));
        var diff = tax - v.prepaid;
        steps.push('已预缴 ' + fmt(v.prepaid) + '，' + (diff >= 0 ? '应补缴 ' + money(diff) : '应退税 ' + money(-diff)));
        res = [
          { k: '综合所得收入额', v: money(income) },
          { k: '应纳税所得额', v: money(taxable) },
          { k: '适用税率', v: pct(p.rate * 100) },
          { k: '速算扣除数', v: fmt(p.deduct) },
          { k: '应纳税额', v: money(tax) },
          { k: diff >= 0 ? '应补税额' : '应退税额', v: money(Math.abs(diff)) }
        ];
      } else {
        var m = Math.max(1, Math.min(12, Math.round(v.month)));
        var deductFee = 5000 * m;
        taxable = Math.max(0, v.cIncome - deductFee - v.cSocial - v.cAdd - v.cOther);
        var p2 = prog(taxable, IIT);
        var cumTax = p2.tax;
        var cur = Math.max(0, cumTax - v.cPrepaid);
        steps.push('累计减除费用 = 5,000 × ' + m + ' 个月 = ' + money(deductFee));
        steps.push('累计应纳税所得额 = 累计收入 ' + fmt(v.cIncome) + ' − ' + fmt(deductFee) + ' − 累计专项扣除 ' + fmt(v.cSocial) + ' − 累计专项附加扣除 ' + fmt(v.cAdd) + ' − 其他 ' + fmt(v.cOther) + ' = ' + money(taxable));
        steps.push('累计应纳税额 = ' + fmt(taxable) + ' × ' + pct(p2.rate * 100) + ' − ' + fmt(p2.deduct) + ' = ' + money(cumTax));
        steps.push('本期应预扣预缴 = ' + fmt(cumTax) + ' − 累计已预扣 ' + fmt(v.cPrepaid) + ' = ' + money(cur));
        res = [
          { k: '累计应纳税所得额', v: money(taxable) },
          { k: '适用税率', v: pct(p2.rate * 100) },
          { k: '累计应纳税额', v: money(cumTax) },
          { k: '本期应预扣预缴', v: money(cur) }
        ];
      }
      return {
        result: res,
        steps: steps,
        note: '专项附加扣除：子女教育、3 岁以下婴幼儿照护各 2,000 元/月/孩；继续教育 400 元/月或 3,600 元/年；住房贷款利息 1,000 元/月；住房租金 800/1,100/1,500 元/月；赡养老人 3,000 元/月（独生子女）；大病医疗据实（限额 80,000 元/年）。'
      };
    }
  });

  /* ============ 5. 小税种速算 ============ */
  var STAMP = [
    { v: '0.05', t: '借款合同 / 融资租赁合同 0.05‰' },
    { v: '0.3', t: '买卖 / 承揽 / 建设工程 / 运输 / 技术合同 0.3‰' },
    { v: '1', t: '租赁 / 保管 / 仓储 / 财产保险合同 1‰' },
    { v: '0.5', t: '产权转移书据（土地房屋、股权等）0.5‰' },
    { v: '0.25', t: '营业账簿（实收资本+资本公积）0.25‰' },
    { v: '1', t: '证券交易 1‰（出让方单边）' }
  ];

  App.register('税法计算', {
    id: 'minor-taxes',
    name: '小税种速算',
    tip: '城建税及教育费附加、印花税、房产税、土地增值税、契税、车辆购置税、关税、城镇土地使用税。',
    inputs: [
      {
        key: 'method', label: '税种', type: 'select',
        options: [
          { v: 'cs', t: '城市维护建设税及教育费附加' },
          { v: 'stamp', t: '印花税' },
          { v: 'property', t: '房产税' },
          { v: 'lvdt', t: '土地增值税' },
          { v: 'deed', t: '契税' },
          { v: 'vehicle', t: '车辆购置税' },
          { v: 'tariff2', t: '关税（从价）' },
          { v: 'land', t: '城镇土地使用税' }
        ]
      },
      { key: 'base', label: '实际缴纳的增值税 + 消费税', value: 100000, showIf: function (v) { return v.method === 'cs'; } },
      {
        key: 'cityRate', label: '城建税税率', type: 'select', value: 7,
        options: [{ v: 7, t: '7%（市区）' }, { v: 5, t: '5%（县城、镇）' }, { v: 1, t: '1%（其他地区）' }],
        showIf: function (v) { return v.method === 'cs'; }
      },
      {
        key: 'stampCat', label: '印花税税目', type: 'select',
        options: STAMP,
        showIf: function (v) { return v.method === 'stamp'; }
      },
      { key: 'amount', label: '计税金额', value: 1000000, showIf: function (v) { return v.method === 'stamp'; } },
      {
        key: 'pmode', label: '房产税计税方式', type: 'select',
        options: [{ v: 'value', t: '从价计征' }, { v: 'rent', t: '从租计征' }],
        showIf: function (v) { return v.method === 'property'; }
      },
      { key: 'pvalue', label: '房产原值', value: 5000000, showIf: function (v) { return v.method === 'property' && v.pmode === 'value'; } },
      { key: 'pdeduct', label: '扣除比例', value: 30, unit: '%（10%~30%）', showIf: function (v) { return v.method === 'property' && v.pmode === 'value'; } },
      { key: 'prent', label: '年租金收入', value: 240000, showIf: function (v) { return v.method === 'property' && v.pmode === 'rent'; } },
      {
        key: 'prate', label: '从租税率', type: 'select', value: 12,
        options: [{ v: 12, t: '12%（一般）' }, { v: 4, t: '4%（个人住房出租）' }],
        showIf: function (v) { return v.method === 'property' && v.pmode === 'rent'; }
      },
      { key: 'lincome', label: '转让房地产收入（不含增值税）', value: 5000000, showIf: function (v) { return v.method === 'lvdt'; } },
      { key: 'ldeduct', label: '扣除项目金额合计', value: 3000000, showIf: function (v) { return v.method === 'lvdt'; } },
      { key: 'dprice', label: '成交价格（不含增值税）', value: 2000000, showIf: function (v) { return v.method === 'deed'; } },
      {
        key: 'drate2', label: '契税税率', type: 'select', value: 3,
        options: [{ v: 3, t: '3%' }, { v: 4, t: '4%' }, { v: 5, t: '5%' }],
        showIf: function (v) { return v.method === 'deed'; }
      },
      { key: 'vprice', label: '支付给销售者的全部价款（不含增值税）', value: 200000, showIf: function (v) { return v.method === 'vehicle'; } },
      { key: 'cprice', label: '完税价格（到岸价）', value: 500000, showIf: function (v) { return v.method === 'tariff2'; } },
      { key: 'trate', label: '关税税率', value: 10, unit: '%', showIf: function (v) { return v.method === 'tariff2'; } },
      { key: 'area', label: '实际占用土地面积', value: 2000, unit: '㎡', showIf: function (v) { return v.method === 'land'; } },
      { key: 'utax', label: '单位税额', value: 8, unit: '元/㎡·年', showIf: function (v) { return v.method === 'land'; } }
    ],
    compute: function (v) {
      var steps = [], res = [], note = '';
      if (v.method === 'cs') {
        var cs = v.base * v.cityRate / 100;
        var edu = v.base * 0.03, local = v.base * 0.02;
        steps.push('城建税 = ' + fmt(v.base) + ' × ' + pct(v.cityRate) + ' = ' + money(cs));
        steps.push('教育费附加 = ' + fmt(v.base) + ' × 3% = ' + money(edu) + '；地方教育附加 = ' + fmt(v.base) + ' × 2% = ' + money(local));
        res = [{ k: '城市维护建设税', v: money(cs) }, { k: '教育费附加', v: money(edu) }, { k: '地方教育附加', v: money(local) }, { k: '合计', v: money(cs + edu + local) }];
        note = '计税依据是实际缴纳的增值税和消费税税额，不包括滞纳金和罚款。进口货物代征的增值税不征城建税。';
      } else if (v.method === 'stamp') {
        var t = Number(v.stampCat) / 1000;
        var st = v.amount * t;
        steps.push('应纳税额 = 计税金额 ' + fmt(v.amount) + ' × ' + Number(v.stampCat) + '‰ = ' + money(st));
        res = [{ k: '适用税率', v: Number(v.stampCat) + '‰' }, { k: '应纳印花税', v: money(st) }];
        note = '同一应税凭证由两方以上当事人书立的，按各自涉及的金额分别计算应纳税额。';
      } else if (v.method === 'property') {
        if (v.pmode === 'value') {
          var pv = v.pvalue * (1 - v.pdeduct / 100) * 0.012;
          steps.push('应纳税额 = 房产原值 ' + fmt(v.pvalue) + ' × (1 − ' + pct(v.pdeduct) + ') × 1.2% = ' + money(pv));
          res = [{ k: '计税余值', v: money(v.pvalue * (1 - v.pdeduct / 100)) }, { k: '年应纳房产税', v: money(pv) }, { k: '月应纳房产税', v: money(pv / 12) }];
        } else {
          var pr = v.prent * v.prate / 100;
          steps.push('应纳税额 = 年租金收入 ' + fmt(v.prent) + ' × ' + pct(v.prate) + ' = ' + money(pr));
          res = [{ k: '年应纳房产税', v: money(pr) }, { k: '月应纳房产税', v: money(pr / 12) }];
        }
      } else if (v.method === 'lvdt') {
        var inc = v.lincome - v.ldeduct;
        var r = v.ldeduct === 0 ? 0 : inc / v.ldeduct;
        var rate, coef;
        if (r <= 0.5) { rate = 0.3; coef = 0; }
        else if (r <= 1) { rate = 0.4; coef = 0.05; }
        else if (r <= 2) { rate = 0.5; coef = 0.15; }
        else { rate = 0.6; coef = 0.35; }
        var lt = inc * rate - v.ldeduct * coef;
        steps.push('增值额 = 转让收入 ' + fmt(v.lincome) + ' − 扣除项目 ' + fmt(v.ldeduct) + ' = ' + money(inc));
        steps.push('增值率 = ' + fmt(inc) + ' ÷ ' + fmt(v.ldeduct) + ' = ' + pct(r * 100) + '，适用税率 ' + pct(rate * 100) + '，速算扣除系数 ' + pct(coef * 100));
        steps.push('应纳税额 = 增值额 × 税率 − 扣除项目 × 速算扣除系数 = ' + fmt(inc) + ' × ' + pct(rate * 100) + ' − ' + fmt(v.ldeduct) + ' × ' + pct(coef * 100) + ' = ' + money(lt));
        if (inc <= 0) steps.push('增值额为负，无需缴纳土地增值税。');
        res = [{ k: '增值额', v: money(inc) }, { k: '增值率', v: pct(r * 100) }, { k: '适用税率', v: pct(rate * 100) }, { k: '应纳土地增值税', v: money(Math.max(0, lt)) }];
        note = '四级超率累进：增值率 ≤50% 税率 30%；50%~100% 税率 40%、速算扣除 5%；100%~200% 税率 50%、速算扣除 15%；>200% 税率 60%、速算扣除 35%。';
      } else if (v.method === 'deed') {
        var dt = v.dprice * v.drate2 / 100;
        steps.push('应纳税额 = 成交价格 ' + fmt(v.dprice) + ' × ' + pct(v.drate2) + ' = ' + money(dt));
        res = [{ k: '应纳契税', v: money(dt) }];
      } else if (v.method === 'vehicle') {
        var vt = v.vprice * 0.1;
        steps.push('应纳税额 = 计税价格 ' + fmt(v.vprice) + ' × 10% = ' + money(vt));
        res = [{ k: '应纳车辆购置税', v: money(vt) }];
      } else if (v.method === 'tariff2') {
        var tt = v.cprice * v.trate / 100;
        steps.push('应纳税额 = 完税价格 ' + fmt(v.cprice) + ' × ' + pct(v.trate) + ' = ' + money(tt));
        res = [{ k: '应纳关税', v: money(tt) }];
      } else {
        var lu = v.area * v.utax;
        steps.push('年应纳税额 = 实际占用面积 ' + fmt(v.area, 0) + ' × 单位税额 ' + fmt(v.utax) + ' = ' + money(lu));
        res = [{ k: '年应纳城镇土地使用税', v: money(lu) }, { k: '季度应纳税额', v: money(lu / 4) }];
      }
      return { result: res, steps: steps, note: note };
    }
  });
})();
