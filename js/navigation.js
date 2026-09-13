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
function renderPage(page){
  normalizeMonthlyDueDates();
  const generated=ensureLegacyOperationalSchedules(todayISO());
  const scheduleChanged=refreshScheduleStatuses();
  const notificationsChanged=refreshNotifications();
  if(generated || scheduleChanged || notificationsChanged) save();
  const c=document.getElementById("content");
  ({dashboard:renderDashboard,customers:renderCustomers,registration:renderRegistration,loans:renderLoans,today:renderToday,pending:renderPending,payment:renderPayment,history:renderPaymentHistory,schedule:renderSchedule,reports:renderReports,analytics:renderAnalytics,blacklist:renderBlacklist,expired:renderExpired,expiredPeople:renderExpiredPeople,backup:renderBackup,settings:renderSettings}[page]||renderDashboard)(c)
}

function header(title,sub="",actions=""){return `<div class="page-title"><div><h1>${title}</h1>${sub?`<p>${sub}</p>`:""}</div><div class="actions">${actions}</div></div>`}
function stat(label,value,sub="",cls=""){return `<div class="card stat-card ${cls}"><div class="label">${label}</div><div class="value">${value}</div><div class="sub">${sub}</div></div>`}


