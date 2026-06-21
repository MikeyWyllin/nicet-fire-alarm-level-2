const BANK = window.QUESTION_BANK || [];
const TEST_SIZE = 25;
const TEST_SECONDS = 30 * 60;
const STORAGE_KEY = "nicet2_fire_alarm_stats_v1";

let state = { test: [], index: 0, answers: {}, startedAt: null, remaining: TEST_SECONDS, timerId: null, submitted: false };

const $ = (id) => document.getElementById(id);
const screens = ["startScreen", "quizScreen", "resultsScreen"];
function show(id){ screens.forEach(s => $(s).classList.toggle("hidden", s !== id)); }
function shuffle(arr){ return [...arr].sort(() => Math.random() - 0.5); }
function loadStats(){
  const base = { tests:0, answered:0, correct:0, best:0, history:[], tag:{}, missed:{}, source:{}, lastScore:0 };
  try { return Object.assign(base, JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}); } catch { return base; }
}
function saveStats(stats){ localStorage.setItem(STORAGE_KEY, JSON.stringify(stats)); }
function pct(a,b){ return b ? Math.round((a/b)*100) : 0; }
function statBox(label, value){ return `<div class="stat"><b>${value}</b><span>${label}</span></div>`; }
function renderStats(){
  const s = loadStats();
  const weak = Object.entries(s.tag || {}).filter(([k,v])=>v.answered>=3).sort((a,b)=>pct(a[1].correct,a[1].answered)-pct(b[1].correct,b[1].answered))[0];
  $("statsGrid").innerHTML = [
    statBox("Tests Taken", s.tests),
    statBox("All-Time Score", `${pct(s.correct,s.answered)}%`),
    statBox("Questions Answered", s.answered),
    statBox("Best 25Q Score", `${s.best}%`),
    statBox("Last Score", `${s.lastScore || 0}%`),
    statBox("Weakest Tag", weak ? `${weak[0]} (${pct(weak[1].correct,weak[1].answered)}%)` : "None yet")
  ].join("");
}
function makeTest(){
  const sample = shuffle(BANK).slice(0, TEST_SIZE).map(q => {
    const opts = q.options.map((text, i) => ({ text, originalIndex:i }));
    return { ...q, displayOptions: shuffle(opts) };
  });
  state = { test: sample, index: 0, answers: {}, startedAt: Date.now(), remaining: TEST_SECONDS, timerId: null, submitted: false };
  show("quizScreen");
  renderQuestion();
  startTimer();
}
function startTimer(){
  clearInterval(state.timerId);
  tick();
  state.timerId = setInterval(() => {
    state.remaining--;
    tick();
    if(state.remaining <= 0) submitTest(true);
  }, 1000);
}
function tick(){
  const m = Math.floor(state.remaining/60).toString().padStart(2,"0");
  const s = Math.max(0,state.remaining%60).toString().padStart(2,"0");
  $("timer").textContent = `${m}:${s}`;
}
function renderQuestion(){
  const q = state.test[state.index];
  $("progressText").textContent = `Question ${state.index + 1} of ${state.test.length}`;
  $("bankInfo").textContent = `${q.source} • ${q.tag}`;
  const selected = state.answers[q.id];
  $("questionCard").innerHTML = `
    <div class="pill">${q.source}</div><div class="pill">${q.tag}</div>
    <div class="qtext">${escapeHtml(q.question)}</div>
    <div>${q.displayOptions.map((o, idx) => `
      <label class="option ${selected===idx ? 'selected':''}">
        <input type="radio" name="answer" value="${idx}" ${selected===idx ? 'checked':''} />
        <span><strong>${String.fromCharCode(65+idx)}.</strong> ${escapeHtml(o.text)}</span>
      </label>`).join("")}</div>`;
  document.querySelectorAll('input[name="answer"]').forEach(input => {
    input.addEventListener('change', e => { state.answers[q.id] = Number(e.target.value); renderQuestion(); });
  });
  $("prevBtn").disabled = state.index === 0;
  $("nextBtn").disabled = state.index === state.test.length - 1;
}
function escapeHtml(str){ return String(str).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
function submitTest(auto=false){
  if(state.submitted) return;
  if(!auto){
    const unanswered = state.test.length - Object.keys(state.answers).length;
    if(unanswered && !confirm(`${unanswered} unanswered. Submit anyway?`)) return;
  }
  state.submitted = true;
  clearInterval(state.timerId);
  let correct=0;
  const details = state.test.map(q => {
    const chosenDisplayIndex = state.answers[q.id];
    const chosen = chosenDisplayIndex === undefined ? null : q.displayOptions[chosenDisplayIndex];
    const ok = chosen && chosen.originalIndex === q.answer;
    if(ok) correct++;
    return { q, chosenDisplayIndex, chosenText: chosen ? chosen.text : "Unanswered", ok };
  });
  const score = Math.round((correct/state.test.length)*100);
  updateStats(details, correct, score);
  renderResults(details, correct, score, auto);
  show("resultsScreen");
}
function updateStats(details, correct, score){
  const s = loadStats();
  s.tests += 1; s.answered += details.length; s.correct += correct; s.best = Math.max(s.best || 0, score); s.lastScore = score;
  s.history.unshift({ date:new Date().toISOString(), score, correct, total:details.length });
  s.history = s.history.slice(0, 50);
  details.forEach(d => {
    const tag = d.q.tag || "Other"; const src = d.q.source || "Other";
    s.tag[tag] = s.tag[tag] || { answered:0, correct:0 };
    s.tag[tag].answered++; if(d.ok) s.tag[tag].correct++;
    s.source[src] = s.source[src] || { answered:0, correct:0 };
    s.source[src].answered++; if(d.ok) s.source[src].correct++;
    if(!d.ok) s.missed[d.q.id] = (s.missed[d.q.id] || 0) + 1;
  });
  saveStats(s);
}
function renderResults(details, correct, score, auto){
  $("scoreTitle").textContent = auto ? "Time Up - Test Submitted" : "Test Submitted";
  $("scoreSummary").innerHTML = `<strong>${correct}/${details.length}</strong> correct • <strong>${score}%</strong>`;
  const byTag = {};
  details.forEach(d => { byTag[d.q.tag] = byTag[d.q.tag] || {c:0,t:0}; byTag[d.q.tag].t++; if(d.ok) byTag[d.q.tag].c++; });
  $("resultsStats").innerHTML = Object.entries(byTag).sort((a,b)=>a[0].localeCompare(b[0])).map(([tag,v]) => statBox(tag, `${v.c}/${v.t}`)).join("");
  $("reviewList").innerHTML = details.map((d,i) => {
    const correctText = d.q.options[d.q.answer];
    return `<div class="reviewItem">
      <div class="small">Question ${i+1} • ${escapeHtml(d.q.source)} • ${escapeHtml(d.q.tag)}</div>
      <div><strong>${escapeHtml(d.q.question)}</strong></div>
      <div class="${d.ok ? 'correct':'wrong'}">Your answer: ${escapeHtml(d.chosenText)}</div>
      ${d.ok ? '' : `<div class="correct">Correct answer: ${escapeHtml(correctText)}</div>`}
      <div class="explain">${escapeHtml(d.q.explanation)}</div>
      <div class="small">Reference: ${escapeHtml(d.q.reference || 'General')}</div>
    </div>`;
  }).join("");
}
function reviewMissed(){
  const s = loadStats();
  const ids = Object.keys(s.missed || {});
  if(!ids.length){ alert("No missed questions saved yet."); return; }
  const missed = BANK.filter(q => ids.includes(q.id));
  const sample = shuffle(missed).slice(0, Math.min(TEST_SIZE, missed.length)).map(q => {
    const opts = q.options.map((text, i) => ({ text, originalIndex:i }));
    return { ...q, displayOptions: shuffle(opts) };
  });
  state = { test: sample, index: 0, answers: {}, startedAt: Date.now(), remaining: TEST_SECONDS, timerId: null, submitted: false };
  show("quizScreen"); renderQuestion(); startTimer();
}
$("startBtn").addEventListener("click", makeTest);
$("newTestBtn").addEventListener("click", makeTest);
$("backHomeBtn").addEventListener("click", () => { show("startScreen"); renderStats(); });
$("reviewWrongBtn").addEventListener("click", reviewMissed);
$("prevBtn").addEventListener("click", () => { if(state.index>0){state.index--; renderQuestion();} });
$("nextBtn").addEventListener("click", () => { if(state.index<state.test.length-1){state.index++; renderQuestion();} });
$("submitBtn").addEventListener("click", () => submitTest(false));
$("resetStatsBtn").addEventListener("click", () => { if(confirm("Clear all saved NICET stats on this device?")){ localStorage.removeItem(STORAGE_KEY); renderStats(); } });
renderStats();
