// Dashboard and overview features.
async function confirmDeleteRecord(type,id){
  if(currentUser?.role!=='Administrator') return;
  const labels={customer:"customer",loan:"loan",payment:"payment"};
  const label=labels[type]||"record";
  if(!confirm(`Delete this ${label}? The record will be moved to Deleted Records for audit.`)) return;
  db.deletedRecords=db.deletedRecords||[];
  const deletedAt=new Date().toISOString();
  if(type==="customer"){
    const customer=db.customers.find(c=>String(c.id)===String(id));
    const loans=db.loans.filter(l=>String(l.customerId)===String(id));
    const loanIds=new Set(loans.map(l=>l.id));
    const payments=db.payments.filter(p=>loanIds.has(p.loanId));
    if(payments.length){
      toast("Cannot delete a customer with payment history. Financial history must be preserved.","err"); return;
    }
    db.deletedRecords.push({id:uid("DEL"),type:"customer",recordId:id,deletedAt,deletedBy:"admin",reason:"Manual deletion",data:{customer,loans,schedules:db.schedules.filter(s=>String(s.customerId)===String(id)),blacklist:db.blacklist.filter(b=>String(b.customerId)===String(id))}});

    db.customers=db.customers.filter(c=>c.id!==id);
    db.loans=db.loans.filter(l=>l.customerId!==id);
    db.schedules=db.schedules.filter(s=>s.customerId!==id);
    db.blacklist=db.blacklist.filter(b=>b.customerId!==id);
  }else if(type==="loan"){
    const loan=db.loans.find(l=>String(l.id)===String(id));
    const payments=db.payments.filter(p=>String(p.loanId)===String(id));
    if(payments.length){
      toast("Cannot delete a loan with payment history. Preserve financial history instead.","err"); return;
    }
    db.deletedRecords.push({id:uid("DEL"),type:"loan",recordId:id,deletedAt,deletedBy:"admin",reason:"Manual deletion",data:{loan,schedules:db.schedules.filter(s=>String(s.loanId)===String(id))}});
    db.loans=db.loans.filter(l=>l.id!==id);
    db.schedules=db.schedules.filter(s=>s.loanId!==id);
  }else if(type==="payment"){
    const p=db.payments.find(x=>String(x.id)===String(id));
    if(!p){ toast("Payment entry not found.","err"); return; }
    db.deletedRecords.push({id:uid("DEL"),type:"payment",recordId:p.id,deletedAt,deletedBy:"admin",reason:"Manual deletion",data:{payment:{...p}}});
    if(p){
      const s=db.schedules.find(x=>x.id===p.scheduleId);
      if(s){ s.paid=Math.max(0,Number(s.paid||0)-Number(p.principal||0)-Number(p.interest||0)); s.status=statusForSchedule(s); }
    }
    db.payments=db.payments.filter(p=>p.id!==id);
  }
  await save();
  toast(`${label[0].toUpperCase()+label.slice(1)} deleted`);
  closeModal();
  renderPage(currentPage);
}
function printSection(title, html){
  const w=window.open("","_blank","width=1100,height=800");
  if(!w){toast("Please allow pop-ups to print.","err");return}
  w.document.write(`<!doctype html><html><head><title>${title}</title><style>
  body{font-family:Arial,sans-serif;padding:30px;color:#222}h1{font-size:24px}h2{font-size:18px}
  table{width:100%;border-collapse:collapse;margin-top:18px}th{background:#1d22ee;color:#fff}th,td{padding:9px;border:1px solid #ccc;text-align:left;font-size:12px}
  .summary{display:flex;gap:12px;flex-wrap:wrap}.box{padding:12px;border:1px solid #ddd;border-radius:8px}.muted{color:#666}
  @media print{body{padding:10px}}
  </style></head><body><h1>${title}</h1><div class="muted">Printed on ${new Date().toLocaleString("en-IN")}</div>${html}</body></html>`);
  w.document.close(); w.focus(); setTimeout(()=>w.print(),300);
}

function dashboardLoanStats(){
  const loans=activeLoans();
  const active=loans.filter(l=>loanOutstanding(l)>0).length;
  const completed=loans.filter(l=>loanOutstanding(l)<=0.005).length;
  const emiYes=loans.filter(l=>String(l.emiOption||'YES').toUpperCase()==='YES').length;
  const interestOnly=loans.filter(l=>String(l.emiOption||'YES').toUpperCase()==='NO').length;
  return {loans,active,completed,emiYes,interestOnly};
}function dashboardCollectionStats(){
  const today=todayISO();
  ensureLegacyOperationalSchedules(today);

  // Dashboard has two deliberately different concepts:
  // 1) Due today = installments scheduled for today's calendar date.
  // 2) Collected today = every payment actually received today, regardless
  //    of whether it settled today's EMI or an older overdue installment.
  const activeSchedules=db.schedules.filter(s=>isActiveCustomer(s.customerId)&&s.dueDate===today);
  const allTodaysPayments=db.payments.filter(p=>p.date===today);
  const todaysPayments=allTodaysPayments.filter(p=>{
    const loan=db.loans.find(l=>String(l.id)===String(p.loanId));
    return !!loan;
  });

  const todayScheduleIds=new Set(activeSchedules.map(s=>String(s.id)));
  const todayLoanIds=new Set(activeSchedules.map(s=>String(s.loanId)));
  const dueTodayPayments=todaysPayments.filter(p=>p.scheduleId
    ? todayScheduleIds.has(String(p.scheduleId))
    : todayLoanIds.has(String(p.loanId)));
  const overduePaymentsToday=todaysPayments.filter(p=>!dueTodayPayments.includes(p));

  const grouped=new Map();
  activeSchedules.forEach(s=>{
    const key=String(s.loanId);
    if(!grouped.has(key)) grouped.set(key,[]);
    grouped.get(key).push(s);
  });

  const dueToday=[];
  grouped.forEach((schedules,loanId)=>{
    const l=db.loans.find(x=>String(x.id)===String(loanId));
    if(!l)return;
    const scheduledAmount=schedules.reduce((sum,s)=>sum+Number(s.emi||0)+Number(s.penalty||0),0);
    const due=schedules.reduce((sum,s)=>sum+effectiveDueAmount(s),0);
    const payments=todaysPayments.filter(p=>String(p.loanId)===String(loanId) &&
      (schedules.some(x=>String(x.id)===String(p.scheduleId||'')) ||
       (!p.scheduleId && schedules.some(x=>String(x.dueDate)===String(p.date)))));
    const paidOnDate=payments.reduce((sum,p)=>sum+Number(p.total||0),0);
    const fullyPaid=schedules.every(s=>effectiveDueAmount(s)<=0.005);
    const remainingDue=fullyPaid?0:Math.max(0,due-paidOnDate);
    dueToday.push({loanId:String(loanId),loan:l,schedules,due:remainingDue,grossDue:Math.max(scheduledAmount,due),paidOnDate,fullyPaid});
  });

  const expected=dueToday.reduce((a,r)=>a+Number(r.grossDue||0),0);
  const collected=todaysPayments.reduce((a,p)=>a+Number(p.total||0),0);
  const interestToday=todaysPayments.reduce((a,p)=>a+Number(p.interest||0),0);
  const principalToday=todaysPayments.reduce((a,p)=>a+Number(p.principal||0),0);
  const penaltyToday=todaysPayments.reduce((a,p)=>a+Number(p.penalty||0),0);
  const dueTodayCollected=dueTodayPayments.reduce((a,p)=>a+Number(p.total||0),0);
  const overdueCollectedToday=overduePaymentsToday.reduce((a,p)=>a+Number(p.total||0),0);

  const overdue=db.schedules.filter(s=>isActiveCustomer(s.customerId)&&s.dueDate<today&&effectiveDueAmount(s)>0.005);
  const overdueAmount=overdue.reduce((a,s)=>a+effectiveDueAmount(s),0);
  const pendingToday=Math.max(0,expected-dueTodayCollected);
  const collectionPct=expected>0?(dueTodayCollected/expected)*100:0;

  // Deceased/expired customers are not part of operational collection queues,
  // but their outstanding balance must remain visible to the lender.
  const deceasedLoans=db.loans.filter(l=>isExpiredCustomer(l.customerId));
  const deceasedOutstanding=deceasedLoans.reduce((a,l)=>a+loanOutstanding(l),0);
  const deceasedOverdue=db.schedules.filter(s=>isExpiredCustomer(s.customerId)&&s.dueDate<today&&effectiveDueAmount(s)>0.005);
  const deceasedOverdueAmount=deceasedOverdue.reduce((a,s)=>a+effectiveDueAmount(s),0);

  return {
    dueToday:activeSchedules,
    dueTodayRows:dueToday,
    overdue,
    todaysPayments,
    allTodaysPayments,
    dueTodayPayments,
    overduePaymentsToday,
    expected,
    scheduledToday:expected,
    collected,
    dueTodayCollected,
    interestToday,
    principalToday,
    penaltyToday,
    pendingToday,
    overdueAmount,
    overdueCollectedToday,
    collectionPct,
    deceasedLoans,
    deceasedOutstanding,
    deceasedOverdue,
    deceasedOverdueAmount
  };
}
function dashboardRiskBuckets(overdue){
  const today=todayISO();
  const buckets={"1–7 Days":0,"8–30 Days":0,"31–60 Days":0,"60+ Days":0};
  overdue.forEach(s=>{
    const days=Math.max(1,daysBetween(s.dueDate,today));
    if(days<=7)buckets["1–7 Days"]++;
    else if(days<=30)buckets["8–30 Days"]++;
    else if(days<=60)buckets["31–60 Days"]++;
    else buckets["60+ Days"]++;
  });
  return buckets;
}
function pendingQueueRows(asOf=todayISO()){
  ensureLegacyOperationalSchedules(asOf);
  return db.schedules.filter(s=>{
    if(!isActiveCustomer(s.customerId)) return false;
    const loan=db.loans.find(l=>String(l.id)===String(s.loanId));
    if(!loan) return false;
    if(loanOutstanding(loan)<=0.005 || String(loan.status||'').toUpperCase()==='CLOSED') return false;
    if(effectiveScheduleStatus(s,asOf)==='PAID') return false;
    return isExplicitPending(s);
  });
}
function dashboardTopOverdue(){
  // Dashboard Top Overdue Customers is intentionally sourced from the SAME
  // explicit Pending Payments queue used by the Pending Payments page.
  // Never use the global automatic overdue schedule here.
  const overdue=pendingQueueRows(todayISO()).filter(s=>effectiveScheduleStatus(s,todayISO())==='OVERDUE');
  const map=new Map();
  overdue.forEach(s=>{
    const l=db.loans.find(x=>String(x.id)===String(s.loanId));
    if(!l)return;
    const cu=db.customers.find(x=>String(x.id)===String(l.customerId));
    if(!cu)return;
    const key=String(cu.id);
    const item=map.get(key)||{customer:cu,amount:0,days:0,count:0,loanIds:new Set()};
    item.amount+=effectiveDueAmount(s);
    item.days=Math.max(item.days,Math.max(0,daysBetween(s.dueDate,todayISO())));
    item.count++;
    item.loanIds.add(String(l.id));
    map.set(key,item);
  });
  return [...map.values()].sort((a,b)=>b.amount-a.amount).slice(0,5);
}
function dashboardRecentActivity(){
  const today=todayISO(), events=[];
  const seen=new Set();
  // Keep only today's activity, but order it by the actual creation timestamp
  // so the newest transaction/action is always shown first.
  const add=(e,key)=>{
    if(!validISODate(e.date)||e.date!==today||seen.has(key))return;
    seen.add(key);
    e.sortTime=e.createdAt||`${e.date}T00:00:00`;
    events.push(e);
  };
  db.payments.forEach(p=>{
    const l=db.loans.find(x=>String(x.id)===String(p.loanId)),cu=l&&db.customers.find(x=>String(x.id)===String(l.customerId));
    add({date:p.date,createdAt:p.createdAt||p.activityCreatedAt,type:'payment',title:'Payment received',detail:`${customerName(cu||{})} · ${l?.id||''}`,amount:Number(p.total||0)},`payment:${p.id}`);
  });
  db.loans.forEach(l=>{
    const cu=db.customers.find(x=>String(x.id)===String(l.customerId));
    const created=l.createdAt||l.activityCreatedAt||'';
    const d=String(created).slice(0,10);
    add({date:d,createdAt:created,type:'loan',title:'New loan created',detail:`${customerName(cu||{})} · ${l.id}`,amount:Number(l.amount||0)},`loan:${l.id}`);
  });
  db.customers.forEach(cu=>{
    const created=cu.createdAt||cu.activityCreatedAt||'';
    const d=String(created).slice(0,10);
    add({date:d,createdAt:created,type:'customer',title:'Customer registered',detail:customerName(cu),amount:null},`customer:${cu.id}`);
  });
  db.blacklist.forEach(b=>{
    const cu=db.customers.find(x=>String(x.id)===String(b.customerId));
    add({date:b.date,createdAt:b.createdAt||b.date,type:'risk',title:'Customer blacklisted',detail:customerName(cu||{})||String(b.customerId),amount:null},`blacklist:${b.id||b.customerId}`);
  });
  db.expiredCustomers.forEach(x=>{
    const cu=db.customers.find(c=>String(c.id)===String(x.customerId));
    add({date:x.date,createdAt:x.createdAt||x.date,type:'risk',title:'Customer marked expired/deceased',detail:customerName(cu||{})||String(x.customerId),amount:null},`expired:${x.id||x.customerId}`);
  });
  return events.sort((a,b)=>{
    const bt=Date.parse(b.sortTime||'')||0, at=Date.parse(a.sortTime||'')||0;
    return bt-at || String(b.date).localeCompare(String(a.date));
  }).slice(0,8);
}
async function renderCollectionTrend(range='6m'){
  const data = await loadDashboardData(range);
  const periods = data?.trend || [];
  const vals = periods.map(x => Number(x.total || 0));
  const max = Math.max(...vals, 1);
  return `<div class="trend-range"><button class="btn small ${range==='7d'?'primary':''}" onclick="renderDashboardTrend('7d')">7D</button><button class="btn small ${range==='30d'?'primary':''}" onclick="renderDashboardTrend('30d')">30D</button><button class="btn small ${range==='6m'?'primary':''}" onclick="renderDashboardTrend('6m')">6M</button><button class="btn small ${range==='1y'?'primary':''}" onclick="renderDashboardTrend('1y')">1Y</button></div><div class="chart trend-chart">${periods.map((m,i)=>`<div class="bar-col"><b>${money(vals[i])}</b><div class="bar" style="height:${Math.max(5,vals[i]/max*150)}px"></div><small>${m.label}</small></div>`).join('')}</div>`;
}
async function renderDashboardTrend(range='6m'){
  const el=document.getElementById('dashboardTrend');
  if(!el)return;
  el.innerHTML='<div class="empty compact"><div class="emoji">⏳</div><p>Loading trend…</p></div>';
  try{el.innerHTML=await renderCollectionTrend(range);}catch(e){console.error(e);el.innerHTML=`<div class="empty compact"><div class="emoji">⚠</div><p>${esc(e.message||'Could not load trend')}</p></div>`;}
}

async function renderDashboard(c){
  const d = dashboardData || await loadDashboardData('6m');
  const counts = d.counts || {};
  const portfolio = d.portfolio || {};
  const col = d.collection || {};
  const reminders = (d.dueTodayRows || []).filter(r => !r.fullyPaid && Number(r.due||0)>0.005).slice(0,6);
  const topOverdue = d.topOverdue || [];
  const risk = d.risk || {'1–7 Days':0,'8–30 Days':0,'31–60 Days':0,'60+ Days':0};
  const riskTotal = Object.values(risk).reduce((a,b)=>a+Number(b||0),0);
  const activity = d.activity || [];
  const special = d.specialCases || {loans:0,outstanding:0,overdue:0};
  const eventIcon={payment:'💳',loan:'📝',customer:'👤',risk:'⚠'};
  const stat=(label,value,sub,cls,icon)=>`<div class="dash-stat ${cls}"><div class="dash-stat-icon">${icon}</div><div class="dash-stat-body"><div class="dash-stat-label">${label}</div><div class="dash-stat-value">${value}</div><div class="dash-stat-sub">${sub}</div></div></div>`;
  const collectionBreakdown=`<div class="breakdown-list"><div><span>Principal received</span><b>${money(col.principalToday)}</b></div><div><span>Interest received</span><b>${money(col.interestToday)}</b></div><div><span>Penalty received</span><b>${money(col.penaltyToday)}</b></div><div><span>Overdue / catch-up received</span><b>${money(col.overdueCollectedToday)}</b></div><div class="breakdown-total"><span>Total received today</span><b>${money(col.collected)}</b></div></div>`;
  c.innerHTML=header("Dashboard",`${counts.customers||0} customers · ${counts.activeLoans||0} active loans · ${counts.completedLoans||0} completed`,`<button class="btn" onclick="renderPage('dashboard')">↻ Refresh</button>`)+`
    <div class="dashboard-stat-grid">
      ${stat("Outstanding Principal",money(portfolio.outstanding),"Active loan portfolio","teal","₹")}
      ${stat("Collected Today",money(col.collected),"All payments received today","teal","◉")}
      ${stat("Due Today",money(col.expected),"Scheduled unpaid/paid installments","blue","▣")}
      ${stat("Total Overdue",money(col.overdueAmount),`${riskTotal} overdue installments` ,"amber","⚠")}
    </div>
    <div class="dashboard-main-grid banking-dashboard-grid">
      <div class="card dashboard-panel"><div class="dashboard-panel-head"><div><h3>💰 Today's Collection</h3><p>Actual cash received today, including overdue catch-up payments.</p></div><button class="btn" onclick="openPage('history')">Payment History</button></div><div class="today-collection-total"><b>${money(col.collected)}</b><span>received today</span></div>${collectionBreakdown}</div>
      <div class="card dashboard-panel"><div class="dashboard-panel-head"><div><h3>🏦 Loan Portfolio</h3><p>Current active lending position.</p></div><button class="btn" onclick="openPage('loans')">View Loans</button></div><div class="portfolio-summary portfolio-summary-final"><div class="portfolio-metric lent"><span class="portfolio-metric-icon">₹</span><div><span>Total lent</span><b>${money(portfolio.lent)}</b><em>${amountInWords(portfolio.lent)}</em></div></div><div class="portfolio-metric outstanding"><span class="portfolio-metric-icon">⌛</span><div><span>Outstanding principal</span><b>${money(portfolio.outstanding)}</b><em>${amountInWords(portfolio.outstanding)}</em></div></div><div class="portfolio-metric interest"><span class="portfolio-metric-icon">◎</span><div><span>All-time interest</span><b>${money(portfolio.interest)}</b><em>${amountInWords(portfolio.interest)}</em></div></div><div class="portfolio-metric completed-total"><span class="portfolio-metric-icon">✓</span><div><span>Completed / total loans</span><b>${counts.completedLoans||0} / ${counts.loans||0}</b><em>${loanCountWords(counts.completedLoans||0)} completed out of ${loanCountWords(counts.loans||0)} loans</em></div></div></div></div>
    </div>
    <div class="dashboard-bottom-grid">
      <div class="card dashboard-panel"><div class="dashboard-panel-head"><div><h3>🚨 Top Overdue Customers</h3><p>Highest unpaid overdue amounts.</p></div><button class="btn" onclick="openPage('pending')">View All</button></div>
        ${topOverdue.length?`<div class="top-overdue-list">${topOverdue.map(x=>`<div class="top-overdue-row"><div><b>${esc(customerName(x.customer||{}))}</b><div class="muted">${x.count} overdue installment${x.count===1?'':'s'} · ${x.days} days late</div></div><div class="top-overdue-right"><strong>${money(x.amount)}</strong><button class="btn small primary" onclick="openPendingForCustomer('${esc(customerName(x.customer||{}))}')">History</button></div></div>`).join('')}</div>`:`<div class="empty compact"><div class="emoji">✓</div><h3>No overdue customers</h3><p>Everyone is up to date.</p></div>`}
      </div>
      <div class="card dashboard-panel"><div class="dashboard-panel-head"><div><h3>🔔 EMIs Due Today</h3><p>Only unpaid installments scheduled for today's date.</p></div><button class="btn" onclick="openPage('today')">View All</button></div>
        ${reminders.length?`<div class="dashboard-reminders">${reminders.map(r=>{const l=r.loan,cu=r.customer||{};const s=r.schedules?.[0];return `<div class="dashboard-reminder"><div><b>${esc(customerName(cu))}</b><div class="muted">${esc(l?.id||'')} · Due ${fmtDate(s?.dueDate||todayISO())}</div></div><div class="reminder-amount"><b>${money(r.due)}</b><button class="btn small primary" onclick="openPaymentFor('${l.id}','${s?.id||''}')">PAY</button></div></div>`}).join('')}</div>`:`<div class="empty compact"><div class="emoji">🎉</div><h3>Everyone due today is paid</h3><p>No unpaid EMI requires action.</p></div>`}
      </div>
    </div>
    <div class="dashboard-bottom-grid">
      <div class="card dashboard-panel"><div class="dashboard-panel-head"><div><h3>🕘 Today's Activity</h3><p>Latest payments, loans and account actions.</p></div><button class="btn" onclick="openPage('history')">History</button></div>
        ${activity.length?`<div class="activity-list">${activity.map(e=>`<div class="activity-row"><div class="activity-icon">${eventIcon[e.type]||'•'}</div><div class="activity-copy"><b>${esc(e.title)}</b><span>${esc(e.detail)}</span></div><div class="activity-meta"><b>${e.amount!==null?money(e.amount):''}</b><span>${fmtDate(e.date)}</span></div></div>`).join('')}</div>`:`<div class="empty compact"><div class="emoji">▱</div><h3>No activity yet</h3><p>Recent activity will appear here.</p></div>`}
      </div>
      <div class="card dashboard-panel special-case-panel"><div class="dashboard-panel-head"><div><h3>⚰ Special Cases</h3><p>Deceased/expired portfolio remains visible for recovery review.</p></div><button class="btn" onclick="openPage('expiredPeople')">View</button></div><div class="special-case-stats"><div><b>${special.loans}</b><span>Loans</span></div><div><b>${money(special.outstanding)}</b><span>Outstanding</span></div><div><b>${money(special.overdue)}</b><span>Overdue</span></div></div><p class="special-case-note">This balance is excluded from operational overdue queues but is not hidden from management totals.</p></div>
    </div>
    <div class="dashboard-bottom-grid banking-dashboard-grid dashboard-final-risk-row">
      <div class="card dashboard-panel"><div class="dashboard-panel-head"><div><h3>📈 Collection Trend</h3><p>Actual money received by month.</p></div><button class="btn" onclick="openPage('analytics')">Analytics</button></div><div id="dashboardTrend">${renderCollectionTrendHtml(d.trend||[],'6m')}</div></div>
      <div class="card dashboard-panel"><div class="dashboard-panel-head"><div><h3>🚨 Overdue Risk</h3><p>Operational overdue exposure by age.</p></div><button class="btn" onclick="openPage('pending')">View Pending</button></div><div class="risk-total"><b>${riskTotal}</b><span>overdue installments</span><strong>${money(col.overdueAmount)}</strong></div><div class="risk-list">${Object.entries(risk).map(([label,count])=>`<div><span>${label}</span><b>${count}</b></div>`).join('')}</div></div>
    </div>`;
}

function renderCollectionTrendHtml(periods, range='6m'){
  const vals=periods.map(x=>Number(x.total||0));
  const max=Math.max(...vals,1);
  return `<div class="trend-range"><button class="btn small ${range==='7d'?'primary':''}" onclick="renderDashboardTrend('7d')">7D</button><button class="btn small ${range==='30d'?'primary':''}" onclick="renderDashboardTrend('30d')">30D</button><button class="btn small ${range==='6m'?'primary':''}" onclick="renderDashboardTrend('6m')">6M</button><button class="btn small ${range==='1y'?'primary':''}" onclick="renderDashboardTrend('1y')">1Y</button></div><div class="chart trend-chart">${periods.map((m,i)=>`<div class="bar-col"><b>${money(vals[i])}</b><div class="bar" style="height:${Math.max(5,vals[i]/max*150)}px"></div><small>${m.label}</small></div>`).join('')}</div>`;
}
