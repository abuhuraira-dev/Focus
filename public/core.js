'use strict';
/* Focus core: pure workspace logic (no DOM). Loaded by the app and by tests. */
(function (root) {
  const DAY = 86400000;
  const T = { today: null };
  const pad = n => String(n).padStart(2, '0');
  const iso = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const today = () => T.today || iso(new Date());
  const setToday = s => { T.today = s; };
  const parse = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return iso(d); };
  const diff = (a, b) => Math.round((parse(a) - parse(b)) / DAY); // days from b to a
  const uid = () => (root.crypto && root.crypto.randomUUID) ? root.crypto.randomUUID()
    : 'id' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  const est = t => Number(t.est) > 0 ? Number(t.est) : 1;
  const PRIO = { 1: 'Must', 2: 'Should', 3: 'Could' };

  function blank() {
    const me = uid();
    return {
      version: 2, meId: me, members: [{ id: me, name: 'You' }],
      settings: { capacity: 4, workdays: [1, 2, 3, 4, 5], maxCommit: 3, focusMin: 25 },
      projects: [], tasks: [], inbox: [], plan: {}, closed: {}, ledger: [], checkins: [], sessions: [], reviews: [], demo: false
    };
  }

  /* ---------- calendar helpers ---------- */
  const isWork = (date, s) => s.settings.workdays.includes(parse(date).getDay());
  function workdaysBetween(from, to, s) {
    if (to < from) return 0;
    let n = 0, d = from;
    for (let i = 0; i < 400 && d <= to; i++, d = addDays(d, 1)) if (isWork(d, s)) n++;
    return n;
  }
  function nextWorkday(date, s) {
    let d = addDays(date, 1);
    for (let i = 0; i < 7 && !isWork(d, s); i++) d = addDays(d, 1);
    return d;
  }

  /* ---------- lookups ---------- */
  const proj = (s, id) => s.projects.find(p => p.id === id);
  const task = (s, id) => s.tasks.find(t => t.id === id);
  const member = (s, id) => s.members.find(m => m.id === id);
  const bal = i => Math.max(0, Number(i.amount || 0) - Number(i.paid || 0));
  const invOverdue = i => i.sent !== false && bal(i) > 0 && !!i.due && i.due < today();
  const isLive = p => p && p.status !== 'Done' && p.status !== 'Parked';

  /* ---------- project health ---------- */
  function projectStats(p, s) {
    const ts = s.tasks.filter(t => t.projectId === p.id && t.status !== 'dropped');
    const open = ts.filter(t => t.status === 'open'), waiting = ts.filter(t => t.status === 'waiting'), done = ts.filter(t => t.status === 'done');
    const remaining = open.concat(waiting);
    const remainingH = remaining.reduce((a, t) => a + est(t), 0);
    const byOwner = {};
    remaining.forEach(t => { const k = t.owner || '_'; byOwner[k] = (byOwner[k] || 0) + est(t); });
    const owners = Object.keys(byOwner).length || 1;
    const cap = Number(s.settings.capacity) || 4;
    const need = Math.max(0, ...Object.values(byOwner)) / cap; // bottleneck person, not team average
    const daysLeft = p.due ? workdaysBetween(today(), p.due, s) : null;
    let risk = 'none', why = '';
    if (p.status === 'Done') risk = 'done';
    else if (p.status === 'Parked') risk = 'parked';
    else if (p.due) {
      if (p.due < today() && remaining.length) { risk = 'late'; why = diff(today(), p.due) + ' days past delivery date with ' + remaining.length + ' tasks open'; }
      else if (!remaining.length) { risk = 'ok'; why = 'No open tasks left'; }
      else if (need > daysLeft) { risk = 'risk'; why = round1(remainingH) + 'h left; the busiest person needs ~' + round1(need) + ' working days but only ' + daysLeft + ' remain'; }
      else if (need > daysLeft * 0.7) { risk = 'tight'; why = round1(remainingH) + 'h left needs ~' + round1(need) + ' of ' + daysLeft + ' working days'; }
      else { risk = 'ok'; why = round1(remainingH) + 'h left, ' + daysLeft + ' working days to go'; }
    }
    return { total: ts.length, open: open.length, waiting: waiting.length, done: done.length, pct: ts.length ? Math.round(done.length / ts.length * 100) : 0, remainingH, owners, need, daysLeft, risk, why };
  }
  const round1 = n => Math.round(n * 10) / 10;

  /* ---------- priority ---------- */
  function score(t, s) {
    const p = proj(s, t.projectId), why = []; let n = 0;
    n += { 1: 40, 2: 20, 3: 0 }[t.prio || 2];
    if (t.prio === 1) why.push('Must-do');
    let d = t.due ? diff(t.due, today()) : null, src = 'Due';
    if (d === null && p && p.due) { d = diff(p.due, today()); src = 'Delivery'; if (d > 3) d = null; }
    if (d !== null) {
      if (d < 0) { n += 60 + Math.min(20, -d * 4); why.push(-d + 'd overdue'); }
      else if (d === 0) { n += 55; why.push(src + ' today'); }
      else if (d <= 2) { n += 40; why.push(src + ' in ' + d + 'd'); }
      else if (d <= 7) { n += 25; why.push(src + ' in ' + d + 'd'); }
      else if (d <= 14) n += 10;
    }
    if (p) {
      if (p.type === 'client') { n += 10; why.push('Client'); }
      const st = projectStats(p, s);
      if (st.risk === 'late' || st.risk === 'risk') { n += 15; why.push('Project ' + (st.risk === 'late' ? 'late' : 'at risk')); }
      else if (st.risk === 'tight') n += 6;
    }
    if (t.slips) { n += Math.min(15, t.slips * 5); why.push('Slipped ' + t.slips + '×'); }
    return { n, why };
  }

  function ranked(s, ownerId) {
    return s.tasks
      .filter(t => t.status === 'open' && (!ownerId || t.owner === ownerId) && (!t.projectId || isLive(proj(s, t.projectId))))
      .map(t => ({ t, ...score(t, s) }))
      .sort((a, b) => b.n - a.n || (a.t.due || '9').localeCompare(b.t.due || '9') || (a.t.created || 0) - (b.t.created || 0));
  }

  /* ---------- daily plan + ledger ---------- */
  const planOf = (s, date, mid) => ((s.plan[date] || {})[mid] || []).filter(id => task(s, id));
  function commit(s, date, mid, id) {
    const t = task(s, id);
    if (!t || t.status !== 'open') return { ok: false, msg: 'Only open tasks can be committed.' };
    const cur = planOf(s, date, mid);
    if (cur.includes(id)) return { ok: false, msg: 'Already in today’s plan.' };
    if (cur.length >= s.settings.maxCommit) return { ok: false, msg: 'Your day is full. Finish or remove one before adding another.' };
    if ((t.slips || 0) >= 3) return { ok: false, msg: 'This task slipped 3 times. Reshape, delegate or drop it first.', stuck: true };
    (s.plan[date] ||= {})[mid] = cur.concat(id);
    return { ok: true };
  }
  function uncommit(s, date, mid, id) { if (s.plan[date] && s.plan[date][mid]) s.plan[date][mid] = s.plan[date][mid].filter(x => x !== id); }

  function closeDay(s, date, mid, auto) {
    s.closed[date] ||= {};
    if (s.closed[date][mid]) return { kept: 0, slipped: 0, already: true };
    let kept = 0, slipped = 0;
    for (const id of planOf(s, date, mid)) {
      const t = task(s, id);
      if (!t || t.status === 'dropped') continue;
      const ok = t.status === 'done' && t.doneAt && t.doneAt <= date;
      s.ledger.push({ date, taskId: id, memberId: mid, result: ok ? 'kept' : 'slipped', auto: !!auto });
      if (ok) kept++; else { slipped++; if (t.status === 'open' || t.status === 'waiting') t.slips = (t.slips || 0) + 1; }
    }
    s.closed[date][mid] = true;
    return { kept, slipped };
  }
  function reopenDay(s, date, mid) {
    if (!(s.closed[date] || {})[mid]) return false;
    const mine = s.ledger.filter(l => l.date === date && l.memberId === mid);
    for (const l of mine) { const t = task(s, l.taskId); if (l.result === 'slipped' && t && t.status !== 'done' && t.slips > 0) t.slips--; }
    s.ledger = s.ledger.filter(l => !(l.date === date && l.memberId === mid));
    delete s.closed[date][mid];
    return true;
  }
  function autoClose(s) {
    let n = 0;
    for (const date of Object.keys(s.plan)) {
      if (date >= today()) continue;
      for (const mid of Object.keys(s.plan[date])) {
        if (!(s.closed[date] || {})[mid] && planOf(s, date, mid).length) { closeDay(s, date, mid, true); n++; }
      }
    }
    return n;
  }
  function keepRate(s, mid, fromDate) {
    const rows = s.ledger.filter(l => (!mid || l.memberId === mid) && (!fromDate || l.date >= fromDate));
    const kept = rows.filter(l => l.result === 'kept').length;
    return { kept, total: rows.length, pct: rows.length ? Math.round(kept / rows.length * 100) : null };
  }
  function onTimeRate(s, fromDate, mid) {
    const rows = s.tasks.filter(t => t.status === 'done' && t.due && t.doneAt && t.doneAt >= fromDate && (!mid || t.owner === mid));
    const ok = rows.filter(t => t.doneAt <= t.due).length;
    return { ok, total: rows.length, pct: rows.length ? Math.round(ok / rows.length * 100) : null };
  }

  /* ---------- task lifecycle ---------- */
  function nextDue(t, from, s) {
    if (t.repeat === 'daily') return nextWorkday(from, s);
    if (t.repeat === 'weekly') return addDays(t.due && t.due > from ? t.due : from, 7);
    if (t.repeat === 'monthly') { const d = parse(t.due || from); d.setMonth(d.getMonth() + 1); return iso(d); }
    return null;
  }
  function complete(s, id) {
    const t = task(s, id); if (!t) return null;
    t.status = 'done'; t.doneAt = today(); t.waitingOn = ''; t.chase = '';
    if (t.repeat) {
      const n = { ...t, id: uid(), status: 'open', doneAt: null, slips: 0, created: Date.now(), due: nextDue(t, today(), s) };
      s.tasks.push(n); t.nextId = n.id; return n;
    }
    return null;
  }
  function reopen(s, id) {
    const t = task(s, id); if (!t) return;
    t.status = 'open'; t.doneAt = null;
    if (t.nextId) { const n = task(s, t.nextId); if (n && n.status === 'open' && !n.slips) s.tasks = s.tasks.filter(x => x.id !== n.id); t.nextId = null; }
  }
  function removeTask(s, id) {
    s.tasks = s.tasks.filter(t => t.id !== id);
    for (const d of Object.keys(s.plan)) for (const m of Object.keys(s.plan[d])) s.plan[d][m] = s.plan[d][m].filter(x => x !== id);
  }
  const stuck = (s, mid) => s.tasks.filter(t => t.status === 'open' && (t.slips || 0) >= 3 && (!mid || t.owner === mid));
  const chaseDue = (s, mid) => s.tasks.filter(t => t.status === 'waiting' && t.chase && t.chase <= today() && (!mid || t.owner === mid));
  const overdueInvoices = s => s.projects.flatMap(p => (p.invoices || []).filter(invOverdue).map(i => ({ p, i })));

  function outstanding(s) {
    const out = {};
    for (const p of s.projects) for (const i of p.invoices || []) {
      if (i.sent === false || !bal(i)) continue;
      const c = (i.currency || 'EUR').toUpperCase();
      out[c] ||= { out: 0, overdue: 0 };
      out[c].out += bal(i); if (invOverdue(i)) out[c].overdue += bal(i);
    }
    return out;
  }

  /* ---------- deadlines ---------- */
  function deadlineItems(s) {
    const a = [];
    for (const p of s.projects) {
      if (isLive(p) && p.due) a.push({ date: p.due, type: 'Delivery', title: p.name, sub: p.client || '', pid: p.id });
      for (const i of p.invoices || []) if (i.sent !== false && bal(i) && i.due) a.push({ date: i.due, type: 'Payment', title: (i.label || 'Invoice') + ' · ' + (i.currency || 'EUR') + ' ' + bal(i).toLocaleString(), sub: p.name, pid: p.id });
    }
    for (const t of s.tasks) {
      const p = proj(s, t.projectId); if (p && !isLive(p)) continue;
      if (t.status === 'open' && t.due) a.push({ date: t.due, type: 'Task', title: t.title, sub: p ? p.name : '', tid: t.id, owner: t.owner, est: est(t) });
      if (t.status === 'waiting' && t.chase) a.push({ date: t.chase, type: 'Chase', title: t.title, sub: (t.waitingOn ? 'Waiting on ' + t.waitingOn : '') + (p ? ' · ' + p.name : ''), tid: t.id, owner: t.owner });
    }
    return a.sort((x, y) => x.date.localeCompare(y.date));
  }
  function loadByDay(s, n) {
    const cap = (Number(s.settings.capacity) || 4) * Math.max(1, s.members.length), out = [];
    for (let i = 0; i < n; i++) {
      const d = addDays(today(), i), work = isWork(d, s);
      let hours = s.tasks.filter(t => t.status === 'open' && t.due && (i === 0 ? t.due <= d : t.due === d)).reduce((a, t) => a + est(t), 0);
      out.push({ date: d, hours, cap: work ? cap : 0, over: hours > (work ? cap : 0) && hours > 0, work });
    }
    return out;
  }

  /* ---------- standup text ---------- */
  function standup(s) {
    const t = today(), y = addDays(t, -1);
    return s.members.map(m => {
      const done = s.tasks.filter(x => x.status === 'done' && x.owner === m.id && x.doneAt && x.doneAt >= y).map(x => '• ' + x.title);
      const plan = planOf(s, t, m.id).map(id => '• ' + task(s, id).title);
      const blocked = s.tasks.filter(x => x.status === 'waiting' && x.owner === m.id).map(x => '• ' + x.title + (x.waitingOn ? ' (waiting on ' + x.waitingOn + ')' : ''));
      return m.name + '\nDone: ' + (done.join('\n') ? '\n' + done.join('\n') : ' —') + '\nToday: ' + (plan.join('\n') ? '\n' + plan.join('\n') : ' not committed yet') + '\nBlocked: ' + (blocked.join('\n') ? '\n' + blocked.join('\n') : ' —');
    }).join('\n\n');
  }

  /* ---------- import from Focus v1 ---------- */
  function importV1(old) {
    const s = blank(); const me = s.meId; const now = Date.now();
    const mk = (projectId, title, o = {}) => ({ id: uid(), projectId, title: String(title).slice(0, 300), owner: me, due: o.due || '', prio: o.prio || 2, est: o.est || 1, status: o.done ? 'done' : 'open', doneAt: o.done ? (o.doneAt || today()) : null, slips: 0, repeat: o.repeat || '', created: now, notes: '', waitingOn: '', chase: '' });
    const palette = ['#e9eddf', '#eee9fd', '#e6eefb', '#faecdf', '#f3e4e1', '#e4f0ef'];
    (old.projects || []).forEach((p, pi) => {
      const np = { id: uid(), name: p.name, client: '', type: 'internal', status: p.name === old.active ? 'Active' : 'Parked', due: '', color: p.color || palette[pi % 6], notes: [p.desc, p.obstacle && 'Obstacle: ' + p.obstacle].filter(Boolean).join('\n'), invoices: [] };
      s.projects.push(np);
      (p.tasks || []).forEach((title, i) => s.tasks.push(mk(np.id, title, { done: !!(old.done || {})[p.name + '::' + i] })));
    });
    (old.clients || []).forEach((c, ci) => {
      const np = { id: uid(), name: c.name, client: c.client, type: 'client', status: { 'In progress': 'Active', 'Waiting on client': 'Waiting', 'Blocked': 'Blocked', 'Delivered': 'Done' }[c.status] || 'Active', due: c.due || '', color: palette[(ci + 2) % 6], notes: c.notes || '', invoices: [] };
      if (Number(c.amount) > 0) np.invoices.push({ id: uid(), label: 'Invoice', amount: Number(c.amount), paid: c.payment === 'Paid' ? Number(c.amount) : Math.min(Number(c.paid || 0), Number(c.amount)), currency: c.currency || 'EUR', due: c.payDue || '', sent: c.payment !== 'Not invoiced' });
      s.projects.push(np);
      const titles = new Set();
      (c.taskItems || []).forEach(t => { titles.add(t.title); s.tasks.push(mk(np.id, t.title, { due: t.due, prio: { High: 1, Normal: 2, Low: 3 }[t.priority] || 2, done: !!t.done })); });
      String(c.tasks || '').split('\n').map(x => x.trim()).filter(x => x && !titles.has(x)).forEach(x => s.tasks.push(mk(np.id, x, { done: c.status === 'Delivered' })));
      if (c.followUp) s.tasks.push(mk(np.id, 'Follow up with ' + (c.client || 'client'), { due: c.followUp, prio: 1 }));
    });
    const routines = [['german', 'German practice'], ['it', 'IT skills practice']];
    if (old.german || old.it) {
      const rp = { id: uid(), name: 'Ausbildung', client: '', type: 'internal', status: 'Active', due: '', color: palette[5], notes: 'Daily routines imported from Focus v1.', invoices: [] };
      s.projects.push(rp);
      routines.forEach(([k, label]) => { if (old[k]) s.tasks.push(mk(rp.id, label, { due: today(), est: Math.round(old[k] / 60 * 4) / 4 || 0.5, repeat: 'daily', prio: 2 })); });
    }
    (old.ideas || []).forEach(x => s.inbox.push({ id: uid(), text: (x.title || '') + (x.note ? ' — ' + x.note : ''), created: x.created || now }));
    s.checkins = (old.checkins || []).map(x => ({ date: x.date, memberId: me, win: x.win || '', blocker: x.blocker || '', next: x.next || '', energy: Number(x.energy) || 3 }));
    s.sessions = (old.sessions || []).map(x => ({ date: x.date, minutes: Number(x.minutes) || 0, taskId: null, memberId: me }));
    s.reviews = (old.reviews || []).map(x => ({ date: x.date, note: x.note }));
    return s;
  }

  /* ---------- validation (restore / cloud) ---------- */
  function validate(v) {
    const arr = k => Array.isArray(v[k]);
    if (!v || v.version !== 2 || !['members', 'projects', 'tasks', 'inbox', 'ledger', 'checkins', 'sessions', 'reviews'].every(arr)) throw Error('Not a Focus v2 backup');
    if (!v.members.length || !v.members.every(m => typeof m.id === 'string' && typeof m.name === 'string')) throw Error('Invalid members');
    if (!v.members.some(m => m.id === v.meId)) v.meId = v.members[0].id;
    if (!v.tasks.every(t => typeof t.id === 'string' && typeof t.title === 'string' && ['open', 'waiting', 'done', 'dropped'].includes(t.status))) throw Error('Invalid tasks');
    if (!v.projects.every(p => typeof p.id === 'string' && typeof p.name === 'string' && Array.isArray(p.invoices || []))) throw Error('Invalid projects');
    for (const p of v.projects) for (const i of p.invoices || []) {
      const a = Number(i.amount), d = Number(i.paid || 0);
      if (!(a >= 0) || !(d >= 0) || d > a) throw Error('Invalid invoice: ' + (i.label || 'unnamed') + ' (paid exceeds amount)');
    }
    for (const k of ['plan', 'closed']) if (!v[k] || typeof v[k] !== 'object' || Array.isArray(v[k])) throw Error('Invalid ' + k);
    const st = v.settings || {};
    if (!(st.capacity > 0 && st.capacity <= 24) || !Array.isArray(st.workdays) || !st.workdays.length) throw Error('Invalid settings');
    return v;
  }

  /* ---------- example workspace ---------- */
  function demo() {
    const s = blank(); const t0 = today(), d = n => addDays(t0, n);
    const [sara, ali] = [{ id: uid(), name: 'Sara' }, { id: uid(), name: 'Ali' }]; s.members.push(sara, ali);
    s.members[0].name = 'You'; const me = s.meId;
    const P = (name, client, type, status, due, color, notes, invoices = []) => { const p = { id: uid(), name, client, type, status, due, color, notes, invoices }; s.projects.push(p); return p; };
    const acme = P('Website redesign', 'Acme Dental', 'client', 'Active', d(9), '#e9eddf', 'Approved scope: 6 pages + booking form.', [{ id: uid(), label: 'Deposit 50%', amount: 1200, paid: 1200, currency: 'EUR', due: d(-20), sent: true }, { id: uid(), label: 'Final 50%', amount: 1200, paid: 0, currency: 'EUR', due: d(12), sent: true }]);
    const harbor = P('Brand kit', 'Harbor Café', 'client', 'Active', d(2), '#faecdf', 'Logo, palette, menu template.', [{ id: uid(), label: 'Invoice 1', amount: 800, paid: 300, currency: 'EUR', due: d(-6), sent: true }]);
    const bright = P('SEO retainer', 'Bright Roofing', 'client', 'Waiting', d(21), '#e6eefb', 'Waiting on Google Business access.', []);
    const noble = P('Noblesoft outreach', '', 'internal', 'Active', '', '#eee9fd', 'Internal: 3 personalised messages per day.');
    const T = (p, title, o = {}) => { const t = { id: uid(), projectId: p.id, title, owner: o.owner || me, due: o.due || '', prio: o.prio || 2, est: o.est || 1, status: o.status || 'open', doneAt: o.doneAt || null, slips: o.slips || 0, repeat: o.repeat || '', created: Date.now() - (o.age || 0) * DAY, notes: '', waitingOn: o.waitingOn || '', chase: o.chase || '' }; s.tasks.push(t); return t; };
    const a1 = T(acme, 'Homepage design — final pass', { due: d(1), prio: 1, est: 3, slips: 1 });
    const a2 = T(acme, 'Build booking form', { due: d(5), est: 4, owner: sara.id });
    T(acme, 'Write service pages copy', { due: d(4), est: 3, owner: ali.id });
    T(acme, 'Mobile QA on 4 devices', { due: d(8), est: 2, owner: sara.id });
    T(acme, 'Client sign-off on wireframes', { status: 'done', doneAt: d(-3), due: d(-3) });
    const h1 = T(harbor, 'Logo round 2 revisions', { due: d(0), prio: 1, est: 10, slips: 3 });
    T(harbor, 'Menu template (A4 + A5)', { due: d(2), est: 4, owner: sara.id });
    T(harbor, 'Colour palette + type pairing', { due: d(2), est: 3 });
    T(harbor, 'Brand guideline PDF', { due: d(2), est: 3, owner: ali.id });
    T(bright, 'Get Google Business access', { status: 'waiting', waitingOn: 'Bright Roofing', chase: d(0), prio: 1, est: 0.5 });
    T(bright, 'Keyword research — 30 terms', { due: d(10), est: 3, owner: ali.id });
    T(noble, 'Send 3 personalised outreach messages', { due: t0, est: 1, repeat: 'daily' });
    T(noble, 'Follow up with day-3 prospects', { due: d(1), est: 1, prio: 2 });
    T(noble, 'Update portfolio case study', { est: 2, prio: 3 });
    s.inbox.push({ id: uid(), text: 'Acme asked if we can add a blog — scope + price?', created: Date.now() - 3600e3 }, { id: uid(), text: 'Renew domain for Zyvro', created: Date.now() - 86400e3 });
    // short history so Team and Review are populated
    for (let i = 6; i >= 1; i--) {
      const date = d(-i); if (!isWork(date, s)) continue;
      for (const [m, rate] of [[me, 0.6], [sara.id, 0.85], [ali.id, 0.75]]) for (let k = 0; k < 3; k++) s.ledger.push({ date, taskId: 'demo', memberId: m, result: ((i * 7 + k * 3 + m.length) % 10) / 10 < rate ? 'kept' : 'slipped', auto: false });
      s.sessions.push({ date, minutes: 25 * (2 + i % 3), taskId: null, memberId: me });
    }
    s.plan[t0] = { [me]: [a1.id], [sara.id]: [a2.id] };
    s.checkins.push({ date: d(-1), memberId: me, win: 'Wireframes approved', blocker: 'Logo feedback unclear', next: 'Call Harbor Café before touching the logo again', energy: 3 });
    s.demo = true;
    return s;
  }

  const api = { DAY, PRIO, pad, iso, today, setToday, parse, addDays, diff, uid, est, blank, isWork, workdaysBetween, nextWorkday, proj, task, member, bal, invOverdue, isLive, projectStats, score, ranked, planOf, commit, uncommit, closeDay, reopenDay, autoClose, keepRate, onTimeRate, complete, reopen, removeTask, stuck, chaseDue, overdueInvoices, outstanding, deadlineItems, loadByDay, standup, importV1, validate, demo };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.FocusCore = api;
})(typeof window !== 'undefined' ? window : globalThis);
