// Reports and analytics features.
function paymentTotalsForMonth(key){
  return reportPayments().filter(p=>String(p.date).slice(0,7)===key).reduce((a,p)=>({
    principal:a.principal+Number(p.principal||0),
    interest:a.interest+Number(p.interest||0),
    penalty:a.penalty+Number(p.penalty||0),
    total:a.total+Number(p.total||0)
  }),{principal:0,interest:0,penalty:0,total:0});
}
function monthKeyLocal(d){ return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`; }
function renderReports(c){
  // All Year Revenue is now year-selectable, using the same year universe as
  // Graphs & Analytics. Every KPI and every monthly row is restricted to the
  // selected calendar year. Revenue is based only on actual recorded payments.
  const years=analyticsYears();
  const storedYear=Number(sessionStorage.getItem("kkRevenueYear"));
  const year=years.includes(storedYear)?storedYear:years[0];
  sessionStorage.setItem("kkRevenueYear",String(year));

  const rows=Array.from({length:12},(_,i)=>{
    const key=`${year}-${String(i+1).padStart(2,"0")}`;
    const d=new Date(year,i,1);
    const t=paymentTotalsForMonth(key);
    return {year,month:d.toLocaleString("en-IN",{month:"long"}),...t};
  });

  const yearPayments=reportPayments().filter(p=>String(p.date).slice(0,4)===String(year));
  const totalInterest=yearPayments.reduce((a,p)=>a+Number(p.interest||0),0);
  const totalCollection=yearPayments.reduce((a,p)=>a+Number(p.total||0),0);
  const totalPrincipal=yearPayments.reduce((a,p)=>a+Number(p.principal||0),0);
  const totalPenalty=yearPayments.reduce((a,p)=>a+Number(p.penalty||0),0);

  c.innerHTML=header(
    "All Year Revenue",
    `Actual revenue from recorded payments only. Showing ${year} data.`,
    `<select class="year-select" aria-label="Revenue year" onchange="sessionStorage.setItem('kkRevenueYear',this.value);renderPage('reports')">${years.map(y=>`<option value="${y}" ${y===year?'selected':''}>${y}</option>`).join("")}</select><button class="btn" onclick="window.print()">🖨 Print</button>`
  );

  c.innerHTML+=`<div class="stat-grid">${stat("Total Interest",money(totalInterest),`Actual interest received in ${year}`)}${stat("Months",12,"Calendar months in selected year")}${stat("Total Payments",yearPayments.length,`Recorded payment entries in ${year}`)}${stat("Total Collection",money(totalCollection),"Principal + interest + penalty")}</div>`;

  c.innerHTML+=`<div class="card section-card" style="margin-top:18px"><div class="table-wrap"><table class="data-table"><thead><tr><th>Year</th><th>Month</th><th>Total Principal</th><th>Total Interest</th><th>Total Penalty</th><th>Total Collection</th></tr></thead><tbody>${rows.map(r=>`<tr><td><b>${r.year}</b></td><td>${esc(r.month)}</td><td>${money(r.principal)}</td><td><b>${money(r.interest)}</b></td><td>${money(r.penalty)}</td><td><b>${money(r.total)}</b></td></tr>`).join("")}</tbody></table></div><div class="report-year-summary"><span>Total principal: <b>${money(totalPrincipal)}</b></span><span>Total interest: <b>${money(totalInterest)}</b></span><span>Total penalty: <b>${money(totalPenalty)}</b></span><span>Total collection: <b>${money(totalCollection)}</b></span></div></div>`;
}
function analyticsYears(){
  const ys=new Set();
  const addYear=value=>{const m=String(value||"").match(/^(\d{4})-/);if(m)ys.add(Number(m[1]));};
  // The year selector represents the reporting year. Include every year that
  // can contribute to this page so changing the selector never mixes years.
  db.customers.forEach(c=>addYear(c.createdAt||c.activityCreatedAt));
  db.loans.forEach(l=>{addYear(l.startDate||l.loanDate);addYear(l.createdAt||l.activityCreatedAt);});
  db.payments.forEach(p=>addYear(p.date));
  db.loans.forEach(l=>{const d=loanCompletionDate(l);if(d)addYear(d);});
  if(!ys.size)ys.add(new Date().getFullYear());
  return [...ys].sort((a,b)=>b-a);
}
function analyticsData(year){
  const months=Array.from({length:12},(_,i)=>{
    const key=`${year}-${String(i+1).padStart(2,"0")}`;
    const loans=db.loans.filter(l=>String(l.startDate||l.loanDate||"").startsWith(key));
    const pays=reportPayments().filter(p=>String(p.date).startsWith(key));
    return {month:i+1,label:new Date(year,i,1).toLocaleString("en-IN",{month:"short"}),investment:loans.reduce((a,l)=>a+Number(l.amount||0),0),interest:pays.reduce((a,p)=>a+Number(p.interest||0),0),penalty:pays.reduce((a,p)=>a+Number(p.penalty||0),0)};
  });
  return {months,investment:months.reduce((a,m)=>a+m.investment,0),interest:months.reduce((a,m)=>a+m.interest,0),penalty:months.reduce((a,m)=>a+m.penalty,0)};
}
function loanCompletionDate(yearLoan){
  const l=yearLoan;
  if(l.completedAt&&/^\d{4}-\d{2}-\d{2}/.test(String(l.completedAt))) return String(l.completedAt).slice(0,10);
  const target=Math.max(0,Number(l.amount||0));
  if(target<=0) return null;
  let principal=0,lastDate=null;
  const pays=loanPayments(l.id).slice().sort((a,b)=>String(a.date).localeCompare(String(b.date)));
  for(const p of pays){
    principal+=Number(p.principal||0);
    if(principal>=target-0.005){lastDate=p.date;break;}
  }
  return lastDate;
}
function analyticsActivityData(year){
  const selectedYear=Number(year);
  // All activity counts are calculated independently from the selected year.
  // New users = registration year; New loans = loan/start date year;
  // Completed loans = the year the loan principal actually reached zero.
  const newCustomers=db.customers.filter(c=>Number(String(c.createdAt||c.activityCreatedAt||'').slice(0,4))===selectedYear).length;
  const newLoans=db.loans.filter(l=>Number(String(l.startDate||l.loanDate||'').slice(0,4))===selectedYear).length;
  const completedLoans=db.loans.filter(l=>{const d=loanCompletionDate(l);return d&&Number(String(d).slice(0,4))===selectedYear;}).length;
  return {newCustomers,newLoans,completedLoans};
}
function renderAnalytics(c){
  const years=analyticsYears();
  const storedYear=Number(sessionStorage.getItem("kkAnalyticsYear"));
  const year=years.includes(storedYear)?storedYear:years[0];
  sessionStorage.setItem("kkAnalyticsYear",String(year));
  const data=analyticsData(year),activity=analyticsActivityData(year);
  c.innerHTML=header("Graphs & Analytics","Annual loan, interest and penalty analysis. Monthly Report contains the detailed monthly table.",`<select class="year-select" onchange="sessionStorage.setItem('kkAnalyticsYear',this.value);renderPage('analytics')">${years.map(y=>`<option value="${y}" ${y===year?'selected':''}>${y}</option>`).join("")}</select>`);
  c.innerHTML+=`<div class="analytics-top"><div class="analytics-card"><div class="analytics-icon">₹</div><div><span>Investment</span><b>${money(data.investment)}</b><small>Loans issued in ${year}</small></div></div><div class="analytics-card"><div class="analytics-icon">%</div><div><span>Interest</span><b>${money(data.interest)}</b><small>Actual interest received</small></div></div><div class="analytics-card"><div class="analytics-icon">⚠</div><div><span>Penalty</span><b>${money(data.penalty)}</b><small>Actual penalty received</small></div></div><div class="card analytics-status analytics-activity"><h3>Activity — ${year}</h3>${renderActivityChart(activity)}</div></div>`;
  c.innerHTML+=`<div class="card section-card analytics-chart-card"><div class="section-head"><div><h3>Chart Analysis — ${year}</h3><p>Monthly loan investment compared with actual interest and penalty received.</p></div></div>${renderAnnualAnalysisChart(data.months)}</div>`;
  c.innerHTML+=`<div class="analytics-note"><b>Reporting rule:</b> Investment is based on loans issued in the selected year. Interest and penalty are based only on actual recorded payments. Completed loans are counted in the year their principal was fully paid. Detailed monthly totals are available under <b>Monthly Report</b>.</div>`;
}
function renderActivityChart(data){
  const items=[["New Customers",data.newCustomers],["New Loans",data.newLoans],["Completed Loans",data.completedLoans]],max=Math.max(...items.map(x=>x[1]),1);
  return `<div class="chart analytics-activity-chart">${items.map(x=>`<div class="bar-col"><b>${x[1]}</b><div class="bar" style="height:${Math.max(5,x[1]/max*72)}px"></div><small>${x[0]}</small></div>`).join("")}</div>`;
}
function renderAnnualAnalysisChart(months){
  const max=Math.max(...months.flatMap(m=>[m.investment,m.interest,m.penalty]),1);
  const desktop=`<div class="annual-chart"><div class="chart-y"><span>${money(max)}</span><span>${money(max*.75)}</span><span>${money(max*.5)}</span><span>${money(max*.25)}</span><span>₹0</span></div><div class="chart-grid">${months.map(m=>`<div class="analysis-month"><div class="analysis-bars"><div class="analysis-bar investment" style="height:${Math.max(m.investment?4:0,m.investment/max*260)}px"><i>${m.investment?money(m.investment):''}</i></div><div class="analysis-bar interest" style="height:${Math.max(m.interest?4:0,m.interest/max*260)}px"><i>${m.interest?money(m.interest):''}</i></div><div class="analysis-bar penalty" style="height:${Math.max(m.penalty?4:0,m.penalty/max*260)}px"><i>${m.penalty?money(m.penalty):''}</i></div></div><small>${m.label}</small></div>`).join("")}</div></div>`;
  const mobile=`<div class="annual-mobile-list">${months.map(m=>{
    const total=m.investment+m.interest+m.penalty;
    const invPct=m.investment?Math.max(3,m.investment/max*100):0;
    const intPct=m.interest?Math.max(3,m.interest/max*100):0;
    const penPct=m.penalty?Math.max(3,m.penalty/max*100):0;
    return `<article class="annual-mobile-card"><div class="annual-mobile-head"><h4>${m.label}</h4><span>${total?money(total):'No activity'}</span></div><div class="annual-mobile-metrics"><div><small>Investment</small><b>${money(m.investment)}</b></div><div><small>Interest</small><b>${money(m.interest)}</b></div><div><small>Penalty</small><b>${money(m.penalty)}</b></div></div><div class="annual-mobile-bars" aria-label="${m.label} comparison"><span class="annual-mobile-bar investment" style="width:${invPct}%"></span><span class="annual-mobile-bar interest" style="width:${intPct}%"></span><span class="annual-mobile-bar penalty" style="width:${penPct}%"></span></div></article>`;
  }).join('')}</div>`;
  return `${desktop}<div class="chart-legend"><span><i class="dot investment"></i>Investment</span><span><i class="dot interest"></i>Interest</span><span><i class="dot penalty"></i>Penalty</span></div>${mobile}`;
}

