// Blacklist, expired people, backup/import and settings administration.
async function renderBlacklist(c){
  const state=window.blacklistPageState||{page:1,limit:50,search:'',total:0,totalPages:1}; window.blacklistPageState=state;
  c.innerHTML=header("Blacklisted Customers","Customers marked as not eligible for new loans.",`<span class="badge red">Loading…</span>`)+`<div class="card section-card special-people-card"><div class="toolbar special-people-toolbar"><input class="grow" id="blacklistFilter" value="${esc(state.search)}" placeholder="Search name, mobile or customer ID..." oninput="blacklistSearchChanged(this.value)"></div><div id="blacklistArea"><div class="empty">Loading blacklisted customers…</div></div></div>`;
  await loadBlacklistPage(state.page,state.search);
}
async function loadBlacklistPage(page=1,search=window.blacklistPageState?.search||''){
  const c=document.getElementById('content'); if(!c)return;
  const state=window.blacklistPageState||{page:1,limit:50,search:'',total:0,totalPages:1}; window.blacklistPageState=state;
  state.page=Math.max(1,Number(page)||1); state.search=String(search||'').trim();
  const key=`${state.page}|${state.search.toLowerCase()}`;
  state._cache=state._cache||new Map(); if(state._cache.has(key)){renderBlacklistRows(c,state._cache.get(key));return;}
  const x=await apiJSON(`/api/blacklist?page=${state.page}&limit=${state.limit}&search=${encodeURIComponent(state.search)}`); state._cache.set(key,x);
  state.page=Number(x.pagination?.page||1); state.total=Number(x.pagination?.total||0); state.totalPages=Number(x.pagination?.totalPages||1); renderBlacklistRows(c,x);
}
function renderBlacklistRows(c,x){const state=window.blacklistPageState; const rows=Array.isArray(x.rows)?x.rows:[]; const area=document.getElementById('blacklistArea'); if(!area)return; area.innerHTML=`<div class="special-people-desktop"><div class="table-wrap"><table class="data-table"><thead><tr><th>ID</th><th>Name</th><th>Mobile</th><th>Outstanding</th><th>Reason</th><th>Date</th><th>Notes</th><th>Action</th></tr></thead><tbody>${rows.map(x=>{const b=x.blacklist,cu=x.customer;return `<tr><td>${esc(cu.id)}</td><td><b>${esc(customerName(cu))}</b></td><td>${esc(cu.mobile||'-')}</td><td>${money(x.outstanding||b.outstanding||0)}</td><td>${esc(b.reason||'-')}</td><td>${fmtDate(b.date)}</td><td>${esc(b.notes||'-')}</td><td><button class="btn small" onclick="viewCustomer('${esc(cu.id)}')">View</button> <button class="btn small success" onclick="unblacklist('${esc(cu.id)}')">Remove</button></td></tr>`}).join('')}</tbody></table></div></div><div class="special-people-mobile">${rows.map(x=>{const b=x.blacklist,cu=x.customer;return `<article class="special-person-card"><div class="special-person-head"><div><b>${esc(customerName(cu))}</b><small>${esc(cu.id)}</small></div><span class="badge red">BLACKLISTED</span></div><div class="special-person-grid"><div><small>Mobile</small><b>${esc(cu.mobile||'-')}</b></div><div><small>Outstanding</small><b>${money(x.outstanding||b.outstanding||0)}</b></div><div><small>Reason</small><b>${esc(b.reason||'-')}</b></div><div><small>Date</small><b>${fmtDate(b.date)}</b></div></div>${b.notes?`<div class="special-person-note"><small>Notes</small><div>${esc(b.notes)}</div></div>`:''}<div class="special-person-actions"><button class="btn" onclick="viewCustomer('${esc(cu.id)}')">View Customer</button><button class="btn success" onclick="unblacklist('${esc(cu.id)}')">Remove Blacklist</button></div></article>`}).join('')}</div>${rows.length?'':`<div class="empty"><div class="emoji">🚫</div><h3>No blacklisted customers</h3></div>`}<div class="toolbar" style="justify-content:space-between;margin-top:12px"><span class="muted">${state.total?`Showing ${(state.page-1)*state.limit+1}-${Math.min(state.page*state.limit,state.total)} of ${state.total} blacklisted customers`:'No blacklisted customers'}</span><div class="actions"><button class="btn" ${state.page>1?'':'disabled'} onclick="changeBlacklistPage(${state.page-1})">← Previous</button><span class="muted">Page ${state.page} of ${state.totalPages}</span><button class="btn" ${state.page<state.totalPages?'':'disabled'} onclick="changeBlacklistPage(${state.page+1})">Next →</button></div></div>`;}
function blacklistSearchChanged(v){clearTimeout(window.blacklistSearchTimer);window.blacklistSearchTimer=setTimeout(()=>loadBlacklistPage(1,v),300)}
function changeBlacklistPage(page){return loadBlacklistPage(page,window.blacklistPageState?.search||'')}

function openBlacklistForm(id){
  const cu=db.customers.find(c=>String(c.id)===String(id)); if(!cu)return;
  if(db.blacklist.some(b=>String(b.customerId)===String(id))){toast("Customer is already blacklisted.","err");return;}
  const loans=db.loans.filter(l=>String(l.customerId)===String(id));
  const outstanding=loans.reduce((sum,l)=>sum+loanOutstanding(l),0);
  const overdue=loans.reduce((sum,l)=>sum+scheduleFor(l.id).filter(s=>s.status==="OVERDUE").length,0);
  openModal("Blacklist Customer",`<div class="notice"><b>${esc(customerName(cu))}</b> · ${esc(cu.mobile||"-")}<br>Outstanding: <b>${money(outstanding)}</b> · Overdue installments: <b>${overdue}</b></div><form id="blacklistForm"><div class="form-grid"><div class="form-group span-2"><label>Reason *</label><select name="reason" required><option value="">Select reason</option><option>Repeated payment default</option><option>Long overdue</option><option>Refused to pay</option><option>Unreachable / absconded</option><option>Fraud / false information</option><option>Other</option></select></div><div class="form-group span-2"><label>Notes</label><textarea name="notes" placeholder="Add details about why this customer is blacklisted..."></textarea></div></div></form>`,`<button class="btn" onclick="closeModal()">Cancel</button><button class="btn danger" onclick="saveBlacklist('${id}')">🔴 Add to Blacklist</button>`);
}
async function saveBlacklist(id){
  const cu=db.customers.find(c=>String(c.id)===String(id)); const form=document.getElementById("blacklistForm"); if(!cu||!form)return;
  const reason=form.reason.value.trim(); if(!reason){toast("Please select a blacklist reason.","err");return;}
  if(db.blacklist.some(b=>String(b.customerId)===String(id))){toast("Customer is already blacklisted.","err");closeModal();return;}
  const loans=db.loans.filter(l=>String(l.customerId)===String(id));
  db.blacklist.push({id:uid("BL"),ownerId:getCurrentUser()?.id||"ADMIN",customerId:cu.id,reason,date:todayISO(),notes:form.notes.value.trim(),outstanding:loans.reduce((sum,l)=>sum+loanOutstanding(l),0),createdAt:new Date().toISOString()});
  await save(); closeModal(); toast(`${customerName(cu)} added to blacklist`); await loadServerData(); openPage("customers");
}
async function unblacklist(id){ if(!db.customers.some(c=>String(c.id)===String(id))){toast("Customer not found.","err");return;} db.blacklist=db.blacklist.filter(b=>String(b.customerId)!==String(id)); await save(); await loadServerData(); toast("Customer removed from blacklist"); openPage("blacklist") }
async function renderExpired(c){
  const state=window.overduePageState||{page:1,limit:50,search:'',total:0,totalPages:1}; window.overduePageState=state;
  c.innerHTML=header("Overdue Loans","Installments that have passed their due date. Move overdue installments to Collections for follow-up.",`<button class="btn primary" onclick="openPage('pending')">→ Collections</button>`)+`<div class="card section-card"><div class="toolbar"><input class="grow" id="overdueFilter" value="${esc(state.search)}" placeholder="Search customer, loan or Khata..." oninput="overdueSearchChanged(this.value)"></div><div id="overdueArea"><div class="empty">Loading overdue installments…</div></div></div>`;
  await loadOverduePage(state.page,state.search);
}
async function loadOverduePage(page=1,search=window.overduePageState?.search||''){
  const state=window.overduePageState||{page:1,limit:50,search:'',total:0,totalPages:1};window.overduePageState=state;state.page=Math.max(1,Number(page)||1);state.search=String(search||'').trim();
  const x=await apiJSON(`/api/overdue?page=${state.page}&limit=${state.limit}&search=${encodeURIComponent(state.search)}&date=${encodeURIComponent(todayISO())}`);state.total=Number(x.pagination?.total||0);state.totalPages=Number(x.pagination?.totalPages||1);state.page=Number(x.pagination?.page||1);
  const rows=Array.isArray(x.rows)?x.rows:[]; const area=document.getElementById('overdueArea');if(!area)return;
  area.innerHTML=`<div class="toolbar"><span class="muted"><b>${state.total}</b> matching pending installments</span></div><div class="table-wrap"><table class="data-table"><thead><tr><th>Customer</th><th>Loan</th><th>Due Date</th><th>Pending</th><th>Days Overdue</th><th>Action</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${esc(r.customer?.name||customerName(r.customer||{}))}</td><td>${esc(r.loan?.id||r.loanId||'')}</td><td>${fmtDate(r.dueDate)}</td><td>${money(r.pending||0)}</td><td>${r.dueDate?daysBetween(r.dueDate,todayISO()):0}</td><td><button class="btn small primary" onclick="window.pendingDate=todayISO();openPaymentFor('${esc(r.loan?.id||r.loanId||'')}','${esc(r.scheduleId||'')}')">Collect</button></td></tr>`).join('')}</tbody></table>${rows.length?'':`<div class='empty'><div class='emoji'>🎉</div><h3>No overdue installments</h3></div>`}</div><div class="toolbar" style="justify-content:space-between;margin-top:12px"><span class="muted">${state.total?`Page ${state.page} of ${state.totalPages}`:'No records'}</span><div class="actions"><button class="btn" ${state.page>1?'':'disabled'} onclick="changeOverduePage(${state.page-1})">← Previous</button><button class="btn" ${state.page<state.totalPages?'':'disabled'} onclick="changeOverduePage(${state.page+1})">Next →</button></div></div>`;
}
function overdueSearchChanged(v){clearTimeout(window.overdueSearchTimer);window.overdueSearchTimer=setTimeout(()=>loadOverduePage(1,v),300)}
function changeOverduePage(p){return loadOverduePage(p,window.overduePageState?.search||'')}

function openExpiredCustomerForm(id){
  const cu=db.customers.find(c=>String(c.id)===String(id));
  if(!cu){toast("Customer not found.","err");return;}
  if(isExpiredCustomer(id)){toast("Customer is already in Expired People.","err");return;}
  const loans=db.loans.filter(l=>String(l.customerId)===String(id));
  const outstanding=loans.reduce((sum,l)=>sum+loanOutstanding(l),0);
  openModal("Mark Customer as Expired / Dead",`<div class="notice"><b>${esc(customerName(cu))}</b> · ${esc(cu.mobile||"-")}<br>Outstanding principal: <b>${money(outstanding)}</b><br><small>The customer will be removed from active Customers, Today's Collection, Pending Payments, reminders and new-loan selection. All loans and payment history will be preserved.</small></div><form id="expiredCustomerForm"><div class="form-grid"><div class="form-group"><label>Date of Death *</label><input type="date" name="date" value="${todayISO()}" required></div><div class="form-group"><label>Reason</label><input name="reason" value="Death" readonly></div><div class="form-group span-2"><label>Notes</label><textarea name="notes" placeholder="Add any details or reference..."></textarea></div></div></form>`,`<button class="btn" onclick="closeModal()">Cancel</button><button class="btn danger" onclick="saveExpiredCustomer('${esc(id)}')">⚫ Move to Expired People</button>`);
}
function saveExpiredCustomer(id){
  const cu=db.customers.find(c=>String(c.id)===String(id)); const f=document.getElementById("expiredCustomerForm");
  if(!cu||!f)return;
  const date=f.date.value;
  if(!validISODate(date)){toast("Enter a valid date of death.","err");return;}
  if(date>todayISO()){toast("Date of death cannot be in the future.","err");return;}
  if(isExpiredCustomer(id)){toast("Customer is already expired.","err");return;}
  const loans=db.loans.filter(l=>String(l.customerId)===String(id));
  db.expiredCustomers.push({id:uid("EXP"),ownerId:getCurrentUser()?.id||"ADMIN",customerId:cu.id,date,reason:"Death",notes:cleanText(f.notes.value,1000),outstanding:loans.reduce((sum,l)=>sum+loanOutstanding(l),0),createdAt:new Date().toISOString(),createdBy:"admin"});
  save(); closeModal(); toast(`${customerName(cu)} moved to Expired People`); openPage("expiredPeople");
}
function restoreExpiredCustomer(id){
  if(!isExpiredCustomer(id)){toast("Customer is not in Expired People.","err");return;}
  if(!confirm("Restore this customer to the active customer list? Their loan and payment history will remain unchanged."))return;
  db.expiredCustomers=db.expiredCustomers.filter(x=>String(x.customerId)!==String(id));
  save(); toast("Customer restored to active Customers"); renderPage("expiredPeople");
}
function viewExpiredCustomer(id){
  const cu=db.customers.find(c=>String(c.id)===String(id)); const ex=db.expiredCustomers.find(x=>String(x.customerId)===String(id));
  if(!cu||!ex)return; const loans=db.loans.filter(l=>l.customerId===id);
  openModal(`Expired Customer — ${esc(customerName(cu))}`,`<div class="kpi-row"><div class="kpi"><b>${esc(cu.id)}</b><span>Customer ID</span></div><div class="kpi"><b>${esc(cu.mobile||"-")}</b><span>Mobile</span></div><div class="kpi"><b>${money(loans.reduce((a,l)=>a+Number(l.amount),0))}</b><span>Total Loan</span></div><div class="kpi"><b>${money(loans.reduce((a,l)=>a+loanOutstanding(l),0))}</b><span>Outstanding</span></div></div><hr><p><b>Date of Death:</b> ${fmtDate(ex.date)}</p><p><b>Notes:</b> ${esc(ex.notes||"-")}</p><h3>Loans & History</h3>${loans.length?`<div class="table-wrap"><table class="data-table"><thead><tr><th>Loan</th><th>Khata</th><th>Amount</th><th>Remaining</th></tr></thead><tbody>${loans.map(l=>`<tr><td>${l.id}</td><td>${esc(l.khataNo||"-")}</td><td>${money(l.amount)}</td><td>${money(loanOutstanding(l))}</td></tr>`).join("")}</tbody></table></div>`:"<div class='empty'>No loans.</div>"}`,`<button class="btn" onclick="closeModal();openPaymentHistory('${id}')">🧾 Payment History</button><button class="btn" onclick="printCustomer('${id}')">🖨 Print</button><button class="btn success" onclick="restoreExpiredCustomer('${id}')">Restore to Customers</button><button class="btn" onclick="closeModal()">Close</button>`);
}
async function renderExpiredPeople(c){
  const state=window.expiredPeoplePageState||{page:1,limit:50,search:'',total:0,totalPages:1};window.expiredPeoplePageState=state;
  c.innerHTML=header("Expired People","Deceased customers are archived here. Their loans and payment history are preserved, but they are excluded from all collection/reminder workflows.",`<span class="badge red">Loading…</span>`)+`<div class="card section-card special-people-card"><div class="toolbar special-people-toolbar"><input class="grow" id="expiredFilter" value="${esc(state.search)}" placeholder="Search name, mobile or customer ID..." oninput="expiredPeopleSearchChanged(this.value)"></div><div id="expiredPeopleArea"><div class="empty">Loading expired people…</div></div></div>`;
  await loadExpiredPeoplePage(state.page,state.search);
}
async function loadExpiredPeoplePage(page=1,search=window.expiredPeoplePageState?.search||''){
  const state=window.expiredPeoplePageState||{page:1,limit:50,search:'',total:0,totalPages:1};window.expiredPeoplePageState=state;state.page=Math.max(1,Number(page)||1);state.search=String(search||'').trim();
  const x=await apiJSON(`/api/expired-people?page=${state.page}&limit=${state.limit}&search=${encodeURIComponent(state.search)}`);state.total=Number(x.pagination?.total||0);state.totalPages=Number(x.pagination?.totalPages||1);state.page=Number(x.pagination?.page||1);const rows=Array.isArray(x.rows)?x.rows:[];const area=document.getElementById('expiredPeopleArea');if(!area)return;
  area.innerHTML=`<div class="special-people-desktop"><div class="table-wrap"><table class="data-table"><thead><tr><th>Customer ID</th><th>Name</th><th>Mobile</th><th>Date of Death</th><th>Total Loans</th><th>Outstanding</th><th>Status</th><th>Actions</th></tr></thead><tbody>${rows.map(x=>{const ex=x.expired,cu=x.customer;return `<tr><td>${esc(cu.id)}</td><td><b>${esc(customerName(cu))}</b></td><td>${esc(cu.mobile||'-')}</td><td>${fmtDate(ex.date)}</td><td>${x.loanCount}</td><td>${money(x.outstanding||0)}</td><td><span class="badge red">EXPIRED</span></td><td><button class="btn small" onclick="viewExpiredCustomer('${esc(cu.id)}')">View</button> <button class="btn small success" onclick="restoreExpiredCustomer('${esc(cu.id)}')">Restore</button></td></tr>`}).join('')}</tbody></table></div></div><div class="special-people-mobile">${rows.map(x=>{const ex=x.expired,cu=x.customer;return `<article class="special-person-card"><div class="special-person-head"><div><b>${esc(customerName(cu))}</b><small>${esc(cu.id)}</small></div><span class="badge red">EXPIRED</span></div><div class="special-person-grid"><div><small>Mobile</small><b>${esc(cu.mobile||'-')}</b></div><div><small>Date of Death</small><b>${fmtDate(ex.date)}</b></div><div><small>Total Loans</small><b>${x.loanCount}</b></div><div><small>Outstanding</small><b>${money(x.outstanding||0)}</b></div></div>${ex.notes?`<div class="special-person-note"><small>Notes</small><div>${esc(ex.notes)}</div></div>`:''}<div class="special-person-actions"><button class="btn" onclick="viewExpiredCustomer('${esc(cu.id)}')">View Details</button><button class="btn success" onclick="restoreExpiredCustomer('${esc(cu.id)}')">Restore Customer</button></div></article>`}).join('')}</div>${rows.length?'':`<div class="empty"><div class="emoji">⚫</div><h3>No expired people</h3><p>Customers marked as deceased will appear here.</p></div>`}<div class="toolbar" style="justify-content:space-between;margin-top:12px"><span class="muted">${state.total?`Showing ${(state.page-1)*state.limit+1}-${Math.min(state.page*state.limit,state.total)} of ${state.total} expired people`:'No expired people'}</span><div class="actions"><button class="btn" ${state.page>1?'':'disabled'} onclick="changeExpiredPeoplePage(${state.page-1})">← Previous</button><span class="muted">Page ${state.page} of ${state.totalPages}</span><button class="btn" ${state.page<state.totalPages?'':'disabled'} onclick="changeExpiredPeoplePage(${state.page+1})">Next →</button></div></div>`;
}
function expiredPeopleSearchChanged(v){clearTimeout(window.expiredPeopleSearchTimer);window.expiredPeopleSearchTimer=setTimeout(()=>loadExpiredPeoplePage(1,v),300)}
function changeExpiredPeoplePage(p){return loadExpiredPeoplePage(p,window.expiredPeoplePageState?.search||'')}

function filterSpecialPeople(tableId,mobileId,value){
  const q=String(value||"").trim().toLowerCase();
  [tableId,mobileId].forEach(id=>{const root=document.getElementById(id);if(!root)return;root.querySelectorAll('[data-search]').forEach(el=>{el.style.display=!q||el.dataset.search.includes(q)?"":"none"})});
}

async function refreshAdminNav(){
  document.querySelectorAll('.admin-only').forEach(el=>el.classList.toggle('hidden',currentUser?.role!=='Administrator'));
}

function renderBackup(c){
  const admin=currentUser?.role==='Administrator';
  c.innerHTML=header("Backup / Export","Import Excel data, protect the database and export payment reports.",`<span class="badge green">Data protected</span>`);
  c.innerHTML+=`<div class="card section-card" style="margin-bottom:18px"><h3>✅ Server Database</h3><p id="backupDbSummary">Loading database summary…</p><p class="notice">Expired/deceased customers are archived separately without deleting their loans or payment history.</p></div>
  <div class="grid-2"><div class="card section-card"><h3>💾 Database Backup</h3><p>Download a full server database backup (Administrator only).</p><button class="btn primary" ${admin?'':'disabled'} onclick="downloadBackup()">Download JSON Backup</button></div><div class="card section-card"><h3>📄 Payment Export</h3><p>Export all payment transactions as CSV for Excel.</p><button class="btn primary" onclick="downloadPaymentsCSV()">Export Payments CSV</button></div></div>
  <div class="card section-card" style="margin-top:18px"><h3>📥 Import Excel</h3><p>Import customers, loans, payments and optional blacklist/expired test records from an Excel workbook. Only Administrators can import.</p><p class="notice"><b>Supported sheets:</b> Reviews, Customers, Loans, Payments, Blacklist / Blacklist_Test, Expired / Expired_Test. The importer validates dates, required fields, references and duplicate records before saving.</p><div class="form-grid"><div class="form-group span-2"><label>Excel File *</label><input type="file" id="excelImportFile" accept=".xlsx,.xls,.xlsm"></div><div class="form-group"><label>Import Mode *</label><select id="excelImportMode"><option value="add">Add / Merge</option><option value="replace">Replace Current Data</option></select></div></div><div class="actions" style="margin-top:12px"><button class="btn" ${admin?'':'disabled'} onclick="previewExcelImport()">🔎 Preview & Validate</button><button class="btn primary" ${admin?'':'disabled'} onclick="importExcelData()">📥 Import Excel</button></div><div id="excelImportResult" style="margin-top:14px"></div></div>
  <div class="card section-card" style="margin-top:18px"><h3>Restore Backup</h3><p class="notice">Restoring replaces the current user data on the server. Use only a backup created by this application.</p><input type="file" id="restoreFile" accept=".json"><button class="btn" style="margin-top:10px" ${admin?'':'disabled'} onclick="restoreBackup()">Restore JSON Backup</button><hr style="margin:18px 0"><h3>Data Integrity</h3><p>Validate customer, loan, schedule, payment and blacklist references before backup/restore operations.</p><button class="btn" onclick="runDataValidation()">🔎 Validate Data</button><span id="validationResult" class="muted" style="margin-left:10px"></span></div>
  <div class="card section-card" style="margin-top:18px"><h3>🚀 Phase 3 — PostgreSQL Migration</h3><p>Creates indexed PostgreSQL tables for customers, loans, schedules and payments. Your existing JSONB database is preserved as the source of truth during this phase.</p><p class="notice"><b>Safe migration:</b> this copies data only. It does not switch the application APIs yet.</p><div id="normalizedDbStatus" class="muted">Checking normalized database status…</div><div class="actions" style="margin-top:12px"><button class="btn" ${admin?'':'disabled'} onclick="migrateToNormalizedDb()">Migrate JSONB → PostgreSQL Tables</button><button class="btn" ${admin?'':'disabled'} onclick="loadNormalizedDbStatus()">Refresh Status</button></div></div>
  <div class="card section-card" style="margin-top:18px"><h3>Danger Zone</h3><p>Clear all customers, loans, schedules and payments from the server database.</p><button class="btn danger" ${admin?'':'disabled'} onclick="clearAllData()">🗑 Clear All Data</button></div>`;
  loadBackupSummary();
  loadNormalizedDbStatus();
}
async function loadNormalizedDbStatus(){
  const el=document.getElementById('normalizedDbStatus'); if(!el)return;
  try{
    const x=await apiJSON('/api/admin/normalized-status');
    const c=x.counts||{};
    const migrated=x.migratedAt?`Migrated: ${new Date(x.migratedAt).toLocaleString('en-IN')}`:'Not migrated yet.';
    el.innerHTML=`<b>${esc(migrated)}</b><br>Customers: ${Number(c.customers||0).toLocaleString('en-IN')} · Loans: ${Number(c.loans||0).toLocaleString('en-IN')} · Payments: ${Number(c.payments||0).toLocaleString('en-IN')} · Schedules: ${Number(c.schedules||0).toLocaleString('en-IN')}`;
  }catch(e){el.textContent='Could not load normalized database status.';}
}
async function migrateToNormalizedDb(){
  if(currentUser?.role!=='Administrator')return;
  const answer=prompt('This copies the current JSONB business data into indexed PostgreSQL tables. Your existing JSONB data will NOT be changed. Type MIGRATE to continue:');
  if(answer!=='MIGRATE'){toast('Migration was not started.','err');return;}
  const buttons=[...document.querySelectorAll('button')].filter(b=>(b.textContent||'').includes('Migrate JSONB'));
  buttons.forEach(b=>{b.disabled=true;b.textContent='⏳ Migrating…';});
  const el=document.getElementById('normalizedDbStatus'); if(el)el.innerHTML='<span class="muted">Migrating data into PostgreSQL tables… Keep this page open.</span>';
  try{
    const x=await apiJSON('/api/admin/migrate-normalized',{method:'POST',body:JSON.stringify({confirm:'MIGRATE'})});
    const c=x.counts||{};
    if(el)el.innerHTML=`<span class="badge green">✓ Migration completed</span><br>Customers: ${Number(c.customers||0).toLocaleString('en-IN')} · Loans: ${Number(c.loans||0).toLocaleString('en-IN')} · Payments: ${Number(c.payments||0).toLocaleString('en-IN')} · Schedules: ${Number(c.schedules||0).toLocaleString('en-IN')}`;
    toast('Phase 3.1 migration completed successfully');
  }catch(e){
    const details=e?.details?.length?`<br>${esc(e.details.slice(0,3).join(' | '))}`:'';
    if(el)el.innerHTML=`<span class="badge red">Migration failed</span> ${esc(e.message||'Migration failed')}${details}`;
    toast(e.message||'Migration failed','err');
  }finally{buttons.forEach(b=>{b.disabled=false;b.textContent='Migrate JSONB → PostgreSQL Tables';});}
}

async function loadBackupSummary(){
  const el=document.getElementById('backupDbSummary'); if(!el)return;
  try{const x=await apiJSON('/api/backup/summary'); el.innerHTML=`Shared business database: <b>${Number(x.customers||0).toLocaleString('en-IN')}</b> customers, <b>${Number(x.loans||0).toLocaleString('en-IN')}</b> loans and <b>${Number(x.payments||0).toLocaleString('en-IN')}</b> payment entries. Expired customer records: <b>${Number(x.expiredCustomers||0).toLocaleString('en-IN')}</b>.`;}
  catch(e){el.textContent='Could not load database summary.';}
}

function readExcelBase64(file){return new Promise((resolve,reject)=>{if(!file)return reject(new Error('Select an Excel file first.'));if(file.size>10*1024*1024)return reject(new Error('Excel file must be 10 MB or smaller.'));const r=new FileReader();r.onload=()=>{const s=String(r.result||'');resolve(s.includes(',')?s.split(',')[1]:s)};r.onerror=()=>reject(new Error('Could not read the Excel file.'));r.readAsDataURL(file);});}
function showExcelImportResult(result,preview=true){const el=document.getElementById('excelImportResult');if(!el)return;const st=result.stats||{};const counts=`<div class="summary"><div class="box"><b>${st.customers||0}</b><br>Customers</div><div class="box"><b>${st.loans||0}</b><br>Loans</div><div class="box"><b>${st.payments||0}</b><br>Payments</div><div class="box"><b>${st.schedules||0}</b><br>Schedules</div><div class="box"><b>${st.skipped||0}</b><br>Skipped</div></div>`;const issues=result.issues||result.details||[];el.innerHTML=counts+(issues.length?`<div class="notice" style="margin-top:12px"><b>${preview?'Validation issues':'Import failed'}:</b><ul>${issues.slice(0,20).map(x=>`<li>${esc(x)}</li>`).join('')}</ul></div>`:`<div class="notice success" style="margin-top:12px">✓ ${preview?'Validation passed. Ready to import.':'Excel import completed successfully.'}</div>`);}
async function previewExcelImport(){if(currentUser?.role!=='Administrator')return;const file=document.getElementById('excelImportFile')?.files?.[0];const mode=document.getElementById('excelImportMode')?.value||'add';const el=document.getElementById('excelImportResult');if(el)el.innerHTML='<span class="muted">Reading and validating Excel…</span>';try{const fileBase64=await readExcelBase64(file);const result=await apiJSON('/api/import-excel',{method:'POST',body:JSON.stringify({fileBase64,mode,preview:true})});showExcelImportResult(result,true);if(result.sheets?.length)el.innerHTML+=`<p class="muted">Sheets detected: ${result.sheets.map(esc).join(', ')}</p>`;}catch(e){if(el)el.innerHTML=`<div class="notice" style="color:#b42318">${esc(e.message||'Excel preview failed.')}</div>`;}}
let excelImportInFlight=false;
async function importExcelData(){
  if(currentUser?.role!=='Administrator')return;
  if(excelImportInFlight){toast('An Excel import is already in progress. Please wait.','err');return;}
  const file=document.getElementById('excelImportFile')?.files?.[0];
  const mode=document.getElementById('excelImportMode')?.value||'add';
  if(!file)return toast('Select an Excel file first.','err');
  if(mode==='replace'&&!confirm('Replace current business data with this Excel file? A JSON backup will be created automatically before replacement.'))return;
  const el=document.getElementById('excelImportResult');
  const buttons=[...document.querySelectorAll('button')].filter(b=>/Import Excel/.test(b.textContent||''));
  excelImportInFlight=true; buttons.forEach(b=>{b.disabled=true;b.dataset.importBusy='1';b.textContent='⏳ Importing…';});
  if(el)el.innerHTML='<span class="muted">Importing Excel… Please keep this page open and do not click Import again.</span>';
  try{
    const fileBase64=await readExcelBase64(file);
    const result=await apiJSON('/api/import-excel',{method:'POST',body:JSON.stringify({fileBase64,mode,preview:false})});
    showExcelImportResult(result,false);
    await loadBackupSummary();
    toast(`Excel imported: ${result.stats?.customers||0} customers, ${result.stats?.loans||0} loans, ${result.stats?.payments||0} payments`);
  }catch(e){
    if(el)el.innerHTML=`<div class="notice" style="color:#b42318">${esc(e.message||'Excel import failed.')}</div>`;
    toast(e.message||'Excel import failed.','err');
  }finally{
    excelImportInFlight=false;
    buttons.forEach(b=>{b.disabled=false;b.textContent='📥 Import Excel';delete b.dataset.importBusy;});
  }
}
function downloadFile(name,text,type){const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([text],{type}));a.download=name;a.click();URL.revokeObjectURL(a.href)}
async function downloadBackup(){if(currentUser?.role!=="Administrator"){toast("Only Administrators can download a full server backup.","err");return;}try{const payload=await apiJSON("/api/backup");downloadFile(`loan-management-server-backup-${todayISO()}.json`,JSON.stringify(payload,null,2),"application/json");toast("Server backup downloaded");}catch(e){toast(e.message||"Backup failed","err")}}
async function downloadPaymentsCSV(){
  try{
    const r=await fetch('/api/payments/export',{credentials:'include'});
    if(!r.ok){let m='Export failed';try{const b=await r.json();m=b.error||m;}catch{}throw new Error(m);}
    const blob=await r.blob();
    const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=`payments-${todayISO()}.csv`; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),1000);
    toast('CSV exported');
  }catch(e){toast(e.message||'CSV export failed','err');}
}
async function clearAllData(){
  if(currentUser?.role!=="Administrator"){toast("Only Administrators can clear data.","err");return;}
  const answer=prompt("This permanently clears ALL customers, loans, schedules, payments, blacklist, notifications, expired records and pending items on the server. Settings and administrator accounts are preserved. Type DELETE to continue:");
  if(answer!=="DELETE"){toast("Data was not cleared.","err");return;}
  try{
    const result=await apiJSON('/api/admin/clear-data',{method:'POST',body:JSON.stringify({confirm:'DELETE'})});
    db=blankDB();
    if(result?.preserved?.includes('settings')){
      // The server preserved settings; force a fresh small-state read on the next page that needs it.
      serverDataLoaded=false;
    }
    toast("All business data cleared from the server database");
    await openPage("dashboard");
  }catch(e){
    toast(e.message||"Could not clear data","err");
  }
}
async function restoreBackup(){
  if(currentUser?.role!=="Administrator"){toast("Only Administrators can restore backups.","err");return;}
  const input=document.getElementById("restoreFile");
  const button=document.querySelector('[onclick="restoreBackup()"]');
  const f=input?.files?.[0];
  if(!f)return toast("Select a JSON backup file.","err");
  if(f.size>50*1024*1024)return toast("Backup file must be 50 MB or smaller.","err");
  if(!confirm("Restore this backup? It will replace all current customers, loans, schedules, payments and related business data."))return;

  if(button){button.disabled=true;button.dataset.originalText=button.textContent;button.textContent="Restoring…";}
  try{
    const text=await f.text();
    let payload;
    try{payload=JSON.parse(text);}catch{throw new Error("Invalid JSON backup file.");}
    const x=payload?.sharedData||payload;
    if(!x||!Array.isArray(x.customers)||!Array.isArray(x.loans)||!Array.isArray(x.schedules)||!Array.isArray(x.payments)||!Array.isArray(x.blacklist)){
      throw new Error("Invalid or incompatible backup file.");
    }

    const result=await apiJSON('/api/backup/restore',{
      method:'POST',
      body:JSON.stringify({sharedData:x})
    });

    db={...blankDB(),...x,settings:{...blankDB().settings,...(x.settings||{})}};
    db.expiredCustomers=Array.isArray(db.expiredCustomers)?db.expiredCustomers:[];
    serverSnapshot=cloneData(db);
    serverDataLoaded=true;
    toast(`Backup restored successfully: ${Number(result?.restored?.customers||db.customers.length).toLocaleString('en-IN')} customers`);
    await openPage("dashboard");
  }catch(e){
    console.error("Restore backup failed:",e);
    toast(e.message||"Could not restore backup.","err");
  }finally{
    if(button){button.disabled=false;button.textContent=button.dataset.originalText||"Restore JSON Backup";}
  }
}

function runDataValidation(){const issues=validateDatabaseIntegrity();const el=document.getElementById("validationResult");if(!el)return;if(issues.length){el.innerHTML=`<span class="badge red">${issues.length} issue(s)</span> ${esc(issues.slice(0,3).join(" | "))}`;toast(`Validation found ${issues.length} issue(s). See Backup / Export.`,"err");}else{el.innerHTML='<span class="badge green">✓ Data is valid</span>';toast("Data validation passed");}}

function renderSettings(c){
  c.innerHTML=header("Settings","Application, branding and reminder configuration.");
  c.innerHTML+=`<div class="card section-card branding-settings-card">
    <div class="section-head"><div><h3>Application Branding</h3><p class="muted">Use your own logo across the login page and application sidebar.</p></div></div>
    <div class="branding-grid">
      <div class="logo-preview-panel"><div class="logo-preview-box"><img id="settingsLogoPreview" src="" alt="Application logo preview"></div><div class="logo-actions"><label class="btn primary upload-btn">↥ Upload Logo<input type="file" id="logoFile" accept="image/png,image/jpeg,image/jpg,image/svg+xml"></label><button type="button" class="btn danger" onclick="removeApplicationLogo()">Remove Logo</button></div><div class="muted small-text">Recommended: <b>512 × 512 px</b> square PNG with a clean/transparent background. Maximum file size: <b>2 MB</b>.</div></div>
      <div class="logo-guidelines"><h4>Logo size & usage</h4><ul><li><b>Original upload:</b> 512 × 512 px (1:1) recommended.</li><li><b>Login page:</b> displayed around 180–220 px wide.</li><li><b>Sidebar:</b> displayed around 42–52 px.</li><li><b>Browser tab:</b> use a square 32 × 32 px version.</li><li>Supported: PNG, JPG/JPEG and SVG.</li><li>Keep important text inside the safe center area because the sidebar uses a smaller version.</li></ul></div>
    </div>
  </div>
  <form id="settingsForm" class="card section-card" style="margin-top:16px"><div class="form-grid">
    ${fg("Application Name","appName")}${fg("Default Monthly Interest %","defaultInterest","number")}${fg("Default Penalty per EMI","defaultPenalty","number")}
    ${fg("Reminder Days (comma separated)","reminders")}${fg("Currency","currency")}${fg("Date Format","dateFormat")}
  </div><div class="settings-logo-toggle"><label class="check-row"><input type="checkbox" id="logoEnabled"> <span>Use application logo</span></label><span class="muted">If disabled, the built-in default logo is used.</span></div><div class="actions" style="margin-top:18px"><button class="btn primary">Save Settings</button></div></form>`;
  const f=document.getElementById("settingsForm");const g=globalBranding();f.appName.value=g.appName||db.settings.appName;f.defaultInterest.value=db.settings.defaultInterest;f.defaultPenalty.value=db.settings.defaultPenalty;f.reminders.value=(db.settings.reminderDays||[]).join(",");f.currency.value=db.settings.currency||"INR";f.dateFormat.value="DD MMM YYYY";document.getElementById("logoEnabled").checked=g.logoEnabled!==false && db.settings.logoEnabled!==false;
  const preview=document.getElementById("settingsLogoPreview");preview.src=g.logoData||db.settings.logoData||"loan-management-logo.png";
  document.getElementById("logoFile").onchange=e=>{const file=e.target.files[0];if(!file)return;if(file.size>2*1024*1024){toast("Logo must be 2 MB or smaller.","err");e.target.value="";return;}if(!/^image\/(png|jpeg|jpg|svg\+xml)$/.test(file.type)){toast("Use PNG, JPG/JPEG or SVG.","err");e.target.value="";return;}const r=new FileReader();r.onload=()=>{preview.src=r.result;preview.dataset.pending=r.result;toast("Logo ready. Click Save Settings to apply it.")};r.readAsDataURL(file)};
  f.onsubmit=e=>{e.preventDefault();const interest=Number(f.defaultInterest.value),penalty=Number(f.defaultPenalty.value);const reminders=f.reminders.value.split(",").map(x=>Number(x.trim())).filter(x=>Number.isInteger(x)&&x>=0&&x<=365);if(!cleanText(f.appName.value,100)){toast("Application name is required.","err");return;}if(!Number.isFinite(interest)||interest<0||interest>100){toast("Default interest must be between 0 and 100%.","err");return;}if(!Number.isFinite(penalty)||penalty<0){toast("Default penalty cannot be negative.","err");return;}if(!reminders.length){toast("Enter at least one valid reminder day.","err");return;}db.settings.appName=cleanText(f.appName.value,100);db.settings.defaultInterest=interest;db.settings.defaultPenalty=penalty;db.settings.reminderDays=[...new Set(reminders)].sort((a,b)=>b-a);db.settings.logoEnabled=document.getElementById("logoEnabled").checked;const pending=preview.dataset.pending;if(pending){db.settings.logoData=pending;delete preview.dataset.pending;}const next={...globalBranding(),appName:db.settings.appName,logoEnabled:db.settings.logoEnabled,logoData:db.settings.logoData||g.logoData||""};saveGlobalBranding(next);save();applyAppBranding();toast("Settings saved")}
}
function removeApplicationLogo(){const g=globalBranding();g.logoData="";g.logoEnabled=true;saveGlobalBranding(g);db.settings.logoData="";db.settings.logoEnabled=true;save();applyAppBranding();const p=document.getElementById("settingsLogoPreview");if(p)p.src="loan-management-logo.png";toast("Custom logo removed. Default logo restored.")}

let globalSearchTimer=null;
async function renderSearchResults(q){
  q=String(q||'').trim().toLowerCase();
  if(!q)return;
  clearTimeout(globalSearchTimer);
  globalSearchTimer=setTimeout(async()=>{
    try{
      const x=await apiJSON(`/api/search?q=${encodeURIComponent(q)}`),cs=x.customers||[],ls=x.loans||[];
      if(!cs.length&&!ls.length)return;
      openModal("Global Search",`<h3>Customers</h3>${cs.length?cs.map(c=>`<button class="btn" style="display:block;width:100%;text-align:left;margin:6px 0" onclick="closeModal();viewCustomer('${esc(c.id)}')">${esc(c.id)} — ${esc(customerName(c))} — ${esc(c.mobile||'')}</button>`).join(''):"<p class='muted'>No customers.</p>"}<h3>Loans</h3>${ls.length?ls.map(r=>{const l=r.loan||{},c=r.customer||{};return `<button class="btn" style="display:block;width:100%;text-align:left;margin:6px 0" onclick="closeModal();showSchedule('${esc(l.id||'')}')">${esc(l.id||'')} — ${esc(customerName(c))} — ${money(l.amount||0)}</button>`}).join(''):"<p class='muted'>No loans.</p>"}`);
      const input=document.getElementById('globalSearch');if(input)input.value='';
    }catch(e){console.error(e);}
  },250);
}
