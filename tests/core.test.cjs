const test=require('node:test'),assert=require('node:assert/strict'),C=require('../public/core.js');
const mk=()=>{C.setToday('2026-10-19');return C.blank()}; // Monday
const addP=(s,o={})=>{const p={id:C.uid(),name:'P',client:'c',type:'client',status:'Active',due:'',color:'#fff',notes:'',invoices:[],...o};s.projects.push(p);return p};
const addT=(s,p,o={})=>{const t={id:C.uid(),projectId:p&&p.id,title:'T',owner:s.meId,due:'',prio:2,est:1,status:'open',doneAt:null,slips:0,repeat:'',created:1,...o};s.tasks.push(t);return t};

test('workdays count skips weekends',()=>{const s=mk();assert.equal(C.workdaysBetween('2026-10-19','2026-10-25',s),5);assert.equal(C.nextWorkday('2026-10-23',s),'2026-10-26');assert.equal(C.workdaysBetween('2026-10-20','2026-10-19',s),0)});
test('overdue outranks later-due, must outranks should',()=>{const s=mk(),p=addP(s);const a=addT(s,p,{title:'a',due:'2026-10-18'}),b=addT(s,p,{title:'b',due:'2026-10-30',prio:1}),c=addT(s,p,{title:'c'});const r=C.ranked(s).map(x=>x.t.title);assert.deepEqual(r,['a','b','c']);assert.ok(C.score(a,s).why.some(w=>/overdue/.test(w)))});
test('slips raise score, capped',()=>{const s=mk(),p=addP(s,{type:'internal'});const t=addT(s,p);const base=C.score(t,s).n;t.slips=1;assert.equal(C.score(t,s).n,base+5);t.slips=9;assert.equal(C.score(t,s).n,base+15)});
test('parked projects are excluded from ranking',()=>{const s=mk(),p=addP(s,{status:'Parked'});addT(s,p);assert.equal(C.ranked(s).length,0)});
test('project risk: late, at risk, tight, ok',()=>{const s=mk();s.settings.capacity=4;
 const late=addP(s,{due:'2026-10-18'});addT(s,late);assert.equal(C.projectStats(late,s).risk,'late');
 const risk=addP(s,{due:'2026-10-20'});addT(s,risk,{est:20});assert.equal(C.projectStats(risk,s).risk,'risk'); // 20h/4 = 5d > 2d
 const tight=addP(s,{due:'2026-10-21'});addT(s,tight,{est:10});assert.equal(C.projectStats(tight,s).risk,'tight'); // 2.5d vs 3d
 const ok=addP(s,{due:'2026-10-30'});addT(s,ok,{est:4});assert.equal(C.projectStats(ok,s).risk,'ok');
 const none=addP(s);assert.equal(C.projectStats(none,s).risk,'none')});
test('risk uses the busiest person, not the team average',()=>{const s=mk(),p=addP(s,{due:'2026-10-20'});s.members.push({id:'b',name:'B'});addT(s,p,{est:4});addT(s,p,{est:4,owner:'b'});assert.equal(C.projectStats(p,s).risk,'ok');addT(s,p,{est:8});assert.equal(C.projectStats(p,s).risk,'risk')});
test('commit cap of 3 and stuck guard',()=>{const s=mk(),p=addP(s);const ts=[1,2,3,4].map(()=>addT(s,p));for(let i=0;i<3;i++)assert.ok(C.commit(s,'2026-10-19',s.meId,ts[i].id).ok);assert.equal(C.commit(s,'2026-10-19',s.meId,ts[3].id).ok,false);
 C.uncommit(s,'2026-10-19',s.meId,ts[0].id);ts[3].slips=3;const r=C.commit(s,'2026-10-19',s.meId,ts[3].id);assert.equal(r.ok,false);assert.ok(r.stuck)});
test('close day writes ledger, bumps slips, idempotent',()=>{const s=mk(),p=addP(s);const a=addT(s,p),b=addT(s,p);C.commit(s,'2026-10-19',s.meId,a.id);C.commit(s,'2026-10-19',s.meId,b.id);C.complete(s,a.id);
 const r=C.closeDay(s,'2026-10-19',s.meId);assert.deepEqual([r.kept,r.slipped],[1,1]);assert.equal(b.slips,1);assert.equal(C.closeDay(s,'2026-10-19',s.meId).already,true);assert.equal(s.ledger.length,2);assert.equal(C.keepRate(s,s.meId).pct,50)});
test('task finished a day late counts as slipped, no slip bump',()=>{const s=mk(),p=addP(s);const a=addT(s,p);C.commit(s,'2026-10-19',s.meId,a.id);C.setToday('2026-10-20');C.complete(s,a.id);assert.equal(C.autoClose(s),1);assert.equal(s.ledger[0].result,'slipped');assert.equal(a.slips||0,0)});
test('autoClose handles skipped shutdowns and only past days',()=>{const s=mk(),p=addP(s);const a=addT(s,p);C.commit(s,'2026-10-19',s.meId,a.id);assert.equal(C.autoClose(s),0);C.setToday('2026-10-20');assert.equal(C.autoClose(s),1);assert.equal(C.autoClose(s),0);assert.equal(a.slips,1)});
test('recurring tasks spawn next occurrence, undo removes it',()=>{const s=mk(),p=addP(s,{type:'internal'});const a=addT(s,p,{repeat:'daily',due:'2026-10-19'});const n=C.complete(s,a.id);assert.equal(n.due,'2026-10-20');assert.equal(s.tasks.length,2);C.reopen(s,a.id);assert.equal(s.tasks.length,1);
 C.setToday('2026-10-23');const w=addT(s,p,{repeat:'daily'});assert.equal(C.complete(s,w.id).due,'2026-10-26');const m=addT(s,p,{repeat:'monthly',due:'2026-10-31'});assert.ok(C.complete(s,m.id).due.startsWith('2026-1'))});
test('invoices: balance, overdue, per-currency totals never mixed',()=>{const s=mk(),p=addP(s,{invoices:[{id:'1',amount:100,paid:40,currency:'EUR',due:'2026-10-01',sent:true},{id:'2',amount:50,paid:0,currency:'USD',due:'2026-12-01',sent:true},{id:'3',amount:999,paid:0,currency:'EUR',due:'2026-10-01',sent:false}]});
 const o=C.outstanding(s);assert.deepEqual(o,{EUR:{out:60,overdue:60},USD:{out:50,overdue:0}});assert.equal(C.overdueInvoices(s).length,1)});
test('chase list and deadline items',()=>{const s=mk(),p=addP(s,{due:'2026-10-25'});addT(s,p,{status:'waiting',chase:'2026-10-19',waitingOn:'Client'});addT(s,p,{due:'2026-10-21'});assert.equal(C.chaseDue(s).length,1);const it=C.deadlineItems(s);assert.deepEqual(it.map(x=>x.type),['Chase','Task','Delivery'])});
test('load per day flags collisions',()=>{const s=mk(),p=addP(s);addT(s,p,{due:'2026-10-21',est:3});addT(s,p,{due:'2026-10-21',est:3});const l=C.loadByDay(s,5);assert.equal(l[2].over,true);assert.equal(l[1].over,false)});
test('removeTask cleans plan',()=>{const s=mk(),p=addP(s);const a=addT(s,p);C.commit(s,'2026-10-19',s.meId,a.id);C.removeTask(s,a.id);assert.equal(C.planOf(s,'2026-10-19',s.meId).length,0)});
test('demo workspace validates and has risk variety',()=>{const s=(C.setToday('2026-10-19'),C.demo());C.validate(JSON.parse(JSON.stringify(s)));const risks=s.projects.map(p=>C.projectStats(p,s).risk);assert.ok(risks.includes('risk')||risks.includes('tight'));assert.ok(C.stuck(s).length>=1)});
test('validate rejects garbage',()=>{assert.throws(()=>C.validate({version:1}));assert.throws(()=>C.validate({...mk(),tasks:[{id:1}]}))});
test('v1 import maps clients, projects, routines, ideas',()=>{C.setToday('2026-10-19');
 const old={version:1,active:'Noblesoft',projects:[{name:'Noblesoft',desc:'d',obstacle:'o',tasks:['a','b']},{name:'FLASH',desc:'',obstacle:'',tasks:['x']}],done:{'Noblesoft::0':true},plan:{},routines:{},checkins:[{date:'2026-10-18',win:'w',blocker:'',next:'n',energy:'4',outreach:'1',revenue:'EUR 0'}],ideas:[{id:'1',title:'Idea',note:'why',created:1}],sessions:[{date:'2026-10-18',minutes:25}],reviews:[],german:45,it:60,
  clients:[{id:'c',client:'Acme',name:'Site',tasks:'Do A\nDo B',amount:300,currency:'EUR',due:'2026-10-30',payDue:'2026-10-10',status:'Waiting on client',payment:'Awaiting payment',paid:100,followUp:'2026-10-21',notes:'n',taskItems:[{id:'t',title:'Do A',due:'2026-10-22',priority:'High',done:false}]}]};
 const s=C.importV1(old);C.validate(JSON.parse(JSON.stringify(s)));
 assert.equal(s.projects.length,4); assert.equal(s.projects.find(p=>p.name==='FLASH').status,'Parked');
 assert.equal(s.tasks.filter(t=>t.title==='a')[0].status,'done');
 const site=s.projects.find(p=>p.name==='Site');assert.equal(site.status,'Waiting');assert.equal(site.invoices[0].paid,100);
 const titles=s.tasks.filter(t=>t.projectId===site.id).map(t=>t.title);assert.deepEqual(titles.sort(),['Do A','Do B','Follow up with Acme'].sort()); // no duplicate "Do A"
 assert.equal(s.tasks.filter(t=>t.repeat==='daily').length,2);assert.equal(s.inbox.length,1);assert.equal(s.checkins[0].energy,4)});

test('reopenDay reverses ledger and slips',()=>{const s=mk(),p=addP(s);const a=addT(s,p);C.commit(s,'2026-10-19',s.meId,a.id);C.closeDay(s,'2026-10-19',s.meId);assert.equal(a.slips,1);assert.ok(C.reopenDay(s,'2026-10-19',s.meId));assert.equal(a.slips,0);assert.equal(s.ledger.length,0);assert.equal(C.reopenDay(s,'2026-10-19',s.meId),false);C.closeDay(s,'2026-10-19',s.meId);assert.equal(s.ledger.length,1)});

test('backup rejects overpaid or malformed invoices',()=>{const s=mk(),p=addP(s);p.invoices=[{id:'i1',label:'A',amount:100,paid:150}];assert.throws(()=>C.validate(JSON.parse(JSON.stringify(s))),/paid exceeds/);p.invoices=[{id:'i2',label:'B',amount:100,paid:40}];assert.doesNotThrow(()=>C.validate(JSON.parse(JSON.stringify(s))))});
test('partial payment leaves balance, paid leaves none',()=>{assert.equal(C.bal({amount:1000,paid:250}),750);assert.equal(C.bal({amount:1000,paid:1000}),0)});
