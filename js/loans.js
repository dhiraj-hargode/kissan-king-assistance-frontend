// Loan creation, editing, details and loan actions.
function renderLoans(c){
  c.innerHTML=header("Loans","All loans and outstanding balances.",`<button class="btn primary" onclick="openPage('customers')">Select Customer → New Loan</button>`);
  const loans=activeLoans();
  const loanRows=loans.map(l=>{
    const cu=db.customers.find(x=>x.id===l.customerId), rem=loanOutstanding(l), overdue=scheduleFor(l.id).some(s=>s.status==="OVERDUE"), st=rem<=0?"COMPLETED":overdue?"OVERDUE":"ACTIVE";
    const badge=st==="OVERDUE"?"red":st==="COMPLETED"?"blue":"green";
    const search=esc((l.id+" "+(l.khataNo||"")+" "+customerName(cu||{})+" "+(cu?.mobile||"")+" "+(l.loanType||"")+" "+(l.loanAgainst||"")+" "+st).toLowerCase());
    const action=`<select class="action-select" aria-label="Loan actions for ${esc(l.id)}" onchange="loanAction(this,'${l.id}')"><option value="">Actions</option><option value="view">View</option><option value="edit">Edit Loan</option><option value="schedule">Schedule</option><option value="history">Payment History</option><option value="payment">Add Payment</option><option value="delete" ${currentUser?.role==='Administrator' ? '' : 'disabled'}>Delete (Administrator only)</option></select>`;
    return {l,cu,rem,st,badge,search,action};
  });
  c.innerHTML+=`<div class="card section-card loan-page-card">
    <div class="toolbar"><input class="grow" id="loanFilter" placeholder="Search loan ID, customer or mobile..." oninput="filterGeneric('loanTable',this.value)"><select id="loanStatusFilter" onchange="filterGeneric('loanTable',document.getElementById('loanFilter').value)"><option value="">All Status</option><option>ACTIVE</option><option>COMPLETED</option><option>OVERDUE</option></select></div>
    <div class="loan-desktop-list"><div class="table-wrap"><table class="data-table loan-table" id="loanTable"><thead><tr><th>Loan ID</th><th>Khata</th><th>Customer</th><th>Against</th><th>Amount</th><th>Rate</th><th>EMI</th><th>Start</th><th>Remaining</th><th>Status</th><th class="loan-actions-head">Actions</th></tr></thead><tbody>${loanRows.map(r=>`<tr data-search="${r.search}"><td>${r.l.id}</td><td><b>${esc(r.l.khataNo||r.l.legacyKhataNo||"-")}</b></td><td>${esc(customerName(r.cu||{}))}</td><td>${esc(r.l.loanAgainst||"-")}</td><td>${money(r.l.amount)}</td><td>${r.l.interestRate}%</td><td>${esc(String(r.l.emiOption||"YES"))}</td><td>${fmtDate(r.l.startDate)}</td><td>${money(r.rem)}</td><td><span class="badge ${r.badge}">${r.st}</span></td><td class="loan-actions-cell">${r.action}</td></tr>`).join("")}</tbody></table></div></div>
    <div class="loan-mobile-list" id="loanMobileList">${loanRows.map(r=>`<article class="loan-mobile-card" data-search="${r.search}" data-status="${r.st}"><div class="loan-mobile-head"><div><b>${esc(r.l.id)}</b><span>${esc(r.l.khataNo||r.l.legacyKhataNo||"-")}</span></div><span class="badge ${r.badge}">${r.st}</span></div><div class="loan-mobile-customer"><b>${esc(customerName(r.cu||{}))}</b><span>${esc(r.cu?.mobile||"")}</span></div><div class="loan-mobile-grid"><div><small>Against</small><b>${esc(r.l.loanAgainst||"-")}</b></div><div><small>Amount</small><b>${money(r.l.amount)}</b></div><div><small>Rate</small><b>${r.l.interestRate}%</b></div><div><small>EMI</small><b>${esc(String(r.l.emiOption||"YES"))}</b></div><div><small>Start</small><b>${fmtDate(r.l.startDate)}</b></div><div><small>Remaining</small><b>${money(r.rem)}</b></div></div><div class="loan-mobile-action">${r.action}</div></article>`).join("")}</div>
    ${loans.length?"":"<div class='empty'><div class='emoji'>💰</div><h3>No loans yet</h3><p>Create a customer first, then create a loan.</p></div>"}
  </div>`;
}

function filterGeneric(id,q){
  q=(q||"").toLowerCase();
  const st=document.getElementById("loanStatusFilter")?.value||"";
  document.querySelectorAll("#"+id+" tbody tr").forEach(r=>r.style.display=((r.dataset.search||"").includes(q)&&(st===""||r.dataset.search.includes(st.toLowerCase())))?"":"none");
  document.querySelectorAll("#loanMobileList .loan-mobile-card").forEach(r=>r.style.display=((r.dataset.search||"").includes(q)&&(st===""||r.dataset.status===st))?"":"none");
}
function loanAction(select,id){const action=select.value;select.value="";if(!action)return;switch(action){case "view":viewLoan(id);break;case "edit":openEditLoan(id);break;case "schedule":showSchedule(id);break;case "history":openPaymentHistory(null,id);break;case "payment":openPaymentFor(id);break;case "delete":confirmDeleteRecord("loan",id);break;}}
function viewLoan(id){
  const l=db.loans.find(x=>String(x.id)===String(id)); if(!l){toast("Loan not found.","err");return;}
  const cu=db.customers.find(x=>String(x.id)===String(l.customerId)); const paid=paidPrincipal(l.id), rem=loanOutstanding(l);
  const status=rem<=0?"CLOSED":(String(l.status||"").toUpperCase()==="DEAD"?"DEAD":"ACTIVE");
  openModal(`Loan Details — ${esc(l.id)}`,`<div class="kpi-row"><div class="kpi"><b>${esc(customerName(cu||{}))}</b><span>Customer</span></div><div class="kpi"><b>${esc(l.khataNo||"-")}</b><span>Khata No</span></div><div class="kpi"><b>${money(l.amount)}</b><span>Original Amount</span></div><div class="kpi"><b>${money(rem)}</b><span>Outstanding</span></div></div><div class="loan-detail-summary"><div class="box"><b>Loan Date</b>${fmtDate(l.startDate)}</div><div class="box"><b>Type</b>${esc(l.loanType||"-")}</div><div class="box"><b>Against</b>${esc(l.loanAgainst||"-")}</div><div class="box"><b>Interest</b>${esc(String(l.interestRate||0))}%</div><div class="box"><b>EMI</b>${esc(String(l.emiOption||"YES"))}</div><div class="box"><b>Status</b><span class="badge ${status==='ACTIVE'?'green':status==='CLOSED'?'blue':'red'}">${status}</span></div></div><div class="notice" style="margin-top:16px">Paid principal: <b>${money(paid)}</b> · Total collected: <b>${money(totalPaid(l.id))}</b> · Next due: <b>${nextDue(l)?fmtDate(nextDue(l).dueDate):"None"}</b></div>`,`<button class="btn" onclick="closeModal();showSchedule('${esc(l.id)}')">Schedule</button><button class="btn" onclick="closeModal();openPaymentHistory(null,'${esc(l.id)}')">Payment History</button><button class="btn primary" onclick="closeModal();openEditLoan('${esc(l.id)}')">✏ Edit Loan</button><button class="btn" onclick="closeModal();openPaymentFor('${esc(l.id)}')">＋ Add Payment</button><button class="btn" onclick="closeModal()">Close</button>`);
}
function openEditLoan(id){
  const l=db.loans.find(x=>String(x.id)===String(id)); if(!l){toast("Loan not found.","err");return;}
  const cu=db.customers.find(x=>String(x.id)===String(l.customerId)); const hasPayments=loanPayments(l.id).length>0; const paid=paidPrincipal(l.id);
  const types=["Mortgage","Without Mortgage"], against=["Gold","Credit","Bike/Car","Mobile","Plot","Farm","Cheque","Other"];
  openModal(`Edit Loan — ${esc(l.id)}`,`<form id="editLoanForm" class="form-grid">
    <div class="form-group"><label>Customer</label><input value="${esc(customerName(cu||{}))} — ${esc(cu?.mobile||"")}" readonly class="readonly-input"></div>
    ${fg("Khata No","khataNo","text",true)}${fg("Loan Apply Date","startDate","date",true)}
    <div class="form-group"><label>Loan Type *</label><select name="loanType" required>${types.map(x=>`<option ${x===l.loanType?'selected':''}>${x}</option>`).join("")}</select></div>
    <div class="form-group"><label>Loan Against *</label><select name="loanAgainst" required>${against.map(x=>`<option ${x===l.loanAgainst?'selected':''}>${x}</option>`).join("")}</select></div>
    ${fg("Loan Amount","amount","number",true)}${fg("Interest Rate %","interestRate","number",true)}
    <div class="form-group"><label>EMI Option *</label><select name="emiOption"><option ${String(l.emiOption).toUpperCase()==="YES"?'selected':''}>YES</option><option ${String(l.emiOption).toUpperCase()==="NO"?'selected':''}>NO</option></select></div>
    ${fg("Duration (months)","duration","number",true)}<div class="form-group"><label>Monthly Due Day</label><input name="dueDay" type="number" readonly class="readonly-input"><small class="muted">Automatically follows the loan apply date.</small></div>
    <div class="form-group"><label>Interest Method *</label><select name="method"><option ${l.method==="Flat Monthly"?'selected':''}>Flat Monthly</option><option ${l.method==="Reducing Balance"?'selected':''}>Reducing Balance</option></select></div>
    ${fg("Penalty per overdue EMI","penalty","number")}
    <div class="form-group"><label>Loan Status *</label><select name="loanStatus"><option ${String(l.status||"ACTIVE").toUpperCase()==="ACTIVE"?'selected':''}>ACTIVE</option><option ${String(l.status||"").toUpperCase()==="CLOSED"?'selected':''}>CLOSED</option><option ${String(l.status||"").toUpperCase()==="DEAD"?'selected':''}>DEAD</option></select></div>
    ${fg("Notes","notes","textarea",false,3)}
  </form>${hasPayments?`<div class="notice" style="margin-top:12px"><b>⚠ Financial history exists:</b> ${loanPayments(l.id).length} payment(s), ${money(paid)} principal already paid. The amount cannot be set below the principal already paid. Existing paid transactions will not be deleted.</div>`:""}`,
  `<button class="btn" onclick="closeModal()">Cancel</button><button class="btn primary" onclick="saveEditedLoan('${esc(l.id)}')">💾 Save Loan Changes</button>`);
  const f=document.getElementById("editLoanForm");
  ["khataNo","startDate","amount","interestRate","duration","dueDay","penalty","notes"].forEach(k=>{const e=f.querySelector(`[name="${k}"]`);if(e)e.value=l[k]??""});
  const editDuration=f.querySelector('[name="duration"]');
  const toggleEditDuration=()=>{
    const yes=f.querySelector('[name="emiOption"]').value==="YES";
    editDuration.disabled=!yes;
    editDuration.required=yes;
    editDuration.classList.toggle("readonly-input",!yes);
  };
  f.querySelector('[name="emiOption"]').addEventListener("change",toggleEditDuration);
  toggleEditDuration();
}
function saveEditedLoan(id){
  const l=db.loans.find(x=>String(x.id)===String(id)); const f=document.getElementById("editLoanForm"); if(!l||!f)return;
  const o=Object.fromEntries(new FormData(f).entries());
  if(String(o.emiOption||"").toUpperCase()==="NO" && !o.duration) o.duration=String(l.duration||10);
  const base={...o,loanId:id,customerId:l.customerId};
  const errors=validateLoanInput(base,l.customerId).filter(e=>!e.includes("Khata No is already assigned"));
  const dup=db.loans.some(x=>String(x.id)!==String(id)&&String(x.khataNo||"").trim().toLowerCase()===String(o.khataNo||"").trim().toLowerCase());
  if(dup)errors.push("This Khata No is already assigned to another loan.");
  const paid=paidPrincipal(l.id);
  if(Number(o.amount)<paid)errors.push(`Loan amount cannot be less than principal already paid (${money(paid)}).`);
  if(Number(o.dueDay)<1||Number(o.dueDay)>31)errors.push("Due Day must be between 1 and 31.");
  if(errors.length){toast(errors[0],"err");return;}
  const before={...l};
  l.khataNo=cleanText(o.khataNo,50);l.startDate=o.startDate;l.loanType=cleanText(o.loanType,100);l.loanAgainst=cleanText(o.loanAgainst,100);l.amount=Number(o.amount);l.interestRate=Number(o.interestRate);l.emiOption=String(o.emiOption).toUpperCase();l.duration=Number(o.duration);l.dueDay=loanDueDay(l);l.method=cleanText(o.method,50);l.penalty=Number(o.penalty||0);l.status=String(o.loanStatus||"ACTIVE").toUpperCase();l.notes=cleanText(o.notes,1000);l.updatedAt=new Date().toISOString();
  db.deletedRecords=db.deletedRecords||[];
  db.deletedRecords.push({id:uid("AUD"),type:"loan-edit",recordId:l.id,deletedAt:new Date().toISOString(),deletedBy:"admin",reason:"Loan details updated",data:{before}});
  if(loanPayments(l.id).length===0){db.schedules=db.schedules.filter(s=>String(s.loanId)!==String(l.id));generateSchedule(l);}else{
    // Preserve all paid history. Only refresh unpaid schedules so the new rate,
    // penalty and remaining balance are reflected without rewriting transactions.
    const unpaid=scheduleFor(l.id).filter(s=>s.status!=="PAID");
    const outstanding=loanOutstanding(l); const principalPer=l.emiOption==="YES"?Number((l.amount/Math.max(1,l.duration)).toFixed(2)):0;
    unpaid.forEach(s=>{s.interest=Number((outstanding*Number(l.interestRate||0)/100).toFixed(2));if(l.emiOption==="YES")s.principal=Math.min(Number(s.principal||principalPer)||principalPer,outstanding);else s.principal=0;s.emi=Number((s.principal+s.interest).toFixed(2));s.penalty=Number(l.penalty||0);s.status=statusForSchedule(s)});
  }
  if(l.status==="CLOSED" && loanOutstanding(l)>0){l.status="ACTIVE";toast("Loan has outstanding balance, so it remains ACTIVE.","err");}else{save();toast("Loan details updated successfully");closeModal();openPage("loans");}
}


