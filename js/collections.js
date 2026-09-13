// Today collection and pending payment features.
function renderToday(c){
  const selected=(window.todayCollectionDate||todayISO());
  ensureLegacyOperationalSchedules(selected);

  // STRICT daily collection rule:
  // 1) Only installments whose DUE DATE equals the selected date are eligible.
  // 2) Fully paid installments remain visible for daily reference and their Payment button is disabled.
  // 3) If bad/duplicate schedule rows exist for the same loan/date, collapse them
  //    into ONE customer/loan row instead of showing the same loan repeatedly.
  const activeSchedules=db.schedules.filter(s=>isActiveCustomer(s.customerId) && s.dueDate===selected && !s.manualPending);
  // A payment received today may belong to an older overdue installment. It
  // must never be applied to today's installment merely because the loan is the same.
  const ps=db.payments.filter(p=>p.date===selected && isActiveCustomer(db.loans.find(l=>l.id===p.loanId)?.customerId));
  const todayScheduleIds=new Set(activeSchedules.map(s=>String(s.id)));
  const todayLoanIds=new Set(activeSchedules.map(s=>String(s.loanId)));
  const todayAllocatedPayments=ps.filter(p=>p.scheduleId ? todayScheduleIds.has(String(p.scheduleId)) : todayLoanIds.has(String(p.loanId)));

  const grouped=new Map();
  activeSchedules.forEach(s=>{
    const key=String(s.loanId);
    if(!grouped.has(key)) grouped.set(key,[]);
    grouped.get(key).push(s);
  });

  const rows=[];
  grouped.forEach((schedules,loanId)=>{
    const l=db.loans.find(x=>String(x.id)===String(loanId));
    if(!l) return;
    // The installment target must be based on the scheduled EMI itself.
    // A schedule can already have s.paid == s.emi, which makes dueAmount(s)
    // zero; that does NOT mean we should lose the paid reference row.
    const scheduledAmount=schedules.reduce((sum,s)=>sum+Number(s.emi||0)+Number(s.penalty||0),0);
    const due=schedules.reduce((sum,s)=>sum+effectiveDueAmount(s),0);
    // Only payments allocated to today's installment count here. Payments
    // entered today against an overdue schedule stay attached to that overdue row.
    const payments=ps.filter(p=>String(p.loanId)===String(loanId) &&
      (String(p.scheduleId||'')===String(schedules[0]?.id||'') ||
       (!p.scheduleId && schedules.some(x=>String(x.dueDate)===String(p.date)))));
    const paidOnDate=payments.reduce((sum,p)=>sum+Number(p.total||0),0);
    // If the schedule is already marked PAID, use the scheduled EMI as the
    // target and keep the row visible. This makes a fully-paid entry show
    // Status=Paid and disables the Payment button.
    const hasPaidSchedule=schedules.some(s=>effectiveScheduleStatus(s,selected)==='PAID');
    const target=Math.max(scheduledAmount,due);
    // A collection row is fully paid when the installment ledger is fully paid,
    // regardless of whether the payment transaction was entered with today's
    // date. Previously this depended on paidOnDate, so a completed installment
    // could show Pay Amount ₹0 but still expose the Payment button.
    const fullyPaidInstallment=schedules.every(s=>effectiveDueAmount(s)<=0.005);
    const fullyPaidToday=fullyPaidInstallment || (paidOnDate>0 && target>0 && paidOnDate>=target-0.005);
    const remainingDue=fullyPaidInstallment?0:Math.max(0,due-paidOnDate);
    const unpaid=schedules.find(s=>effectiveDueAmount(s)>0.005) || schedules[0];
    rows.push({s:unpaid,schedules,l,due:remainingDue,grossDue:target,paidOnDate,fullyPaidToday,hasPaidSchedule,fullyPaidInstallment});
  });

  // An installment explicitly moved to Pending Payments belongs to that
  // work queue and must disappear from Today's Collection until it is paid.
  // Once it is paid, the pending ID is removed and the installment may appear
  // again here as a paid reference row. This prevents the same unpaid item
  // from being actionable in both screens at the same time.
  const pendingIds=new Set(pendingQueue().map(id=>String(id)));
  const beforePendingCount=rows.length;
  const visibleRows=rows.filter(r=>!pendingIds.has(String(r.s?.id)) || r.fullyPaidInstallment);
  rows.length=0;
  rows.push(...visibleRows);

  rows.sort((a,b)=>String(a.l.id).localeCompare(String(b.l.id)));
  // Expected = gross scheduled amount for the selected date.
  // Pending = remaining unpaid amount after payments.
  // Keeping these separate prevents Expected from dropping to ₹0 just because
  // the installment was already collected. Dashboard uses the same ledger.
  const expected=rows.reduce((a,r)=>a+Number(r.grossDue||0),0);
  const collected=todayAllocatedPayments.reduce((a,p)=>a+Number(p.total||0),0);
  const interest=todayAllocatedPayments.reduce((a,p)=>a+Number(p.interest||0),0);
  const pending=rows.reduce((a,r)=>a+Number(r.due||0),0);

  c.innerHTML=header("Today's Collection",`Selected date: ${fmtDate(selected)}`,`<button class="btn" onclick="printTodayCollection('${selected}')">🖨 Print</button>`);
  c.innerHTML+=`<div class="card section-card">
    <div class="toolbar">
      <label style="font-weight:700">Collection Date</label>
      <input id="todayDatePicker" type="date" value="${selected}" onchange="window.todayCollectionDate=this.value;openPage('today')">
      <button class="btn" onclick="window.todayCollectionDate=todayISO();openPage('today')">Today</button>
      <button class="btn" onclick="shiftTodayDate(-1)">← Previous Day</button>
      <button class="btn" onclick="shiftTodayDate(1)">Next Day →</button>
      <input class="grow" id="todayFilter" placeholder="Search customer, mobile, Khata or loan ID..." value="${esc(window.todayFilter||'')}" oninput="refreshTodaySearch(this.value)">
    </div>
  </div>
  <div class="stat-grid" style="margin-top:16px">${stat("Expected",money(expected),"Unpaid EMIs due on selected date")}${stat("Collected",money(collected),"Payments received on selected date")}${stat("Interest",money(interest),"Interest received")}${stat("Pending",money(pending),"Unpaid amount for selected date")}</div>
  <div class="card section-card today-collection-card" style="margin-top:18px"><div class="today-collection-head"><h3>Collection Entries — ${fmtDate(selected)}</h3><span class="today-entry-count">${rows.length} ${rows.length===1?'entry':'entries'}</span></div>
  <div class="today-collection-desktop table-wrap"><table class="data-table" id="todayTable"><thead><tr><th>Sr No</th><th>Khata No</th><th>Name</th><th>Mobile</th><th>Loan Date</th><th>Loan Rs.</th><th>Remaining</th><th>Pay Amount</th><th>Paid Today</th><th>Remark</th><th>Action</th></tr></thead><tbody>${rows.map((r,i)=>{
    const s=r.s,l=r.l,cu=db.customers.find(x=>x.id===l.customerId);
    const remaining=loanOutstanding(l||{});
    const remark=r.fullyPaidToday?'Paid':(r.paidOnDate>0?'Partial / Paid':'Due Today');
    const khata=l?.legacyKhataNo||l?.khataNo||l?.id||'-';
    return `<tr data-search="${esc((khata+' '+l?.id+' '+customerName(cu||{})+' '+(cu?.mobile||'')).toLowerCase())}">
      <td>${i+1}</td><td><b>${esc(khata)}</b></td><td><b>${esc(customerName(cu||{}))}</b></td><td>${esc(cu?.mobile||'-')}</td><td>${fmtDate(l?.startDate)}</td><td>${money(l?.amount)}</td><td><b>${money(remaining)}</b></td><td><b>${money(r.due)}</b></td><td>${money(r.paidOnDate)}</td><td><span class="badge ${r.fullyPaidToday?'green':'amber'}">${remark}</span></td>
      <td>${(r.fullyPaidToday || r.due<=0.005)?'<button class="btn small" disabled title="This installment is fully paid">Paid</button>':`<div style="display:flex;gap:6px;justify-content:flex-end;flex-wrap:wrap"><button class="btn small primary" onclick="openPaymentFor('${l.id}','${s.id}')">Payment</button><button class="btn small" onclick="addToPending('${s.id}')">Add to Pending</button></div>`}</td>
    </tr>`}).join('')}</tbody></table></div>
  <div class="today-collection-mobile" id="todayMobileList">${rows.map((r,i)=>{
    const s=r.s,l=r.l,cu=db.customers.find(x=>x.id===l.customerId);
    const remaining=loanOutstanding(l||{});
    const remark=r.fullyPaidToday?'Paid':(r.paidOnDate>0?'Partial / Paid':'Due Today');
    const khata=l?.legacyKhataNo||l?.khataNo||l?.id||'-';
    const search=(khata+' '+l?.id+' '+customerName(cu||{})+' '+(cu?.mobile||'')).toLowerCase();
    return `<article class="today-mobile-card" data-search="${esc(search)}"><div class="today-mobile-head"><div><span class="today-mobile-index">${i+1}</span><div><b>${esc(customerName(cu||{}))}</b><small>${esc(khata)} · ${esc(cu?.mobile||'-')}</small></div></div><span class="badge ${r.fullyPaidToday?'green':'amber'}">${remark}</span></div><div class="today-mobile-grid"><div><small>Loan Date</small><b>${fmtDate(l?.startDate)}</b></div><div><small>Loan Amount</small><b>${money(l?.amount)}</b></div><div><small>Remaining</small><b>${money(remaining)}</b></div><div><small>Pay Amount</small><b>${money(r.due)}</b></div><div><small>Paid Today</small><b>${money(r.paidOnDate)}</b></div></div>${(r.fullyPaidToday || r.due<=0.005)?'<button class="btn small today-paid-btn" disabled>✓ Paid</button>':`<div class="today-mobile-actions"><button class="btn primary" onclick="openPaymentFor('${l.id}','${s.id}')">Payment</button><button class="btn" onclick="addToPending('${s.id}')">Add to Pending</button></div>`}</article>`}).join('')}
    ${rows.length?'':"<div class='empty'><div class='emoji'>📅</div><h3>No collection entries for ${fmtDate(selected)}</h3><p>Due, partially paid, and fully paid installments for the selected date will appear here for reference.</p></div>"}
  </div>
  ${rows.length?'':"<div class='today-collection-desktop'><div class='empty'><div class='emoji'>📅</div><h3>No collection entries for ${fmtDate(selected)}</h3><p>Due, partially paid, and fully paid installments for the selected date will appear here for reference.</p></div></div>"}
  </div>`;
}
async function addToPending(scheduleId){
  const s=db.schedules.find(x=>String(x.id)===String(scheduleId));
  if(!s){toast("Installment not found.","err");return;}
  if(effectiveDueAmount(s)<=0.005){toast("This installment is already paid.","err");return;}
  if(isExplicitPending(s)){toast("This installment is already in Pending Payments.","err");return;}
  addPendingQueueId(s);
  s.pendingAddedAt=new Date().toISOString();
  s.pendingAddedBy=currentUser?.username||"admin";
  refreshNotifications();
  await save();
  // Re-render Today's Collection from the persisted queue. The installment
  // must disappear from this page immediately after Add to Pending.
  renderToday(document.getElementById('content'));
  // Do not navigate until the server has confirmed the queue state. This
  // prevents a second click/navigation from rendering stale server data.
  toast("Installment moved to Pending Payments");
  openPage("today");
}
function refreshTodaySearch(value){
  window.todayFilter=String(value||'');
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
function renderPending(c){
  // Pending Payments is intentionally NOT date-filtered. It always shows the
  // complete explicit pending queue across all dates/years. The search box
  // below is the only filter the user applies on this page.
  const selected=todayISO();
  const rows=pendingQueueRows(selected).sort((a,b)=>b.dueDate.localeCompare(a.dueDate));
  // Search is a true data filter, not just a visual table filter.
  // When a customer / mobile / Khata / loan ID is entered, every KPI and
  // count on this page must represent ONLY that matching customer/loan.
  const pendingFilter=String(window.pendingFilter||'').trim().toLowerCase();
  const displayRows=pendingFilter?rows.filter(s=>{
    const l=db.loans.find(x=>String(x.id)===String(s.loanId)),cu=l&&db.customers.find(x=>String(x.id)===String(l.customerId));
    const khata=l?.legacyKhataNo||l?.id||'-';
    const st=effectiveScheduleStatus(s,selected);
    const haystack=(customerName(cu||{})+' '+(cu?.mobile||'')+' '+khata+' '+(l?.id||'')+' '+(cu?.id||'')+' '+st).toLowerCase();
    return haystack.includes(pendingFilter);
  }):rows;

  // All summary cards use the same filtered dataset as the table.
  const summaryRows=displayRows;
  const totalPending=summaryRows.reduce((a,s)=>a+effectiveDueAmount(s),0);
  const overdue=summaryRows.filter(s=>effectiveScheduleStatus(s,selected)==='OVERDUE');
  const dueToday=summaryRows.filter(s=>effectiveScheduleStatus(s,selected)==='DUE TODAY');
  c.innerHTML=header("Pending Payments",`All pending payments · ${overdue.length} overdue · ${dueToday.length} due today`,`<button class="btn" onclick="printPending()">🖨 Print</button>`);
  c.innerHTML+=`<div class="card section-card"><div class="toolbar">
    <input class="grow" id="pendingFilter" value="${esc(window.pendingFilter||'')}" placeholder="Search customer, mobile, Khata or loan ID..." oninput="refreshPendingSearch(this.value)">
  </div></div>
  <div class="stat-grid pending-stat-grid" style="margin-top:16px">${stat("Total Pending",money(totalPending),"All installments currently in the pending queue")}${stat("Overdue Loans",String(new Set(overdue.map(s=>s.loanId)).size),"Loans with pending installments")}${stat("Overdue EMIs",String(overdue.length),"Pending installments")}${stat("Due Today",money(dueToday.reduce((a,s)=>a+effectiveDueAmount(s),0)),"Unpaid amount due today")}</div>
  <div class="card section-card pending-list-card" style="margin-top:18px"><div class="pending-list-head"><h3>Customers Not Paid On Time</h3><span class="pending-count">${displayRows.length} ${displayRows.length===1?'entry':'entries'}</span></div>
  <div class="pending-desktop table-wrap"><table class="data-table" id="pendingTable"><thead><tr><th>Sr No</th><th>Khata No</th><th>Customer</th><th>Mobile</th><th>Due Date</th><th>EMI</th><th>Pending</th><th>Days Late</th><th>Status</th><th>Action</th></tr></thead><tbody>${displayRows.map((s,i)=>{
    const l=db.loans.find(x=>x.id===s.loanId),cu=l&&db.customers.find(x=>x.id===l.customerId),days=Math.max(0,daysBetween(s.dueDate,selected));
    const st=isExplicitPending(s)?'PENDING':effectiveScheduleStatus(s,selected);
    const khata=l?.legacyKhataNo||l?.id||'-';
    return `<tr data-search="${esc((customerName(cu||{})+' '+(cu?.mobile||'')+' '+khata+' '+(l?.id||'')+' '+st).toLowerCase())}" data-status="${st}"><td>${i+1}</td><td><b>${esc(khata)}</b></td><td><b>${esc(customerName(cu||{}))}</b></td><td>${esc(cu?.mobile||'-')}</td><td>${fmtDate(s.dueDate)}</td><td>${money(s.emi)}</td><td><b>${money(effectiveDueAmount(s))}</b></td><td>${days}</td><td><span class="badge ${st==='OVERDUE'?'red':st==='PENDING'?'amber':'amber'}">${st}</span></td><td><button class="btn small primary" onclick="openPaymentFor('${l.id}','${s.id}')">Collect</button></td></tr>`}).join('')}</tbody></table></div>
  <div class="pending-mobile-list">${displayRows.map((s,i)=>{
    const l=db.loans.find(x=>x.id===s.loanId),cu=l&&db.customers.find(x=>x.id===l.customerId),days=Math.max(0,daysBetween(s.dueDate,selected));
    const st=isExplicitPending(s)?'PENDING':effectiveScheduleStatus(s,selected);
    const khata=l?.legacyKhataNo||l?.id||'-';
    return `<article class="pending-mobile-card"><div class="pending-mobile-head"><div class="pending-mobile-title"><span class="pending-mobile-index">${i+1}</span><div><b>${esc(customerName(cu||{}))}</b><small>${esc(khata)} · ${esc(cu?.mobile||'-')}</small></div></div><span class="badge ${st==='OVERDUE'?'red':'amber'}">${st}</span></div><div class="pending-mobile-grid"><div><small>Due Date</small><b>${fmtDate(s.dueDate)}</b></div><div><small>Days Late</small><b>${days}</b></div><div><small>EMI</small><b>${money(s.emi)}</b></div><div><small>Pending</small><b>${money(effectiveDueAmount(s))}</b></div></div><button class="btn primary pending-mobile-collect" onclick="openPaymentFor('${l.id}','${s.id}')">Collect Payment</button></article>`}).join('')}</div>
  ${displayRows.length?'':`<div class='empty'><div class='emoji'>🎉</div><h3>${pendingFilter?'No matching pending payments':'No pending payments'}</h3><p>${pendingFilter?'Try another customer name, mobile, Khata or loan ID.':'There are currently no installments in the pending queue.'}</p></div>`}
  </div></div>`;
}
function refreshPendingSearch(value){
  window.pendingFilter=String(value||'');
  renderPending(document.getElementById('content'));
  const input=document.getElementById('pendingFilter');
  if(input){ input.focus(); input.setSelectionRange(input.value.length,input.value.length); }
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


