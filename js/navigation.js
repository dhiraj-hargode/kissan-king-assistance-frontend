// Navigation and page routing.
let currentPage="dashboard";
function openPage(page){
  // Normal Pending Payments navigation (sidebar / notification bell) must
  // always open the complete pending queue. A customer-specific filter is
  // allowed only when the caller explicitly sets pendingPreserveFilter.
  if(page==='pending' && !window.pendingPreserveFilter){
    window.pendingFilter='';
  }
  if(page==='pending') delete window.pendingPreserveFilter;
  currentPage=page;
  document.querySelectorAll(".nav-item").forEach(b=>b.classList.toggle("active",b.dataset.page===page));
  renderPage(page)
}
async function renderPage(page){
  const c=document.getElementById("content");
  if(page==='dashboard'){
    try{
      await loadDashboardData('6m');
      await renderDashboard(c);
    }catch(e){
      console.error(e);
      c.innerHTML=header("Dashboard","Could not load dashboard data.",`<button class="btn" onclick="renderPage('dashboard')">↻ Retry</button>`)+`<div class="empty"><div class="emoji">⚠</div><h3>Dashboard unavailable</h3><p>${esc(e.message||'Request failed')}</p></div>`;
    }
    return;
  }

  // Customers is intentionally loaded from the paginated customer API.
  // Do not call /api/db here: the full business database must not be loaded
  // merely to open the Customers page. Customer actions can load full data
  // on demand when an existing legacy workflow needs it.
  if(page==='customers'){
    try{
      await renderCustomers(c);
    }catch(e){
      console.error(e);
      c.innerHTML=header("Customers","Could not load customers.",`<button class="btn" onclick="renderPage('customers')">↻ Retry</button>`)+`<div class="empty"><div class="emoji">⚠</div><h3>Customers unavailable</h3><p>${esc(e.message||'Request failed')}</p></div>`;
    }
    return;
  }

  if(page==='history'){
    try{
      await renderPaymentHistory(c);
    }catch(e){
      console.error(e);
      c.innerHTML=header("Payment History","Could not load payment history.",`<button class="btn" onclick="renderPage('history')">↻ Retry</button>`)+`<div class="empty"><div class="emoji">⚠</div><h3>Payment History unavailable</h3><p>${esc(e.message||'Request failed')}</p></div>`;
    }
    return;
  }

  if(page==='loans'){
    try{
      await renderLoans(c);
    }catch(e){
      console.error(e);
      c.innerHTML=header("Loans","Could not load loans.",`<button class="btn" onclick="renderPage('loans')">↻ Retry</button>`)+`<div class="empty"><div class="emoji">⚠</div><h3>Loans unavailable</h3><p>${esc(e.message||'Request failed')}</p></div>`;
    }
    return;
  }

  // Collections list pages use targeted APIs and must not load the complete
  // JSONB database merely to display Today's Collection or Pending Payments.
  // Payment-entry actions will lazy-load the full data only when required.
  if(page==='today' || page==='pending'){
    try{
      await (page==='today' ? renderToday(c) : renderPending(c));
    }catch(e){
      console.error(e);
      c.innerHTML=header(page==='today'?"Today's Collection":"Pending Payments","Could not load collection data.",`<button class="btn" onclick="renderPage('${page}')">↻ Retry</button>`)+`<div class="empty"><div class="emoji">⚠</div><h3>Collections unavailable</h3><p>${esc(e.message||'Request failed')}</p></div>`;
    }
    return;
  }

  // Read-heavy reporting/admin lists use targeted APIs and must not hydrate
  // the complete JSONB database just to open the page.
  if(['reports','analytics','blacklist','expired'].includes(page)){
    try{
      const renderer={reports:renderReports,analytics:renderAnalytics,blacklist:renderBlacklist,expired:renderExpired}[page];
      await renderer(c);
    }catch(e){
      console.error(e);
      c.innerHTML=header(page==='reports'?'All Year Revenue':page==='analytics'?'Graphs & Analytics':page==='blacklist'?'Blacklisted Customers':'Overdue Loans','Could not load page.',`<button class="btn" onclick="renderPage('${page}')">↻ Retry</button>`)+`<div class="empty"><h3>Page unavailable</h3><p>${esc(e.message||'Request failed')}</p></div>`;
    }
    return;
  }

  if(page==='expiredPeople'){
    try{ await renderExpiredPeople(c); }catch(e){ console.error(e); c.innerHTML=header('Expired People','Could not load expired people.',`<button class="btn" onclick="renderPage('expiredPeople')">↻ Retry</button>`)+`<div class="empty"><h3>Page unavailable</h3><p>${esc(e.message||'Request failed')}</p></div>`; }
    return;
  }

  await ensureServerDataLoaded();
  normalizeMonthlyDueDates();
  const generated=ensureLegacyOperationalSchedules(todayISO());
  const scheduleChanged=refreshScheduleStatuses();
  const notificationsChanged=refreshNotifications();
  if(generated || scheduleChanged || notificationsChanged) save();
  const renderer=({customers:renderCustomers,registration:renderRegistration,loans:renderLoans,today:renderToday,pending:renderPending,payment:renderPayment,history:renderPaymentHistory,schedule:renderSchedule,reports:renderReports,analytics:renderAnalytics,blacklist:renderBlacklist,expired:renderExpired,expiredPeople:renderExpiredPeople,backup:renderBackup,settings:renderSettings}[page]||renderDashboard);
  renderer(c);
}

function header(title,sub="",actions=""){return `<div class="page-title"><div><h1>${title}</h1>${sub?`<p>${sub}</p>`:""}</div><div class="actions">${actions}</div></div>`}
function stat(label,value,sub="",cls=""){return `<div class="card stat-card ${cls}"><div class="label">${label}</div><div class="value">${value}</div><div class="sub">${sub}</div></div>`}


