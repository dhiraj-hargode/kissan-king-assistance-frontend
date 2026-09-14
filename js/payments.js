// Payment entry, payment history and repayment schedule features.
function renderPayment(c){
  c.innerHTML=header("Payment Entry","Search a loan and record a payment.",`<button class="btn" onclick="openPage('history')">🧾 Payment History</button>`);
  c.innerHTML+=`<div class="card section-card"><div class="toolbar"><input class="grow" id="paymentSearch" placeholder="Enter Loan ID, Khata No, Customer ID, name or mobile..." oninput="searchPaymentLoans(this.value)"></div><div id="paymentResults" class="empty"><div class="emoji">💳</div><h3>Select a loan</h3><p>Search above to begin a payment.</p></div></div>`;
}
function searchPaymentLoans(q){
  q=q.toLowerCase().trim();const r=document.getElementById("paymentResults");if(!q){r.className="empty";r.innerHTML="<div class='emoji'>💳</div><h3>Select a loan</h3>";return}
  const ls=activeLoans().filter(l=>{const c=db.customers.find(x=>x.id===l.customerId);return (l.id+" "+(l.khataNo||"")+" "+(l.legacyKhataNo||"")+" "+l.customerId+" "+customerName(c||{})+" "+(c?.mobile||"")).toLowerCase().includes(q)});
  r.className="payment-search-results";r.innerHTML=ls.length?`<div class="payment-results-desktop"><div class="table-wrap"><table class="data-table"><thead><tr><th>Loan</th><th>Khata</th><th>Customer</th><th>Mobile</th><th>Amount</th><th>Remaining</th><th>Next EMI</th><th>Action</th></tr></thead><tbody>${ls.map(l=>{const c=db.customers.find(x=>x.id===l.customerId),n=nextDue(l);return `<tr><td>${esc(l.id)}</td><td>${esc(l.khataNo||l.legacyKhataNo||"-")}</td><td>${esc(customerName(c||{}))}</td><td>${esc(c?.mobile||"-")}</td><td>${money(l.amount)}</td><td>${money(loanOutstanding(l))}</td><td>${n?fmtDate(n.dueDate):"Completed"}</td><td><button class="btn small primary" onclick="openPaymentFor('${l.id}')">Open Payment</button></td></tr>`}).join("")}</tbody></table></div></div><div class="payment-results-mobile">${ls.map((l,i)=>{const c=db.customers.find(x=>x.id===l.customerId),n=nextDue(l),out=loanOutstanding(l);return `<article class="payment-loan-card"><div class="payment-loan-head"><div class="payment-loan-title"><span class="payment-loan-index">${i+1}</span><div><b>${esc(customerName(c||{}))}</b><small>${esc(l.id)} · Khata ${esc(l.khataNo||l.legacyKhataNo||"-")}</small></div></div><span class="payment-loan-status">${out>0.005?"OPEN":"PAID"}</span></div><div class="payment-loan-contact"><span>📱 ${esc(c?.mobile||"-")}</span><span>📅 ${n?fmtDate(n.dueDate):"Completed"}</span></div><div class="payment-loan-grid"><div><small>Loan Amount</small><b>${money(l.amount)}</b></div><div><small>Outstanding</small><b>${money(out)}</b></div></div><button type="button" class="btn primary payment-loan-action" onclick="openPaymentFor('${l.id}')">💳 Open Payment</button></article>`}).join("")}</div>`:`<div class="empty"><div class="emoji">🔎</div><h3>No matching loan</h3><p>Try a loan ID, Khata number, customer name, ID or mobile.</p></div>`;
}

async function openPaymentFor(loanId,scheduleId=null){
  await ensureServerDataLoaded();
  const l=db.loans.find(x=>x.id===loanId),c=l&&db.customers.find(x=>x.id===l.customerId);if(!l||!c)return; if(isExpiredCustomer(c.id)){toast("Expired/deceased customers are excluded from collection. View them under Expired People.","err");return;}
  // Remember where the payment was opened from. Completing a payment from
  // Pending Payments must return to Pending Payments, not Today's Collection.
  window.paymentReturnPage=(typeof currentPage!=="undefined"&&currentPage==="pending")?"pending":"today";
  const s=db.schedules.find(x=>x.id===scheduleId)||nextDue(l);
  if(!s){toast("This loan is completed.","err");return}
  openModal("Record Payment",`<div class="kpi-row"><div class="kpi"><b>${esc(customerName(c))}</b><span>Customer</span></div><div class="kpi"><b>${l.id}</b><span>Loan</span></div><div class="kpi"><b>${money(loanOutstanding(l))}</b><span>Outstanding Principal</span></div><div class="kpi"><b>${money(dueAmount(s))}</b><span>Current Due</span></div></div><hr>
  <form id="payForm"><div class="form-grid">${fg("Payment Date","date","date",true)}${fg("Principal","principal","number",true)}${fg("Interest","interest","number",true)}${fg("Penalty","penalty","number")}${fg("Payment Mode","mode","text",true)}${fg("Notes","notes")}</div><div class="notice">Installment due: <b>${fmtDate(s.dueDate)}</b>. Remaining installment amount: <b>${money(dueAmount(s))}</b>.</div></form>`,
  `<button class="btn" onclick="closeModal()">Cancel</button><button class="btn" type="button" onclick="calculatePaymentAmounts('${l.id}','${s.id}')">🧮 Calculate</button><button class="btn primary" onclick="savePayment('${l.id}','${s.id}')">Save Payment</button>`);
  const f=document.getElementById("payForm");
  f.date.value=todayISO();
  // Default the payment to the selected installment, not to the loan-level
  // balance. Legacy/interest-only installments can legitimately have ₹0
  // principal outstanding while still having an unpaid interest amount.
  const schedulePaid=effectiveSchedulePaid(s);
  const unpaidPrincipal=Math.max(0,Number(s.principal||0)-Math.min(Number(s.principal||0),Math.max(0,schedulePaid)));
  const principalDue=Math.min(unpaidPrincipal,Math.max(0,loanOutstanding(l)));
  const interestPaid=db.payments.filter(p=>String(p.scheduleId||'')===String(s.id)).reduce((a,p)=>a+Number(p.interest||0),0);
  const interestDue=Math.max(0,Number(s.interest||0)-interestPaid);
  // Keep Principal and Interest empty when opening a payment.
  // The user must explicitly enter the amount to collect instead of
  // accidentally saving the full installment defaults.
  f.principal.value="";
  f.interest.value="";
  f.penalty.value=Math.max(0,Number(s.penalty||0)-db.payments.filter(p=>String(p.scheduleId||'')===String(s.id)).reduce((a,p)=>a+Number(p.penalty||0),0));
  f.mode.value="Cash";
}
function calculatePaymentAmounts(loanId,scheduleId){
  const form=document.getElementById("payForm");
  if(!form)return;
  const l=db.loans.find(x=>String(x.id)===String(loanId));
  const s=db.schedules.find(x=>String(x.id)===String(scheduleId));
  if(!l||!s){toast("Unable to calculate payment amounts.","err");return;}

  const schedulePaid=effectiveSchedulePaid(s);
  const unpaidPrincipal=Math.max(0,Number(s.principal||0)-Math.min(Number(s.principal||0),Math.max(0,schedulePaid)));
  const principalDue=Math.min(unpaidPrincipal,Math.max(0,loanOutstanding(l)));
  const interestPaid=db.payments
    .filter(p=>String(p.scheduleId||"")===String(s.id))
    .reduce((a,p)=>a+Number(p.interest||0),0);
  const interestDue=Math.max(0,Number(s.interest||0)-interestPaid);

  form.principal.value=principalDue>0.005?principalDue:"";
  form.interest.value=interestDue>0.005?interestDue:"";

  const total=principalDue+interestDue+Number(form.penalty.value||0);
  toast(`Calculated: Principal ${money(principalDue)} + Interest ${money(interestDue)} = ${money(total)}`);
}

async function savePayment(loanId,scheduleId){
  const form=document.getElementById("payForm"); if(!form)return;
  const f=new FormData(form),o=Object.fromEntries(f.entries());
  const l=db.loans.find(x=>String(x.id)===String(loanId));
  const s=db.schedules.find(x=>String(x.id)===String(scheduleId));
  const errors=validatePaymentInput(o,l,s);
  if(errors.length){toast(errors[0],"err");return;}
  const principal=Number(o.principal||0),interest=Number(o.interest||0),penalty=Number(o.penalty||0),total=principal+interest+penalty;
  const payment={id:uid("PAY"),loanId:l.id,scheduleId:s.id,date:o.date,principal,interest,penalty,total,mode:cleanText(o.mode,50),notes:cleanText(o.notes,1000),createdAt:new Date().toISOString(),activityCreatedAt:new Date().toISOString()};
  db.payments.push(payment);
  s.paid=Number(s.paid||0)+principal+interest;
  if(s.paid>=Number(s.emi))s.paid=Number(s.emi);
  // Determine completion from the actual unpaid amount, not from whether
  // interest alone was collected. For EMI=NO loans, the principal remains
  // outstanding and the loan must continue with another monthly interest cycle.
  s.status=effectiveDueAmount(s)<=0.005?"PAID":statusForSchedule(s);
  if(s.status==="PAID" || effectiveDueAmount(s)<=0.005) removePendingQueueId(s);
  // Every unpaid future cycle must use the NEW remaining principal as its
  // interest base. This applies to both new and legacy/reconstructed loans.
  recalculateFutureInterest(l.id);
  // Interest-only loans continue month-to-month until principal is actually
  // repaid. Create the next cycle immediately after the current cycle is paid.
  if(String(l.emiOption||"YES").toUpperCase()==="NO" && loanOutstanding(l)>0.005 && s.status==="PAID"){
    nextDue(l);
  }
  // A loan is automatically closed once its principal balance reaches zero.
  // Pending Payments must then stop showing any historical/overdue schedule
  // rows that may still exist for the same loan. Interest-only loans are not
  // closed when only interest is paid because principal remains outstanding.
  if(loanOutstanding(l)<=0.005){
    l.status="CLOSED";
    scheduleFor(l.id).forEach(x=>{
      if(effectiveDueAmount(x)>0.005) x.status="PAID";
      removePendingQueueId(x);
    });
  }
  await save();
  if(typeof paymentHistoryCache!=='undefined') paymentHistoryCache.clear();
  const notificationsChanged=refreshNotifications();
  if(notificationsChanged) await save();
  updateNotifCount();
  toast("Payment recorded successfully");closeModal();
  const returnPage=window.paymentReturnPage||"today";
  delete window.paymentReturnPage;
  openPage(returnPage);
}
function showSchedule(loanId){selectedLoanId=loanId;openPage("schedule")}

function openPaymentHistory(customerId=null, loanId=null){
  window.historyCustomerId=customerId||null;
  window.historyLoanId=loanId||null;
  openPage("history");
}
let paymentHistoryState={page:1,limit:50,search:"",from:"",to:"",mode:"",customerId:"",loanId:"",total:0,totalPages:1,loading:false};
let paymentHistoryCache=new Map();
let paymentHistoryInFlight=new Map();
let paymentHistoryRequestToken=0;
let paymentHistoryFilterTimer=null;

function paymentHistoryParams(){
  return new URLSearchParams({
    page:String(paymentHistoryState.page),
    limit:String(paymentHistoryState.limit),
    search:paymentHistoryState.search,
    from:paymentHistoryState.from,
    to:paymentHistoryState.to,
    mode:paymentHistoryState.mode,
    customerId:paymentHistoryState.customerId,
    loanId:paymentHistoryState.loanId
  });
}
async function loadPaymentHistoryPage(page=paymentHistoryState.page){
  const table=document.getElementById('historyTable'),sum=document.getElementById('historySummary');
  if(!table||!sum)return;
  paymentHistoryState.page=Math.max(1,Number(page)||1);
  const params=paymentHistoryParams();
  const key=params.toString();
  const token=++paymentHistoryRequestToken;
  paymentHistoryState.loading=true;
  table.innerHTML=`<div class="empty"><div class="emoji">⏳</div><h3>Loading payments...</h3></div>`;
  try{
    let x=paymentHistoryCache.get(key);
    if(!x){
      if(paymentHistoryInFlight.has(key)) x=await paymentHistoryInFlight.get(key);
      else{
        const req=apiJSON(`/api/payments?${key}`);
        paymentHistoryInFlight.set(key,req);
        try{x=await req;}finally{paymentHistoryInFlight.delete(key);}
      }
      paymentHistoryCache.set(key,x);
      if(paymentHistoryCache.size>8) paymentHistoryCache.delete(paymentHistoryCache.keys().next().value);
    }
    if(token!==paymentHistoryRequestToken)return;
    const pg=x.pagination||{};
    paymentHistoryState.page=Number(pg.page||1);
    paymentHistoryState.total=Number(pg.total||0);
    paymentHistoryState.totalPages=Number(pg.totalPages||1);
    paymentHistoryState.loading=false;
    const rows=Array.isArray(x.payments)?x.payments:[];
    const s=x.summary||{};
    sum.innerHTML=`<div class="stat-grid history-stats">${stat("Transactions",Number(s.transactions||0),"Matching payments")}${stat("Total Collection",money(s.totalCollection||0),"Principal + interest + penalty")}${stat("Loan Amount",money(s.loanAmount||0),Number(s.matchingLoans||0)===1?"Original loan amount":"Across matching loans")}${stat("Remaining",money(s.remaining||0),Number(s.matchingLoans||0)===1?"Outstanding principal":"Across matching loans")}${stat("Principal",money(s.principal||0),"Principal received")}${stat("Interest",money(s.interest||0),"Interest received")}${stat("Penalty",money(s.penalty||0),"Penalty received")}</div>`;
    table.innerHTML=renderPaymentsTable(rows)+`<div class="toolbar" style="justify-content:space-between;margin-top:12px"><span class="muted">${paymentHistoryState.total?`Showing ${(paymentHistoryState.page-1)*paymentHistoryState.limit+1}-${Math.min(paymentHistoryState.page*paymentHistoryState.limit,paymentHistoryState.total)} of ${paymentHistoryState.total} payments`:`No payments found`}</span><div class="actions"><button class="btn" ${pg.hasPrevious?'':'disabled'} onclick="changePaymentHistoryPage(${paymentHistoryState.page-1})">← Previous</button><span class="muted">Page ${paymentHistoryState.page} of ${paymentHistoryState.totalPages}</span><button class="btn" ${pg.hasNext?'':'disabled'} onclick="changePaymentHistoryPage(${paymentHistoryState.page+1})">Next →</button></div></div>`;
  }catch(e){
    if(token!==paymentHistoryRequestToken)return;
    paymentHistoryState.loading=false;
    table.innerHTML=`<div class="empty"><div class="emoji">⚠</div><h3>Could not load payments</h3><p>${esc(e.message||'Request failed')}</p><button class="btn" onclick="loadPaymentHistoryPage(${paymentHistoryState.page})">↻ Retry</button></div>`;
  }
}
function renderPaymentHistory(c){
  const customerId=window.historyCustomerId||"";
  const loanId=window.historyLoanId||"";
  paymentHistoryState={page:1,limit:50,search:"",from:"",to:"",mode:"",customerId:String(customerId),loanId:String(loanId),total:0,totalPages:1,loading:false};
  const initialQuery=loanId?String(loanId):"";
  c.innerHTML=header("Payment History","Complete transaction history with customer, loan and date filters.",`<button class="btn" onclick="printPaymentHistory()">🖨 Print</button><button class="btn primary" onclick="openPage('payment')">＋ Add Payment</button>`);
  c.innerHTML+=`<div class="card section-card history-filter-card"><div class="toolbar history-toolbar">
    <input class="grow" id="historySearch" placeholder="Search customer, mobile, Khata / loan ID..." value="${esc(initialQuery)}" oninput="paymentHistoryFilterChanged()">
    <input id="historyFrom" type="date" onchange="paymentHistoryFilterChanged()">
    <input id="historyTo" type="date" onchange="paymentHistoryFilterChanged()">
    <select id="historyMode" onchange="paymentHistoryFilterChanged()"><option value="">All Modes</option><option>Cash</option><option>UPI</option><option>Bank Transfer</option><option>Cheque</option><option>Other</option></select>
    <button class="btn" onclick="clearPaymentHistoryFilters()">Clear</button>
  </div></div><div id="historySummary"></div><div id="historyTable"></div>`;
  loadPaymentHistoryPage(1);
}
function paymentHistoryFilterChanged(){
  paymentHistoryState.search=(document.getElementById("historySearch")?.value||"").trim();
  paymentHistoryState.from=document.getElementById("historyFrom")?.value||"";
  paymentHistoryState.to=document.getElementById("historyTo")?.value||"";
  paymentHistoryState.mode=document.getElementById("historyMode")?.value||"";
  paymentHistoryState.page=1;
  clearTimeout(paymentHistoryFilterTimer);
  paymentHistoryFilterTimer=setTimeout(()=>loadPaymentHistoryPage(1),300);
}
function filterPaymentHistory(){paymentHistoryFilterChanged();}
async function changePaymentHistoryPage(page){
  if(paymentHistoryState.loading)return;
  const p=Math.max(1,Math.min(paymentHistoryState.totalPages,Number(page)||1));
  await loadPaymentHistoryPage(p);
}
function clearPaymentHistoryFilters(){
  ["historySearch","historyFrom","historyTo"].forEach(id=>{const e=document.getElementById(id);if(e)e.value=""});
  const m=document.getElementById("historyMode");if(m)m.value="";
  window.historyCustomerId=null;window.historyLoanId=null;
  paymentHistoryState.customerId="";paymentHistoryState.loanId="";
  paymentHistoryFilterChanged();
}
async function printPaymentHistory(){
  await ensureServerDataLoaded();
  const rows=paymentHistoryRows();
  const body=`<h2>Payment History</h2><p>Generated: ${fmtDate(todayISO())}</p><table><thead><tr><th>Payment ID</th><th>Date</th><th>Customer</th><th>Loan / Khata</th><th>Principal</th><th>Interest</th><th>Penalty</th><th>Total</th><th>Mode</th></tr></thead><tbody>${rows.map(p=>{const l=db.loans.find(x=>String(x.id)===String(p.loanId)),cu=l&&db.customers.find(x=>String(x.id)===String(l.customerId));return `<tr><td>${esc(p.id)}</td><td>${fmtDate(p.date)}</td><td>${esc(customerName(cu||{}))}</td><td>${esc(l?.id||"")}</td><td>${money(p.principal)}</td><td>${money(p.interest)}</td><td>${money(p.penalty)}</td><td>${money(p.total)}</td><td>${esc(p.mode||"")}</td></tr>`}).join("")}</tbody></table>`;
  printSection("Loan Management — Payment History",body);
}
function paymentHistoryRows(){
  const q=(document.getElementById("historySearch")?.value||"").trim().toLowerCase();
  const from=document.getElementById("historyFrom")?.value||"",to=document.getElementById("historyTo")?.value||"",mode=document.getElementById("historyMode")?.value||"";
  return db.payments.filter(p=>{
    const l=db.loans.find(x=>String(x.id)===String(p.loanId));const cu=l&&db.customers.find(x=>String(x.id)===String(l.customerId));
    const hay=[p.id,p.date,p.loanId,l?.customerId,customerName(cu||{}),cu?.mobile,cu?.reference,l?.legacyKhataNo,l?.khataNo].join(" ").toLowerCase();
    return (!q||hay.includes(q))&&(!from||p.date>=from)&&(!to||p.date<=to)&&(!mode||String(p.mode||"")===mode);
  }).sort((a,b)=>String(b.date).localeCompare(String(a.date))||String(b.id).localeCompare(String(a.id)));
}
function paymentHistoryLoanSummary(rows){
  const loanIds=[...new Set(rows.map(p=>String(p.loanId)).filter(Boolean))];
  const loans=loanIds.map(id=>db.loans.find(l=>String(l.id)===id)).filter(Boolean);
  const loanAmount=loans.reduce((sum,l)=>sum+Number(l.amount||0),0);
  const remaining=loans.reduce((sum,l)=>sum+Math.max(0,loanOutstanding(l)),0);
  return {loanAmount,remaining,count:loans.length};
}

async function editPayment(id){
  const p=db.payments.find(x=>String(x.id)===String(id));
  if(!p){toast("Payment not found.","err");return;}
  const l=db.loans.find(x=>String(x.id)===String(p.loanId));
  if(!l){toast("Loan for this payment was not found.","err");return;}
  openModal("Edit Payment",`<div class="notice">Editing a payment will recalculate the loan balance and schedule. The original values are preserved in the audit trail.</div><form id="editPayForm"><div class="form-grid">${fg("Payment Date","date","date",true)}${fg("Principal","principal","number",true)}${fg("Interest","interest","number",true)}${fg("Penalty","penalty","number")}${fg("Payment Mode","mode","text",true)}${fg("Notes","notes")}</div></form>`,`<button class="btn" onclick="closeModal()">Cancel</button><button class="btn primary" onclick="saveEditedPayment('${esc(p.id)}')">Save Changes</button>`);
  const f=document.getElementById("editPayForm");f.date.value=p.date;f.principal.value=p.principal;f.interest.value=p.interest;f.penalty.value=p.penalty;f.mode.value=p.mode||"Cash";f.notes.value=p.notes||"";
}
function saveEditedPayment(id){
  const p=db.payments.find(x=>String(x.id)===String(id));
  if(!p){toast("Payment not found.","err");return;}
  const l=db.loans.find(x=>String(x.id)===String(p.loanId));
  const s=db.schedules.find(x=>String(x.id)===String(p.scheduleId));
  const form=document.getElementById("editPayForm"),o=Object.fromEntries(new FormData(form).entries());
  // Temporarily remove old principal from outstanding validation.
  const currentOutstanding=loanOutstanding(l)+Number(p.principal||0);
  const principal=Number(o.principal||0),interest=Number(o.interest||0),penalty=Number(o.penalty||0),total=principal+interest+penalty;
  const errors=[];
  if(!validISODate(o.date)) errors.push("Enter a valid payment date.");
  if(o.date<l.startDate) errors.push("Payment date cannot be before the loan start date.");
  if(principal<0||interest<0||penalty<0) errors.push("Payment amounts cannot be negative.");
  if(principal>currentOutstanding+0.005) errors.push("Principal payment cannot exceed the available loan balance.");
  if(total<=0) errors.push("Payment amount must be greater than zero.");
  if(!cleanText(o.mode,50)) errors.push("Payment mode is required.");
  if(errors.length){toast(errors[0],"err");return;}
  // Preserve the previous values for audit.
  db.deletedRecords=db.deletedRecords||[];
  db.deletedRecords.push({id:uid("AUD"),type:"payment-edit",recordId:p.id,deletedAt:new Date().toISOString(),deletedBy:"admin",reason:"Payment updated",data:{before:{...p}}});
  const oldPrincipal=Number(p.principal||0),oldInterest=Number(p.interest||0);
  p.date=o.date;p.principal=principal;p.interest=interest;p.penalty=penalty;p.total=total;p.mode=cleanText(o.mode,50);p.notes=cleanText(o.notes,1000);p.updatedAt=new Date().toISOString();
  if(s){s.paid=Math.max(0,Number(s.paid||0)-oldPrincipal-oldInterest+principal+interest);s.status=statusForSchedule(s);}
  save();
  if(typeof paymentHistoryCache!=='undefined') paymentHistoryCache.clear();
  toast("Payment updated successfully");closeModal();renderPage("history");
}

function paymentHistoryRemainingMap(){
  const map=new Map();
  const byLoan=new Map();
  db.payments.forEach(p=>{
    const key=String(p.loanId);
    if(!byLoan.has(key))byLoan.set(key,[]);
    byLoan.get(key).push(p);
  });
  byLoan.forEach((items,key)=>{
    const loan=db.loans.find(l=>String(l.id)===key);
    if(!loan)return;
    let remaining=Math.max(0,Number(loan.amount||0));
    items.slice().sort((a,b)=>String(a.date).localeCompare(String(b.date))||String(a.id).localeCompare(String(b.id))).forEach(p=>{
      remaining=Math.max(0,remaining-Number(p.principal||0));
      map.set(String(p.id),remaining);
    });
  });
  return map;
}
function renderPaymentsTable(rows){
  if(!rows.length)return `<div class="empty"><div class="emoji">💳</div><h3>No payments found</h3><p>Payments you record will appear here.</p></div>`;
  const desktopRows=rows.map(p=>{
    const l=p.loan||db.loans.find(x=>String(x.id)===String(p.loanId));
    const c=p.customer||(l&&db.customers.find(x=>String(x.id)===String(l.customerId)));
    const khata=l?.legacyKhataNo||l?.khataNo||l?.id||"-";
    return `<tr><td>${esc(p.id)}</td><td>${fmtDate(p.date)}</td><td>${c?`<button class="link-btn" onclick="viewCustomer('${esc(c.id)}')">${esc(customerName(c))}</button>`:"-"}</td><td><button class="link-btn" onclick="showSchedule('${esc(l?.id||"")}')">${esc(khata)}</button></td><td>${money(p.principal)}</td><td>${money(p.interest)}</td><td>${money(p.penalty)}</td><td><b>${money(p.total)}</b></td><td>${esc(p.mode||"-")}</td><td class="table-actions"><button class="btn small" onclick="viewPayment('${esc(p.id)}')">View</button><button class="btn small" onclick="editPayment('${esc(p.id)}')">Edit</button>${currentUser?.role==='Administrator'?`<button class="btn small danger" onclick="confirmDeleteRecord('payment','${esc(p.id)}')">Delete</button>`:`<button class="btn small danger" disabled title="Only Administrators can delete records">Delete</button>`}</td></tr>`;
  }).join("");
  const mobileRows=rows.map(p=>{
    const l=p.loan||db.loans.find(x=>String(x.id)===String(p.loanId));
    const c=p.customer||(l&&db.customers.find(x=>String(x.id)===String(l.customerId)));
    const khata=l?.legacyKhataNo||l?.khataNo||l?.id||"-";
    const customer=c?`<button class="link-btn payment-mobile-name" onclick="viewCustomer('${esc(c.id)}')">${esc(customerName(c))}</button>`:"-";
    return `<article class="payment-mobile-card"><div class="payment-mobile-head"><div><b>${esc(p.id)}</b><span>${fmtDate(p.date)}</span></div><strong>${money(p.total)}</strong></div><div class="payment-mobile-customer">${customer}<button class="link-btn" onclick="showSchedule('${esc(l?.id||"")}')">${esc(khata)}</button></div><div class="payment-mobile-breakdown"><span><small>Principal</small><b>${money(p.principal)}</b></span><span><small>Interest</small><b>${money(p.interest)}</b></span><span><small>Penalty</small><b>${money(p.penalty)}</b></span><span><small>Mode</small><b>${esc(p.mode||"-")}</b></span></div><div class="payment-mobile-actions"><button class="btn small" onclick="viewPayment('${esc(p.id)}')">View</button><button class="btn small" onclick="editPayment('${esc(p.id)}')">Edit</button>${currentUser?.role==='Administrator'?`<button class="btn small danger" onclick="confirmDeleteRecord('payment','${esc(p.id)}')">Delete</button>`:`<button class="btn small danger" disabled>Delete</button>`}</div></article>`;
  }).join("");
  return `<div class="payment-history-desktop table-wrap"><table class="data-table"><thead><tr><th>Payment ID</th><th>Date</th><th>Customer</th><th>Loan / Khata</th><th>Principal</th><th>Interest</th><th>Penalty</th><th>Total</th><th>Mode</th><th>Action</th></tr></thead><tbody>${desktopRows}</tbody></table></div><div class="payment-history-mobile">${mobileRows}</div>`;
}

// ---------- Single source of truth for financial reports ----------
// Reports MUST use actual recorded payments only. Expected schedules are never
// treated as received revenue. Expired/dead customers are excluded from live
// operational reporting, but their historical payments remain valid records.
function reportPayments(){
  return db.payments.filter(p=>{
    const l=db.loans.find(x=>String(x.id)===String(p.loanId));
    return l && /^\d{4}-\d{2}-\d{2}$/.test(String(p.date||""));
  });
}
