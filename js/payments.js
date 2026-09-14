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
function renderPaymentHistory(c){
  const customerId=window.historyCustomerId||"";
  const loanId=window.historyLoanId||"";
  const selectedCustomer=db.customers.find(x=>String(x.id)===String(customerId));
  const selectedLoan=db.loans.find(x=>String(x.id)===String(loanId));
  const initialQuery=selectedLoan?selectedLoan.id:(selectedCustomer?customerName(selectedCustomer):"");
  c.innerHTML=header("Payment History","Complete transaction history with customer, loan and date filters.",`<button class="btn" onclick="printPaymentHistory()">🖨 Print</button><button class="btn primary" onclick="openPage('payment')">＋ Add Payment</button>`);
  c.innerHTML+=`<div class="card section-card history-filter-card"><div class="toolbar history-toolbar">
    <input class="grow" id="historySearch" placeholder="Search customer, mobile, Khata / loan ID..." value="${esc(initialQuery)}" oninput="filterPaymentHistory()">
    <input id="historyFrom" type="date" onchange="filterPaymentHistory()">
    <input id="historyTo" type="date" onchange="filterPaymentHistory()">
    <select id="historyMode" onchange="filterPaymentHistory()"><option value="">All Modes</option><option>Cash</option><option>UPI</option><option>Bank Transfer</option><option>Cheque</option><option>Other</option></select>
    <button class="btn" onclick="clearPaymentHistoryFilters()">Clear</button>
  </div></div><div id="historySummary"></div><div id="historyTable"></div>`;
  filterPaymentHistory();
}
function paymentHistoryRows(){
  const q=(document.getElementById("historySearch")?.value||"").trim().toLowerCase();
  const from=document.getElementById("historyFrom")?.value||"", to=document.getElementById("historyTo")?.value||"", mode=document.getElementById("historyMode")?.value||"";
  return db.payments.filter(p=>{
    const l=db.loans.find(x=>String(x.id)===String(p.loanId));
    const cu=l&&db.customers.find(x=>String(x.id)===String(l.customerId));
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
function filterPaymentHistory(){
  const rows=paymentHistoryRows();
  const total=rows.reduce((a,p)=>a+Number(p.total||0),0), principal=rows.reduce((a,p)=>a+Number(p.principal||0),0), interest=rows.reduce((a,p)=>a+Number(p.interest||0),0), penalty=rows.reduce((a,p)=>a+Number(p.penalty||0),0);
  const loanSummary=paymentHistoryLoanSummary(rows);
  const sum=document.getElementById("historySummary"), table=document.getElementById("historyTable"); if(!sum||!table)return;
  const loanLabel=loanSummary.count===1?"Loan Amount":"Total Loan Amount";
  const remainingLabel=loanSummary.count===1?"Remaining Principal":"Total Remaining";
  sum.innerHTML=`<div class="stat-grid history-stats">${stat("Transactions",rows.length,"Matching payments")}${stat("Total Collection",money(total),"Principal + interest + penalty")}${stat("Loan Amount",money(loanSummary.loanAmount),loanSummary.count===1?"Original loan amount":"Across matching loans")}${stat("Remaining",money(loanSummary.remaining),loanSummary.count===1?"Outstanding principal":"Across matching loans")}${stat("Principal",money(principal),"Principal received")}${stat("Interest",money(interest),"Interest received")}${stat("Penalty",money(penalty),"Penalty received")}</div>`;
  table.innerHTML=renderPaymentsTable(rows);
}
function clearPaymentHistoryFilters(){
  ["historySearch","historyFrom","historyTo"].forEach(id=>{const e=document.getElementById(id);if(e)e.value=""});
  const m=document.getElementById("historyMode");if(m)m.value="";
  window.historyCustomerId=null;window.historyLoanId=null;filterPaymentHistory();
}
function printPaymentHistory(){
  const rows=paymentHistoryRows();
  const remainingMap=paymentHistoryRemainingMap();
  const body=`<h2>Payment History</h2><p>Generated: ${fmtDate(todayISO())}</p><table><thead><tr><th>Payment ID</th><th>Date</th><th>Customer</th><th>Loan / Khata</th><th>Principal</th><th>Interest</th><th>Penalty</th><th>Total</th><th>Mode</th></tr></thead><tbody>${rows.map(p=>{const l=db.loans.find(x=>String(x.id)===String(p.loanId)),cu=l&&db.customers.find(x=>String(x.id)===String(l.customerId));return `<tr><td>${esc(p.id)}</td><td>${fmtDate(p.date)}</td><td>${esc(customerName(cu||{}))}</td><td>${esc(l?.id||"")}</td><td>${money(p.principal)}</td><td>${money(p.interest)}</td><td>${money(p.penalty)}</td><td>${money(p.total)}</td><td>${esc(p.mode||"")}</td></tr>`}).join("")}</tbody></table>`;
  printSection("Loan Management — Payment History",body);
}
function renderSchedule(c){
  c.innerHTML=header("Repayment Schedule","Search by loan ID, customer ID or customer name.");
  c.innerHTML+=`<div class="card section-card"><div class="toolbar"><input class="grow" id="scheduleSearch" placeholder="Search loan/customer..." oninput="searchSchedule(this.value)"></div><div id="scheduleArea" class="empty"><div class="emoji">📋</div><h3>Select a loan</h3></div></div>`;
  if(selectedLoanId){const l=db.loans.find(x=>String(x.id)===String(selectedLoanId));if(l){document.getElementById("scheduleSearch").value=l.id;searchSchedule(l.id)}}
}
function scheduleLedgerPayments(s){
  const seen=new Set(); let principal=0,interest=0,penalty=0;
  db.payments.filter(p=>String(p.loanId)===String(s.loanId) &&
    (String(p.scheduleId||"")===String(s.id) || String(p.date||"")===String(s.dueDate||"")))
    .forEach(p=>{const id=String(p.id);if(seen.has(id))return;seen.add(id);principal+=Number(p.principal||0);interest+=Number(p.interest||0);penalty+=Number(p.penalty||0);});
  return {principal,interest,penalty,total:principal+interest+penalty};
}
function repaymentScheduleDisplayRows(loan){
  // Build the display from the loan + payment ledger. Legacy operational
  // cycles use installment numbers 900000+ internally; those numbers must
  // NEVER be passed to monthlyDueDate() because they produce Invalid Date.
  // Normal duration rows use the loan apply date; operational legacy rows use
  // their stored valid due date and are displayed with a normal sequence.
  const all=scheduleFor(loan.id).slice().filter(s=>validISODate(s.dueDate)||Number(s.installment||0)<900000)
    .sort((a,b)=>{
      const ad=validISODate(a.dueDate)?a.dueDate:"9999-12-31", bd=validISODate(b.dueDate)?b.dueDate:"9999-12-31";
      if(ad!==bd)return ad.localeCompare(bd);
      return Number(a.installment||0)-Number(b.installment||0);
    });
  const rows=[];
  let cumulativePrincipalPaid=0;
  let closed=false;
  let displayInstallment=0;

  for(const s of all){
    if(closed) break;
    const internalInstallment=Number(s.installment||0);
    const isOperational=internalInstallment>=900000;
    const installment=++displayInstallment;
    const dueDate=isOperational
      ? (validISODate(s.dueDate)?s.dueDate:monthlyDueDate(loan.startDate,installment-1))
      : (monthlyDueDate(loan.startDate,installment-1) || s.dueDate);
    if(!validISODate(dueDate)) continue;
    const pay=scheduleLedgerPayments({...s,dueDate});

    // Scheduled principal: EMI=YES uses the generated principal component;
    // EMI=NO is interest-only, so scheduled principal is zero.
    const scheduledPrincipal=String(loan.emiOption||'YES').toUpperCase()==='NO'
      ? 0
      : Math.max(0,Number(s.principal||0));

    // Use the stored interest for historical rows, but calculate a sensible
    // fallback when the schedule was created with missing/stale interest.
    let scheduledInterest=Number(s.interest||0);
    if(!Number.isFinite(scheduledInterest)) scheduledInterest=0;

    const paidPrincipal=Math.max(0,Number(pay.principal||0));
    const paidInterest=Math.max(0,Number(pay.interest||0));
    const paidPenalty=Math.max(0,Number(pay.penalty||0));
    const paidTotal=Number((paidPrincipal+paidInterest+paidPenalty).toFixed(2));
    const scheduledPenalty=Math.max(0,Number(s.penalty||0));
    const scheduledEmi=Math.max(0,Number(s.emi||scheduledPrincipal+scheduledInterest+scheduledPenalty));

    cumulativePrincipalPaid += paidPrincipal;
    const remaining=Math.max(0,Number(loan.amount||0)-cumulativePrincipalPaid);
    const effectivePaid=Math.max(paidTotal,Number(s.paid||0));
    const status=effectiveDueAmount({...s,dueDate})<=0.005 ? 'PAID' : effectiveScheduleStatus({...s,dueDate});

    rows.push({...s,
      installment,
      dueDate,
      principal:scheduledPrincipal,
      interest:scheduledInterest,
      emi:Number((scheduledPrincipal+scheduledInterest+scheduledPenalty).toFixed(2)) || scheduledEmi,
      paid:effectivePaid,
      penalty:scheduledPenalty,
      remaining,
      status
    });

    // Once actual principal reaches zero, there are no real future
    // installments. Hide all zero-value rows after the closing payment.
    if(remaining<=0.005 && paidPrincipal>0) closed=true;
  }
  return rows;
}
function renderSelectedSchedule(loan){
  const area=document.getElementById('scheduleArea');
  if(!area||!loan)return;
  const cu=db.customers.find(x=>String(x.id)===String(loan.customerId));
  const rows=repaymentScheduleDisplayRows(loan);
  if(!rows.length){
    area.className='empty';
    area.innerHTML=`<div class="emoji">📋</div><h3>No repayment schedule</h3><p>This loan does not have valid schedule entries.</p>`;
    return;
  }
  const totalInterest=rows.reduce((a,s)=>a+Number(s.interest||0),0);
  const closed=loanOutstanding(loan)<=0.005 || String(loan.status||'').toUpperCase()==='COMPLETED' || String(loan.status||'').toUpperCase()==='CLOSED';
  area.className='';
  area.innerHTML=`<div class="kpi-row"><div class="kpi"><b>${esc(customerName(cu||{}))}</b><span>Customer</span></div><div class="kpi"><b>${money(loan.amount)}</b><span>Loan Amount</span></div><div class="kpi"><b>${loan.interestRate}%</b><span>Monthly Interest</span></div><div class="kpi"><b>${money(totalInterest)}</b><span>Total Interest</span></div></div>${closed?`<div class="notice" style="margin:12px 0">✓ Loan completed — schedule ends on the final payment. Future zero-value installments are not shown.</div>`:''}<div class="actions no-print" style="margin:15px 0"><button class="btn" onclick="window.print()">🖨 Print</button></div><div class="loan-schedule-desktop"><div class="table-wrap"><table class="data-table"><thead><tr><th>Sr No</th><th>Due Date</th><th>Principal</th><th>Interest</th><th>EMI</th><th>Paid</th><th>Penalty</th><th>Remaining</th><th>Status</th></tr></thead><tbody>${rows.map(s=>`<tr><td>${s.installment}</td><td>${fmtDate(s.dueDate)}</td><td>${money(s.principal)}</td><td>${money(s.interest)}</td><td>${money(s.emi)}</td><td>${money(s.paid)}</td><td>${money(s.penalty)}</td><td><b>${money(s.remaining)}</b></td><td><span class="badge ${s.status==='PAID'?'green':s.status==='OVERDUE'?'red':s.status==='DUE TODAY'?'amber':'blue'}">${s.status}</span></td></tr>`).join('')}</tbody></table></div></div><div class="loan-schedule-mobile">${rows.map(s=>`<article class="schedule-mobile-card"><div class="schedule-mobile-head"><div><b>Installment ${s.installment}</b><span>Due ${fmtDate(s.dueDate)}</span></div><span class="badge ${s.status==='PAID'?'green':s.status==='OVERDUE'?'red':s.status==='DUE TODAY'?'amber':'blue'}">${s.status}</span></div><div class="schedule-mobile-grid"><div><small>Principal</small><b>${money(s.principal)}</b></div><div><small>Interest</small><b>${money(s.interest)}</b></div><div><small>EMI</small><b>${money(s.emi)}</b></div><div><small>Paid</small><b>${money(s.paid)}</b></div><div><small>Penalty</small><b>${money(s.penalty)}</b></div><div><small>Remaining</small><b>${money(s.remaining)}</b></div></div></article>`).join('')}</div>`;
}
function searchSchedule(q){
  q=String(q||'').trim().toLowerCase();
  const area=document.getElementById('scheduleArea');
  if(!area)return;
  const ls=activeLoans().filter(l=>{
    const c=db.customers.find(x=>String(x.id)===String(l.customerId));
    const hay=[l.id,l.customerId,l.khataNo,l.legacyKhataNo,customerName(c||{}),c?.mobile].join(' ').toLowerCase();
    return !q || hay.includes(q);
  });

  // Exact loan-ID search opens the schedule immediately. Previously the field
  // could contain an exact ID while the page still showed "Select a loan".
  const exact=activeLoans().find(l=>String(l.id).toLowerCase()===q);
  if(exact){
    selectedLoanId=exact.id;
    renderSelectedSchedule(exact);
    return;
  }

  if(ls.length===1 && q){
    selectedLoanId=ls[0].id;
    renderSelectedSchedule(ls[0]);
    return;
  }

  selectedLoanId=null;
  if(q){
    area.className='';
    area.innerHTML=ls.length
      ? ls.map(l=>`<button class="btn" style="display:block;width:100%;text-align:left;margin:7px 0" onclick="showSchedule('${esc(l.id)}')"><b>${esc(l.id)}</b> — ${esc(customerName(db.customers.find(c=>String(c.id)===String(l.customerId))||{}))} — ${money(l.amount)}</button>`).join('')
      : `<div class="empty">No matching loan.</div>`;
  }else{
    area.className='empty';
    area.innerHTML=`<div class="emoji">📋</div><h3>Search for a loan</h3><p>Enter a loan ID, customer ID or customer name.</p>`;
  }
}

function viewPayment(id){
  const p=db.payments.find(x=>String(x.id)===String(id));
  if(!p){toast("Payment not found.","err");return;}
  const l=db.loans.find(x=>String(x.id)===String(p.loanId));
  const cu=l&&db.customers.find(x=>String(x.id)===String(l.customerId));
  openModal("Payment Details",`<div class="kpi-row"><div class="kpi"><b>${esc(p.id)}</b><span>Payment ID</span></div><div class="kpi"><b>${fmtDate(p.date)}</b><span>Payment Date</span></div><div class="kpi"><b>${esc(customerName(cu||{}))}</b><span>Customer</span></div><div class="kpi"><b>${money(p.total)}</b><span>Total Paid</span></div></div><hr><div class="detail-grid"><div><b>Loan / Khata</b><span>${esc(l?.legacyKhataNo||l?.khataNo||l?.id||"-")}</span></div><div><b>Principal</b><span>${money(p.principal)}</span></div><div><b>Interest</b><span>${money(p.interest)}</span></div><div><b>Penalty</b><span>${money(p.penalty)}</span></div><div><b>Payment Mode</b><span>${esc(p.mode||"-")}</span></div><div><b>Notes</b><span>${esc(p.notes||"-")}</span></div></div>`, `<button class="btn" onclick="closeModal()">Close</button><button class="btn primary" onclick="closeModal();editPayment('${esc(p.id)}')">✏ Edit Payment</button>${currentUser?.role==='Administrator'?`<button class="btn danger" onclick="confirmDeleteRecord('payment','${esc(p.id)}')">🗑 Delete Entry</button>`:`<button class="btn danger" disabled title="Only Administrators can delete records">🗑 Delete Entry</button>`}`);
}
function editPayment(id){
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
  save();toast("Payment updated successfully");closeModal();renderPage("history");
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
    const l=db.loans.find(x=>String(x.id)===String(p.loanId));
    const c=l&&db.customers.find(x=>String(x.id)===String(l.customerId));
    const khata=l?.legacyKhataNo||l?.khataNo||l?.id||"-";
    return `<tr><td>${esc(p.id)}</td><td>${fmtDate(p.date)}</td><td>${c?`<button class="link-btn" onclick="viewCustomer('${esc(c.id)}')">${esc(customerName(c))}</button>`:"-"}</td><td><button class="link-btn" onclick="showSchedule('${esc(l?.id||"")}')">${esc(khata)}</button></td><td>${money(p.principal)}</td><td>${money(p.interest)}</td><td>${money(p.penalty)}</td><td><b>${money(p.total)}</b></td><td>${esc(p.mode||"-")}</td><td class="table-actions"><button class="btn small" onclick="viewPayment('${esc(p.id)}')">View</button><button class="btn small" onclick="editPayment('${esc(p.id)}')">Edit</button>${currentUser?.role==='Administrator'?`<button class="btn small danger" onclick="confirmDeleteRecord('payment','${esc(p.id)}')">Delete</button>`:`<button class="btn small danger" disabled title="Only Administrators can delete records">Delete</button>`}</td></tr>`;
  }).join("");
  const mobileRows=rows.map(p=>{
    const l=db.loans.find(x=>String(x.id)===String(p.loanId));
    const c=l&&db.customers.find(x=>String(x.id)===String(l.customerId));
    const khata=l?.legacyKhataNo||l?.khataNo||l?.id||"-";
    const customer=c?`<button class="link-btn payment-mobile-name" onclick="viewCustomer('${esc(c.id)}')">${esc(customerName(c))}</button>`:"-";
    return `<article class="payment-mobile-card">
      <div class="payment-mobile-head"><div><b>${esc(p.id)}</b><span>${fmtDate(p.date)}</span></div><strong>${money(p.total)}</strong></div>
      <div class="payment-mobile-customer">${customer}<button class="link-btn" onclick="showSchedule('${esc(l?.id||"")}')">${esc(khata)}</button></div>
      <div class="payment-mobile-breakdown"><span><small>Principal</small><b>${money(p.principal)}</b></span><span><small>Interest</small><b>${money(p.interest)}</b></span><span><small>Penalty</small><b>${money(p.penalty)}</b></span><span><small>Mode</small><b>${esc(p.mode||"-")}</b></span></div>
      <div class="payment-mobile-actions"><button class="btn small" onclick="viewPayment('${esc(p.id)}')">View</button><button class="btn small" onclick="editPayment('${esc(p.id)}')">Edit</button>${currentUser?.role==='Administrator'?`<button class="btn small danger" onclick="confirmDeleteRecord('payment','${esc(p.id)}')">Delete</button>`:`<button class="btn small danger" disabled>Delete</button>`}</div>
    </article>`;
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
