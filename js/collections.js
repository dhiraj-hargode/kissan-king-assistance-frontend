// Today collection and pending payment features.
let todayCollectionState={loading:false,search:"",requestKey:"",request:null,cache:new Map()};
let todayCollectionSearchTimer=null;
async function loadTodayCollection(c,date=todayISO(),search=todayCollectionState.search){
  const key=`${date}|${String(search||'').trim().toLowerCase()}`;
  todayCollectionState.loading=true;
  if(todayCollectionState.requestKey===key && todayCollectionState.request) return todayCollectionState.request;
  const cached=todayCollectionState.cache.get(key);
  if(cached){renderTodayFromApi(c,cached);todayCollectionState.loading=false;return cached;}
  todayCollectionState.requestKey=key;
  todayCollectionState.request=apiJSON(`/api/collections/today?date=${encodeURIComponent(date)}&search=${encodeURIComponent(search||'')}`)
    .then(x=>{todayCollectionState.cache.set(key,x); if(todayCollectionState.cache.size>8) todayCollectionState.cache.delete(todayCollectionState.cache.keys().next().value); renderTodayFromApi(c,x); return x;})
    .finally(()=>{todayCollectionState.loading=false;todayCollectionState.request=null;});
  return todayCollectionState.request;
}
function renderToday(c){
  const selected=window.todayCollectionDate||todayISO();
  const search=normalizeTodaySearch(window.todayFilter);
  window.todayFilter=search;
  c.innerHTML=header("Today's Collection",`Selected date: ${fmtDate(selected)}`,`<button class="btn" onclick="printTodayCollection('${selected}')">🖨 Print</button>`)+`<div class="card section-card"><div class="toolbar"><label style="font-weight:700">Collection Date</label><input id="todayDatePicker" type="date" value="${selected}" onchange="window.todayCollectionDate=this.value;openPage('today')"><button class="btn" onclick="window.todayCollectionDate=todayISO();openPage('today')">Today</button><button class="btn" onclick="shiftTodayDate(-1)">← Previous Day</button><button class="btn" onclick="shiftTodayDate(1)">Next Day →</button><input class="grow" id="todayFilter" placeholder="Search customer, mobile, Khata or loan ID..." value="${esc(search)}" oninput="refreshTodaySearch(this.value)"></div></div><div id="todayCollectionApiBody"><div class="empty">Loading collection...</div></div>`;
  loadTodayCollection(c,selected,search).catch(e=>{console.error(e);document.getElementById('todayCollectionApiBody').innerHTML=`<div class="empty"><div class="emoji">⚠</div><h3>Collection unavailable</h3><p>${esc(e.message||'Request failed')}</p></div>`;});
}
function renderTodayFromApi(c,x){
  const body=document.getElementById('todayCollectionApiBody'); if(!body)return;
  const rows=Array.isArray(x.rows)?x.rows:[], summary=x.summary||{}, selected=x.date||window.todayCollectionDate||todayISO();
  body.innerHTML=`<div class="stat-grid" style="margin-top:16px">${stat("Expected",money(summary.expected||0),"Unpaid EMIs due on selected date")}${stat("Collected",money(summary.collected||0),"Payments received on selected date")}${stat("Interest",money(summary.interest||0),"Interest received")}${stat("Pending",money(summary.pending||0),"Unpaid amount for selected date")}</div><div class="card section-card today-collection-card" style="margin-top:18px"><div class="today-collection-head"><h3>Collection Entries — ${fmtDate(selected)}</h3><span class="today-entry-count">${rows.length} ${rows.length===1?'entry':'entries'}</span></div><div class="today-collection-desktop table-wrap"><table class="data-table" id="todayTable"><thead><tr><th>Sr No</th><th>Khata No</th><th>Name</th><th>Mobile</th><th>Loan Date</th><th>Loan Rs.</th><th>Remaining</th><th>Pay Amount</th><th>Paid Today</th><th>Remark</th><th>Action</th></tr></thead><tbody>${rows.map((r,i)=>{const l=r.loan||{},cu=r.customer||{},s=r.s||r.schedules?.[0]||{};const khata=l.legacyKhataNo||l.khataNo||l.id||'-';const pending=Boolean(r.pendingAddedAt||r.s?.pendingAddedAt||r.s?.manualPending||r.schedule?.pendingAddedAt||r.schedule?.manualPending);const remark=r.fullyPaidToday?'Paid':pending?'Added to Pending':(Number(r.paidOnDate||0)>0?'Partial / Paid':'Due Today');const remaining=Math.max(0,Number(l.amount||0)-Number(l.paidPrincipal||0));return `<tr data-search="${esc((khata+' '+l.id+' '+customerName(cu)+' '+(cu.mobile||'')).toLowerCase())}"><td>${i+1}</td><td><b>${esc(khata)}</b></td><td><b>${esc(customerName(cu)||cu.name||'-')}</b></td><td>${esc(cu.mobile||'-')}</td><td>${fmtDate(l.startDate)}</td><td>${money(l.amount)}</td><td><b>${money(remaining)}</b></td><td><b>${money(r.due||0)}</b></td><td>${money(r.paidOnDate||0)}</td><td><span class="badge ${r.fullyPaidToday?'green':pending?'amber':'amber'}">${remark}</span></td><td>${(r.fullyPaidToday||Number(r.due||0)<=0.005)?'<button class="btn small" disabled>Paid</button>':pending?'<button class="btn small" disabled>Pending</button>':`<div style="display:flex;gap:6px;justify-content:flex-end;flex-wrap:wrap"><button class="btn small primary" onclick="openPaymentFor('${l.id}','${s.id}')">Payment</button><button class="btn small" onclick="addToPending('${s.id}')">Add to Pending</button></div>`}</td></tr>`}).join('')}</tbody></table></div><div class="today-collection-mobile" id="todayMobileList">${rows.map((r,i)=>{const l=r.loan||{},cu=r.customer||{},s=r.s||r.schedules?.[0]||{};const khata=l.legacyKhataNo||l.khataNo||l.id||'-';const pending=Boolean(r.pendingAddedAt||r.s?.pendingAddedAt||r.s?.manualPending||r.schedule?.pendingAddedAt||r.schedule?.manualPending);const remark=r.fullyPaidToday?'Paid':pending?'Added to Pending':(Number(r.paidOnDate||0)>0?'Partial / Paid':'Due Today');return `<article class="today-mobile-card"><div class="today-mobile-head"><div><span class="today-mobile-index">${i+1}</span><div><b>${esc(customerName(cu)||cu.name||'-')}</b><small>${esc(khata)} · ${esc(cu.mobile||'-')}</small></div></div><span class="badge ${r.fullyPaidToday?'green':pending?'amber':'amber'}">${remark}</span></div><div class="today-mobile-grid"><div><small>Loan Date</small><b>${fmtDate(l.startDate)}</b></div><div><small>Loan Amount</small><b>${money(l.amount)}</b></div><div><small>Remaining</small><b>${money(Math.max(0,Number(l.amount||0)-Number(l.paidPrincipal||0)))}</b></div><div><small>Pay Amount</small><b>${money(r.due||0)}</b></div><div><small>Paid Today</small><b>${money(r.paidOnDate||0)}</b></div></div>${(r.fullyPaidToday||Number(r.due||0)<=0.005)?'<button class="btn small today-paid-btn" disabled>✓ Paid</button>':pending?'<button class="btn small today-paid-btn" disabled>✓ Added to Pending</button>':`<div class="today-mobile-actions"><button class="btn primary" onclick="openPaymentFor('${l.id}','${s.id}')">Payment</button><button class="btn" onclick="addToPending('${s.id}')">Add to Pending</button></div>`}</article>`}).join('')}${rows.length?'':`<div class='empty'><div class='emoji'>📅</div><h3>No collection entries for ${fmtDate(selected)}</h3><p>Due, partially paid, and fully paid installments for the selected date will appear here for reference.</p></div>`}</div></div>`;
}
async function addToPending(scheduleId){
  // Today's Collection is API-backed, so the in-memory database may not have
  // been hydrated when this action is clicked. Always load the authoritative
  // normalized data before resolving the schedule ID.
  await ensureServerDataLoaded();
  const s=db.schedules.find(x=>String(x.id)===String(scheduleId));
  if(!s){toast("Installment not found.","err");return;}
  if(effectiveDueAmount(s)<=0.005){toast("This installment is already paid.","err");return;}
  if(isExplicitPending(s)){toast("This installment is already in Pending Payments.","err");return;}

  addPendingQueueId(s);
  s.pendingAddedAt=new Date().toISOString();
  s.pendingAddedBy=currentUser?.username||"admin";
  refreshNotifications();
  await save();

  // The collection list is API-backed and cached. Invalidate the cache after
  // the mutation succeeds so the next render cannot show stale rows.
  todayCollectionState.cache.clear();
  todayCollectionState.requestKey="";
  todayCollectionState.request=null;

  const content=document.getElementById('content');
  if(content) await loadTodayCollection(content, window.todayCollectionDate||todayISO(), window.todayFilter||"");
  toast("Installment moved to Pending Payments");
}
function refreshTodaySearch(value){
  window.todayFilter=normalizeTodaySearch(value);
  const q=window.todayFilter.trim().toLowerCase();
  document.querySelectorAll('#todayTable tbody tr[data-search], #todayMobileList .today-mobile-card[data-search]').forEach(el=>{
    el.style.display=!q || String(el.dataset.search||'').includes(q)?'':'none';
  });
}
function shiftTodayDate(delta){
  const value=window.todayCollectionDate||todayISO();
  const parts=value.split('-').map(Number);
  const base=new Date(parts[0],parts[1]-1,parts[2]);
  base.setDate(base.getDate()+delta);
  const yyyy=base.getFullYear();
  const mm=String(base.getMonth()+1).padStart(2,'0');
  const dd=String(base.getDate()).padStart(2,'0');
  window.todayCollectionDate=`${yyyy}-${mm}-${dd}`;
  openPage("today");
}
function printTodayCollection(date){
  // Print the same strict daily collection view: only installments due on the selected date.
  const rows=db.schedules.filter(s=>isActiveCustomer(s.customerId)&&s.dueDate===date);
  const body=`<h2>Collection Date: ${fmtDate(date)}</h2><table><thead><tr><th>Loan ID</th><th>Customer</th><th>Due Date</th><th>EMI</th><th>Paid on Date</th><th>Pending</th><th>Status</th></tr></thead><tbody>${rows.map(s=>{
    const l=db.loans.find(x=>x.id===s.loanId),cu=l&&db.customers.find(x=>x.id===l.customerId),paid=db.payments.filter(p=>p.date===date&&p.scheduleId===s.id).reduce((a,p)=>a+Number(p.total),0);
    return `<tr><td>${l?.id||""}</td><td>${esc(customerName(cu||{}))}</td><td>${fmtDate(s.dueDate)}</td><td>${money(s.emi)}</td><td>${money(paid)}</td><td>${money(dueAmount(s))}</td><td>${s.status}</td></tr>`}).join("")}</tbody></table>`;
  printSection(`Loan Management — Collection`,body);
}

function openPendingForCustomer(name){window.pendingFilter=String(name||'');window.pendingPreserveFilter=true;openPage('pending');}
let pendingCollectionState={page:1,limit:50,search:"",requestKey:"",request:null,cache:new Map()};
let pendingCollectionSearchTimer=null;
async function loadPendingCollection(c,page=pendingCollectionState.page,search=pendingCollectionState.search){
  const key=`${page}|${String(search||'').trim().toLowerCase()}|${todayISO()}`;
  if(pendingCollectionState.requestKey===key && pendingCollectionState.request)return pendingCollectionState.request;
  const cached=pendingCollectionState.cache.get(key);
  if(cached){renderPendingFromApi(c,cached);return cached;}
  pendingCollectionState.requestKey=key;
  pendingCollectionState.request=apiJSON(`/api/collections/pending?page=${page}&limit=${pendingCollectionState.limit}&search=${encodeURIComponent(search||'')}&date=${encodeURIComponent(todayISO())}`).then(x=>{pendingCollectionState.cache.set(key,x);if(pendingCollectionState.cache.size>8)pendingCollectionState.cache.delete(pendingCollectionState.cache.keys().next().value);pendingCollectionState.page=Number(x.pagination?.page||1);renderPendingFromApi(c,x);return x;}).finally(()=>pendingCollectionState.request=null);
  return pendingCollectionState.request;
}
function renderPending(c){
  const search=String(window.pendingFilter||'');
  pendingCollectionState.search=search;
  c.innerHTML=header("Pending Payments",`All pending payments`,`<button class="btn" onclick="printPending()">🖨 Print</button>`)+`<div class="card section-card"><div class="toolbar"><input class="grow" id="pendingFilter" value="${esc(search)}" placeholder="Search customer, mobile, Khata or loan ID..." oninput="refreshPendingSearch(this.value)"></div></div><div id="pendingCollectionApiBody"><div class="empty">Loading pending payments...</div></div>`;
  loadPendingCollection(c,pendingCollectionState.page,search).catch(e=>{console.error(e);document.getElementById('pendingCollectionApiBody').innerHTML=`<div class="empty"><div class="emoji">⚠</div><h3>Pending Payments unavailable</h3><p>${esc(e.message||'Request failed')}</p></div>`;});
}
function renderPendingFromApi(c,x){
  const body=document.getElementById('pendingCollectionApiBody');if(!body)return;
  const rows=Array.isArray(x.rows)?x.rows:[], summary=x.summary||{},pg=x.pagination||{};
  body.innerHTML=`<div class="stat-grid pending-stat-grid" style="margin-top:16px">${stat("Total Pending",money(summary.totalPending||0),"All installments currently in the pending queue")}${stat("Overdue Loans",String(summary.overdueLoans||0),"Loans with pending installments")}${stat("Overdue EMIs",String(summary.overdueEmis||0),"Pending installments")}${stat("Due Today",money(summary.dueToday||0),"Unpaid amount due today")}</div><div class="card section-card pending-list-card" style="margin-top:18px"><div class="pending-list-head"><h3>Customers Not Paid On Time</h3><span class="pending-count">${Number(pg.total||0)} ${Number(pg.total||0)===1?'entry':'entries'}</span></div><div class="pending-desktop table-wrap"><table class="data-table" id="pendingTable"><thead><tr><th>Sr No</th><th>Khata No</th><th>Customer</th><th>Mobile</th><th>Due Date</th><th>EMI</th><th>Pending</th><th>Days Late</th><th>Status</th><th>Action</th></tr></thead><tbody>${rows.map((r,i)=>{const s=r.schedule||{},l=r.loan||{},cu=r.customer||{},khata=l.legacyKhataNo||l.khataNo||l.id||'-';return `<tr><td>${(Number(pg.page||1)-1)*Number(pg.limit||50)+i+1}</td><td><b>${esc(khata)}</b></td><td><b>${esc(customerName(cu)||cu.name||'-')}</b></td><td>${esc(cu.mobile||'-')}</td><td>${fmtDate(s.dueDate)}</td><td>${money(s.emi)}</td><td><b>${money(r.pending||0)}</b></td><td>${Number(r.daysLate||0)}</td><td><span class="badge ${r.status==='OVERDUE'?'red':'amber'}">${esc(r.status||'PENDING')}</span></td><td><button class="btn small primary" onclick="openPaymentFor('${l.id}','${s.id}')">Collect</button></td></tr>`}).join('')}</tbody></table></div><div class="pending-mobile-list">${rows.map((r,i)=>{const s=r.schedule||{},l=r.loan||{},cu=r.customer||{},khata=l.legacyKhataNo||l.khataNo||l.id||'-';return `<article class="pending-mobile-card"><div class="pending-mobile-head"><div class="pending-mobile-title"><span class="pending-mobile-index">${(Number(pg.page||1)-1)*Number(pg.limit||50)+i+1}</span><div><b>${esc(customerName(cu)||cu.name||'-')}</b><small>${esc(khata)} · ${esc(cu.mobile||'-')}</small></div></div><span class="badge ${r.status==='OVERDUE'?'red':'amber'}">${esc(r.status||'PENDING')}</span></div><div class="pending-mobile-grid"><div><small>Due Date</small><b>${fmtDate(s.dueDate)}</b></div><div><small>Days Late</small><b>${Number(r.daysLate||0)}</b></div><div><small>EMI</small><b>${money(s.emi)}</b></div><div><small>Pending</small><b>${money(r.pending||0)}</b></div></div><button class="btn primary pending-mobile-collect" onclick="openPaymentFor('${l.id}','${s.id}')">Collect Payment</button></article>`}).join('')}${rows.length?'':`<div class='empty'><div class='emoji'>🎉</div><h3>${window.pendingFilter?'No matching pending payments':'No pending payments'}</h3><p>${window.pendingFilter?'Try another customer name, mobile, Khata or loan ID.':'There are currently no installments in the pending queue.'}</p></div>`}</div>${Number(pg.totalPages||1)>1?`<div class="toolbar" style="justify-content:center;margin-top:16px"><button class="btn" onclick="changePendingPage(${Number(pg.page||1)-1})" ${pg.hasPrevious?'':'disabled'}>← Previous</button><span>Page ${Number(pg.page||1)} of ${Number(pg.totalPages||1)}</span><button class="btn" onclick="changePendingPage(${Number(pg.page||1)+1})" ${pg.hasNext?'':'disabled'}>Next →</button></div>`:''}</div>`;
}
function refreshPendingSearch(value){
  window.pendingFilter=String(value||'');
  pendingCollectionState.page=1;
  clearTimeout(pendingCollectionSearchTimer);
  pendingCollectionSearchTimer=setTimeout(()=>loadPendingCollection(document.getElementById('content'),1,window.pendingFilter),300);
}
function changePendingPage(page){
  const pg=Math.max(1,Number(page)||1);pendingCollectionState.page=pg;loadPendingCollection(document.getElementById('content'),pg,window.pendingFilter||'').catch(e=>toast(e.message||'Could not load pending payments','err'));
}

// Kept for compatibility with older cached UI code; Pending Payments is no longer date-filtered.
function shiftPendingDate(delta){ openPage("pending"); }
function printPending(){
  // Print the complete pending queue, matching the Pending Payments page.
  const asOf=todayISO();
  const rows=pendingQueueRows(asOf).sort((a,b)=>b.dueDate.localeCompare(a.dueDate));
  const body=`<h2>Pending Payments — All</h2><table><thead><tr><th>Customer</th><th>Loan</th><th>Due Date</th><th>EMI</th><th>Pending</th><th>Days Late</th><th>Status</th></tr></thead><tbody>${rows.map(s=>{
    const l=db.loans.find(x=>x.id===s.loanId),cu=l&&db.customers.find(x=>x.id===l.customerId),st=isExplicitPending(s)?'PENDING':effectiveScheduleStatus(s,asOf);
    return `<tr><td>${esc(customerName(cu||{}))}</td><td>${l?.id||""}</td><td>${fmtDate(s.dueDate)}</td><td>${money(s.emi)}</td><td>${money(effectiveDueAmount(s))}</td><td>${Math.max(0,daysBetween(s.dueDate,asOf))}</td><td>${st}</td></tr>`}).join("")}</tbody></table>`;
  printSection(`Loan Management — Pending Payments`,body);
}


