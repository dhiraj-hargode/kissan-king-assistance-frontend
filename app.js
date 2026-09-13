// Application bootstrap / event wiring. Feature and business logic lives in js/*.js modules.
const loginForm=document.getElementById("loginForm");
if(loginForm){const pass=document.getElementById("loginPass");pass.addEventListener("keydown",e=>{const caps=e.getModifierState&&e.getModifierState("CapsLock");document.getElementById("capsWarning")?.classList.toggle("hidden",!caps)});pass.addEventListener("keyup",e=>{const caps=e.getModifierState&&e.getModifierState("CapsLock");document.getElementById("capsWarning")?.classList.toggle("hidden",!caps)});loginForm.addEventListener("submit",async e=>{e.preventDefault();const username=document.getElementById("loginUser").value.trim().toLowerCase(),password=document.getElementById("loginPass").value;if(!username)return setLoginStatus("Enter your username.","error");if(!password)return setLoginStatus("Enter your password.","error");const btn=document.getElementById("loginBtn");if(btn)btn.disabled=true;try{const x=await apiJSON('/api/auth/login',{method:'POST',body:JSON.stringify({username,password,remember:document.getElementById("rememberLogin").checked})});currentUser=x.user;await completeLogin(document.getElementById("rememberLogin").checked);}catch(e){setLoginStatus(e.message||"Invalid username or password.","error");}finally{if(btn)btn.disabled=false;}});}
(async function restoreLogin(){await loadPublicBranding();try{const x=await apiJSON('/api/auth/me');currentUser=x.user;await loadServerData();document.getElementById('loginScreen').classList.add('hidden');document.getElementById('app').classList.remove('hidden');updateCurrentUserChip();renderPage('dashboard');}catch(e){currentUser=null;document.getElementById('loginScreen').classList.remove('hidden');document.getElementById('app').classList.add('hidden');applyAppBranding();}})();
document.getElementById("logoutBtn").onclick=async()=>{try{await apiJSON('/api/auth/logout',{method:'POST'});}catch{}currentUser=null;localStorage.removeItem(REMEMBER_KEY);location.reload()};

document.getElementById("menuBtn").onclick=()=>document.getElementById("sidebar").classList.toggle("open");
document.querySelectorAll(".nav-item").forEach(b=>b.onclick=()=>{
  const section=b.closest(".nav-section");
  if(section) section.classList.remove("collapsed");
  openPage(b.dataset.page);
  document.getElementById("sidebar").classList.remove("open");
});

// Compact sidebar: collapsible menu groups and desktop collapse state.
document.querySelectorAll(".nav-section-title").forEach(btn=>{
  btn.addEventListener("click",()=>{
    if(document.getElementById("sidebar").classList.contains("collapsed")) return;
    const section=btn.closest(".nav-section");
    const collapsed=section.classList.toggle("collapsed");
    btn.setAttribute("aria-expanded",String(!collapsed));
  });
});
const sidebar=document.getElementById("sidebar");
const sidebarCollapseBtn=document.getElementById("sidebarCollapseBtn");
if(sidebarCollapseBtn){
  sidebarCollapseBtn.addEventListener("click",()=>{
    const collapsed=sidebar.classList.toggle("collapsed");
    sidebarCollapseBtn.textContent=collapsed?"›":"‹";
    sidebarCollapseBtn.title=collapsed?"Expand sidebar":"Collapse sidebar";
    sidebarCollapseBtn.setAttribute("aria-label",sidebarCollapseBtn.title);
  });
}

document.getElementById("globalSearch").addEventListener("input",e=>{
  const q=e.target.value.trim().toLowerCase(); if(!q)return;
  renderSearchResults(q);
});
normalizeMonthlyDueDates();
migratePendingQueue();
const startupScheduleChanged=refreshScheduleStatuses();
const startupNotificationsChanged=refreshNotifications();
if(startupScheduleChanged||startupNotificationsChanged) save();

