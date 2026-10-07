/* 会计计算器 - 框架层
 * 每个计算模块只需要调用 App.register(分组名, 模块) 注册自己。
 * 模块格式：
 *   { id, name, tip,
 *     inputs: [{key,label,type:'number'|'select'|'textarea',value,unit,hint,options,showIf}],
 *     compute(v) -> {result:[{k,v}], steps:[], tableHtml:'', entry:[], note:''} }
 */
(function (global) {
  'use strict';

  var App = {
    groups: [],
    register: function (groupName, mod) {
      var g = null, i;
      for (i = 0; i < App.groups.length; i++) {
        if (App.groups[i].name === groupName) { g = App.groups[i]; break; }
      }
      if (!g) { g = { name: groupName, items: [] }; App.groups.push(g); }
      g.items.push(mod);
      return mod;
    },
    all: function () {
      var out = [];
      App.groups.forEach(function (g) { out = out.concat(g.items); });
      return out;
    }
  };

  /* ---------------- 通用工具 ---------------- */
  function fmt(n, d) {
    if (d === undefined) d = 2;
    if (n === null || n === undefined || !isFinite(n)) return '-';
    return Number(n).toLocaleString('zh-CN', { minimumFractionDigits: d, maximumFractionDigits: d });
  }
  function money(n, d) { return '¥ ' + fmt(n, d); }
  function pct(n, d) { if (d === undefined) d = 2; return fmt(n, d) + '%'; }
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function round(n, d) { if (d === undefined) d = 2; var p = Math.pow(10, d); return Math.round(n * p) / p; }

  /* 超额累进：brackets = [{up, rate, deduct}]，用速算扣除数 */
  function progressive(amount, brackets) {
    var i, b = brackets[brackets.length - 1];
    for (i = 0; i < brackets.length; i++) {
      if (amount <= brackets[i].up) { b = brackets[i]; break; }
    }
    return { rate: b.rate, deduct: b.deduct, tax: Math.max(0, amount * b.rate - b.deduct) };
  }

  /* 生成一张简单表格：head=[], rows=[[],[]] */
  function table(head, rows) {
    var h = '<table class="tbl"><thead><tr>';
    head.forEach(function (x) { h += '<th>' + esc(x) + '</th>'; });
    h += '</tr></thead><tbody>';
    rows.forEach(function (r) {
      h += '<tr>';
      r.forEach(function (c) { h += '<td>' + esc(c) + '</td>'; });
      h += '</tr>';
    });
    return h + '</tbody></table>';
  }

  App.fmt = fmt; App.money = money; App.pct = pct; App.round = round;
  App.table = table; App.progressive = progressive; App.esc = esc;

  /* ---------------- 渲染 ---------------- */
  var current = null;

  function fieldHtml(inp) {
    var id = 'f_' + inp.key;
    var h = '<div class="field' + (inp.wide ? ' wide' : '') + '" data-key="' + inp.key + '">';
    h += '<label for="' + id + '">' + esc(inp.label) + '</label>';
    if (inp.type === 'select') {
      h += '<select id="' + id + '">';
      inp.options.forEach(function (o) { h += '<option value="' + esc(o.v) + '">' + esc(o.t) + '</option>'; });
      h += '</select>';
    } else if (inp.type === 'textarea') {
      h += '<textarea id="' + id + '" rows="' + (inp.rows || 5) + '">' + esc(inp.value || '') + '</textarea>';
    } else {
      h += '<input type="number" step="any" id="' + id + '" value="' + (inp.value === undefined ? 0 : inp.value) + '">';
    }
    if (inp.unit) h += '<span class="unit">' + esc(inp.unit) + '</span>';
    if (inp.hint) h += '<div class="hint">' + esc(inp.hint) + '</div>';
    return h + '</div>';
  }

  function readValues(mod) {
    var v = {};
    mod.inputs.forEach(function (inp) {
      var el = document.getElementById('f_' + inp.key);
      if (!el) return;
      if (inp.type === 'select') {
        var numeric = inp.options.every(function (o) { return /^-?\d+(\.\d+)?$/.test(String(o.v)); });
        v[inp.key] = numeric ? Number(el.value) : el.value;
      } else if (inp.type === 'textarea') {
        v[inp.key] = el.value;
      } else {
        v[inp.key] = el.value === '' ? 0 : Number(el.value);
      }
    });
    return v;
  }

  function refreshVisibility(mod, v) {
    mod.inputs.forEach(function (inp) {
      var el = document.getElementById('f_' + inp.key);
      if (!el) return;
      var box = el.parentNode;
      if (typeof inp.showIf === 'function') {
        box.className = 'field' + (inp.wide ? ' wide' : '') + (inp.showIf(v) ? '' : ' hide');
      }
    });
  }

  function resultHtml(res) {
    var h = '';
    if (!res) return '';
    if (res.result && res.result.length) {
      h += '<div class="res">';
      res.result.forEach(function (r) {
        h += '<div class="res-item"><div class="res-k">' + esc(r.k) + '</div><div class="res-v">' + esc(r.v) + '</div></div>';
      });
      h += '</div>';
    }
    if (res.tableHtml) { h += '<h3>明细</h3>' + res.tableHtml; }
    if (res.steps && res.steps.length) {
      h += '<h3>计算过程</h3><ol class="steps">';
      res.steps.forEach(function (s) { h += '<li>' + s + '</li>'; });
      h += '</ol>';
    }
    if (res.entry && res.entry.length) {
      h += '<h3>会计分录</h3><pre class="entry">' + res.entry.map(esc).join('\n') + '</pre>';
    }
    if (res.note) h += '<div class="note">' + res.note + '</div>';
    return h;
  }

  function compute(mod) {
    var out = document.getElementById('out');
    var v = readValues(mod);
    refreshVisibility(mod, v);
    var res;
    try {
      res = mod.compute(v);
    } catch (e) {
      out.innerHTML = '<div class="warn">计算出错：' + esc(e.message) + '</div>';
      return;
    }
    out.innerHTML = resultHtml(res);
  }

  function renderModule(mod) {
    current = mod;
    var panel = document.getElementById('panel');
    var h = '<div class="card"><h2>' + esc(mod.name) + '</h2>';
    if (mod.tip) h += '<p class="tip">' + mod.tip + '</p>';
    h += '<div class="form">';
    mod.inputs.forEach(function (inp) { h += fieldHtml(inp); });
    h += '<div class="form-actions"><button class="btn" id="btnCalc">计算</button>';
    h += '<button class="btn ghost" id="btnReset">恢复默认</button></div>';
    h += '</div><div id="out"></div></div>';
    panel.innerHTML = h;

    mod.inputs.forEach(function (inp) {
      var el = document.getElementById('f_' + inp.key);
      if (!el) return;
      if (inp.type === 'select' && inp.value !== undefined) el.value = String(inp.value);
      el.addEventListener('input', function () { compute(mod); });
      el.addEventListener('change', function () { compute(mod); });
    });

    document.getElementById('btnCalc').addEventListener('click', function () { compute(mod); });
    document.getElementById('btnReset').addEventListener('click', function () {
      mod.inputs.forEach(function (inp) {
        var el = document.getElementById('f_' + inp.key);
        if (!el) return;
        if (inp.type === 'select') el.value = String(inp.value !== undefined ? inp.value : inp.options[0].v);
        else if (inp.value !== undefined) el.value = inp.value;
      });
      compute(mod);
    });

    Array.prototype.forEach.call(document.querySelectorAll('.nav-item'), function (b) {
      b.classList.toggle('active', b.getAttribute('data-id') === mod.id);
    });
    compute(mod);
  }

  function buildNav() {
    var nav = document.getElementById('nav');
    var h = '';
    App.groups.forEach(function (g) {
      h += '<div class="nav-group"><div class="nav-gname">' + esc(g.name) + '</div>';
      g.items.forEach(function (m) {
        h += '<button class="nav-item" data-id="' + esc(m.id) + '">' + esc(m.name) + '</button>';
      });
      h += '</div>';
    });
    nav.innerHTML = h;
    Array.prototype.forEach.call(nav.querySelectorAll('.nav-item'), function (b) {
      b.addEventListener('click', function () {
        var id = b.getAttribute('data-id');
        var mod = App.all().filter(function (m) { return m.id === id; })[0];
        if (mod) { renderModule(mod); if (global.location) global.location.hash = id; }
      });
    });
    var box = document.getElementById('search');
    if (box) {
      box.addEventListener('input', function () {
        var q = box.value.trim();
        Array.prototype.forEach.call(nav.querySelectorAll('.nav-item'), function (b) {
          b.classList.toggle('hide', q !== '' && b.textContent.indexOf(q) === -1);
        });
      });
    }
  }

  function init() {
    buildNav();
    var start = App.all()[0];
    var hash = global.location && global.location.hash ? global.location.hash.slice(1) : '';
    if (hash) {
      var m = App.all().filter(function (x) { return x.id === hash; })[0];
      if (m) start = m;
    }
    if (start) renderModule(start);
  }

  global.App = App;
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
  }
})(typeof window !== 'undefined' ? window : globalThis);
