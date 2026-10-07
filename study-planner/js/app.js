/* ============================================================
 * app.js — 导航路由 + 示例数据
 * ============================================================ */
PB.app = (() => {
  const U = PB.util;

  const VIEWS = {
    dashboard: () => PB.views.dashboard,
    timetable: () => PB.views.timetable,
    goals: () => PB.views.goals,
    materials: () => PB.views.materials,
    plan: () => PB.views.plan,
    report: () => PB.views.report,
    settings: () => PB.views.settings,
  };

  function nav(tab) {
    document.querySelectorAll('#navTabs button').forEach(b => {
      b.classList.toggle('active', b.dataset.tab === tab);
    });
    const root = document.getElementById('mainContent');
    root.innerHTML = '';
    (VIEWS[tab] || VIEWS.dashboard)()(root);
    window.scrollTo(0, 0);
  }

  function init() {
    document.getElementById('navTabs').addEventListener('click', e => {
      const btn = e.target.closest('button[data-tab]');
      if (btn) nav(btn.dataset.tab);
    });
    nav('dashboard');
  }

  /* ── 示例数据 ───────────────────────────────── */
  function demoState() {
    const s = PB.store.get(); // 以当前设置为基础
    const d = (n) => U.dateStr(U.addDays(U.today(), n));
    s.courses = [
      { id: 'c1', name: '高等数学（下）', location: '教1-201', day: 1, start: '08:00', end: '09:40' },
      { id: 'c2', name: '大学物理', location: '教2-305', day: 1, start: '14:00', end: '15:40' },
      { id: 'c3', name: '数据结构', location: '教3-102', day: 2, start: '10:00', end: '11:40' },
      { id: 'c4', name: '高等数学（下）', location: '教1-201', day: 3, start: '08:00', end: '09:40' },
      { id: 'c5', name: '大学物理', location: '教2-305', day: 3, start: '14:00', end: '15:40' },
      { id: 'c6', name: '数据结构实验', location: '实验楼405', day: 4, start: '14:00', end: '15:40' },
      { id: 'c7', name: '大学英语', location: '文B-203', day: 5, start: '10:00', end: '11:40' },
      { id: 'c8', name: '体育', location: '田径场', day: 4, start: '16:00', end: '17:00' },
    ];
    s.events = [
      { id: 'e1', name: '年级大会', date: d(2), start: '18:30', end: '20:00' },
    ];
    s.subjects = [
      { id: 's1', name: '数学竞赛', target: d(58), note: '全国大学生数学竞赛（非数学类），11月初校内选拔' },
      { id: 's2', name: '高等数学', target: d(42), note: '期末考试范围：下册第8-12章' },
    ];
    s.materials = [
      { id: 'm1', subjectId: 's1', type: 'link', title: '历年真题合集（校内ftp）', url: 'https://example.com/past-papers', content: '2015-2025 年初赛真题与解析' },
      { id: 'm2', subjectId: 's1', type: 'note', title: '错题本（纸质）', url: '', content: '两本：极限/级数专题 + 线代专题，每周回顾' },
      { id: 'm3', subjectId: 's2', type: 'note', title: '老师划的重点', url: '', content: '第9章曲面积分、第11章级数敛散性是重点' },
    ];
    s.goals = [
      { id: 'g1', title: '全国大学生数学竞赛（初赛）', category: '竞赛', deadline: d(58), priority: 'high', estHours: 0, note: '目标：校内选拔进前10', subjectId: 's1', createdAt: U.dateStr(U.today()) },
      { id: 'g2', title: '高数期末复习', category: '考试', deadline: d(42), priority: 'med', estHours: 0, note: '', subjectId: 's2', createdAt: U.dateStr(U.today()) },
      { id: 'g3', title: '英语六级刷分', category: '考试', deadline: d(84), priority: 'low', estHours: 0, note: '上学期 480，目标 550+', subjectId: null, createdAt: U.dateStr(U.today()) },
    ];
    s.tasks = [
      { id: 't1', goalId: 'g1', title: '历年真题限时模拟', estHours: 37.5, doneHours: 7.5, qty: { n: 15, unit: 'paper' }, estFrom: 'qty', preferred: 'deep', priority: 'high' },
      { id: 't2', goalId: 'g1', title: '薄弱章节专项（级数+曲面积分）', estHours: 16, doneHours: 4, qty: { n: 8, unit: 'chapter' }, estFrom: 'qty', preferred: 'deep', priority: 'high' },
      { id: 't3', goalId: 'g1', title: '错题回顾', estHours: 10, doneHours: 2, qty: { n: 20, unit: 'recite' }, estFrom: 'qty', preferred: 'fragment', priority: 'med' },
      { id: 't4', goalId: 'g2', title: '过一遍下册知识点', estHours: 14, doneHours: 0, qty: { n: 7, unit: 'chapter' }, estFrom: 'qty', preferred: 'deep', priority: 'med' },
      { id: 't5', goalId: 'g2', title: '课后习题二刷', estHours: 12, doneHours: 0, qty: null, estFrom: 'manual', preferred: 'deep', priority: 'med' },
      { id: 't6', goalId: 'g3', title: '六级词汇（每天50个）', estHours: 15, doneHours: 3, qty: { n: 30, unit: 'word50' }, estFrom: 'qty', preferred: 'fragment', priority: 'low' },
      { id: 't7', goalId: 'g3', title: '真题听力精听', estHours: 10, doneHours: 0, qty: null, estFrom: 'manual', preferred: 'fragment', priority: 'low' },
    ];
    s.plan = { weekOf: '', items: [], warnings: [] };
    return s;
  }

  return {
    nav,
    init,
    demo: {
      load() { PB.store.replaceAll(demoState()); },
    },
  };
})();

PB.demo = PB.app.demo;

document.addEventListener('DOMContentLoaded', PB.app.init);
