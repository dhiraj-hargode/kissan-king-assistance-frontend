// Core utilities, validation, server data access, schedules and authentication helpers.

// v47: server-backed data layer. Today's Collection matches payments by loan + collection date so fully paid entries are correctly locked. Business data is no longer persisted in localStorage.
// The browser keeps only an in-memory working copy for rendering; the server/database is authoritative.
// API endpoint selection:
// - Local development keeps using the local backend.
// - Deployed frontend uses the live Render backend.

const API_BASE = "";

const KEY = "server-db";
const USER_DB_KEY = "server-db";
const REMEMBER_KEY = "kk_remember_login"; // preference only; authentication is server-side.
let db = blankDB();
let currentUser = null;
let serverDataLoaded = false;
let dashboardData = null;

const todayISO = () => { const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; };
const money = n => "₹" + Number(n||0).toLocaleString("en-IN",{minimumFractionDigits:0,maximumFractionDigits:2});
const numberWordsIndian = n => {
  n = Math.floor(Math.abs(Number(n)||0));
  if(n===0) return "zero";
  const ones=["zero","one","two","three","four","five","six","seven","eight","nine","ten","eleven","twelve","thirteen","fourteen","fifteen","sixteen","seventeen","eighteen","nineteen"];
  const tens=["","","twenty","thirty","forty","fifty","sixty","seventy","eighty","ninety"];
  const under1000=x=>{let out=[];if(x>=100){out.push(ones[Math.floor(x/100)]+" hundred");x%=100;if(x)out.push("and");}if(x>=20){out.push(tens[Math.floor(x/10)]+(x%10?"-"+ones[x%10]:""));}else if(x>0)out.push(ones[x]);return out.join(" ");};
  const parts=[]; const crore=Math.floor(n/10000000); n%=10000000; const lakh=Math.floor(n/100000); n%=100000; const thousand=Math.floor(n/1000); n%=1000;
  if(crore)parts.push(under1000(crore)+" crore"); if(lakh)parts.push(under1000(lakh)+" lakh"); if(thousand)parts.push(under1000(thousand)+" thousand"); if(n)parts.push(under1000(n));
  return parts.join(" ");
};
const amountInWords = n => {
  const value=Math.round((Number(n)||0)*100)/100;
  const whole=Math.floor(Math.abs(value));
  const paise=Math.round((Math.abs(value)-whole)*100);
  let text=numberWordsIndian(whole)+" rupees";
  if(paise) text += " and "+numberWordsIndian(paise)+" paise";
  return text;
};
const loanCountWords = n => numberWordsIndian(Number(n)||0);
const esc = s => String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));
const fmtDate = d => d ? new Date(d+"T00:00:00").toLocaleDateString("en-IN",{day:"2-digit",month:"short",year:"numeric"}) : "-";
const fmtDateTime = d => { if(!d) return "-"; const x=new Date(d); return Number.isNaN(x.getTime())?String(d):x.toLocaleString("en-IN",{day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit",hour12:true}); };
const addMonths = (dateStr,n) => {const d=new Date(String(dateStr||"")+"T00:00:00");if(Number.isNaN(d.getTime()))return "";const originalDay=d.getDate(),total=d.getFullYear()*12+d.getMonth()+Number(n||0),y=Math.floor(total/12),m=((total%12)+12)%12,lastDay=new Date(y,m+1,0).getDate(),day=Math.min(originalDay,lastDay);return `${y}-${String(m+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;};
const loanDueDay = loan => {const d=new Date(String(loan?.startDate||"")+"T00:00:00");return Number.isNaN(d.getTime())?1:d.getDate();};
const monthlyDueDate=(startDate,installment)=>{const d=new Date(String(startDate||"")+"T00:00:00");if(Number.isNaN(d.getTime()))return "";const targetMonth=d.getMonth()+Number(installment||0),y=d.getFullYear()+Math.floor(targetMonth/12),m=((targetMonth%12)+12)%12,lastDay=new Date(y,m+1,0).getDate(),day=Math.min(d.getDate(),lastDay);return `${y}-${String(m+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;};
const daysBetween=(a,b)=>Math.floor((new Date(b+"T00:00:00")-new Date(a+"T00:00:00"))/86400000);
function validISODate(v){return /^\d{4}-\d{2}-\d{2}$/.test(String(v||""))&&!Number.isNaN(new Date(String(v)+"T00:00:00").getTime());}
function cleanText(v,max=500){return String(v??"").trim().slice(0,max);}
function validMobile(v,required=true){const x=String(v??"").trim();return !required&&!x?true:/^[6-9]\d{9}$/.test(x);}
function nonNegativeNumber(v){const n=Number(v);return Number.isFinite(n)&&n>=0;}
function positiveNumber(v){const n=Number(v);return Number.isFinite(n)&&n>0;}

const MAHARASHTRA_DISTRICT_PINS = {
  "Ahilyanagar":"414001","Akola":"444001","Amravati":"444601","Chhatrapati Sambhajinagar":"431001",
  "Beed":"431122","Bhandara":"441904","Buldhana":"443001","Chandrapur":"442401",
  "Dhule":"424001","Gadchiroli":"442605","Gondia":"441601","Hingoli":"431513",
  "Jalgaon":"425001","Jalna":"431203","Kolhapur":"416003","Latur":"413512",
  "Mumbai City":"400001","Mumbai Suburban":"400050","Nagpur":"440001","Nanded":"431601",
  "Nandurbar":"425412","Nashik":"422001","Dharashiv":"413501","Palghar":"401404",
  "Parbhani":"431401","Pune":"411001","Raigad":"402201","Ratnagiri":"415612",
  "Sangli":"416416","Satara":"415001","Sindhudurg":"416510","Solapur":"413001",
  "Thane":"400601","Wardha":"442001","Washim":"444505","Yavatmal":"445001"
};
const MAHARASHTRA_DISTRICTS = Object.keys(MAHARASHTRA_DISTRICT_PINS);
function districtSelect(name="district", value="", required=true){
  return `<div class="form-group"><label>District${required?" *":""}</label><select name="${name}" ${required?"required":""} onchange="syncDistrictPincode(this.form)"><option value="">Select District</option>${MAHARASHTRA_DISTRICTS.map(d=>`<option value="${esc(d)}" ${String(value)===d?"selected":""}>${esc(d)}</option>`).join("")}</select></div>`;
}
function syncDistrictPincode(form){
  if(!form)return;
  const district=form.querySelector('[name="district"]')?.value||"";
  const pin=form.querySelector('[name="pincode"]');
  if(pin && district && MAHARASHTRA_DISTRICT_PINS[district]) pin.value=MAHARASHTRA_DISTRICT_PINS[district];
}
function validateCustomerInput(o,editingId=null){const errors=[];if(!cleanText(o.firstName,100))errors.push("First name is required.");if(!validMobile(o.mobile,true))errors.push("Enter a valid 10-digit Indian mobile number.");if(!cleanText(o.city||o.village,100))errors.push("City is required.");if(!cleanText(o.district,100))errors.push("District is required.");if(o.homeNumber&&!validMobile(o.homeNumber,false))errors.push("Enter a valid alternate mobile number.");if(o.guarantorMobile&&!validMobile(o.guarantorMobile,false))errors.push("Enter a valid guarantor mobile number.");if(o.pincode&&!/^\d{6}$/.test(String(o.pincode).trim()))errors.push("Pincode must be 6 digits.");const mobile=String(o.mobile||"").trim();if(db.customers.some(c=>String(c.id)!==String(editingId||"")&&String(c.mobile||"").trim()===mobile))errors.push("Another customer already uses this mobile number.");return errors;}
function validateLoanInput(o,customerId){const errors=[],amount=Number(o.amount),rate=Number(o.interestRate),duration=Number(o.duration),dueDay=Number(o.dueDay),penalty=Number(o.penalty||0);if(!customerId||!db.customers.some(c=>String(c.id)===String(customerId)))errors.push("Valid customer selection is required.");if(!cleanText(o.khataNo,50))errors.push("Khata No is required.");if(!cleanText(o.loanType,100))errors.push("Loan Type is required.");if(!cleanText(o.loanAgainst,100))errors.push("Loan Against is required.");if(!["YES","NO"].includes(String(o.emiOption||"").toUpperCase()))errors.push("Select EMI Option YES or NO.");if(!positiveNumber(amount))errors.push("Loan amount must be greater than zero.");if(!Number.isFinite(rate)||rate<0||rate>100)errors.push("Monthly interest must be between 0 and 100%.");if(String(o.emiOption||"").toUpperCase()==="YES" && (!Number.isInteger(duration)||duration<1||duration>240))errors.push("Duration must be a whole number between 1 and 240 months for EMI loans.");if(!Number.isInteger(dueDay)||dueDay<1||dueDay>31)errors.push("Due day must be between 1 and 31.");if(!validISODate(o.startDate))errors.push("Enter a valid loan apply date.");if(!["Flat Monthly","Reducing Balance"].includes(String(o.method||"")))errors.push("Select a valid interest method.");if(!nonNegativeNumber(penalty))errors.push("Penalty cannot be negative.");const duplicate=db.loans.some(l=>String(l.id)!==String(o.loanId||"")&&String(l.khataNo||l.legacyKhataNo||"").trim().toLowerCase()===String(o.khataNo||"").trim().toLowerCase());if(duplicate)errors.push("This Khata No is already assigned to another loan.");return errors;}
function validatePaymentInput(o,loan,schedule){const errors=[],principal=Number(o.principal||0),interest=Number(o.interest||0),penalty=Number(o.penalty||0),total=principal+interest+penalty;if(!loan)errors.push("Loan not found.");if(!schedule)errors.push("Installment not found.");if(loan&&schedule&&String(schedule.loanId)!==String(loan.id))errors.push("Selected installment does not belong to this loan.");if(!validISODate(o.date))errors.push("Enter a valid payment date.");if(loan&&validISODate(o.date)&&validISODate(loan.startDate)&&o.date<loan.startDate)errors.push("Payment date cannot be before the loan start date.");if(validISODate(o.date)&&o.date>todayISO())errors.push("Payment date cannot be in the future.");if(!Number.isFinite(principal)||principal<0)errors.push("Principal cannot be negative.");if(!Number.isFinite(interest)||interest<0)errors.push("Interest cannot be negative.");if(!Number.isFinite(penalty)||penalty<0)errors.push("Penalty cannot be negative.");if(principal>0&&loan&&principal>loanOutstanding(loan)+0.005)errors.push("Principal payment cannot exceed the remaining loan balance.");if(schedule&&total>effectiveDueAmount(schedule)+0.005)errors.push(`Payment exceeds the current installment due (${money(effectiveDueAmount(schedule))}).`);if(total<=0)errors.push("Payment amount must be greater than zero.");if(!cleanText(o.mode,50))errors.push("Payment mode is required.");return errors;}
function validateDatabaseIntegrity(){const issues=[],ids=new Set();if(!db||!Array.isArray(db.customers)||!Array.isArray(db.loans)||!Array.isArray(db.schedules)||!Array.isArray(db.payments)||!Array.isArray(db.blacklist))return ["Database structure is invalid."];db.customers.forEach(c=>{if(ids.has(String(c.id)))issues.push(`Duplicate customer ID: ${c.id}`);ids.add(String(c.id));if(!String(c.firstName||"").trim())issues.push(`Customer ${c.id} has no first name.`);});const customerIds=new Set(db.customers.map(c=>String(c.id))),loanIds=new Set();db.loans.forEach(l=>{if(loanIds.has(String(l.id)))issues.push(`Duplicate loan ID: ${l.id}`);loanIds.add(String(l.id));if(!customerIds.has(String(l.customerId)))issues.push(`Loan ${l.id} references missing customer ${l.customerId}.`);if(!positiveNumber(l.amount))issues.push(`Loan ${l.id} has invalid amount.`);if(!validISODate(l.startDate))issues.push(`Loan ${l.id} has invalid start date.`);});const scheduleIds=new Set();db.schedules.forEach(s=>{if(scheduleIds.has(String(s.id)))issues.push(`Duplicate schedule ID: ${s.id}`);scheduleIds.add(String(s.id));if(!loanIds.has(String(s.loanId)))issues.push(`Schedule ${s.id} references missing loan ${s.loanId}.`);if(!validISODate(s.dueDate))issues.push(`Schedule ${s.id} has invalid due date.`);if(Number(s.emi||0)<0||Number(s.principal||0)<0||Number(s.interest||0)<0||Number(s.penalty||0)<0)issues.push(`Schedule ${s.id} has a negative amount.`);});db.expiredCustomers.forEach(x=>{if(!customerIds.has(String(x.customerId)))issues.push(`Expired record ${x.id} references missing customer ${x.customerId}.`);});const paymentIds=new Set();db.payments.forEach(p=>{if(paymentIds.has(String(p.id)))issues.push(`Duplicate payment ID: ${p.id}`);paymentIds.add(String(p.id));const loan=loanIds.has(String(p.loanId));if(!loan)issues.push(`Payment ${p.id} references missing loan ${p.loanId}.`);if(!validISODate(p.date))issues.push(`Payment ${p.id} has invalid date.`);const principal=Number(p.principal||0),interest=Number(p.interest||0),penalty=Number(p.penalty||0),total=principal+interest+penalty;if([principal,interest,penalty,total].some(v=>!Number.isFinite(v)||v<0))issues.push(`Payment ${p.id} has invalid amounts.`);if(Math.abs(total-Number(p.total||0))>0.01)issues.push(`Payment ${p.id} total does not match its components.`);if(p.scheduleId&&!scheduleIds.has(String(p.scheduleId)))issues.push(`Payment ${p.id} references missing schedule ${p.scheduleId}.`);});return issues;}
function blankDB(){return {customers:[],loans:[],schedules:[],payments:[],blacklist:[],notifications:[],deletedRecords:[],expiredCustomers:[],pendingQueue:[],settings:{appName:"Loan Management",currency:"INR",defaultInterest:2,defaultPenalty:0,reminderDays:[7,3,1,0],logoData:"",logoEnabled:true}}}
function pendingQueue(){
  if(!Array.isArray(db.pendingQueue)) db.pendingQueue=[];
  return db.pendingQueue;
}
function isExplicitPending(s){ return Boolean(s && s.pendingAddedAt && pendingQueue().some(id=>String(id)===String(s.id))); }
function addPendingQueueId(s){ const q=pendingQueue(); if(!q.some(id=>String(id)===String(s.id))) q.push(String(s.id)); }
function removePendingQueueId(s){ if(!s)return; db.pendingQueue=pendingQueue().filter(id=>String(id)!==String(s.id)); }
function migratePendingQueue(){
  if(!Array.isArray(db.pendingQueue)) db.pendingQueue=[];
  // v107-v112 stored the explicit queue inside settings. Migrate that exact
  // queue once. Pending is an explicit work queue only: an installment is
  // valid here only when Today's Collection previously stamped it with
  // pendingAddedAt. Never infer pending state from due/overdue status.
  const legacy=Array.isArray(db.settings?.pendingQueue)?db.settings.pendingQueue:[];
  for(const id of legacy) if(!db.pendingQueue.some(x=>String(x)===String(id))) db.pendingQueue.push(String(id));
  const validIds=new Set((db.schedules||[]).filter(s=>s&&s.pendingAddedAt).map(s=>String(s.id)));
  db.pendingQueue=db.pendingQueue.map(String).filter(id=>validIds.has(id));
  if(db.settings && Object.prototype.hasOwnProperty.call(db.settings,'pendingQueue')) delete db.settings.pendingQueue;
}
function getCurrentUser(){return currentUser;}
async function apiJSON(url,options={}){const r=await fetch(API_BASE+url,{credentials:'include',headers:{'Content-Type':'application/json',...(options.headers||{})},...options});let body={};try{body=await r.json()}catch{}if(!r.ok)throw new Error(body.error||`Request failed (${r.status})`);return body;}
async function loadServerData(){const x=await apiJSON('/api/db');currentUser=x.user;db=x.data||blankDB();db.expiredCustomers=Array.isArray(db.expiredCustomers)?db.expiredCustomers:[];migratePendingQueue();serverSnapshot=cloneData(db);serverDataLoaded=true;applyAppBranding();updateCurrentUserChip();return db;}
async function ensureServerDataLoaded(){if(serverDataLoaded)return db;return loadServerData();}
async function loadDashboardData(range='6m'){const date=todayISO();const x=await apiJSON(`/api/dashboard?date=${encodeURIComponent(date)}&range=${encodeURIComponent(range)}`);dashboardData=x.dashboard||null;currentUser=x.user||currentUser;return dashboardData;}
async function loadPublicBranding(){try{const x=await apiJSON('/api/public/branding');const g=x.branding||{};db.settings={...(db.settings||blankDB().settings),appName:g.appName||db.settings?.appName||'Loan Management',logoData:g.logoData||db.settings?.logoData||'',logoEnabled:g.logoEnabled!==false};applyAppBranding();}catch(e){applyAppBranding();}}
let saveQueue=Promise.resolve();
let serverSnapshot=null;
function cloneData(x){try{return JSON.parse(JSON.stringify(x));}catch{return null;}}
function buildMutationOperations(before,after){
  const ops=[];
  const keys=["customers","loans","schedules","payments","blacklist","notifications","deletedRecords","expiredCustomers"];
  for(const key of keys){
    const b=Array.isArray(before?.[key])?before[key]:[];
    const a=Array.isArray(after?.[key])?after[key]:[];
    const bm=new Map(b.map(x=>[String(x?.id),x]));
    const am=new Map(a.map(x=>[String(x?.id),x]));
    for(const [id,record] of am){
      if(!bm.has(id) || JSON.stringify(bm.get(id))!==JSON.stringify(record)) ops.push({type:key,action:bm.has(id)?"update":"create",id,record});
    }
    for(const id of bm.keys()) if(!am.has(id)) ops.push({type:key,action:"delete",id});
  }
  if(JSON.stringify(before?.pendingQueue||[])!==JSON.stringify(after?.pendingQueue||[])) ops.push({type:"pendingQueue",action:"replace",records:Array.isArray(after?.pendingQueue)?after.pendingQueue.map(String):[]});
  if(JSON.stringify(before?.settings||{})!==JSON.stringify(after?.settings||{})) ops.push({type:"settings",action:"replace",record:after?.settings||{}});
  return ops;
}
function save(){
  if(!currentUser) return Promise.resolve();
  // Serialize writes, but propagate failures to the caller. The queue itself
  // remains usable after a failed request so one network error cannot disable
  // every later save.
  const run=saveQueue.catch(()=>{}).then(async()=>{
    const before=serverSnapshot||blankDB();
    const operations=buildMutationOperations(before,db);
    if(!operations.length){updateNotifCount();applyAppBranding();return;}
    try{
      await apiJSON('/api/mutations',{method:'POST',body:JSON.stringify({operations})});
      serverSnapshot=cloneData(db);
      updateNotifCount();
      applyAppBranding();
    }catch(e){
      console.error(e);
      try{await loadServerData();}catch{}
      toast(e.message||'Could not save data','err');
      throw e;
    }
  });
  saveQueue=run.catch(()=>{});
  return run;
}
function schedulePaymentBreakdown(s){
  const seen=new Set(); let principal=0,interest=0,penalty=0;
  db.payments.filter(p=>{
    if(String(p.loanId)!==String(s.loanId)) return false;
    const sid=String(p.scheduleId||'').trim();
    return sid ? sid===String(s.id) : String(p.date||'')===String(s.dueDate||'');
  }).forEach(p=>{const id=String(p.id);if(seen.has(id))return;seen.add(id);principal+=Number(p.principal||0);interest+=Number(p.interest||0);penalty+=Number(p.penalty||0);});
  return {principal,interest,penalty,principalInterest:principal+interest,total:principal+interest+penalty};
}
function schedulePaymentTotals(s){
  const t=schedulePaymentBreakdown(s);
  return {principalInterest:t.principalInterest,penalty:t.penalty};
}
function schedulePrincipalDue(s){
  const t=schedulePaymentBreakdown(s);
  return Math.max(0,Number(s.principal||0)-t.principal);
}
function scheduleInterestDue(s){
  const t=schedulePaymentBreakdown(s);
  return Math.max(0,Number(s.interest||0)-t.interest);
}
function effectiveSchedulePaid(s){
  const t=schedulePaymentTotals(s);
  return Math.max(Number(s.paid||0),t.principalInterest);
}
function effectiveDueAmount(s){
  const t=schedulePaymentTotals(s);
  const installment=Math.max(0,Number(s.emi||0)-effectiveSchedulePaid(s));
  const unpaidPenalty=Math.max(0,Number(s.penalty||0)-t.penalty);
  return Number((installment+unpaidPenalty).toFixed(2));
}
function effectiveScheduleStatus(s,asOf=todayISO()){
  if(effectiveDueAmount(s)<=0.005)return 'PAID';
  if(String(s.dueDate)<String(asOf))return 'OVERDUE';
  if(String(s.dueDate)===String(asOf))return 'DUE TODAY';
  return 'UPCOMING';
}
function activeCustomers(){return db.customers.filter(c=>!isExpiredCustomer(c.id))}
function activeLoans(){return db.loans.filter(l=>!isExpiredCustomer(l.customerId))}

let selectedCustomerId=null,selectedLoanId=null;
function globalBranding(){return {appName:db.settings?.appName||"Loan Management",logoEnabled:db.settings?.logoEnabled!==false,logoData:db.settings?.logoData||""};}
function saveGlobalBranding(x){db.settings={...(db.settings||blankDB().settings),...x};}
function applyAppBranding(){const g=globalBranding();const name=cleanText(g.appName||"Loan Management",100)||"Loan Management";const logoEnabled=g.logoEnabled!==false,logoSrc=g.logoData||"loan-management-logo.png";document.title=name;const title=document.getElementById("appTitle");if(title)title.textContent=name;const login=document.getElementById("loginAppName");if(login)login.textContent=name;const side=document.getElementById("sidebarAppName");if(side)side.textContent=name;const sideSub=document.getElementById("sidebarAppSubtitle");if(sideSub)sideSub.textContent="";const loginSub=document.getElementById("loginAppSubtitle");if(loginSub)loginSub.textContent="";const favicon=document.getElementById("appFavicon");if(favicon)favicon.href=logoEnabled?logoSrc:"loan-management-logo.png";[document.getElementById("loginLogo"),document.getElementById("sidebarLogo")].forEach(img=>{if(img){img.src=logoEnabled?logoSrc:"loan-management-logo.png";img.classList.toggle("logo-hidden",!logoEnabled)}})}
function updateCurrentUserChip(){const u=currentUser||{name:"User",username:"",role:""};const chip=document.querySelector(".user-chip");if(chip)chip.innerHTML=`<span class="avatar">${esc((u.name||u.username||"A").charAt(0).toUpperCase())}</span><div><b>${esc(u.username||"User")}</b><small>${esc(u.role||"")}</small></div>`;refreshAdminNav();}
function isExpiredCustomer(customerId){ return (db.expiredCustomers||[]).some(x=>String(x.customerId)===String(customerId)); }
function isActiveCustomer(customerId){ return !isExpiredCustomer(customerId); }

function uid(prefix){return prefix+"-"+Date.now().toString(36).toUpperCase()+"-"+Math.random().toString(36).slice(2,6).toUpperCase();}
function nextCustomerId(){
  const nums=db.customers.map(c=>{const m=String(c?.id||'').match(/^KK-(\d+)$/i);return m?Number(m[1]):0;});
  return "KK-"+String(Math.max(0,...nums)+1).padStart(6,"0");
}
function nextLoanId(){
  const nums=db.loans.map(l=>{const m=String(l?.id||'').match(/^KK-LN-(\d+)$/i);return m?Number(m[1]):0;});
  return "KK-LN-"+String(Math.max(0,...nums)+1).padStart(5,"0");
}
function customerName(c){return [c.firstName,c.middleName,c.lastName].filter(Boolean).join(" ")}
function loanPayments(loanId){return db.payments.filter(p=>p.loanId===loanId)}
function paidPrincipal(loanId){return loanPayments(loanId).reduce((s,p)=>s+Number(p.principal||0),0)}
function paidInterest(loanId){return loanPayments(loanId).reduce((s,p)=>s+Number(p.interest||0),0)}
function paidPenalty(loanId){return loanPayments(loanId).reduce((s,p)=>s+Number(p.penalty||0),0)}
function totalPaid(loanId){return loanPayments(loanId).reduce((s,p)=>s+Number(p.total||0),0)}
function loanOutstanding(loan){return Math.max(0,Number(loan.amount)-paidPrincipal(loan.id))}
function scheduleFor(loanId){return db.schedules.filter(s=>s.loanId===loanId).sort((a,b)=>a.installment-b.installment)}
function nextDue(loan){
  // Reconcile against the payment ledger, not only s.status. If interest was
  // paid but principal remains, the loan is still active and the next payment
  // must remain available.
  let s=scheduleFor(loan.id).find(x=>effectiveDueAmount(x)>0.005);
  if(s)return s;

  // EMI=NO means interest-only collection. Once a monthly interest entry is
  // paid, automatically create the next monthly interest cycle while principal
  // remains outstanding. This prevents Payment Entry from incorrectly saying
  // "Completed" when only that month's interest was collected.
  if(String(loan.emiOption||"YES").toUpperCase()==="NO" &&
     loanOutstanding(loan)>0.005 &&
     !["CLOSED","DEAD"].includes(String(loan.status||"ACTIVE").toUpperCase())){
    const all=scheduleFor(loan.id);
    const last=all[all.length-1];
    const installment=last?Number(last.installment||0)+1:1;
    const dueDate=last?addMonths(last.dueDate,1):monthlyDueDate(loan.startDate,1);
    const interest=Number((loanOutstanding(loan)*Number(loan.interestRate||0)/100).toFixed(2));
    s={id:uid("SCH"),loanId:loan.id,customerId:loan.customerId,installment,dueDate,
       principal:0,interest,emi:interest,paid:0,penalty:Number(loan.penalty||0),
       status:"UPCOMING",ownerId:getCurrentUser()?.id||"ADMIN"};
    db.schedules.push(s);
    return s;
  }
  return null;
}
function dueAmount(s){return effectiveDueAmount(s)}
function statusForSchedule(s){
  const paid=Number(s.paid||0), emi=Number(s.emi||0), t=todayISO();
  if(paid>=emi) return "PAID";
  if(s.dueDate<t) return "OVERDUE";
  if(s.dueDate===t) return "DUE TODAY";
  return "UPCOMING";
}
function normalizeMonthlyDueDates(){
  let changed=false;
  db.schedules.forEach(s=>{
    const l=db.loans.find(x=>String(x.id)===String(s.loanId));
    if(!l || !validISODate(l.startDate)) return;
    // Never rewrite a paid/historical transaction's date. Only future operational cycles are normalized.
    if(String(s.status).toUpperCase()==="PAID" || s.legacy===true) return;
    if(Number.isFinite(Number(s.installment)) && Number(s.installment)>0 && Number(s.installment)<900000){
      const expected=monthlyDueDate(l.startDate, Number(s.installment));
      if(expected && s.dueDate!==expected){ s.dueDate=expected; changed=true; }
    } else if(String(s.id||"").startsWith("LEG-OPS-")){
      const current=new Date(String(s.dueDate)+"T00:00:00");
      if(!Number.isNaN(current.getTime())){
        const lastDay=new Date(current.getFullYear(),current.getMonth()+1,0).getDate();
        const day=Math.min(loanDueDay(l),lastDay);
        const expected=`${current.getFullYear()}-${String(current.getMonth()+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
        if(s.dueDate!==expected){s.dueDate=expected;changed=true;}
      }
    }
  });
  if(changed) save();
  return changed;
}
function refreshScheduleStatuses(){
  let changed=false;
  db.schedules.forEach(s=>{
    const next=effectiveScheduleStatus(s);
    if(s.status!==next){s.status=next;changed=true;}
  });
  return changed;
}

// The legacy backup contains payment history but no reliable future duration/schedule.
// Build a practical monthly collection schedule from the last known payment forward.
// Legacy YES loans are treated as active; EMI Option YES uses a 20-month principal
// pattern (this is a reconstruction and is clearly marked in the UI). EMI Option NO
// is interest-only. This lets Today's Collection and Pending Payments work for 2026
// without altering the original imported payment history.
function ensureLegacyOperationalSchedules(untilDate=todayISO()){
  const added=[];
  const target=untilDate||todayISO();

  // Every loan with principal remaining is an OPEN/UNCLOSED account.
  // It must continue into the next monthly cycle until its principal reaches 0.
  // Do not use legacyStatus as the deciding factor: old backups can contain a
  // stale YES/NO flag while the actual remaining balance is the source of truth.
  db.loans.filter(l=>loanOutstanding(l)>0 && isActiveCustomer(l.customerId)).forEach(l=>{
    const existing=db.schedules.filter(s=>s.loanId===l.id);
    const lastPayment=loanPayments(l.id).slice().sort((a,b)=>a.date.localeCompare(b.date)).pop();
    const lastSchedule=existing.slice().sort((a,b)=>a.dueDate.localeCompare(b.dueDate)).pop();

    // Continue from whichever is later: last payment, last generated due date,
    // or the loan start date. This is important when a customer misses a month:
    // the missed cycle remains overdue AND the next cycle is still created.
    let anchor=l.startDate||target;
    if(lastPayment?.date && lastPayment.date>anchor) anchor=lastPayment.date;
    if(lastSchedule?.dueDate && lastSchedule.dueDate>anchor) anchor=lastSchedule.dueDate;

    let cursor=addMonths(anchor,1);
    let guard=0;
    while(cursor<=target && guard++<240){
      const dueDay=loanDueDay(l);
      const base=new Date(cursor+'T00:00:00');
      const y=base.getFullYear(),m=base.getMonth();
      const lastDay=new Date(y,m+1,0).getDate();
      const day=Math.min(dueDay,lastDay);
      const dueDate=`${y}-${String(m+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
      if(dueDate>target) break;

      const exists=existing.some(x=>x.dueDate===dueDate);
      if(!exists){
        const outstanding=loanOutstanding(l);
        if(outstanding<=0) break;

        const isLegacy=!!l.legacyKhataNo;
        const emiOption=String(l.emiOption||'').toUpperCase();
        const duration=Math.max(1,Number(l.duration)||20);
        const defaultPrincipal=Number(l.amount)/duration;
        // For legacy EMI loans continue the same principal cycle. For ordinary
        // loans use the configured duration as the principal allocation.
        const principal=emiOption==='YES'
          ? Math.min(outstanding,Number((Number(l.amount)/20).toFixed(2)))
          : (isLegacy ? 0 : Math.min(outstanding,Number(defaultPrincipal.toFixed(2))));
        // Interest is calculated on the current outstanding principal, matching
        // the village-loan collection model and preventing interest after closure.
        const interest=Number((outstanding*Number(l.interestRate||0)/100).toFixed(2));
        const emi=Number((principal+interest).toFixed(2));
        const sid='LEG-OPS-'+encodeURIComponent(l.id)+'-'+dueDate;
        added.push({
          id:sid,loanId:l.id,customerId:l.customerId,
          installment:900000+added.length+1,dueDate,
          principal,interest,emi,paid:0,penalty:Number(l.penalty||0),
          status:statusForSchedule({dueDate,paid:0,emi}),
          legacyReconstructed:isLegacy
        });
      }
      cursor=addMonths(dueDate,1);
    }
  });

  if(added.length){db.schedules.push(...added);save();return true;}
  return false;
}
function generateSchedule(loan){
  // EMI=YES uses equal principal installments. Interest is MONTHLY and is
  // calculated on the opening outstanding principal for each installment.
  // This is the application's village-loan / reducing-balance model.
  // EMI=NO remains interest-only.
  const n=Number(loan.duration);
  if(!Number.isInteger(n)||n<1||!validISODate(loan.startDate))return;

  const P=Math.max(0,Number(loan.amount)||0);
  const rate=Math.max(0,Number(loan.interestRate)||0)/100;
  const emiOption=String(loan.emiOption||'YES').toUpperCase();
  const method=String(loan.method||'Flat Monthly');
  const rows=[];
  let outstanding=P;
  const basePrincipal=n>0?Number((P/n).toFixed(2)):0;

  for(let i=1;i<=n;i++){
    let principal=0, interest=0, emi=0;

    if(emiOption==='NO'){
      principal=0;
      interest=Number((outstanding*rate).toFixed(2));
      emi=interest;
    }else{
      principal=i===n ? Number(outstanding.toFixed(2)) : Math.min(basePrincipal,Number(outstanding.toFixed(2)));
      interest=method==='Flat Monthly'
        ? Number((P*rate).toFixed(2))
        : Number((outstanding*rate).toFixed(2));
      emi=Number((principal+interest).toFixed(2));
    }

    rows.push({
      id:uid('SCH'),loanId:loan.id,customerId:loan.customerId,installment:i,
      dueDate:addMonths(loan.startDate,i),principal,interest,emi,paid:0,
      penalty:0,status:'UPCOMING',ownerId:getCurrentUser()?.id||'ADMIN'
    });
    outstanding=Math.max(0,outstanding-principal);
  }
  db.schedules.push(...rows);
}

function ensureConfiguredLoanSchedule(loan){
  if(!loan || String(loan.emiOption||'YES').toUpperCase()!=='YES') return false;
  const n=Number(loan.duration);
  if(!Number.isInteger(n)||n<1||!validISODate(loan.startDate)) return false;

  const existing=scheduleFor(loan.id)
    .filter(s=>Number(s.installment||0)>=1 && Number(s.installment||0)<=n)
    .sort((a,b)=>Number(a.installment)-Number(b.installment));
  const byInstallment=new Map(existing.map(s=>[Number(s.installment),s]));
  const P=Math.max(0,Number(loan.amount)||0);
  const rate=Math.max(0,Number(loan.interestRate||0))/100;
  const method=String(loan.method||'Flat Monthly');
  const basePrincipal=n>0?Number((P/n).toFixed(2)):0;
  let scheduledPrincipalBefore=0;
  let changed=false;

  // Complete the contractual duration and normalize all unpaid schedule
  // economics. Historical ledger payments are never deleted or changed.
  for(let i=1;i<=n;i++){
    const s=byInstallment.get(i);
    const opening=Math.max(0,Number((P-scheduledPrincipalBefore).toFixed(2)));
    const principal=String(loan.emiOption||'YES').toUpperCase()==='NO'
      ? 0
      : (i===n ? opening : Math.min(basePrincipal,opening));
    const interest=method==='Flat Monthly'
      ? Number((P*rate).toFixed(2))
      : Number((opening*rate).toFixed(2));
    const emi=Number((principal+interest).toFixed(2));
    const dueDate=monthlyDueDate(loan.startDate,i);

    if(s){
      // Keep the historical due date if it is valid; normalize ordinary
      // duration rows to the contractual monthly date.
      if(validISODate(dueDate) && s.dueDate!==dueDate){s.dueDate=dueDate;changed=true;}

      const ledger=schedulePaymentBreakdown(s);
      const hasLedgerPayment=ledger.total>0.005;
      const storedPaid=Math.max(0,Number(s.paid||0));
      const effectivePaid=Math.max(storedPaid,ledger.principal+ledger.interest);
      const wasPaid=effectivePaid+0.005>=Math.max(0,Number(s.emi||0));

      // A paid historical row keeps its recorded economics. Unpaid rows are
      // recalculated from the loan contract so stale imported values cannot
      // produce wrong monthly interest/EMI figures.
      if(!wasPaid && !hasLedgerPayment){
        if(Math.abs(Number(s.principal||0)-principal)>0.005){s.principal=principal;changed=true;}
        if(Math.abs(Number(s.interest||0)-interest)>0.005){s.interest=interest;changed=true;}
        if(Math.abs(Number(s.emi||0)-emi)>0.005){s.emi=emi;changed=true;}
        if(Math.abs(Number(s.penalty||0)-Number(loan.penalty||0))>0.005){s.penalty=Math.max(0,Number(loan.penalty||0));changed=true;}
        const nextStatus=effectiveScheduleStatus(s);
        if(s.status!==nextStatus){s.status=nextStatus;changed=true;}
      }
    }else{
      if(principal<=0.005 && interest<=0.005) continue;
      const created={
        id:uid('SCH'),loanId:loan.id,customerId:loan.customerId,installment:i,
        dueDate,principal,interest,emi,paid:0,penalty:0,
        status:effectiveScheduleStatus({dueDate,paid:0,emi}),
        ownerId:getCurrentUser()?.id||'ADMIN'
      };
      db.schedules.push(created);
      byInstallment.set(i,created);
      changed=true;
    }

    scheduledPrincipalBefore += principal;
  }

  return changed;
}

function recalculateFutureInterest(loanId){
  const l=db.loans.find(x=>String(x.id)===String(loanId));
  if(!l)return;
  const schedules=scheduleFor(l.id);
  const rate=Math.max(0,Number(l.interestRate||0))/100;
  const method=String(l.method||'Flat Monthly');
  const emiOption=String(l.emiOption||'YES').toUpperCase();
  const P=Math.max(0,Number(l.amount||0));
  const n=Math.max(1,Number(l.duration)||schedules.length||1);
  const basePrincipal=Number((P/n).toFixed(2));
  let scheduledPrincipalBefore=0;

  schedules.forEach((s,index)=>{
    const installment=Number(s.installment||index+1);
    const isContractRow=installment>=1 && installment<=n;
    if(!isContractRow) return;

    const opening=Math.max(0,Number((P-scheduledPrincipalBefore).toFixed(2)));
    const contractPrincipal=emiOption==='NO' ? 0 : (installment===n ? opening : Math.min(basePrincipal,opening));
    const contractInterest=method==='Flat Monthly'
      ? Number((P*rate).toFixed(2))
      : Number((opening*rate).toFixed(2));

    const paid=schedulePaymentBreakdown(s);
    const effectivePaid=Math.max(Number(s.paid||0),paid.principal+paid.interest);
    const fullyPaid=effectivePaid+0.005>=Number(s.emi||0);

    // Historical paid installments are immutable. Recalculate only an unpaid
    // contract row, preventing a later loan edit from rewriting transactions.
    if(!fullyPaid && paid.total<=0.005){
      s.principal=contractPrincipal;
      s.interest=contractInterest;
      s.emi=Number((contractPrincipal+contractInterest).toFixed(2));
      s.penalty=Math.max(0,Number(l.penalty||0));
      s.status=effectiveScheduleStatus(s);
    }
    scheduledPrincipalBefore+=contractPrincipal;
  });
}

function refreshNotifications(){
  // Notifications are now driven ONLY by the explicit Pending Payments queue.
  // Ordinary overdue/due installments do not create notifications until the
  // user clicks "Add to Pending" from Today's Collection.
  const existing=new Map((db.notifications||[]).map(n=>[String(n.key),n]));
  const next=[];
  const seenKeys=new Set();

  (db.schedules||[]).forEach(s=>{
    if(!isExplicitPending(s) || !isActiveCustomer(s.customerId)) return;
    const loan=db.loans.find(l=>String(l.id)===String(s.loanId));
    const c=loan&&db.customers.find(x=>String(x.id)===String(loan.customerId));
    if(!loan||!c) return;

    // A fully paid/closed installment must no longer notify.
    if(effectiveDueAmount(s)<=0.005 || String(loan.status||'').toUpperCase()==='CLOSED') return;

    const key='PENDING-'+String(s.id);
    if(seenKeys.has(key)) return;
    seenKeys.add(key);
    const old=existing.get(key);
    const amount=effectiveDueAmount(s);
    const late=Math.max(0,daysBetween(s.dueDate,todayISO()));
    const text=late>0
      ? `${customerName(c)} — ${money(amount)} pending (${late} day(s) late)`
      : `${customerName(c)} — ${money(amount)} pending payment`;
    next.push({
      id:old?.id||uid('NT'), key, text,
      createdAt:old?.createdAt||s.pendingAddedAt||new Date().toISOString(),
      read:false, scheduleId:s.id, loanId:loan.id, customerId:c.id
    });
  });

  // Keep only current explicit pending notifications, newest 100.
  next.sort((a,b)=>String(a.createdAt).localeCompare(String(b.createdAt)));
  db.notifications=next.slice(-100);
  updateNotifCount();
  return JSON.stringify(existingArrayForNotifications(existing))!==JSON.stringify(db.notifications);
}
function existingArrayForNotifications(existing){return [...existing.values()].filter(n=>String(n.key).startsWith('PENDING-'));}

function updateNotifCount(){
  const n=(db.notifications||[]).filter(x=>!x.read).length;
  const el=document.getElementById('notifCount');
  if(el) el.textContent=String(n);
}
function toast(msg,type="ok"){const r=document.getElementById("toastRoot");r.innerHTML=`<div class="toast ${type}">${esc(msg)}</div>`;setTimeout(()=>r.innerHTML="",2800)}
function openModal(title,body,footer=""){document.getElementById("modalRoot").innerHTML=`<div class="modal-backdrop" onclick="if(event.target===this)closeModal()"><div class="modal"><div class="modal-header"><h2>${title}</h2><button class="close" onclick="closeModal()">×</button></div><div class="modal-body">${body}</div>${footer?`<div class="modal-footer">${footer}</div>`:""}</div></div>`}
function closeModal(){document.getElementById("modalRoot").innerHTML=""}
function setLoginStatus(message,type=""){const el=document.getElementById("loginStatus");if(!el)return;el.textContent=message||"";el.className="login-status"+(type?` ${type}`:"");}
function togglePassword(){const x=document.getElementById("loginPass"),b=document.getElementById("passwordToggle");if(!x)return;const show=x.type==="password";x.type=show?"text":"password";if(b){b.textContent=show?"🙈":"👁";b.setAttribute("aria-label",show?"Hide password":"Show password");b.title=show?"Hide password":"Show password"}}
function showForgotPassword(){openModal("Reset Password",`<form id="forgotPasswordForm" class="form-grid compact-auth-form">${fg("Username","resetUsername")}${fg("Registered Mobile","resetMobile")}${fg("New Password","resetPassword","password")}${fg("Confirm New Password","resetConfirm","password")}<div class="span-3 notice"><b>Password reset:</b> Verify the username and registered mobile number. The server will securely update the password.</div></form>`,`<button class="btn" onclick="closeModal()">Cancel</button><button class="btn primary" onclick="resetPassword()">Reset Password</button>`);}
async function resetPassword(){const f=document.getElementById("forgotPasswordForm");if(!f)return;const username=cleanText(f.resetUsername.value,50).toLowerCase(),mobile=cleanText(f.resetMobile.value,15),password=f.resetPassword.value,confirm=f.resetConfirm.value;if(!username)return toast("Username is required.","err");if(!mobile||!validMobile(mobile,false))return toast("Enter the registered 10-digit mobile number.","err");if(password.length<8||!/[A-Za-z]/.test(password)||!/[0-9]/.test(password))return toast("Password must be at least 8 characters and contain a letter and a number.","err");if(password!==confirm)return toast("Passwords do not match.","err");try{await apiJSON('/api/auth/reset-password',{method:'POST',body:JSON.stringify({username,mobile,password})});closeModal();setLoginStatus("Password reset successfully. Sign in with your new password.","success");}catch(e){toast(e.message||"Password reset failed.","err");}}
function showRegisterUser(){setLoginStatus("");openModal("Register User",`<form id="registerUserForm" class="form-grid">${fg("Full Name","regName")}${fg("Username","regUsername")}${fg("Mobile (optional)","regMobile")}${fg("Role *","regRole","select","<option value='Administrator' selected>Administrator</option>")}${fg("Password *","regPassword","password")}${fg("Confirm Password *","regConfirm","password")}<div class="span-3 notice"><b>Account security:</b> Passwords are hashed on the server. Select the user's role carefully because permissions are enforced server-side.</div></form>`,`<button class="btn" onclick="closeModal()">Cancel</button><button class="btn primary" onclick="registerUser()">Create Account</button>`);}
async function registerUser(){const f=document.getElementById("registerUserForm");if(!f)return;const name=cleanText(f.regName.value,100),username=cleanText(f.regUsername.value,50).toLowerCase(),mobile=cleanText(f.regMobile.value,15),role=cleanText(f.regRole.value,30),password=f.regPassword.value,confirm=f.regConfirm.value;if(!name)return toast("Full name is required.","err");if(!/^[a-z0-9._-]{3,30}$/.test(username))return toast("Username must be 3-30 characters: letters, numbers, dot, underscore or hyphen.","err");if(mobile&&!validMobile(mobile,false))return toast("Enter a valid 10-digit mobile number.","err");if(role!=="Administrator")return toast("Role must be Administrator.","err");if(password.length<8||!/[A-Za-z]/.test(password)||!/[0-9]/.test(password))return toast("Password must be at least 8 characters and contain a letter and a number.","err");if(password!==confirm)return toast("Passwords do not match.","err");try{await apiJSON('/api/auth/register',{method:'POST',body:JSON.stringify({name,username,mobile,role,password})});document.getElementById("loginUser").value=username;document.getElementById("loginPass").value="";closeModal();setLoginStatus("Registration successful. Enter your password to sign in.","success");}catch(e){toast(e.message||"Registration failed.","err");}}
async function completeLogin(remember){try{serverDataLoaded=false;await loadDashboardData('6m');if(remember)localStorage.setItem(REMEMBER_KEY,"1");else localStorage.removeItem(REMEMBER_KEY);setLoginStatus("");document.getElementById("loginScreen").classList.add("hidden");document.getElementById("app").classList.remove("hidden");updateCurrentUserChip();renderPage("dashboard");}catch(e){setLoginStatus(e.message||"Could not load your account.","error");}}

// Normalize Today's Collection search input. Accepts either a string or an HTML input element.
function normalizeTodaySearch(value){
  if(value && typeof value === "object" && "value" in value){
    value=value.value;
  }
  return String(value ?? "").trim();
}
