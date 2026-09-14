// Customer registration, search, profile and customer actions.
let customerPageState={page:1,limit:50,search:"",loading:false,total:0,totalPages:1};
let customerSearchTimer=null;
let customerListRequest=null;
let customerListRequestKey="";
let customerListCache={key:"",expiresAt:0,payload:null};

async function loadCustomersPage(page=customerPageState.page, search=customerPageState.search){
  const c=document.getElementById("content");
  if(!c) return;
  customerPageState.loading=true;
  customerPageState.page=Math.max(1,Number(page)||1);
  customerPageState.search=String(search||"").trim();

  const params=new URLSearchParams({
    page:String(customerPageState.page),
    limit:String(customerPageState.limit),
    search:customerPageState.search,
    sort:"name",
    order:"asc"
  });

  const requestKey=params.toString();
  let x;
  const now=Date.now();
  if(customerListCache.key===requestKey && customerListCache.payload && customerListCache.expiresAt>now){
    x=customerListCache.payload;
  }else if(customerListRequest && customerListRequestKey===requestKey){
    x=await customerListRequest;
  }else{
    customerListRequestKey=requestKey;
    customerListRequest=apiJSON(`/api/customers?${requestKey}`);
    try{
      x=await customerListRequest;
      customerListCache={key:requestKey,expiresAt:Date.now()+3000,payload:x};
    }finally{
      customerListRequest=null;
      customerListRequestKey="";
    }
  }
  const pagination=x.pagination||{};
  customerPageState.page=Number(pagination.page||1);
  customerPageState.total=Number(pagination.total||0);
  customerPageState.totalPages=Number(pagination.totalPages||1);
  customerPageState.loading=false;
  renderCustomersFromApi(c,Array.isArray(x.customers)?x.customers:[]);
}

async function renderCustomers(c){
  customerSearchTimer=null;
  c.innerHTML=header("Customers","Active customer profiles and their loans. Expired/deceased customers are kept separately.",`<button class="btn primary" onclick="openPage('registration')">+ New Customer</button>`)+`
    <div class="card section-card customer-page-card">
      <div class="toolbar">
        <input class="grow" id="customerFilter" value="${esc(customerPageState.search)}" placeholder="Search name, mobile, customer ID, loan ID or Khata No..." oninput="customerSearchChanged(this.value)">
        <a class="btn" href="#" onclick="openPage('expiredPeople');return false">⚫ Expired People</a>
      </div>
      <div id="customersApiBody"><div class="empty"><div class="emoji">⏳</div><h3>Loading customers...</h3></div></div>
    </div>`;
  await loadCustomersPage(customerPageState.page,customerPageState.search);
}

function customerSearchChanged(value){
  customerPageState.search=String(value||"").trim();
  customerPageState.page=1;
  clearTimeout(customerSearchTimer);
  customerSearchTimer=setTimeout(()=>{
    loadCustomersPage(1,customerPageState.search).catch(e=>{
      console.error(e);
      const body=document.getElementById("customersApiBody");
      if(body) body.innerHTML=`<div class="empty"><div class="emoji">⚠</div><h3>Could not search customers</h3><p>${esc(e.message||'Request failed')}</p></div>`;
    });
  },300);
}

function renderCustomersFromApi(c,rows){
  const body=document.getElementById("customersApiBody");
  if(!body) return;
  const total=customerPageState.total;
  const totalPages=customerPageState.totalPages;
  const current=customerPageState.page;

  const customerRows=rows.map(cu=>{
    const customerStatus=String(cu.status||"ACTIVE");
    const badgeClass=customerStatus==="BLACKLISTED"?"red":customerStatus==="COMPLETED"?"blue":"green";
    const city=cu.city||cu.village||"-";
    const action=`<select class="action-select" aria-label="Actions for ${esc(customerName(cu))}" onchange="customerAction(this,'${esc(String(cu.id))}')"><option value="">Actions</option><option value="view">View</option><option value="edit">Edit</option><option value="loan">New Loan</option><option value="blacklist">${customerStatus==="BLACKLISTED"?"Remove Blacklist":"Blacklist"}</option><option value="expired">Mark Expired / Dead</option><option value="delete" ${currentUser?.role==='Administrator' ? '' : 'disabled'}>Delete (Administrator only)</option></select>`;
    const search=esc((cu.id+" "+customerName(cu)+" "+cu.mobile+" "+city+" "+cu.district+" "+(cu.address||"")+" "+customerStatus).toLowerCase());
    return {cu,customerStatus,badgeClass,city,action,search};
  });

  if(!customerRows.length){
    body.innerHTML=`<div class="empty"><div class="emoji">👥</div><h3>${customerPageState.search?"No customers found":"No active customers"}</h3><p>${customerPageState.search?"Try a different name, mobile, customer ID, loan ID or Khata No.":"Expired/deceased customers are available under Expired People."}</p></div>`;
    return;
  }

  const pagination=`<div class="toolbar" style="justify-content:space-between;align-items:center;margin-top:16px">
    <span class="muted">Showing ${((current-1)*customerPageState.limit)+1}-${Math.min(current*customerPageState.limit,total)} of ${total} customers</span>
    <div style="display:flex;gap:8px;align-items:center">
      <button class="btn" ${current<=1?'disabled':''} onclick="changeCustomerPage(${current-1})">← Previous</button>
      <span class="muted">Page ${current} of ${totalPages}</span>
      <button class="btn" ${current>=totalPages?'disabled':''} onclick="changeCustomerPage(${current+1})">Next →</button>
    </div>
  </div>`;

  body.innerHTML=`<div class="customer-desktop-list"><div class="table-wrap"><table class="data-table customer-table" id="customerTable"><thead><tr><th>ID</th><th>Name</th><th>Mobile</th><th>Address</th><th>City</th><th>District</th><th>Loans</th><th>Total Loan</th><th>Remaining</th><th>Status</th><th class="customer-actions-head">Actions</th></tr></thead><tbody>${customerRows.map(r=>`<tr data-search="${r.search}"><td>${esc(r.cu.id)}</td><td><b>${esc(customerName(r.cu))}</b></td><td>${esc(r.cu.mobile||"")}</td><td>${esc(r.cu.address||"-")}</td><td>${esc(r.city)}</td><td>${esc(r.cu.district||"-")}</td><td>${Number(r.cu.loanCount||0)}</td><td>${money(r.cu.totalLoan||0)}</td><td>${money(r.cu.remaining||0)}</td><td><span class="badge ${r.badgeClass}">${esc(r.customerStatus)}</span></td><td class="customer-actions-cell">${r.action}</td></tr>`).join("")}</tbody></table></div></div>
  <div class="customer-mobile-list" id="customerMobileList">${customerRows.map(r=>`<article class="customer-mobile-card" data-search="${r.search}"><div class="customer-mobile-head"><div><b>${esc(customerName(r.cu))}</b><span>${esc(r.cu.id)} · ${esc(r.cu.mobile||"")}</span></div><span class="badge ${r.badgeClass}">${esc(r.customerStatus)}</span></div><div class="customer-mobile-address">${esc(r.cu.address||"-")}, ${esc(r.city)} · ${esc(r.cu.district||"-")}</div><div class="customer-mobile-stats"><div><small>Loans</small><b>${Number(r.cu.loanCount||0)}</b></div><div><small>Total Loan</small><b>${money(r.cu.totalLoan||0)}</b></div><div><small>Remaining</small><b>${money(r.cu.remaining||0)}</b></div></div><div class="customer-mobile-action">${r.action}</div></article>`).join("")}</div>${pagination}`;
}

async function changeCustomerPage(page){
  const p=Math.max(1,Math.min(customerPageState.totalPages,Number(page)||1));
  try{
    await loadCustomersPage(p,customerPageState.search);
    window.scrollTo({top:0,behavior:'smooth'});
  }catch(e){
    console.error(e);
    const body=document.getElementById("customersApiBody");
    if(body) body.innerHTML=`<div class="empty"><div class="emoji">⚠</div><h3>Could not load customers</h3><p>${esc(e.message||'Request failed')}</p><button class="btn" onclick="changeCustomerPage(${customerPageState.page})">Retry</button></div>`;
  }
}

function filterTable(id,q){
  q=(q||"").toLowerCase();
  const status=document.getElementById("customerStatus")?.value||"";
  document.querySelectorAll("#"+id+" tbody tr").forEach(r=>{r.style.display=((r.dataset.search||"").includes(q)&&(status===""||r.dataset.search.includes(status.toLowerCase())))?"":"none"});
  document.querySelectorAll("#customerMobileList .customer-mobile-card").forEach(r=>{r.style.display=((r.dataset.search||"").includes(q)&&(status===""||r.dataset.search.includes(status.toLowerCase())))?"":"none"});
}
async function customerAction(select,id){
  const action=select.value;select.value="";if(!action)return;
  try{
    if(action==="view"){
      await viewCustomer(id);
      return;
    }
    await ensureServerDataLoaded();
    switch(action){
      case "edit":openEditCustomer(id);break;
      case "loan":newLoan(id);break;
      case "blacklist":{const black=db.blacklist.some(b=>String(b.customerId)===String(id));black?unblacklist(id):openBlacklistForm(id);break;}
      case "expired":openExpiredCustomerForm(id);break;
      case "delete":confirmDeleteRecord("customer",id);break;
    }
  }catch(e){console.error(e);toast(e.message||"Could not load customer data","err");}
}

function renderRegistration(c){
  c.innerHTML=header("New Registration","Maharashtra customer profile. Customer ID is generated automatically.");
  c.innerHTML+=`<form id="customerForm" class="card section-card">
    <div class="form-section"><h3>Customer Information</h3><div class="form-grid">
      ${fg("Customer Name","firstName","text",true)}${fg("Mobile Number","mobile","tel",true)}${fg("Alternate Mobile Number","homeNumber","tel")}
      ${fg("Customer Reference","reference")}
      ${fg("Address","address","textarea",false,2)}${fg("City","city","text",true)}${districtSelect()}
      <div class="form-group"><label>Pincode</label><input name="pincode" type="text" inputmode="numeric" maxlength="6" placeholder="Auto-filled from district"/><small class="muted">District gives a default PIN; edit it for the customer's exact post office.</small></div>
    </div></div>
    <input type="hidden" name="state" value="Maharashtra"><input type="hidden" name="taluka" value="">
    <div class="form-section"><h3>Guarantor Information <span class="muted">(optional)</span></h3><div class="form-grid">
      ${fg("Guarantor Name","guarantorName")}${fg("Guarantor Mobile","guarantorMobile","tel")}${fg("Relationship","guarantorRelation")}
      ${fg("Guarantor Address","guarantorAddress","textarea",false,2)}${fg("Notes","notes","textarea")}
    </div></div>
    <div class="actions"><button class="btn" type="reset">Clear</button><button class="btn primary" type="submit">Save Customer</button></div>
  </form>`;
  document.getElementById("customerForm").onsubmit=async e=>{
    e.preventDefault();const f=new FormData(e.target),o=Object.fromEntries(f.entries());
    o.state="Maharashtra"; o.taluka="";
    const errors=validateCustomerInput(o); if(errors.length){toast(errors[0],"err");return;}
    try{
      // Registration is intentionally lazy on page load. Hydrate the full
      // legacy data only at the point where we actually need to append/save.
      await ensureServerDataLoaded();
      o.id=nextCustomerId();o.ownerId=getCurrentUser()?.id||"ADMIN";o.createdAt=new Date().toISOString();o.activityCreatedAt=o.createdAt;db.customers.push(o);save();toast("Customer created successfully");e.target.reset();openPage("customers");
    }catch(err){console.error(err);toast(err.message||"Could not save customer","err");}
  }
}
function fg(label,name,type="text",required=false,span=1){return `<div class="form-group ${span===2?"span-2":span===3?"span-3":""}"><label>${label}${required?" *":""}</label>${type==="textarea"?`<textarea name="${name}" ${required?"required":""}></textarea>`:`<input name="${name}" type="${type}" ${required?"required":""}/>`}</div>`}

function openEditCustomer(id){
  const cu=db.customers.find(c=>String(c.id)===String(id));
  if(!cu){toast("Customer not found.","err");return;}
  openModal(`Edit Customer — ${esc(customerName(cu))}`,`<form id="editCustomerForm" class="form-grid">
    <div class="form-group"><label>Customer ID</label><input value="${esc(cu.id)}" readonly class="readonly-input"></div>
    ${fg("Customer Name","firstName","text",true)}${fg("Mobile Number","mobile","tel",true)}${fg("Alternate Mobile Number","homeNumber","tel")}
      ${fg("Customer Reference","reference")}
    ${fg("Address","address","textarea",false,2)}${fg("City","city","text",true)}${districtSelect("district",cu.district||"")}
    <div class="form-group"><label>Pincode</label><input name="pincode" value="${esc(cu.pincode||"")}" maxlength="6" inputmode="numeric"><small class="muted">Defaulted from district; editable for exact post office.</small></div>
    ${fg("Guarantor Name","guarantorName")}${fg("Guarantor Mobile","guarantorMobile","tel")}${fg("Relationship","guarantorRelation")}
    ${fg("Guarantor Address","guarantorAddress","textarea",false,2)}${fg("Notes","notes","textarea")}
  </form>`, `<button class="btn" onclick="closeModal()">Cancel</button><button class="btn primary" onclick="saveCustomerEdit('${esc(cu.id)}')">💾 Save Changes</button>`);
  const f=document.getElementById("editCustomerForm");
  ["firstName","mobile","homeNumber","reference","address","city","district","pincode","guarantorName","guarantorMobile","guarantorRelation","guarantorAddress","notes"].forEach(k=>{const el=f.querySelector(`[name="${k}"]`);if(el)el.value=cu[k]||""});
  if(f.querySelector('[name="district"]') && cu.district) syncDistrictPincode(f);
}
function saveCustomerEdit(id){
  const cu=db.customers.find(c=>String(c.id)===String(id));
  const f=document.getElementById("editCustomerForm");
  if(!cu||!f)return;
  const o=Object.fromEntries(new FormData(f).entries());
  const errors=validateCustomerInput(o,id); if(errors.length){toast(errors[0],"err");return;}
  const keep={id:cu.id,legacyId:cu.legacyId,createdAt:cu.createdAt};
  Object.assign(cu,o,keep);
  save();
  toast("Customer details updated successfully");
  closeModal();
  renderPage(currentPage);
  setTimeout(()=>viewCustomer(id),50);
}

async function viewCustomer(id){
  const customerId=String(id);
  openModal("Customer Details",`<div class="empty"><div class="emoji">⏳</div><h3>Loading customer details...</h3><p>Fetching only this customer's loans and payment data.</p></div>`,`<button class="btn" onclick="closeModal()">Close</button>`);
  try{
    const x=await apiJSON(`/api/customers/${encodeURIComponent(customerId)}`);
    const cu=x.customer;
    if(!cu) throw new Error("Customer not found");
    const ls=Array.isArray(x.loans)?x.loans:[];
    const payments=Array.isArray(x.payments)?x.payments:[];
    const schedules=Array.isArray(x.schedules)?x.schedules:[];
    const blacklist=Boolean(x.blacklist);
    const totalLoan=ls.reduce((a,l)=>a+Number(l.amount||0),0);
    const paidByLoan={};
    payments.forEach(p=>{
      const lid=String(p.loanId||"");
      paidByLoan[lid]=(paidByLoan[lid]||0)+Number(p.total||0);
    });
    const paidForLoan=l=>Number(paidByLoan[String(l.id)]||0);
    const outstanding=l=>Math.max(0,Number(l.amount||0)-paidForLoan(l));
    const body=`<div class="kpi-row">
      <div class="kpi"><b>${esc(cu.id)}</b><span>Customer ID</span></div>
      <div class="kpi"><b>${esc(cu.mobile||"-")}</b><span>Mobile</span></div>
      <div class="kpi"><b>${money(totalLoan)}</b><span>Total Loan</span></div>
      <div class="kpi"><b>${money(ls.reduce((a,l)=>a+outstanding(l),0))}</b><span>Outstanding</span></div>
    </div><hr><p><b>Address:</b> ${esc(cu.address||"-")}</p><p><b>City:</b> ${esc(cu.city||cu.village||"-")} &nbsp; <b>District:</b> ${esc(cu.district||"-")}</p><p><b>Guarantor:</b> ${esc(cu.guarantorName||"-")} · ${esc(cu.guarantorMobile||"-")}</p>
    <h3>Loans</h3>${ls.length?`<div class="customer-loans-desktop"><div class="table-wrap"><table class="data-table"><thead><tr><th>Loan ID</th><th>Amount</th><th>Rate</th><th>Start</th><th>Paid</th><th>Remaining</th><th>Status</th></tr></thead><tbody>${ls.map(l=>{const rem=outstanding(l);return `<tr><td>${esc(l.id)}</td><td>${money(l.amount)}</td><td>${esc(String(l.interestRate||0))}%</td><td>${fmtDate(l.startDate)}</td><td>${money(paidForLoan(l))}</td><td>${money(rem)}</td><td><span class="badge ${rem>0?"green":"blue"}">${rem>0?"ACTIVE":"COMPLETED"}</span></td></tr>`}).join("")}</tbody></table></div></div><div class="customer-loans-mobile">${ls.map(l=>{const rem=outstanding(l);return `<article class="customer-loan-card"><div class="customer-loan-head"><div><b>${esc(l.id)}</b><span>Khata ${esc(l.khataNo||l.legacyKhataNo||"-")}</span></div><span class="badge ${rem>0?"green":"blue"}">${rem>0?"ACTIVE":"COMPLETED"}</span></div><div class="customer-loan-grid"><div><small>Amount</small><b>${money(l.amount)}</b></div><div><small>Rate</small><b>${esc(String(l.interestRate||0))}%</b></div><div><small>Start</small><b>${fmtDate(l.startDate)}</b></div><div><small>Paid</small><b>${money(paidForLoan(l))}</b></div><div><small>Remaining</small><b>${money(rem)}</b></div><div><small>Against</small><b>${esc(l.loanAgainst||"-")}</b></div></div><button type="button" class="btn primary customer-loan-view" onclick="loadAndViewLoan('${esc(l.id)}')">View Loan</button></article>`}).join("")}</div>`:`<div class="empty">No loans for this customer.</div>`}`;
    openModal(`Customer — ${esc(customerName(cu))}`,body,`<button class="btn" onclick="closeModal()">Close</button><button class="btn primary" onclick="loadAndEditCustomer('${esc(customerId)}')">✏ Edit Customer</button><button class="btn" onclick="loadAndOpenPaymentHistory('${esc(customerId)}')">🧾 Payment History</button><button class="btn" onclick="loadAndPrintCustomer('${esc(customerId)}')">🖨 Print</button>${blacklist?`<button class="btn success" onclick="loadAndUnblacklist('${esc(customerId)}')">Remove Blacklist</button>`:`<button class="btn danger" onclick="loadAndBlacklistCustomer('${esc(customerId)}')">🔴 Blacklist Customer</button>`}${currentUser?.role==='Administrator'?`<button class="btn danger" onclick="loadAndDeleteCustomer('${esc(customerId)}')">Delete</button>`:`<button class="btn danger" disabled title="Only Administrators can delete records">Delete</button>`}<button class="btn primary" onclick="loadAndNewLoan('${esc(customerId)}')">+ New Loan</button>`);
    window.__customerDetailCache={id:customerId,customer:cu,loans:ls,payments,schedules,blacklist};
  }catch(e){
    console.error(e);
    openModal("Customer Details",`<div class="empty"><div class="emoji">⚠</div><h3>Could not load customer details</h3><p>${esc(e.message||"Request failed")}</p></div>`,`<button class="btn" onclick="closeModal()">Close</button><button class="btn primary" onclick="viewCustomer('${esc(customerId)}')">Retry</button>`);
  }
}

async function loadAndEnsureCustomerAction(fn,id){
  await ensureServerDataLoaded();
  closeModal();
  fn(id);
}
function loadAndEditCustomer(id){return loadAndEnsureCustomerAction(openEditCustomer,id)}
function loadAndOpenPaymentHistory(id){return loadAndEnsureCustomerAction(openPaymentHistory,id)}
function loadAndPrintCustomer(id){return loadAndEnsureCustomerAction(printCustomer,id)}
function loadAndUnblacklist(id){return loadAndEnsureCustomerAction(unblacklist,id)}
function loadAndBlacklistCustomer(id){return loadAndEnsureCustomerAction(openBlacklistForm,id)}
function loadAndDeleteCustomer(id){return loadAndEnsureCustomerAction(()=>confirmDeleteRecord("customer",id),id)}
function loadAndNewLoan(id){return loadAndEnsureCustomerAction(newLoan,id)}
function loadAndViewLoan(id){return viewLoan(id)}

function printCustomer(id){
  const cu=db.customers.find(c=>c.id===id);if(!cu)return;
  const ls=db.loans.filter(l=>l.customerId===id);
  const body=`<div class="summary"><div class="box"><b>Customer ID</b><br>${cu.id}</div><div class="box"><b>Name</b><br>${esc(customerName(cu))}</div><div class="box"><b>Mobile</b><br>${esc(cu.mobile||"-")}</div><div class="box"><b>Address</b><br>${esc(cu.address||"-")}</div></div><h2>Loan Summary</h2><table><thead><tr><th>Loan ID</th><th>Amount</th><th>Rate</th><th>Start</th><th>Paid</th><th>Remaining</th><th>Status</th></tr></thead><tbody>${ls.map(l=>`<tr><td>${l.id}</td><td>${money(l.amount)}</td><td>${l.interestRate}%</td><td>${fmtDate(l.startDate)}</td><td>${money(totalPaid(l.id))}</td><td>${money(loanOutstanding(l))}</td><td>${loanOutstanding(l)>0?"ACTIVE":"COMPLETED"}</td></tr>`).join("")}</tbody></table>`;
  printSection(`Loan Management — Customer Statement`,body);
}
function newLoan(customerId){
  // The New Loan action is opened from a specific customer row/profile.
  // Resolve the customer immediately and keep the ID hidden so it cannot be changed accidentally.
  const cu=db.customers.find(c=>String(c.id)===String(customerId));
  if(!cu){toast("Customer could not be found. Please select the loan from a customer record.","err");return;}
  if(isExpiredCustomer(cu.id)){toast("Expired/deceased customers cannot receive a new loan.","err");return;}
  if(db.blacklist.some(b=>String(b.customerId)===String(cu.id))){toast("This customer is blacklisted. Remove the blacklist before creating a new loan.","err");return;}
  const name=customerName(cu), mobile=cu.mobile||"-";
  openModal("Create New Loan",`<form id="loanForm"><div class="form-grid">
    <div class="form-group span-2"><label>Customer *</label><input id="selectedCustomerDisplay" type="text" value="${esc(name)} — ${esc(mobile)}" readonly class="readonly-input"><small class="muted">Customer is automatically selected from the customer record.</small></div>
    ${fg("Loan Apply Date","startDate","date",true)}${fg("Khata No","khataNo","text",true)}
    <div class="form-group"><label>Loan Type *</label><select name="loanType" required><option value="">Select</option><option>Mortgage</option><option>Without Mortgage</option></select></div>
    <div class="form-group"><label>Loan Against *</label><select name="loanAgainst" required><option value="">Select</option><option>Gold</option><option>Credit</option><option>Bike/Car</option><option>Mobile</option><option>Plot</option><option>Farm</option><option>Cheque</option><option>Other</option></select></div>
    ${fg("Amount","amount","number",true)}${fg("Interest @ (Monthly %)","interestRate","number",true)}
    <div class="form-group"><label>EMI Option *</label><select name="emiOption" required><option value="YES">YES</option><option value="NO">NO</option></select></div>
    ${fg("Duration (months)","duration","number",true)}<div class="form-group"><label>Monthly Due Day</label><input name="dueDay" type="number" readonly class="readonly-input"><small class="muted">Automatically taken from the loan apply date.</small></div>
    <div class="form-group"><label>Interest Method *</label><select name="method" required><option>Reducing Balance</option><option>Flat Monthly</option></select></div>
    ${fg("Penalty per overdue EMI","penalty","number")}${fg("Notes","notes")}
  </div><div class="notice"><b>Loan setup:</b> Loan Date, Khata No, Loan Type, Loan Against, Amount, Interest Rate and EMI Option are stored with the loan. <b>YES</b> schedules principal + interest; <b>NO</b> schedules interest-only payments until principal is manually reduced.</div><input type="hidden" name="customerId" value="${esc(cu.id)}"></form>`,
  `<button class="btn" onclick="closeModal()">Cancel</button><button class="btn primary" onclick="saveLoan()">Create Loan</button>`);
  const form=document.getElementById("loanForm");
  form.querySelector('[name="startDate"]').value=todayISO();
  form.querySelector('[name="interestRate"]').value=db.settings.defaultInterest;
  form.querySelector('[name="duration"]').value=12;
  form.querySelector('[name="dueDay"]').value=new Date(form.querySelector('[name="startDate"]').value+"T00:00:00").getDate();
  form.querySelector('[name="startDate"]').addEventListener("change",e=>{ const d=new Date(e.target.value+"T00:00:00"); if(!Number.isNaN(d.getTime())) form.querySelector('[name="dueDay"]').value=d.getDate(); });
  form.querySelector('[name="method"]').value="Reducing Balance";
  form.querySelector('[name="emiOption"]').value="YES";
  const durationInput=form.querySelector('[name="duration"]');
  const toggleDuration=()=>{
    const yes=form.querySelector('[name="emiOption"]').value==="YES";
    durationInput.disabled=!yes;
    durationInput.required=yes;
    durationInput.classList.toggle("readonly-input",!yes);
  };
  form.querySelector('[name="emiOption"]').addEventListener("change",toggleDuration);
  toggleDuration();
  form.querySelector('[name="penalty"]').value=db.settings.defaultPenalty;
}

function saveLoan(){
  const form=document.getElementById("loanForm"); if(!form)return;
  const f=new FormData(form);const o=Object.fromEntries(f.entries());
  const cu=db.customers.find(c=>String(c.id)===String(o.customerId));
  if(String(o.emiOption||"").toUpperCase()==="NO" && !o.duration) o.duration="12";
  const errors=validateLoanInput(o,o.customerId);
  if(db.blacklist.some(b=>String(b.customerId)===String(o.customerId))) errors.push("Blacklisted customers cannot receive a new loan.");
  if(errors.length){toast(errors[0],"err");return;}
  const loan={id:nextLoanId(),customerId:cu.id,khataNo:cleanText(o.khataNo,50),loanType:cleanText(o.loanType,100),loanAgainst:cleanText(o.loanAgainst,100),emiOption:String(o.emiOption||"YES").toUpperCase(),amount:Number(o.amount),interestRate:Number(o.interestRate),startDate:o.startDate,duration:Number(o.duration),dueDay:loanDueDay({startDate:o.startDate}),method:o.method,penalty:Number(o.penalty||0),notes:cleanText(o.notes,1000),createdAt:new Date().toISOString(),activityCreatedAt:new Date().toISOString()};
  loan.ownerId=getCurrentUser()?.id||"ADMIN";db.loans.push(loan);generateSchedule(loan);save();toast(`Loan created for ${customerName(cu)}`);closeModal();openPage("loans");
}

