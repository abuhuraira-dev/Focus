'use strict';
/* Focus v2 UI. All business rules live in core.js. */
(() => {
const C = window.FocusCore;
const { today, addDays, diff } = C;
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const KEY = 'focus-v2', TKEY = 'focus-timer';

/* ---------- state + persistence ---------- */
let modalPushed = false, ignorePop = 0;
let state, page = 'Today', sel = null, pending = null, warned = false, tickId = null, timer = null;
const filters = { owner: 'all', project: 'all', waiting: false };
const lsGet = k => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); return true; } catch { return false; } };
const lsDel = k => { try { localStorage.removeItem(k); } catch {} };

function load() { try { const r = lsGet(KEY); if (r) return C.validate(JSON.parse(r)); } catch {} return null; }
function save() {
  if (!lsSet(KEY, JSON.stringify(state)) && !warned) { warned = true; toast('Browser storage is unavailable. Export a backup before leaving.'); }
  window.dispatchEvent(new Event('focus:saved'));
}
function v1Blob() { try { const o = JSON.parse(lsGet('focus-v1')); return o && o.version === 1 ? o : null; } catch { return null; } }
const loaded = load();
state = loaded || C.blank();
window.focusWorkspace = {
  get: () => structuredClone(state),
  replace: v => { if (v && v.version === 1) v = C.importV1(v); state = C.validate(v); C.autoClose(state); save(); render(); }
};
if (C.autoClose(state)) save();

/* ---------- small helpers ---------- */
const me = () => C.member(state, state.meId) || state.members[0];
const mname = id => (C.member(state, id) || {}).name || 'Unassigned';
const initials = id => mname(id).split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();
const fmt = d => C.parse(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
const wd = d => C.parse(d).toLocaleDateString(undefined, { weekday: 'short' });
const chip = (t, c = '') => `<span class="chip ${c}">${esc(t)}</span>`;
const pill = (t, c = '') => `<span class="pill ${c}">${esc(t)}</span>`;
function toast(t) { const e = $('#toast'); e.textContent = t; e.classList.remove('hidden'); clearTimeout(toast.id); toast.id = setTimeout(() => e.classList.add('hidden'), 3800); }
function dueChip(d) {
  if (!d) return '';
  const n = diff(d, today());
  if (n < 0) return chip(-n + 'd overdue', 'over');
  if (n === 0) return chip('Due today', 'soon');
  if (n === 1) return chip('Tomorrow', 'soon');
  return chip(n < 7 ? wd(d) + ' ' + fmt(d) : fmt(d));
}
function riskPill(r) {
  return { late: pill('Late', 'over'), risk: pill('At risk', 'over'), tight: pill('Tight', 'warn'), ok: pill('On track'), done: pill('Done', 'mute'), parked: pill('Parked', 'mute') }[r] || '';
}
const opts = (list, cur) => list.map(([v, l]) => `<option value="${esc(v)}" ${String(v) === String(cur) ? 'selected' : ''}>${esc(l)}</option>`).join('');
const memberOpts = cur => opts(state.members.map(m => [m.id, m.name]), cur);
const projectOpts = cur => opts([['', 'No project']].concat(state.projects.filter(p => p.status !== 'Done' || p.id === cur).map(p => [p.id, p.name + (p.client ? ' · ' + p.client : '')])), cur);

/* ---------- modal ---------- */
function modal(title, body) {
  const m = $('#modal');
  m.innerHTML = `<div class="modalhead"><h2>${esc(title)}</h2><button data-act="close" aria-label="Close dialog">×</button></div>${body}`;
  if (!m.open) { if (!modalPushed) { try { history.pushState({ m: 1, n: (history.state && history.state.n) || 0 }, '', location.href); modalPushed = true; } catch {} } m.showModal(); }
  const a = m.querySelector('[autofocus]'); if (a) a.focus();
}
const closeModal = () => { const m = $('#modal'); if (m.open) m.close(); };
function ask(msg, yes, label = 'Confirm') {
  pending = yes;
  modal('Are you sure?', `<p>${esc(msg)}</p><div class="row"><button class="primary" data-act="ask-yes">${esc(label)}</button><button data-act="close">Cancel</button></div>`);
}

/* ---------- task row ---------- */
function taskRow(t, o = {}) {
  const p = C.proj(state, t.projectId), done = t.status === 'done';
  const why = o.why ? C.score(t, state).why.filter(w => !/^(Due |\d+d overdue|Slipped)/.test(w)).map(w => chip(w, 'why')).join(' ') : '';
  const multi = state.members.length > 1;
  return `<div class="task ${done ? 'done' : ''}">
  <input type="checkbox" data-chg="toggle" data-id="${t.id}" ${done ? 'checked' : ''} aria-label="Complete: ${esc(t.title)}">
  <div class="tbody"><button class="tlink" data-act="task" data-id="${t.id}">${o.rank ? `<span style="color:var(--muted);margin-right:6px">${o.rank}.</span>` : ''}${esc(t.title)}</button>
   <div class="meta">${p ? `<span><span class="dot" style="background:${esc(p.color)}"></span>${esc(p.name)}${p.client ? ' · ' + esc(p.client) : ''}</span>` : '<span>No project</span>'}
   ${done ? '' : dueChip(t.due)} <span>${C.est(t)}h</span>${multi ? chip(mname(t.owner), 'who') : ''}${t.repeat ? chip('↻ ' + t.repeat) : ''}${t.status === 'waiting' ? chip('Waiting' + (t.waitingOn ? ' on ' + t.waitingOn : ''), 'soon') : ''}${t.slips && !done ? chip('Slipped ' + t.slips + '×', t.slips >= 3 ? 'over' : 'soon') : ''} ${why}</div></div>
  <div class="tact">${o.actions || ''}</div></div>`;
}
const btnCommit = t => `<button class="textbtn" data-act="commit" data-id="${t.id}">＋ ${t.owner && t.owner !== state.meId ? esc(mname(t.owner)) + '’s ' : ''}Today</button>`;

/* ---------- views ---------- */
function intro(title, sub, extra = '') { return `<div class="intro"><div><h1>${title}</h1><p class="sub">${sub}</p></div><div class="row">${extra}</div></div>`; }
const views = {};

views.Today = () => {
  if (!state.projects.length && !state.tasks.length) return welcome();
  const mid = state.meId, t0 = today(), max = state.settings.maxCommit;
  const plan = C.planOf(state, t0, mid).map(id => C.task(state, id));
  const doneN = plan.filter(t => t.status === 'done').length;
  const closed = (state.closed[t0] || {})[mid];
  const now = plan.find(t => t.status === 'open');
  const last = [...state.checkins].reverse().find(c => c.memberId === mid && c.date < t0 && c.next);
  const sugg = C.ranked(state, mid).filter(r => !plan.some(p => p.id === r.t.id)).slice(0, 5);
  const chases = C.chaseDue(state, mid), stuck = C.stuck(state, mid), bills = C.overdueInvoices(state);
  const risky = state.projects.filter(p => ['late', 'risk'].includes(C.projectStats(p, state).risk));
  const att = [];
  if (state.inbox.length) att.push(`<button data-nav="Inbox">${state.inbox.length} in inbox to triage</button>`);
  if (risky.length) att.push(`<button class="over" data-nav="Projects">${risky.length} project${risky.length > 1 ? 's' : ''} at risk</button>`);
  if (bills.length) att.push(`<button class="over" data-nav="Review">${bills.length} overdue payment${bills.length > 1 ? 's' : ''}</button>`);
  if (stuck.length) att.push(`<button class="warn" data-nav="Today">${stuck.length} stuck task${stuck.length > 1 ? 's' : ''}</button>`);
  const heroBody = closed ? `<span class="eyebrow">Day closed</span><h2>You kept ${state.ledger.filter(l => l.date === t0 && l.memberId === mid && l.result === 'kept').length} of ${plan.length} commitments.</h2><p>Unfinished tasks were recorded as slipped. Tomorrow you choose a new plan.</p><div class="hero-actions"><button data-act="reopen-day">Reopen today</button></div>`
    : now ? `<span class="eyebrow">Next up</span><h2>${esc(now.title)}</h2><p class="meta">${esc((C.proj(state, now.projectId) || {}).name || 'No project')} · ${C.est(now)}h estimate ${dueChip(now.due)}</p><div class="hero-actions"><button class="lime" data-act="focus" data-id="${now.id}">▶ Focus · ${state.settings.focusMin} min</button><button data-act="done" data-id="${now.id}">✓ Mark done</button></div>`
    : plan.length ? `<span class="eyebrow">Plan complete</span><h2>Everything you committed to is done.</h2><p>Close the day to record it, or pick up another task.</p><div class="hero-actions"><button class="lime" data-act="close-day">Close the day</button></div>`
    : `<span class="eyebrow">No plan yet</span><h2>Choose up to ${max} tasks for today.</h2><p>Use the ranking below, or pick your own.</p><div class="hero-actions"><button class="lime" data-act="fill">Use the ranking</button><button data-act="new-task">＋ New task</button></div>`;
  const slots = Array.from({ length: Math.max(0, max - plan.length) }, () => `<div class="slot">Empty slot</div>`).join('');
  return intro('Today', `${new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })} · ${esc(me().name)}`, pill(`${doneN} of ${plan.length} done`, 'mute')) +
    (state.demo ? `<div class="notice">This is sample data. <button class="textbtn" data-act="clear-demo" style="color:#46592c;text-decoration:underline">Clear it and start your own workspace</button></div>` : '') +
    (last ? `<div class="notice"><strong>Your note from last time:</strong> ${esc(last.next)}</div>` : '') +
    (att.length ? `<div class="attn">${att.join('')}</div>` : '') +
    `<div class="grid"><div>
     <div class="hero">${heroBody}</div>
     <div class="sectionhead"><h2>Today’s plan <span style="color:var(--muted);font-size:12px">${plan.length} of ${max}</span></h2>${!closed && plan.length ? `<button class="textbtn" data-act="close-day">Close the day →</button>` : ''}</div>
     <div class="card flush">${plan.map(t => taskRow(t, { actions: closed || t.status === 'done' ? '' : `<button class="textbtn" data-act="focus" data-id="${t.id}">▶ Focus</button><button class="textbtn" data-act="uncommit" data-id="${t.id}" aria-label="Remove from today">×</button>` })).join('')}${closed ? '' : slots}${!plan.length && closed ? '<div class="empty">Nothing was committed today.</div>' : ''}</div>
     ${!closed && plan.length < max ? `<div class="sectionhead"><h2>Suggested tasks</h2><button class="textbtn" data-nav="Priorities">Full ranking →</button></div><div class="card flush">${sugg.map((r, i) => taskRow(r.t, { why: true, actions: btnCommit(r.t) })).join('') || '<div class="empty">No open tasks. Capture something, or enjoy the quiet.</div>'}</div>` : ''}
    </div><div class="stack">
     ${chases.length ? `<div class="card"><h2>Follow up today</h2><p class="sub" style="font-size:12px;margin:4px 0 6px">Tasks waiting on someone else.</p>${chases.map(t => `<div class="task"><div class="tbody"><button class="tlink" data-act="task" data-id="${t.id}">${esc(t.title)}</button><div class="meta">Waiting on ${esc(t.waitingOn || '—')} · chase ${esc(t.chase)}</div></div><div class="tact"><button class="textbtn" data-act="chased" data-id="${t.id}">Chased +3d</button><button class="textbtn" data-act="unwait" data-id="${t.id}">Got reply</button></div></div>`).join('')}</div>` : ''}
     ${bills.length ? `<div class="card"><h2>Overdue payments</h2>${bills.map(({ p, i }) => `<div class="task"><div class="tbody"><strong>${esc(i.currency)} ${C.bal(i).toLocaleString()}</strong> · ${esc(p.client || p.name)}<div class="meta">${esc(i.label || 'Invoice')} · due ${esc(i.due)} (${diff(t0, i.due)}d late)</div></div><div class="tact"><button class="textbtn" data-act="chase-money" data-pid="${p.id}" data-iid="${i.id}">Create follow-up</button></div></div>`).join('')}</div>` : ''}
     ${stuck.length ? `<div class="card"><h2>Stuck tasks</h2><p class="sub" style="font-size:12px;margin:4px 0 6px">Slipped three times. Make it smaller, reassign it, or drop it.</p>${stuck.map(t => `<div class="task"><div class="tbody"><button class="tlink" data-act="task" data-id="${t.id}">${esc(t.title)}</button><div class="meta">${chip('Slipped ' + t.slips + '×', 'over')} ${esc(mname(t.owner))}</div></div><div class="tact"><button class="textbtn" data-act="reshape" data-id="${t.id}">Reshape</button><button class="textbtn" data-act="drop" data-id="${t.id}">Drop</button></div></div>`).join('')}</div>` : ''}
     ${todayStats()}
    </div></div>`;
};
function todayStats() {
  const t0 = today(), mins = state.sessions.filter(s => s.date === t0 && s.memberId === state.meId).reduce((a, s) => a + s.minutes, 0);
  const wk = addDays(t0, -6), kr = C.keepRate(state, state.meId, wk);
  return `<div class="card"><span class="eyebrow">Your record</span><div class="row between" style="margin-top:10px"><div><strong style="font-size:26px">${kr.pct === null ? '—' : kr.pct + '%'}</strong><div class="sub" style="font-size:11.5px">commitments kept in 7 days${kr.total ? ` (${kr.kept}/${kr.total})` : ''}</div></div><div><strong style="font-size:26px">${mins}</strong><div class="sub" style="font-size:11.5px">focus minutes today</div></div></div></div>`;
}
function welcome() {
  const old = v1Blob();
  return intro('Welcome to Focus', 'Plan your day, track deadlines, and see which projects are at risk.') +
    `<div class="grid"><div class="card"><h2>Get started</h2><p class="sub" style="margin:8px 0 16px">Add a project with its deadline and tasks, or load sample data to look around first.</p><div class="row"><button class="primary" data-act="new-project">＋ Add your first project</button><button data-act="load-demo">Load sample data</button>${old ? `<button class="lime" data-act="import-v1">Import my Focus v1 data</button>` : ''}</div>${old ? `<p class="sub" style="font-size:12px;margin-top:12px">Found Focus v1 data in this browser: ${old.projects.length} projects, ${(old.clients || []).length} client projects. Import copies it; v1 stays untouched.</p>` : ''}</div>
    <div class="card"><h2>How it works</h2><ol style="padding-left:18px;margin:10px 0 0;line-height:1.8"><li>Add projects, tasks and deadlines.</li><li>Each morning, choose up to three tasks for the day.</li><li>Projects show a warning when the work left will not fit the time left.</li><li>At the end of the day, close it to record what you finished.</li></ol></div></div>`;
}

views.Inbox = () => intro('Inbox', 'Quick notes waiting to become tasks.') +
  `<div class="card"><form data-form="capture" class="row" style="flex-wrap:nowrap"><input name="text" placeholder="New request, idea, or reminder…" required maxlength="300" aria-label="New inbox item" style="margin:0"><button class="primary">Add</button></form></div>
  <div class="sectionhead"><h2>To triage <span class="pill">${state.inbox.length}</span></h2></div>
  <div class="card flush">${[...state.inbox].reverse().map(x => `<div class="task"><div class="tbody">${esc(x.text)}<div class="meta">${new Date(x.created).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</div></div><div class="tact"><button class="primary" data-act="triage" data-id="${x.id}">Make task</button><button class="textbtn" data-act="inbox-drop" data-id="${x.id}">Discard</button></div></div>`).join('') || '<div class="empty">Inbox is empty. Press C anywhere to add a note.</div>'}</div>`;

views.Priorities = () => {
  let list = C.ranked(state, filters.owner === 'all' ? null : filters.owner);
  if (filters.project !== 'all') list = list.filter(r => r.t.projectId === filters.project);
  const waiting = state.tasks.filter(t => t.status === 'waiting' && (filters.owner === 'all' || t.owner === filters.owner));
  return intro('Tasks', 'All open tasks, ranked by deadline, importance and project risk.', `<button class="primary" data-act="new-task">＋ New task</button>`) +
    `<div class="row" style="margin-bottom:14px"><label class="check">Owner <select data-filter="owner" style="margin:0 0 0 6px;width:auto">${opts([['all', 'Everyone']].concat(state.members.map(m => [m.id, m.name])), filters.owner)}</select></label><label class="check">Project <select data-filter="project" style="margin:0 0 0 6px;width:auto">${opts([['all', 'All projects']].concat(state.projects.map(p => [p.id, p.name])), filters.project)}</select></label></div>
    <div class="card flush">${list.map((r, i) => taskRow(r.t, { rank: i + 1, why: true, actions: btnCommit(r.t) })).join('') || '<div class="empty">No open tasks match.</div>'}</div>
    ${waiting.length ? `<div class="sectionhead"><h2>Waiting on others <span class="pill">${waiting.length}</span></h2></div><div class="card flush">${waiting.map(t => taskRow(t, { actions: `<button class="textbtn" data-act="unwait" data-id="${t.id}">Got reply</button>` })).join('')}</div>` : ''}`;
};

views.Projects = () => {
  const p = sel && C.proj(state, sel);
  if (p) return projectDetail(p);
  const groups = [['Active', state.projects.filter(x => ['Active', 'Waiting', 'Blocked'].includes(x.status))], ['Parked', state.projects.filter(x => x.status === 'Parked')], ['Delivered', state.projects.filter(x => x.status === 'Done')]];
  const order = { late: 0, risk: 1, tight: 2, ok: 3, none: 4 };
  return intro('Projects', 'Each project shows whether the work left fits the time left.', `<button class="primary" data-act="new-project">＋ Project</button>`) +
    groups.map(([g, list]) => list.length || g === 'Active' ? `<div class="sectionhead"><h2>${g} <span class="pill mute">${list.length}</span></h2></div><div class="pgrid">${list.sort((a, b) => (order[C.projectStats(a, state).risk] ?? 5) - (order[C.projectStats(b, state).risk] ?? 5)).map(pcard).join('') || '<div class="card empty">No projects yet.</div>'}</div>` : '').join('');
};
function pcard(p) {
  const st = C.projectStats(p, state), out = (p.invoices || []).reduce((a, i) => a + (i.sent === false ? 0 : C.bal(i)), 0), cur = ((p.invoices || [])[0] || {}).currency;
  return `<button class="card pcard" data-act="open-project" data-id="${p.id}"><div class="row between" style="align-items:flex-start"><strong style="font-size:15.5px"><span class="dot" style="background:${esc(p.color)}"></span>${esc(p.name)}</strong>${riskPill(st.risk)}</div>
  <div class="sub" style="font-size:12px;margin:2px 0 12px">${esc(p.client || (p.type === 'internal' ? 'Internal' : ''))}${p.status !== 'Active' && p.status !== 'Done' && p.status !== 'Parked' ? ' · ' + esc(p.status) : ''}</div>
  <div class="progress ${st.risk === 'late' || st.risk === 'risk' ? 'over' : st.risk === 'tight' ? 'warn' : ''}"><i style="width:${st.pct}%"></i></div>
  <div class="row between meta" style="margin-top:9px"><span>${st.done}/${st.total} done · ${C.projectStats(p, state).remainingH}h left</span><span>${p.due ? 'Delivery ' + fmt(p.due) : 'No deadline'}</span></div>
  ${out ? `<div class="meta" style="margin-top:6px">${esc(cur || '')} ${out.toLocaleString()} outstanding ${(p.invoices || []).some(C.invOverdue) ? chip('overdue', 'over') : ''}</div>` : ''}</button>`;
}
function projectDetail(p) {
  const st = C.projectStats(p, state), ts = state.tasks.filter(t => t.projectId === p.id && t.status !== 'dropped');
  const open = ts.filter(t => t.status === 'open').map(t => ({ t, ...C.score(t, state) })).sort((a, b) => b.n - a.n).map(x => x.t);
  return `<div class="intro"><div><button class="textbtn" data-act="back">← All projects</button><h1><span class="dot" style="background:${esc(p.color)};width:16px;height:16px"></span>${esc(p.name)}</h1><p class="sub">${esc(p.client || (p.type === 'internal' ? 'Internal project' : ''))} · ${esc(p.status)} ${riskPill(st.risk)}</p></div><div class="row"><button data-act="edit-project" data-id="${p.id}">Edit</button><button class="primary" data-act="new-task" data-pid="${p.id}">＋ Task</button></div></div>
  ${st.why ? `<div class="notice ${st.risk === 'late' || st.risk === 'risk' ? 'over' : st.risk === 'tight' ? 'warn' : ''}"><strong>${st.risk === 'late' ? 'Late' : st.risk === 'risk' ? 'At risk' : st.risk === 'tight' ? 'Tight' : 'Outlook'}:</strong> ${esc(st.why)}. Delivery ${esc(p.due)}.${st.risk === 'risk' || st.risk === 'late' ? ' Options: cut scope, reassign work, or agree a new date with the client.' : ''}</div>` : ''}
  ${p.notes ? `<div class="notice" style="white-space:pre-line">${esc(p.notes)}</div>` : ''}
  <div class="grid"><div>
   <div class="sectionhead"><h2>Open tasks <span class="pill">${open.length}</span></h2></div><div class="card flush">${open.map(t => taskRow(t, { actions: btnCommit(t) })).join('') || '<div class="empty">No open tasks.</div>'}</div>
   ${ts.some(t => t.status === 'waiting') ? `<div class="sectionhead"><h2>Waiting</h2></div><div class="card flush">${ts.filter(t => t.status === 'waiting').map(t => taskRow(t, { actions: `<button class="textbtn" data-act="unwait" data-id="${t.id}">Got reply</button>` })).join('')}</div>` : ''}
   ${ts.some(t => t.status === 'done') ? `<details style="margin-top:20px"><summary style="cursor:pointer;color:var(--muted)">${st.done} completed</summary><div class="card flush" style="margin-top:10px">${ts.filter(t => t.status === 'done').map(t => taskRow(t)).join('')}</div></details>` : ''}
  </div><div>
   <div class="sectionhead"><h2>Money</h2><button class="textbtn" data-act="new-invoice" data-pid="${p.id}">＋ Invoice</button></div>
   <div class="card flush">${(p.invoices || []).map(i => { const b = C.bal(i); return `<div class="task"><div class="tbody"><strong>${esc(i.currency)} ${Number(i.amount).toLocaleString()}</strong> · ${esc(i.label || 'Invoice')}<div class="meta">${i.sent === false ? chip('Not sent') : b === 0 ? chip('Paid', 'why') : chip(i.currency + ' ' + b.toLocaleString() + ' left', C.invOverdue(i) ? 'over' : '')} ${i.due ? 'due ' + esc(i.due) : ''}</div></div><div class="tact"><button class="textbtn" data-act="edit-invoice" data-pid="${p.id}" data-iid="${i.id}">Edit</button></div></div>`; }).join('') || '<div class="empty">No invoices. Payment tracking is manual.</div>'}</div>
  </div></div>`;
}

views.Deadlines = () => {
  const items = C.deadlineItems(state), t0 = today(), end = addDays(t0, 7);
  const load = C.loadByDay(state, 14);
  const g = [['Overdue', x => x.date < t0], ['Today', x => x.date === t0], ['Next 7 days', x => x.date > t0 && x.date <= end], ['Later', x => x.date > end]];
  return intro('Deadlines', 'Deliveries, tasks, payments and follow-ups by date.') +
    `<div class="card" style="margin-bottom:6px"><div class="row between"><h2>Next 14 days · estimated work due</h2><span class="sub" style="font-size:12px">Red = more hours due than team capacity</span></div><div class="strip" style="margin-top:14px">${load.map(d => `<div class="day ${d.work ? '' : 'off'} ${d.over ? 'over' : ''}" title="${d.hours}h due, ${d.cap}h capacity">${wd(d.date)}<b>${C.parse(d.date).getDate()}</b>${d.hours}h<div class="bar"><i style="width:${d.cap ? Math.min(100, d.hours / d.cap * 100) : d.hours ? 100 : 0}%"></i></div></div>`).join('')}</div></div>` +
    g.map(([name, f]) => { const rows = items.filter(f); return `<div class="sectionhead"><h2>${name} <span class="pill ${name === 'Overdue' && rows.length ? 'over' : 'mute'}">${rows.length}</span></h2></div><div class="card flush">${rows.map(x => `<div class="task"><span class="pill ${x.type === 'Payment' ? 'warn' : x.type === 'Delivery' ? 'dark' : 'mute'}" style="min-width:68px;text-align:center">${x.type}</span><div class="tbody"><button class="tlink" data-act="${x.tid ? 'task' : 'open-project'}" data-id="${x.tid || x.pid}">${esc(x.title)}</button><div class="meta">${esc(x.sub || '')}${x.owner && state.members.length > 1 ? ' · ' + esc(mname(x.owner)) : ''}</div></div>${dueChip(x.date)}<span class="sub" style="font-size:12px;min-width:48px;text-align:right">${fmt(x.date)}</span></div>`).join('') || '<div class="empty" style="padding:14px">Nothing here.</div>'}</div>`; }).join('');
};

views.Team = () => {
  const t0 = today(), wk = addDays(t0, -6), mon = addDays(t0, -29);
  const rows = state.members.map(m => {
    const plan = C.planOf(state, t0, m.id).map(id => C.task(state, id)), kr = C.keepRate(state, m.id, wk), ot = C.onTimeRate(state, mon, m.id);
    const mine = state.tasks.filter(t => t.owner === m.id);
    const over = mine.filter(t => t.status === 'open' && t.due && t.due < t0).length;
    return { m, plan, kr, ot, open: mine.filter(t => t.status === 'open').length, over, stuck: C.stuck(state, m.id).length, wait: mine.filter(t => t.status === 'waiting').length, mins: state.sessions.filter(s => s.memberId === m.id && s.date >= wk).reduce((a, s) => a + s.minutes, 0), closed: (state.closed[t0] || {})[m.id] };
  });
  const unassigned = state.tasks.filter(t => t.status === 'open' && !C.member(state, t.owner)).length;
  const pc = x => x === null ? '—' : x + '%';
  return intro('Team', 'What each person planned and finished, from closed days.', `<button data-act="settings">Manage members</button>`) +
    (unassigned ? `<div class="notice warn">${unassigned} open task${unassigned > 1 ? 's have' : ' has'} no owner. Unowned work is the first thing to slip.</div>` : '') +
    `<div class="card"><div class="tablewrap"><table class="team-table"><thead><tr><th>Person</th><th>Today</th><th>Kept (7d)</th><th>On time (30d)</th><th>Open</th><th>Overdue</th><th>Stuck</th><th>Waiting</th><th>Focus 7d</th></tr></thead><tbody>${rows.map(r => `<tr><td data-l="Person"><strong>${esc(r.m.name)}</strong>${r.m.id === state.meId ? ' ' + pill('you', 'mute') : ''}</td><td data-l="Today">${r.plan.length ? `${r.plan.filter(t => t.status === 'done').length}/${r.plan.length} done` + (r.closed ? ' ✓' : '') : '<span class="sub">Not committed</span>'}</td><td data-l="Kept (7d)">${pc(r.kr.pct)}${r.kr.total ? `<div class="sub" style="font-size:11px">${r.kr.kept}/${r.kr.total}</div>` : ''}</td><td data-l="On time (30d)">${pc(r.ot.pct)}${r.ot.total ? `<div class="sub" style="font-size:11px">${r.ot.ok}/${r.ot.total}</div>` : ''}</td><td data-l="Open">${r.open}</td><td data-l="Overdue">${r.over ? pill(r.over, 'over') : 0}</td><td data-l="Stuck">${r.stuck ? pill(r.stuck, 'warn') : 0}</td><td data-l="Waiting">${r.wait}</td><td data-l="Focus 7d">${Math.round(r.mins / 60 * 10) / 10}h</td></tr>`).join('')}</tbody></table></div></div>
  <div class="sectionhead"><h2>Daily standup</h2><button data-act="copy-standup">Copy text</button></div><pre class="standup" id="standup">${esc(C.standup(state))}</pre>
  <p class="sub" style="font-size:12px">Members are names in this workspace, not separate logins.</p>`;
};

views.Review = () => {
  const t0 = today(), wk = addDays(t0, -6), mon = addDays(t0, -29);
  const kr = C.keepRate(state, null, wk), ot = C.onTimeRate(state, mon), money = C.outstanding(state);
  const doneWk = state.tasks.filter(t => t.status === 'done' && t.doneAt >= wk).length, mins = state.sessions.filter(s => s.date >= wk).reduce((a, s) => a + s.minutes, 0);
  const days = Array.from({ length: 14 }, (_, i) => addDays(t0, i - 13)).map(d => { const r = C.keepRate(state, null, d), rows = state.ledger.filter(l => l.date === d); const k = rows.filter(l => l.result === 'kept').length; return { d, n: rows.length, pct: rows.length ? Math.round(k / rows.length * 100) : null }; });
  const slippy = [...state.tasks].filter(t => t.status === 'open' && t.slips).sort((a, b) => b.slips - a.slips).slice(0, 5);
  const risky = state.projects.map(p => ({ p, st: C.projectStats(p, state) })).filter(x => ['late', 'risk', 'tight'].includes(x.st.risk));
  const cur = Object.entries(money);
  return intro('Review', 'Last 7 and 30 days.', `<button class="primary" data-act="weekly">Add weekly note</button>`) +
    `<div class="stats"><div class="stat"><span class="eyebrow">Commitments kept · 7d</span><strong>${kr.pct === null ? '—' : kr.pct + '%'}</strong><small>${kr.total ? kr.kept + ' of ' + kr.total + ' promised' : 'Close a day to start the record'}</small></div><div class="stat"><span class="eyebrow">Delivered on time · 30d</span><strong>${ot.pct === null ? '—' : ot.pct + '%'}</strong><small>${ot.total ? ot.ok + ' of ' + ot.total + ' dated tasks' : 'No dated tasks finished yet'}</small></div><div class="stat"><span class="eyebrow">Tasks finished · 7d</span><strong>${doneWk}</strong><small>across the team</small></div><div class="stat"><span class="eyebrow">Focus time · 7d</span><strong>${Math.round(mins / 6) / 10}h</strong><small>${mins} minutes in sessions</small></div></div>
    <div class="grid"><div class="stack">
     <div class="card"><h2>Commitments kept per day</h2><div class="bars" style="margin-top:16px">${days.map(x => `<div title="${x.d}: ${x.pct === null ? 'no commitments' : x.pct + '%'}"><i class="${x.pct === null ? 'none' : x.pct < 50 ? 'bad' : x.pct < 80 ? 'low' : ''}" style="height:${x.pct === null ? 4 : Math.max(4, x.pct * .7)}px"></i>${C.parse(x.d).getDate()}</div>`).join('')}</div></div>
     <div class="card"><h2>Most slipped tasks</h2>${slippy.length ? slippy.map(t => taskRow(t)).join('') : '<p class="sub" style="margin-top:8px">No slipped tasks.</p>'}</div>
     <div class="card"><h2>Daily notes</h2>${[...state.checkins].reverse().slice(0, 8).map(x => `<div class="history"><small>${esc(x.date)} · ${esc(mname(x.memberId))} · energy ${esc(x.energy)}/5</small><p style="margin:4px 0 0"><strong>Win:</strong> ${esc(x.win || '—')}${x.blocker ? `<br><strong>Blocked:</strong> ${esc(x.blocker)}` : ''}<br><strong>Next:</strong> ${esc(x.next || '—')}</p></div>`).join('') || '<p class="sub" style="margin-top:8px">Notes from closing the day appear here.</p>'}</div>
    </div><div class="stack">
     <div class="card"><h2>Projects at risk</h2>${risky.map(({ p, st }) => `<div class="task"><div class="tbody"><button class="tlink" data-act="open-project" data-id="${p.id}">${esc(p.name)}</button><div class="meta">${esc(p.client)} · ${esc(st.why)}</div></div>${riskPill(st.risk)}</div>`).join('') || '<p class="sub" style="margin-top:8px">No active project is at risk.</p>'}</div>
     <div class="card"><h2>Cash outstanding</h2><p class="sub" style="font-size:12px;margin:4px 0 8px">Manual records. Currencies are never added together.</p>${cur.map(([c, v]) => `<div class="row between" style="padding:8px 0;border-bottom:1px solid #eef0e8"><strong>${esc(c)} ${v.out.toLocaleString()}</strong>${v.overdue ? pill(c + ' ' + v.overdue.toLocaleString() + ' overdue', 'over') : pill('none overdue')}</div>`).join('') || '<p class="sub">No unpaid invoices.</p>'}</div>
     <div class="card"><h2>Weekly notes</h2>${[...state.reviews].reverse().map(x => `<div class="history"><small>${esc(x.date)}</small><p style="margin:3px 0 0;white-space:pre-line">${esc(x.note)}</p></div>`).join('') || '<p class="sub" style="margin-top:8px">No weekly review yet.</p>'}</div>
    </div></div>`;
};

/* ---------- routing: real history so the phone Back button works ---------- */
const slug = { Today: 'today', Inbox: 'inbox', Priorities: 'tasks', Projects: 'projects', Deadlines: 'deadlines', Team: 'team', Review: 'review' };
const unslug = Object.fromEntries(Object.entries(slug).map(([k, v]) => [v, k]));
const hashFor = (p, s) => '#/' + slug[p] + (s ? '/' + s : '');
function parseHash() { const m = location.hash.match(/^#\/([a-z]+)(?:\/([\w-]+))?/); const p = m && unslug[m[1]]; return p ? { page: p, sel: m[2] || null } : { page: 'Today', sel: null }; }
const scrolls = {};
function enter() { const v = $('#view'); v.classList.remove('enter'); void v.offsetWidth; v.classList.add('enter'); }
function go(p, s = null, o = {}) {
  if (page === p && sel === s && !o.replace) { window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
  scrolls[hashFor(page, sel)] = window.scrollY;
  const n = (history.state && history.state.n) || 0, h = hashFor(p, s);
  try {
    if (modalPushed) { history.replaceState({ n: n + 1 }, '', h); modalPushed = false; }
    else if (o.replace) history.replaceState({ n }, '', h);
    else history.pushState({ n: n + 1 }, '', h);
  } catch {}
  page = p; sel = s; enter(); render(); window.scrollTo(0, 0);
}
window.addEventListener('popstate', () => {
  if (ignorePop > 0) { ignorePop--; return; }
  const m = $('#modal');
  if (modalPushed) { modalPushed = false; if (m.open) m.close(); }
  const r = parseHash(); if (r.sel && !C.proj(state, r.sel)) r.sel = null;
  if (r.page !== page || r.sel !== sel) { scrolls[hashFor(page, sel)] = window.scrollY; page = r.page; sel = r.sel; enter(); render(); window.scrollTo(0, scrolls[hashFor(page, sel)] || 0); }
});
$('#modal').addEventListener('close', () => setTimeout(() => {
  if (!$('#modal').open && modalPushed) { modalPushed = false; ignorePop++; try { history.back(); } catch { ignorePop--; } }
}, 0));

/* ---------- shell render ---------- */
const tabs = [['Today', 'Today'], ['Inbox', 'Inbox'], ['Priorities', 'Tasks'], ['Projects', 'Projects'], ['Deadlines', 'Deadlines'], ['Team', 'Team'], ['Review', 'Review']];
const label = p => (tabs.find(t => t[0] === p) || [p, p])[1];
const ico = {
  Today: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="2.5"/>',
  Inbox: '<path d="M4 13l2-7h12l2 7v5H4z"/><path d="M4 13h4l1 2h6l1-2h4"/>',
  Priorities: '<path d="M5 7h14M5 12h14M5 17h9"/>',
  Projects: '<rect x="4" y="5" width="16" height="14" rx="2"/><path d="M4 10h16"/>',
  More: '<circle cx="6" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="18" cy="12" r="1.2"/>'
};
function render() {
  const risk = state.projects.filter(p => ['late', 'risk'].includes(C.projectStats(p, state).risk)).length;
  const badge = { Inbox: state.inbox.length ? `<span class="count">${state.inbox.length}</span>` : '', Projects: risk ? `<span class="count red">${risk}</span>` : '' };
  $('#nav').innerHTML = tabs.map(([n, l]) => `<button data-nav="${n}" class="${page === n ? 'active' : ''}" aria-current="${page === n ? 'page' : 'false'}"><span>${l}</span>${badge[n] || ''}</button>`).join('');
  const bn = ['Today', 'Inbox', 'Priorities', 'Projects'].map(n => `<button data-nav="${n}" class="${page === n ? 'active' : ''}" aria-current="${page === n ? 'page' : 'false'}"><svg viewBox="0 0 24 24" aria-hidden="true">${ico[n]}</svg>${label(n)}${n === 'Inbox' && state.inbox.length ? `<span class="count">${state.inbox.length}</span>` : ''}</button>`);
  const moreActive = ['Deadlines', 'Team', 'Review'].includes(page);
  bn.push(`<button data-act="more" class="${moreActive ? 'active' : ''}"><svg viewBox="0 0 24 24" aria-hidden="true">${ico.More}</svg>${moreActive ? label(page) : 'More'}</button>`);
  $('#bottomnav').innerHTML = bn.join('');
  $('#crumb').textContent = label(page);
  document.title = label(page) + ' · Focus';
  $('#viewas').innerHTML = memberOpts(state.meId);
  $('#view').innerHTML = views[page]();
  renderTimerBar();
}

/* ---------- forms ---------- */
const lineup = (o = {}) => ({ title: '', projectId: '', owner: state.meId, due: '', prio: 2, est: 1, repeat: '', notes: '', ...o });
function taskForm(id, defaults) {
  const t = id ? C.task(state, id) : lineup(defaults);
  modal(id ? 'Edit task' : 'New task', `<form data-form="task" data-id="${id || ''}"><label class="field">Task<input name="title" required maxlength="300" value="${esc(t.title)}" autofocus></label>
  <div class="formgrid"><label class="field">Project<select name="projectId">${projectOpts(t.projectId)}</select></label><label class="field">Owner<select name="owner">${memberOpts(t.owner)}</select></label>
  <label class="field">Due date<input type="date" name="due" value="${esc(t.due)}"></label><label class="field">Importance<select name="prio">${opts([[1, 'Must — can’t slip'], [2, 'Should'], [3, 'Could — nice to have']], t.prio)}</select></label>
  <label class="field">Estimate (hours)<input type="number" name="est" min="0.25" max="200" step="0.25" value="${esc(t.est)}"></label><label class="field">Repeats<select name="repeat">${opts([['', 'Does not repeat'], ['daily', 'Every workday'], ['weekly', 'Weekly'], ['monthly', 'Monthly']], t.repeat)}</select></label></div>
  <label class="field">Notes<textarea name="notes" maxlength="2000">${esc(t.notes || '')}</textarea></label>
  <div class="row"><button class="primary">Save task</button>${id ? `<button type="button" data-act="wait" data-id="${id}">Waiting on someone…</button><button type="button" class="danger" data-act="drop" data-id="${id}">Drop</button>` : ''}</div></form>`);
}
function projectForm(id) {
  const p = id ? C.proj(state, id) : { name: '', client: '', type: 'client', status: 'Active', due: '', color: '#e9eddf', notes: '' };
  const colors = ['#e9eddf', '#eee9fd', '#e6eefb', '#faecdf', '#f3e4e1', '#e4f0ef', '#d8f36a', '#f3dd8a'];
  modal(id ? 'Edit project' : 'New project', `<form data-form="project" data-id="${id || ''}"><label class="field">Project name<input name="name" required maxlength="160" value="${esc(p.name)}" autofocus></label>
  <div class="formgrid"><label class="field">Client<input name="client" maxlength="120" value="${esc(p.client)}" placeholder="Leave empty if internal"></label><label class="field">Type<select name="type">${opts([['client', 'Client work'], ['internal', 'Internal / personal']], p.type)}</select></label>
  <label class="field">Delivery deadline<input type="date" name="due" value="${esc(p.due)}"></label><label class="field">Status<select name="status">${opts(['Active', 'Waiting', 'Blocked', 'Parked', 'Done'].map(x => [x, x === 'Done' ? 'Done (delivered)' : x]), p.status)}</select></label></div>
  <label class="field">Colour<select name="color">${opts(colors.map(c => [c, c]), p.color)}</select></label>
  <label class="field">Notes: scope, approvals, obstacles<textarea name="notes" maxlength="3000">${esc(p.notes)}</textarea></label>
  <div class="row"><button class="primary">Save project</button>${id ? `<button type="button" class="danger" data-act="del-project" data-id="${id}">Delete project</button>` : ''}</div></form>`);
}
function invoiceForm(pid, iid) {
  const p = C.proj(state, pid), i = (p.invoices || []).find(x => x.id === iid) || { label: '', amount: 0, paid: 0, currency: (p.invoices || [])[0]?.currency || 'EUR', due: '', sent: true };
  modal(iid ? 'Edit invoice' : 'New invoice', `<form data-form="invoice" data-pid="${pid}" data-iid="${iid || ''}"><label class="field">Label<input name="label" maxlength="80" value="${esc(i.label)}" placeholder="Deposit, Final, Month 1…"></label>
  <div class="formgrid"><label class="field">Amount<input type="number" name="amount" min="0" step="0.01" required value="${esc(i.amount)}"></label><label class="field">Currency<input name="currency" required minlength="3" maxlength="3" pattern="[A-Za-z]{3}" value="${esc(i.currency)}"></label><label class="field">Amount received so far<input type="number" name="paid" min="0" step="0.01" value="${esc(i.paid)}"></label><label class="field">Payment due<input type="date" name="due" value="${esc(i.due)}"></label></div>
  <label class="check" style="margin:8px 0 16px"><input type="checkbox" name="sent" ${i.sent !== false ? 'checked' : ''}> Already sent to the client</label>
  <div class="row"><button class="primary">Save invoice</button>${iid ? `<button type="button" class="danger" data-act="del-invoice" data-pid="${pid}" data-iid="${iid}">Delete</button>` : ''}</div></form>`);
}
function triageForm(id) {
  const x = state.inbox.find(i => i.id === id); if (!x) return;
  taskForm(null, { title: x.text });
  $('#modal').querySelector('form').dataset.inbox = id;
}
function waitForm(id) {
  const t = C.task(state, id);
  modal('Waiting on someone', `<form data-form="wait" data-id="${id}"><p class="sub">${esc(t.title)}</p><label class="field">Waiting on<input name="on" required maxlength="120" value="${esc(t.waitingOn || '')}" placeholder="Client, supplier, teammate…" autofocus></label><label class="field">Chase on<input type="date" name="chase" required value="${esc(t.chase || addDays(today(), 3))}"></label><button class="primary">Park it until then</button></form>`);
}
function reshapeForm(id) {
  const t = C.task(state, id);
  modal('Reshape a stuck task', `<form data-form="reshape" data-id="${id}"><p class="notice warn">“${esc(t.title)}” has slipped ${t.slips} times. Don’t commit to it again unchanged. Make it smaller, or give it a new owner or date.</p><label class="field">Rewrite as a smaller next step<input name="title" required maxlength="300" value="${esc(t.title)}"></label><div class="formgrid"><label class="field">New estimate (hours)<input type="number" name="est" min="0.25" step="0.25" value="${Math.min(2, C.est(t))}"></label><label class="field">Owner<select name="owner">${memberOpts(t.owner)}</select></label></div><label class="field">What was in the way?<input name="why" required maxlength="200" placeholder="Unclear brief, waiting on assets…"></label><button class="primary">Save and reset slips</button></form>`);
}
function closeDayForm() {
  const t0 = today(), mid = state.meId, plan = C.planOf(state, t0, mid).map(id => C.task(state, id));
  modal('Close the day', `<p class="sub">${esc(me().name)} · ${esc(t0)}</p>${plan.length ? `<div class="card flush" style="margin-bottom:6px">${plan.map(t => `<div class="task"><div class="tbody">${esc(t.title)}<div class="meta">${t.status === 'done' ? chip('Done', 'why') : chip('Not done: will count as slipped', 'soon')}</div></div></div>`).join('')}</div>` : '<p class="notice">Nothing was committed today.</p>'}
  <form data-form="close-day"><label class="field">What did you finish?<textarea name="win" maxlength="500"></textarea></label><label class="field">What got in the way? (optional)<input name="blocker" maxlength="300"></label><div class="formgrid"><label class="field">First action tomorrow<input name="next" required maxlength="300"></label><label class="field">Energy 1–5<input type="number" name="energy" min="1" max="5" value="3" required></label></div><button class="primary">Close day</button></form>`);
}
function settingsModal() {
  const s = state.settings, days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  modal('Settings & data', `<form data-form="settings"><h3>Team</h3><p class="sub" style="font-size:12px">Names used for owners and the team view.</p>${state.members.map(m => `<div class="row" style="flex-wrap:nowrap;margin-top:8px"><input name="m_${m.id}" value="${esc(m.name)}" required maxlength="40" aria-label="Member name" style="margin:0">${state.members.length > 1 ? `<button type="button" class="textbtn danger" data-act="del-member" data-id="${m.id}">Remove</button>` : ''}</div>`).join('')}<button type="button" class="textbtn" data-act="add-member" style="margin-top:6px">＋ Add person</button>
  <h3 style="margin-top:20px">Working rhythm</h3><div class="formgrid"><label class="field">Productive hours / person / day<input type="number" name="capacity" min="1" max="12" step="0.5" value="${s.capacity}"></label><label class="field">Daily commitments (the “three”)<input type="number" name="maxCommit" min="1" max="5" value="${s.maxCommit}"></label><label class="field">Focus session minutes<input type="number" name="focusMin" min="5" max="120" value="${s.focusMin}"></label></div>
  <div style="margin:4px 0 12px">${days.map((d, i) => `<label class="check"><input type="checkbox" name="wd" value="${i}" ${s.workdays.includes(i) ? 'checked' : ''}> ${d}</label>`).join('')}</div><button class="primary">Save settings</button></form>
  <h3 style="margin-top:24px">Data</h3><p class="notice">Stored in this browser only. Export regularly. Cloud sync (Account &amp; sync) is manual, replaces the whole workspace, and is not live team collaboration.</p>
  <div class="row"><button data-act="export">Export backup</button><button data-act="load-demo">Load example data</button><button class="danger" data-act="reset">Erase everything</button></div>
  <label class="field">Restore a backup (Focus v2 or v1)<input type="file" id="restore" accept="application/json"></label><div id="restore-msg" class="sub"></div>`);
}
function captureModal() { modal('Capture', `<form data-form="capture-modal"><label class="field">What’s on your mind?<textarea name="text" required maxlength="300" autofocus></textarea></label><button class="primary">Save to inbox</button></form>`); }

const forms = {
  task(f, form) {
    const id = form.dataset.id, v = Object.fromEntries(f);
    const data = { title: v.title.trim(), projectId: v.projectId, owner: v.owner, due: v.due, prio: Number(v.prio), est: Number(v.est) || 1, repeat: v.repeat, notes: v.notes };
    if (id) Object.assign(C.task(state, id), data);
    else { state.tasks.push({ id: C.uid(), status: 'open', doneAt: null, slips: 0, created: Date.now(), waitingOn: '', chase: '', ...data }); if (form.dataset.inbox) state.inbox = state.inbox.filter(x => x.id !== form.dataset.inbox); }
    done(id ? 'Task saved.' : 'Task created.');
  },
  project(f, form) {
    const id = form.dataset.id, v = Object.fromEntries(f);
    if (id) Object.assign(C.proj(state, id), v); else { const p = { id: C.uid(), invoices: [], ...v }; state.projects.push(p); go('Projects', p.id); }
    done('Project saved.');
  },
  invoice(f, form) {
    const p = C.proj(state, form.dataset.pid), v = Object.fromEntries(f), amount = Number(v.amount), paid = Number(v.paid || 0);
    if (paid > amount) return toast('Received amount cannot exceed the invoice amount.');
    const rec = { label: v.label, amount, paid, currency: v.currency.toUpperCase(), due: v.due, sent: f.has('sent') };
    p.invoices ||= []; const i = p.invoices.find(x => x.id === form.dataset.iid);
    if (i) Object.assign(i, rec); else p.invoices.push({ id: C.uid(), ...rec });
    done('Invoice saved.');
  },
  wait(f, form) { const t = C.task(state, form.dataset.id); Object.assign(t, { status: 'waiting', waitingOn: f.get('on'), chase: f.get('chase') }); for (const d of Object.keys(state.plan)) if (d >= today()) C.uncommit(state, d, state.meId, t.id); done('Parked. It will resurface on the chase date.'); },
  reshape(f, form) { const t = C.task(state, form.dataset.id); Object.assign(t, { title: f.get('title'), est: Number(f.get('est')) || 1, owner: f.get('owner'), slips: 0, notes: ((t.notes || '') + '\nReshaped ' + today() + ': ' + f.get('why')).trim() }); done('Reshaped. Slips reset.'); },
  capture(f, form) { state.inbox.push({ id: C.uid(), text: f.get('text').trim(), created: Date.now() }); save(); render(); toast('Captured.'); const i = document.querySelector('[data-form="capture"] input'); if (i) i.focus(); },
  park(f, form) { state.inbox.push({ id: C.uid(), text: f.get('text').trim(), created: Date.now() }); save(); form.reset(); toast('Saved to inbox.'); },
  'capture-modal'(f) { state.inbox.push({ id: C.uid(), text: f.get('text').trim(), created: Date.now() }); done('Captured to inbox.'); },
  'close-day'(f) {
    const t0 = today(), mid = state.meId, r = C.closeDay(state, t0, mid);
    state.checkins = state.checkins.filter(c => !(c.date === t0 && c.memberId === mid));
    state.checkins.push({ date: t0, memberId: mid, win: f.get('win'), blocker: f.get('blocker'), next: f.get('next'), energy: Number(f.get('energy')) || 3 });
    done(`Day closed: ${r.kept} kept, ${r.slipped} slipped.`);
  },
  settings(f) {
    state.members.forEach(m => { const n = (f.get('m_' + m.id) || '').trim(); if (n) m.name = n; });
    const wdays = f.getAll('wd').map(Number); if (!wdays.length) return toast('Choose at least one working day.');
    Object.assign(state.settings, { capacity: Number(f.get('capacity')) || 4, maxCommit: Number(f.get('maxCommit')) || 3, focusMin: Number(f.get('focusMin')) || 25, workdays: wdays });
    done('Settings saved.');
  }
};
function done(msg) { save(); closeModal(); render(); if (msg) toast(msg); }

/* ---------- actions ---------- */
function tryCommit(t) {
  const mid = t.owner || state.meId;
  if ((state.closed[today()] || {})[mid]) return toast('That day is already closed. Reopen it from Today first.');
  const r = C.commit(state, today(), mid, t.id);
  if (!r.ok) { toast(r.msg); if (r.stuck) reshapeForm(t.id); return false; }
  save(); render(); toast('Committed for today.'); return true;
}
function exportData() { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' })); a.download = 'focus-backup-' + today() + '.json'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1500); }
function replaceWith(next, msg) { state = next; C.autoClose(state); save(); if (sel) go(page, null, { replace: true }); closeModal(); render(); toast(msg); }

const act = {
  close: closeModal,
  more() { const I = window.focusInstall; modal('More', `<div class="stack" style="margin-top:12px">${['Deadlines', 'Team', 'Review'].map(n => `<button class="big" data-nav="${n}"><span>${label(n)}</span><i>›</i></button>`).join('')}<button class="big" data-act="settings"><span>Settings &amp; data</span><i>›</i></button>${$('#account') ? '<button class="big" data-act="open-account"><span>Account &amp; sync</span><i>›</i></button>' : ''}${I && I.can() ? '<button class="big lime" data-act="install-app"><span>Install Focus on this phone</span><i>↓</i></button>' : ''}</div><label class="field" style="margin-top:16px">Working as<select id="viewas-more">${memberOpts(state.meId)}</select></label>`); },
  fab() { modal('Add', `<div class="stack" style="margin-top:12px"><button class="big primary" data-act="new-task"><span>New task</span><i>＋</i></button><button class="big" data-act="capture-open"><span>Capture to inbox</span><i>✎</i></button><button class="big" data-act="new-project"><span>New project</span><i>＋</i></button></div>`); },
  'capture-open'() { captureModal(); },
  'install-app'() { const I = window.focusInstall; if (I && I.native()) { closeModal(); I.prompt(); return; } modal('Install Focus', `<p class="sub" style="margin-top:8px">${I && I.ios ? 'Tap <b>Share</b> in Safari, then <b>Add to Home Screen</b>.' : 'Open your browser menu (⋮), then tap <b>Install app</b> or <b>Add to Home screen</b>.'}</p><p class="sub">Focus then opens full screen like any other app and works offline.</p><button class="primary" data-act="close" style="margin-top:8px">Got it</button>`); },
  'open-account'() { closeModal(); $('#account').click(); },
  'ask-yes'() { const f = pending; pending = null; closeModal(); if (f) f(); },
  back() { const st = history.state; if (st && st.n > 0 && !modalPushed) history.back(); else go('Projects'); },
  task(d) { taskForm(d.id); },
  'new-task'(d) { taskForm(null, d.pid ? { projectId: d.pid } : {}); },
  'new-project'() { projectForm(); },
  'edit-project'(d) { projectForm(d.id); },
  'open-project'(d) { go('Projects', d.id); },
  'del-project'(d) { ask('Delete this project and all of its tasks and invoices? Export a backup first if you might need them.', () => { state.tasks.filter(t => t.projectId === d.id).forEach(t => C.removeTask(state, t.id)); state.projects = state.projects.filter(p => p.id !== d.id); save(); go('Projects', null, { replace: true }); toast('Project deleted.'); }, 'Delete'); },
  'new-invoice'(d) { invoiceForm(d.pid); },
  'edit-invoice'(d) { invoiceForm(d.pid, d.iid); },
  'del-invoice'(d) { ask('Delete this invoice record?', () => { const p = C.proj(state, d.pid); p.invoices = p.invoices.filter(i => i.id !== d.iid); save(); render(); }, 'Delete'); },
  commit(d) { tryCommit(C.task(state, d.id)); },
  uncommit(d) { C.uncommit(state, today(), state.meId, d.id); save(); render(); },
  fill() {
    const mid = state.meId; let n = 0;
    for (const r of C.ranked(state, mid)) { if (C.planOf(state, today(), mid).length >= state.settings.maxCommit) break; if (C.commit(state, today(), mid, r.t.id).ok) n++; }
    save(); render(); toast(n ? `Committed ${n} from the ranking. Swap any you disagree with.` : 'No open tasks to commit. Add one first.');
  },
  done(d) { toggleTask(d.id, true); },
  wait(d) { waitForm(d.id); },
  unwait(d) { const t = C.task(state, d.id); t.status = 'open'; t.waitingOn = ''; t.chase = ''; save(); render(); toast('Back in your list.'); },
  chased(d) { C.task(state, d.id).chase = addDays(today(), 3); save(); render(); toast('Chase date moved +3 days.'); },
  'chase-money'(d) { const p = C.proj(state, d.pid), i = p.invoices.find(x => x.id === d.iid); state.tasks.push({ id: C.uid(), projectId: p.id, title: `Chase ${i.currency} ${C.bal(i).toLocaleString()} from ${p.client || p.name}`, owner: state.meId, due: today(), prio: 1, est: 0.5, status: 'open', doneAt: null, slips: 0, repeat: '', created: Date.now(), notes: `Overdue since ${i.due}`, waitingOn: '', chase: '' }); save(); render(); toast('Follow-up task created, due today.'); },
  reshape(d) { reshapeForm(d.id); },
  drop(d) { ask('Drop this task? It disappears from your lists but you can restore from a backup.', () => { const t = C.task(state, d.id); C.removeTask(state, d.id); save(); closeModal(); render(); toast('Dropped: ' + t.title); }, 'Drop task'); },
  triage(d) { triageForm(d.id); },
  'inbox-drop'(d) { state.inbox = state.inbox.filter(x => x.id !== d.id); save(); render(); },
  'close-day'() { closeDayForm(); },
  'reopen-day'() { if (C.reopenDay(state, today(), state.meId)) { save(); render(); toast('Today reopened.'); } },
  focus(d) { startFocus(d.id); },
  weekly() { modal('Weekly note', `<form data-form="weekly"><label class="field">What moved forward, what slipped, and what will you change next week?<textarea name="note" required maxlength="2000" autofocus></textarea></label><button class="primary">Save note</button></form>`); },
  'copy-standup'() { const t = $('#standup').textContent; (navigator.clipboard ? navigator.clipboard.writeText(t).then(() => toast('Standup copied.')) : Promise.reject()).catch(() => { const r = document.createRange(); r.selectNodeContents($('#standup')); const s = getSelection(); s.removeAllRanges(); s.addRange(r); toast('Press Ctrl/⌘+C to copy.'); }); },
  settings: settingsModal,
  export: exportData,
  'add-member'() { keepNames(); state.members.push({ id: C.uid(), name: 'New person' }); save(); settingsModal(); },
  'del-member'(d) { keepNames(); ask('Remove this person? Their tasks move to you.', () => { state.tasks.forEach(t => { if (t.owner === d.id) t.owner = state.meId === d.id ? state.members.find(m => m.id !== d.id).id : state.meId; }); state.members = state.members.filter(m => m.id !== d.id); if (state.meId === d.id) state.meId = state.members[0].id; save(); render(); settingsModal(); }, 'Remove'); },
  'load-demo'() { const go = () => { C.setToday(null); replaceWith(C.demo(), 'Sample data loaded.'); }; if (state.projects.length || state.tasks.length) ask('Replace your current workspace with example data? Export a backup first if you need it.', go, 'Replace'); else go(); },
  'clear-demo'() { replaceWith(C.blank(), 'Cleared. Add your first project.'); },
  'import-v1'() { replaceWith(C.importV1(v1Blob()), 'Imported from Focus v1. Review your projects and set estimates.'); go('Projects'); },
  reset() { ask('Erase every project, task and record in this browser? This cannot be undone.', () => { lsDel(TKEY); timer = null; replaceWith(C.blank(), 'Workspace erased.'); }, 'Erase everything'); }
};

function keepNames() { const f = $('#modal form[data-form="settings"]'); if (!f) return; state.members.forEach(m => { const el = f.elements['m_' + m.id]; if (el && el.value.trim()) m.name = el.value.trim(); }); }
function toggleTask(id, on) {
  const t = C.task(state, id); if (!t) return;
  if (on) { const n = C.complete(state, id); save(); render(); toast(n ? 'Done. Next occurrence: ' + fmt(n.due) + '.' : 'Done ✓'); }
  else { C.reopen(state, id); save(); render(); }
}

/* ---------- focus timer ---------- */
const mmss = s => String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
function persistTimer() { timer ? lsSet(TKEY, JSON.stringify(timer)) : lsDel(TKEY); }
function secsLeft() { return timer.running ? Math.max(0, Math.ceil((timer.endAt - Date.now()) / 1000)) : timer.remaining; }
function startFocus(id) {
  if (timer) { openFocus(); return toast('A session is already running.'); }
  const total = state.settings.focusMin * 60;
  timer = { taskId: id, total, remaining: total, endAt: Date.now() + total * 1000, running: true, memberId: state.meId };
  persistTimer(); loop(); openFocus();
}
function loop() { clearInterval(tickId); tickId = setInterval(tick, 500); tick(); }
function tick() {
  if (!timer) { clearInterval(tickId); return; }
  const s = secsLeft(); const c = $('#clock'), b = $('#tb-clock');
  if (c) c.textContent = mmss(s); if (b) b.textContent = mmss(s);
  document.title = timer.running ? '(' + mmss(s) + ') Focus' : 'Focus · Agency workspace';
  if (timer.running && s === 0) finishTimer(true);
}
function finishTimer(completed) {
  const t = timer; timer = null; persistTimer(); clearInterval(tickId); document.title = 'Focus · Agency workspace';
  if (completed) { state.sessions.push({ date: today(), minutes: Math.round(t.total / 60), taskId: t.taskId, memberId: t.memberId }); save(); toast(Math.round(t.total / 60) + ' focused minutes recorded. Take a short break.'); }
  render(); if ($('#modal').open && $('#clock')) closeModal();
}
function openFocus() {
  const t = C.task(state, timer.taskId);
  modal('Focus session', `<p class="sub">${esc(t ? t.title : 'Focus session')}</p><div class="timer" id="clock">${mmss(secsLeft())}</div><div class="row" style="justify-content:center"><button class="lime" data-act="t-toggle" id="t-toggle">${timer.running ? 'Pause' : 'Resume'}</button><button data-act="t-stop">Stop &amp; discard</button>${t ? `<button data-act="t-done">✓ Task done</button>` : ''}</div><form data-form="park" style="margin-top:22px"><label class="field">Distracted? Note it here and go back to the task.<input name="text" maxlength="300" placeholder="Write it down, then return to the task" required></label></form><p class="notice">Keep this page open while the timer runs. Closing this window leaves the timer running in the bar at the top.</p>`);
}
function renderTimerBar() {
  const el = $('#timerbar');
  if (!timer) { el.hidden = true; return; }
  const t = C.task(state, timer.taskId);
  el.hidden = false; el.innerHTML = `<span>● Focusing</span><b id="tb-clock">${mmss(secsLeft())}</b><span style="flex:1;min-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(t ? t.title : '')}</span><button data-act="t-open">Open</button>`;
}
Object.assign(act, {
  't-open'() { openFocus(); },
  't-toggle'() { if (timer.running) { timer.remaining = secsLeft(); timer.running = false; } else { timer.endAt = Date.now() + timer.remaining * 1000; timer.running = true; } persistTimer(); $('#t-toggle').textContent = timer.running ? 'Pause' : 'Resume'; tick(); },
  't-stop'() { ask('Stop this session? Time so far will not be recorded.', () => finishTimer(false), 'Stop session'); },
  't-done'() { const id = timer.taskId, mins = Math.round((timer.total - secsLeft()) / 60); if (mins >= 1) state.sessions.push({ date: today(), minutes: mins, taskId: id, memberId: timer.memberId }); timer = null; persistTimer(); clearInterval(tickId); document.title = 'Focus · Agency workspace'; closeModal(); toggleTask(id, true); }
});
forms.weekly = f => { state.reviews.push({ date: today(), note: f.get('note').trim() }); done('Weekly note saved.'); };

/* ---------- events ---------- */
document.addEventListener('click', e => {
  const n = e.target.closest('[data-nav]'); if (n) { e.preventDefault(); closeModal(); go(n.dataset.nav); return; }
  const b = e.target.closest('[data-act]'); if (b && act[b.dataset.act]) { e.preventDefault(); act[b.dataset.act](b.dataset, b); return; }
  if (e.target === $('#modal')) closeModal();
});
document.addEventListener('change', e => {
  const t = e.target;
  if (t.dataset.chg === 'toggle') return toggleTask(t.dataset.id, t.checked);
  if (t.dataset.filter) { filters[t.dataset.filter] = t.value; render(); }
  if (t.id === 'viewas' || t.id === 'viewas-more') { state.meId = t.value; save(); render(); }
  if (t.id === 'restore') restoreFile(t.files[0]);
});
document.addEventListener('submit', e => { const f = e.target; if (!f.dataset.form || !forms[f.dataset.form]) return; e.preventDefault(); forms[f.dataset.form](new FormData(f), f); });
document.addEventListener('keydown', e => {
  if (e.key !== 'c' || e.metaKey || e.ctrlKey || e.altKey || $('#modal').open) return;
  if (/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)) return;
  e.preventDefault(); captureModal();
});
$('#capture').onclick = captureModal;
$('#settings').onclick = settingsModal;
async function restoreFile(file) {
  const msg = $('#restore-msg'); if (!file) return;
  try {
    let v = JSON.parse(await file.text()); const was = v.version;
    v = was === 1 ? C.importV1(v) : C.validate(v);
    msg.innerHTML = `<p>${was === 1 ? 'Focus v1 backup detected; it will be converted.' : 'Valid Focus v2 backup.'} ${v.projects.length} projects, ${v.tasks.length} tasks.</p><button class="primary" id="restore-yes">Replace this workspace</button>`;
    $('#restore-yes').onclick = () => replaceWith(v, 'Backup restored.');
  } catch { msg.textContent = 'That file is not a valid Focus backup. Nothing was changed.'; }
}

/* ---------- boot ---------- */
if (!loaded) save();
try { const r = JSON.parse(lsGet(TKEY)); if (r && r.taskId && (r.running ? r.endAt > Date.now() - 3600e3 : true)) { timer = r; loop(); } } catch {}
const bootAction = new URLSearchParams(location.search).get('action');
{ const r = parseHash(); page = r.page; sel = r.sel && C.proj(state, r.sel) ? r.sel : null; try { history.replaceState({ n: 0 }, '', location.pathname + hashFor(page, sel)); } catch {} }
render(); enter();
if (bootAction) { try { history.replaceState(history.state, '', location.pathname + location.hash); } catch {} if (bootAction === 'new-task') taskForm(); else if (bootAction === 'capture') captureModal(); }
window.__focus = { get state() { return state; }, render, act, go: p => go(p) };
})();
