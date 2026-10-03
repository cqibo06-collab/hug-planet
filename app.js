/* ============ 抱抱星球 ============ */
"use strict";

/* ---------- 悄悄话文案 ---------- */
const MOODS = {
  happy:   { emoji: "😊", label: "开心", title: "开心也要好好收藏哦",
    msgs: [
      "真好呀！把今天的快乐存起来，难过的时候拿出来晒一晒。",
      "快乐会传染，愿你把这份好心情分给身边的人。",
      "世界因为你今天的笑容，都可爱了一点点。",
      "趁开心，去吃点喜欢的东西，把甜度拉满。",
    ] },
  sad:     { emoji: "😢", label: "难过", title: "难过的话，就先停一停吧",
    msgs: [
      "难过的时候不必急着好起来。情绪像天气，会来，也会走。",
      "你已经很努力了，允许自己今天软弱一小会儿。",
      "哭一哭也没关系，眼泪是在帮心里做大扫除。",
      "你不是不够好，你只是累了。先抱抱自己。",
      "把难过说出去，它就轻了一半。旁边的树洞一直在。",
    ] },
  anxious: { emoji: "😰", label: "焦虑", title: "深呼吸，你此刻是安全的",
    msgs: [
      "你担心的事，大多数永远不会发生。先回到此刻。",
      "把大象切成小块，一次只吃一口就好。",
      "焦虑是大脑在努力保护你。谢谢它，然后告诉它：现在可以放松了。",
      "不要想整座山，只想脚下这一步。",
      "慢慢来，事情会一件一件被做完的。",
    ] },
  tired:   { emoji: "😫", label: "疲惫", title: "累的话，就好好歇一歇",
    msgs: [
      "你已经走了很远，先坐下来歇歇脚吧。",
      "世界不会因为你休息一会儿就塌下来，真的。",
      "你不需要时刻满分，会累的你也很可爱。",
      "先睡一觉，很多难题睡醒之后会变小的。",
      "把今天的目标改成：好好吃饭，好好休息。",
    ] },
  angry:   { emoji: "😠", label: "生气", title: "生气没有错，先照顾好自己",
    msgs: [
      "生气说明你在乎自己，这很正常。",
      "先让心里的火苗降一降温，再决定要不要说话。",
      "深呼吸三次。你不是要赢，你是想舒服一点。",
      "值得生气的事会过去，别让它偷走你一整天。",
    ] },
  lost:    { emoji: "🧭", label: "迷茫", title: "迷茫是雾，雾会散的",
    msgs: [
      "看不清远方的时候，就把眼前的路走稳。",
      "迷茫说明你在寻找，寻找的人总会遇到答案。",
      "不必急着找到人生方向，先找到今晚吃什么就好。",
      "雾散的时候，路自然就会出现。",
      "你不需要现在就知道所有答案。",
    ] },
};

const WARM_WORDS = [
  "你不需要发光发热才有价值，你本身就很珍贵。",
  "慢慢来，比较快。",
  "今天的你，已经做得足够好了。",
  "世界偶尔冷淡，但总有一盏灯为你留着。",
  "允许一切发生，也允许自己偶尔掉线。",
  "你比你想象中，更勇敢、也更能干。",
  "星星不会因为一次乌云就熄灭，你也一样。",
  "生活会有糖的，再等等看。",
  "照顾好自己，是最温柔的英雄主义。",
  "你走过的每一步，都算数。",
  "累了就休息，不是放弃，是充电。",
  "你的存在本身，就是一件值得开心的事。",
  "把日子过成自己喜欢的样子，哪怕慢一点。",
  "你已经熬过了很多难熬的日子，这次也可以。",
  "不必羡慕别人的花，你的种子正在发芽。",
  "眼泪流完之后，记得抬头看看天空。",
  "这世界上，总有人在偷偷爱着你。",
  "今天的晚霞很美，明天的你也是。",
  "抱抱自己，说一句：辛苦了。",
  "别急，月亮也是慢慢亮起来的。",
  "有些路走得慢，是因为它通往更远的地方。",
  "对自己温柔一点，你只是个普通人，已经很了不起了。",
  "生活偶尔褪色，但你自带光芒。",
  "好好吃饭，好好睡觉，好运正在路上。",
  "你值得被好好对待，从你自己开始。",
  "每朵花都有自己的花期，不用和别人比。",
];

const HUG_MSGS = [
  "抱抱你 🫂",
  "辛苦啦，摸摸头 🌷",
  "你已经很棒了 ⭐",
  "你值得所有的温柔 🕊️",
  "一切都会好起来的 🌈",
  "我在呢，别怕 🫧",
];

/* ---------- 小工具 ---------- */
const $ = (id) => document.getElementById(id);
const LS = {
  get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

let toastTimer = null;
function toast(text) {
  const el = $("toast");
  el.textContent = text;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 2200);
}

function pick(arr, exclude) {
  if (arr.length === 1) return arr[0];
  let v;
  do { v = arr[Math.floor(Math.random() * arr.length)]; } while (v === exclude);
  return v;
}

/* ---------- 主题 ---------- */
function applyTheme(dark) {
  document.documentElement.classList.toggle("dark", dark);
  $("themeBtn").textContent = dark ? "🌞" : "🌙";
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", dark ? "#1c2721" : "#9ccba4");
}
(function initTheme() {
  const saved = LS.get("bb_theme", null);
  const dark = saved === null
    ? window.matchMedia("(prefers-color-scheme: dark)").matches
    : saved === "dark";
  applyTheme(dark);
  $("themeBtn").addEventListener("click", () => {
    const next = !document.documentElement.classList.contains("dark");
    LS.set("bb_theme", next ? "dark" : "light");
    applyTheme(next);
  });
})();

/* ---------- 问候语 ---------- */
(function greeting() {
  const h = new Date().getHours();
  const [title, sub] =
    h < 5  ? ["夜深了", "还没睡的话，记得早点休息"] :
    h < 11 ? ["早上好", "新的一天，慢慢来就好"] :
    h < 13 ? ["中午好", "记得好好吃饭呀"] :
    h < 18 ? ["下午好", "累了就伸个懒腰吧"] :
    h < 23 ? ["晚上好", "今天的你辛苦啦"] :
             ["夜深了", "还没睡的话，记得早点休息"];
  $("greetTitle").textContent = title;
  $("greetSub").textContent = sub;
})();

/* ---------- 页面切换 ---------- */
document.querySelectorAll(".tab").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".page").forEach((p) => p.classList.remove("active"));
    btn.classList.add("active");
    $("page-" + btn.dataset.page).classList.add("active");
    window.scrollTo({ top: 0 });
  });
});

/* ---------- 心情 ---------- */
let curMood = null;
let curMsgIdx = -1;
(function initMoods() {
  const grid = $("moodGrid");
  Object.entries(MOODS).forEach(([key, m]) => {
    const chip = document.createElement("button");
    chip.className = "mood-chip";
    chip.innerHTML = `<span>${m.emoji}</span><b>${m.label}</b>`;
    chip.addEventListener("click", () => selectMood(key, chip));
    grid.appendChild(chip);
  });
})();

function selectMood(key, chip) {
  curMood = key;
  curMsgIdx = -1;
  document.querySelectorAll(".mood-chip").forEach((c) => c.classList.remove("picked"));
  chip.classList.add("picked");
  const m = MOODS[key];
  $("moodEmoji").textContent = m.emoji;
  $("comfortTitle").textContent = m.title;
  nextMoodMsg();
  const card = $("comfortCard");
  card.hidden = false;
  card.scrollIntoView({ behavior: "smooth", block: "center" });
  try { navigator.vibrate?.(12); } catch {}
}
function nextMoodMsg() {
  if (!curMood) return;
  const msgs = MOODS[curMood].msgs;
  curMsgIdx = (curMsgIdx + 1) % msgs.length;
  $("comfortMsg").textContent = msgs[curMsgIdx];
  const el = $("comfortMsg");
  el.style.animation = "none";
  void el.offsetWidth;
  el.style.animation = "";
}
$("anotherMsg").addEventListener("click", nextMoodMsg);
$("goBreathe").addEventListener("click", () =>
  document.querySelector('.tab[data-page="breathe"]').click());

/* ---------- 呼吸练习 ---------- */
const PHASES = [
  { name: "吸气", secs: 4, scale: 1 },
  { name: "屏住", secs: 4, hold: true },
  { name: "呼气", secs: 6, scale: 0.66 },
];
let breathing = false;
let breatheToken = 0;
let cycles = 0;

function setCircleScale(scale, secs) {
  const c = $("breatheCircle");
  c.style.transition = `transform ${secs}s cubic-bezier(0.37, 0, 0.28, 1)`;
  c.style.transform = `scale(${scale})`;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function breatheLoop(token) {
  const done = $("breatheDone");
  done.textContent = cycles > 0 ? `已经完成 ${cycles} 轮，做得很棒 🌟` : "";
  while (breathing && token === breatheToken) {
    for (const ph of PHASES) {
      if (!breathing || token !== breatheToken) return;
      $("breathePhase").textContent = ph.name;
      if (!ph.hold) setCircleScale(ph.scale, ph.secs);
      try { navigator.vibrate?.(ph.name === "呼气" ? 10 : 6); } catch {}
      for (let s = ph.secs; s > 0; s--) {
        if (!breathing || token !== breatheToken) return;
        $("breatheCount").textContent = s;
        await sleep(1000);
      }
    }
    cycles++;
    done.textContent = `已经完成 ${cycles} 轮，做得很棒 🌟`;
  }
}

function setBreatheUI(on) {
  $("breatheToggle").textContent = on ? "停 止" : "开 始";
  if (!on) {
    $("breathePhase").textContent = "准备开始";
    $("breatheCount").textContent = "";
    setCircleScale(0.66, 1.2);
  }
}

$("breatheToggle").addEventListener("click", () => {
  breathing = !breathing;
  if (breathing) {
    breatheToken++;
    setBreatheUI(true);
    breatheLoop(breatheToken);
  } else {
    breatheToken++;
    setBreatheUI(false);
  }
});

/* ---------- 白噪音（本地生成，无需音频文件） ---------- */
let noiseCtx = null, noiseGain = null, noiseOn = false;
function toggleNoise() {
  if (!noiseOn) {
    noiseCtx = noiseCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (noiseCtx.state === "suspended") noiseCtx.resume();
    if (!noiseGain) {
      const len = noiseCtx.sampleRate * 4;
      const buf = noiseCtx.createBuffer(1, len, noiseCtx.sampleRate);
      const data = buf.getChannelData(0);
      let last = 0;
      for (let i = 0; i < len; i++) {
        const white = Math.random() * 2 - 1;
        last = (last + 0.02 * white) / 1.02;
        data[i] = last * 3.2;
      }
      const src = noiseCtx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      noiseGain = noiseCtx.createGain();
      noiseGain.gain.value = 0;
      src.connect(noiseGain).connect(noiseCtx.destination);
      src.start();
      noiseGain._src = src;
    }
    noiseGain.gain.cancelScheduledValues(noiseCtx.currentTime);
    noiseGain.gain.linearRampToValueAtTime(0.12, noiseCtx.currentTime + 1.2);
    noiseOn = true;
    $("noiseToggle").textContent = "🌧️ 停止声音";
    $("noiseToggle").classList.add("primary");
    $("noiseToggle").classList.remove("ghost");
    toast("像雨夜一样的声音，慢慢放松下来");
  } else {
    noiseGain.gain.cancelScheduledValues(noiseCtx.currentTime);
    noiseGain.gain.linearRampToValueAtTime(0, noiseCtx.currentTime + 0.8);
    noiseOn = false;
    $("noiseToggle").textContent = "🌧️ 白噪音";
    $("noiseToggle").classList.remove("primary");
    $("noiseToggle").classList.add("ghost");
  }
}
$("noiseToggle").addEventListener("click", toggleNoise);

/* ---------- 树洞 ---------- */
function loadNotes() { return LS.get("bb_notes", []); }

function renderNotes() {
  const list = $("noteList");
  const notes = loadNotes();
  list.innerHTML = "";
  if (!notes.length) {
    const empty = document.createElement("p");
    empty.className = "empty-hole";
    empty.textContent = "树洞空空的，等哪天想说了再来说说话 🌱";
    list.appendChild(empty);
    return;
  }
  notes.forEach((n) => {
    const item = document.createElement("div");
    item.className = "note";
    item.innerHTML = `
      <p></p>
      <div class="note-foot">
        <span class="note-time">${n.time}</span>
        <button class="note-release">🍃 放飞它</button>
      </div>`;
    item.querySelector("p").textContent = n.text;
    item.querySelector(".note-release").addEventListener("click", () => releaseNote(item, n.id));
    list.appendChild(item);
  });
}

function releaseNote(el, id) {
  el.classList.add("flying");
  setTimeout(() => {
    LS.set("bb_notes", loadNotes().filter((n) => n.id !== id));
    renderNotes();
    toast("让风把它带走吧 🍃");
  }, 2300);
}

$("holeSave").addEventListener("click", () => {
  const input = $("holeInput");
  const text = input.value.trim();
  if (!text) { toast("想说什么都可以，先写一点点吧"); input.focus(); return; }
  const now = new Date();
  const time = `${now.getMonth() + 1}月${now.getDate()}日 ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const notes = loadNotes();
  notes.unshift({ id: Date.now(), text, time });
  LS.set("bb_notes", notes);
  input.value = "";
  renderNotes();
  toast("已经替你收好啦 🌟");
  try { navigator.vibrate?.(15); } catch {}
});
renderNotes();

/* ---------- 暖心话 ---------- */
let lastWord = null;
function shuffleWord() {
  const el = $("wordsQuote");
  lastWord = pick(WARM_WORDS, lastWord);
  el.style.animation = "none";
  void el.offsetWidth;
  el.textContent = lastWord;
  el.style.animation = "";
}
$("wordsCard").addEventListener("click", shuffleWord);
$("wordsCard").addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === " ") { e.preventDefault(); shuffleWord(); }
});
$("wordsCopy").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText($("wordsQuote").textContent);
    toast("复制好啦，发给需要的人 ✨");
  } catch { toast("这部设备不允许复制，手抄一句也很浪漫"); }
});
shuffleWord();

/* ---------- 抱抱 ---------- */
const HUG_ICONS = ["🍃", "🌿", "🍀", "💚", "🫂", "✨", "🕊️", "🌾"];
let hugTimer = null;

function burstHearts() {
  const box = $("hugHearts");
  box.innerHTML = "";
  for (let i = 0; i < 22; i++) {
    const s = document.createElement("span");
    s.textContent = pick(HUG_ICONS);
    s.style.left = Math.random() * 96 + "%";
    s.style.fontSize = 16 + Math.random() * 22 + "px";
    s.style.animationDelay = Math.random() * 1.6 + "s";
    s.style.animationDuration = 2.4 + Math.random() * 1.6 + "s";
    box.appendChild(s);
  }
}

$("hugBtn").addEventListener("click", (e) => {
  e.stopPropagation();
  const ov = $("hugOverlay");
  ov.hidden = false;
  let i = 0;
  $("hugMsg").textContent = HUG_MSGS[0];
  burstHearts();
  clearInterval(hugTimer);
  hugTimer = setInterval(() => {
    i = (i + 1) % HUG_MSGS.length;
    $("hugMsg").textContent = HUG_MSGS[i];
  }, 2100);
  try { navigator.vibrate?.([18, 60, 18]); } catch {}
});

function closeHug() {
  $("hugOverlay").hidden = true;
  clearInterval(hugTimer);
}
$("hugOverlay").addEventListener("click", closeHug);

/* ---------- PWA ---------- */
if ("serviceWorker" in navigator && /^https?:$/.test(location.protocol)) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  });
}
