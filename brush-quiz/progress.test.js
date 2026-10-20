// Run with: node --test brush-quiz/progress.test.js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

for (const file of ['index.dev.html', 'index.html']) {
  const html = fs.readFileSync(path.join(__dirname, file), 'utf8');
  const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)]
    .map(m => m[1]).filter(s => s.trim());
  test(file + ': all inline scripts parse', () => {
    scripts.forEach(s => new vm.Script(s));
  });
  const source = scripts.join('\n');
  const session = source.slice(source.indexOf('function startSession('), source.indexOf('function startTimer('));
  const submit = source.slice(source.indexOf('function doSubmit('), source.indexOf('function renderResult('));
  function app(data = { resumes: [], records: [] }) {
    let next = 0;
    const noop = () => {};
    const context = vm.createContext({
      DB: JSON.parse(JSON.stringify(data)), S: null, TICK: null,
      uid: () => 'session_' + (++next), save: noop, go: noop, toast: noop,
      startTimer: noop, renderQ: noop, renderSheet: noop, clearInterval: noop,
      $: () => ({}), renderResult: noop, touchRight: noop, touchStat: noop,
      logAttempt: noop, pushWrong: noop,
      judge: () => ({ state: 'unanswered', got: 0 })
    });
    vm.runInContext(session + '\n' + submit, context);
    return context;
  }
  function start(c, title) {
    c.startSession({ title, mode: 'practice', list: [{ id: title + '1' }, { id: title + '2' }] });
    return c.S.id;
  }
  test(file + ': chapters survive reload, retain answers and resume independently', () => {
    let c = app();
    const a = start(c, '第一章');
    Object.assign(c.S, { idx: 1, answers: { '第一章1': ['A'] }, locked: { '第一章1': true },
      marks: { '第一章2': true }, conf: { '第一章1': 'sure' }, results: { '第一章1': { state: 'right', got: 1 } } });
    c.saveResume();
    const b = start(c, '第二章');
    c.S.answers['第二章1'] = ['B']; c.saveResume();
    c = app(c.DB); // JSON round trip simulates persisted data after refresh.
    c.resumeSession(a);
    assert.equal(c.S.idx, 1);
    assert.equal(c.S.answers['第一章1'][0], 'A');
    assert.equal(c.S.locked['第一章1'], true);
    assert.equal(c.S.marks['第一章2'], true);
    assert.equal(c.S.conf['第一章1'], 'sure');
    assert.equal(c.S.results['第一章1'].state, 'right');
    c.resumeSession(b);
    assert.equal(c.S.answers['第二章1'][0], 'B');
    assert.equal(c.savedResumes().length, 2);
  });
  test(file + ': migrate legacy progress exactly once without losing new progress', () => {
    const c = app({ resumes: [{ id: 'existing', title: '第二章', list: [{ id: 'b' }], idx: 0 }],
      resume: { title: '旧章节', list: [{ id: 'a' }], idx: 0, answers: { a: ['A'] } } });
    assert.equal(c.savedResumes().length, 2);
    assert.equal(c.savedResumes().length, 2);
    assert.equal(c.DB.resume, undefined);
    const old = c.DB.resumes.find(r => r.title === '旧章节');
    c.resumeSession(old.id);
    assert.equal(c.S.answers.a[0], 'A');
  });
  test(file + ': deleting and submitting affect only the selected session', () => {
    const c = app();
    const a = start(c, '第一章');
    const b = start(c, '第二章');
    const d = start(c, '第三章');
    c.clearResume(b);
    c.resumeSession(a);
    c.doSubmit();
    assert.equal(c.DB.records.length, 1);
    assert.deepEqual(Array.from(c.savedResumes(), r => r.id), [d]);
  });
  test(file + ': many sessions, same-title runs, and untouched first questions are retained', () => {
    const c = app();
    for (let i = 0; i < 100; i++) start(c, '章节');
    assert.equal(c.savedResumes().length, 100);
    assert.equal(new Set(c.DB.resumes.map(r => r.id)).size, 100);
    c.saveResume();
    assert.equal(c.savedResumes().length, 100);
  });
}
