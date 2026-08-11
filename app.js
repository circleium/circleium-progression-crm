const cfg=window.CIRCLEIUM_CONFIG||{};
if(!cfg.supabaseUrl||cfg.supabaseUrl.includes("PASTE_")) alert("Supabase is not configured yet. Open config.js and add your project URL and publishable key.");
const sb=supabase.createClient(cfg.supabaseUrl,cfg.supabasePublishableKey);
let me=null, myPartner=null, globalRows=[], myRows=[], myGroups=[], allPartners=[];

const $=id=>document.getElementById(id);
const esc=s=>String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[m]));
const badge=s=>`<span class="badge">${esc(s||"New")}</span>`;
function field(l,v){return `<div class="field"><label>${esc(l)}</label><div>${esc(v||"—")}</div></div>`}
function table(rows,mode="global"){
 if(!rows.length)return `<tbody><tr><td>No records found.</td></tr></tbody>`;
 return `<thead><tr><th>Ref</th><th>Member</th><th>Interest Pool</th><th>Home Area</th><th>Preferred Asset Area</th><th>Budget</th><th>Owners</th><th>Timescale</th><th>Status</th><th></th></tr></thead><tbody>`+
 rows.map(r=>`<tr><td>${esc(r.reference)}</td><td><strong>${esc(r.member_profile_name)}</strong></td><td>${esc(r.interest_pool)}</td><td>${esc(r.home_county)} · ${esc(r.partner_area)}</td><td>${esc(r.asset_county)} · ${esc(r.asset_location)}</td><td>${esc(r.budget)}</td><td>${esc(r.preferred_owners)}</td><td>${esc(r.timescale)}</td><td>${badge(r.status)}</td><td><button onclick="${mode==="mine"?"openOwn":"openGlobal"}('${r.id}')">${mode==="mine"?"Manage":"Open"}</button></td></tr>`).join("")+"</tbody>";
}
async function login(){
 $("loginError").textContent="";
 const {error}=await sb.auth.signInWithPassword({email:$("loginEmail").value,password:$("loginPassword").value});
 if(error){$("loginError").textContent=error.message;return;} await boot();
}
async function boot(){
 const {data:{session}}=await sb.auth.getSession();
 if(!session){$("login").classList.remove("hidden");return;}
 const {data:p,error}=await sb.from("profiles").select("id,full_name,role,active").eq("id",session.user.id).single();
 if(error||!p?.active){$("loginError").textContent="This CRM account is not active.";return;}
 me=p;$("login").classList.add("hidden");$("who").textContent=`${p.full_name} · ${p.role}`;
 if(p.role==="admin") document.querySelectorAll(".admin").forEach(x=>x.style.display="block");
 if(p.role==="partner"){const {data}=await sb.from("partners").select("*").eq("user_id",p.id).single();myPartner=data;}
 await refresh();
}
async function refresh(){
 await Promise.all([loadGlobal(),loadMine(),loadGroups(), me?.role==="admin"?loadPartners():Promise.resolve()]);
 renderStats();renderGlobal();renderMine();renderGroups();renderRecent();if(me?.role==="admin")renderPartners();
}
async function loadGlobal(){const {data,error}=await sb.rpc("global_progression_register");globalRows=data||[];if(error)console.error(error)}
async function loadMine(){
 if(me?.role==="admin"){const {data}=await sb.from("progressions").select("*").order("created_at",{ascending:false});myRows=data||[]}
 else {const {data}=await sb.from("progressions").select("*").order("created_at",{ascending:false});myRows=data||[]}
}
async function loadGroups(){const {data,error}=await sb.rpc("my_partner_groups");myGroups=data||[];if(error)console.error(error)}
async function loadPartners(){const {data}=await sb.from("partners").select("id,name,email,active,accepting_new,user_id").order("name");allPartners=data||[]}
function renderStats(){
 const values=[["My active progressions",myRows.filter(r=>!["Progressed","Withdrawn"].includes(r.status)).length],["Global matching records",globalRows.length],["Partner Groups",myGroups.length],["Link-ups pending",myGroups.reduce((n,g)=>n+(g.pending_requests||0),0)]];
 $("stats").innerHTML=values.map(([l,n])=>`<div class="card"><b>${n}</b><div>${l}</div></div>`).join("");
}
function renderRecent(){$("recent").innerHTML=table(myRows.slice(0,6),"mine")}
function fill(id,vals){const e=$(id),old=e.options[0].outerHTML;e.innerHTML=old+[...new Set(vals.filter(Boolean))].sort().map(v=>`<option>${esc(v)}</option>`).join("")}
function filteredGlobal(){
 const q=$("gq").value.toLowerCase(),pool=$("gpool").value,asset=$("gasset").value,t=$("gtimescale").value,s=$("gstatus").value;
 return globalRows.filter(r=>(!q||JSON.stringify(r).toLowerCase().includes(q))&&(!pool||r.interest_pool===pool)&&(!asset||r.asset_county===asset)&&(!t||r.timescale===t)&&(!s||r.status===s));
}
function renderGlobal(){fill("gpool",globalRows.map(r=>r.interest_pool));fill("gasset",globalRows.map(r=>r.asset_county));fill("gtimescale",globalRows.map(r=>r.timescale));fill("gstatus",globalRows.map(r=>r.status));$("globalTable").innerHTML=table(filteredGlobal(),"global")}
function renderMine(){$("mineTable").innerHTML=table(myRows,"mine")}
function groupHtml(g,admin=false){
 const members=(g.members||[]).map(m=>`<button class="pill ${m.is_mine?"mine":""}" onclick="${m.is_mine?"openOwn":"openGlobal"}('${m.progression_id}')">${esc(m.member_profile_name)} · ${esc(m.partner_name)}</button>`).join("");
 return `<div class="group"><h3>${esc(g.name)}</h3><div class="small">${esc(g.interest_pool)} · ${g.members?.length||0} linked progressions</div><div class="pills">${members}</div><div class="small">Partners: ${esc((g.partners||[]).join(", "))}</div></div>`
}
function renderGroups(){$("groupList").innerHTML=myGroups.length?myGroups.map(g=>groupHtml(g)).join(""):"<div class='group muted'>No Partner Groups yet.</div>";renderRequests();if(me?.role==="admin")$("adminGroupList").innerHTML=myGroups.map(g=>groupHtml(g,true)).join("")}
async function renderRequests(){
 if(me?.role!=="partner"){ $("requestList").innerHTML="<div class='group muted'>Admin overview.</div>";return;}
 const {data}=await sb.from("linkup_requests").select("*").or(`from_partner_id.eq.${myPartner.id},to_partner_id.eq.${myPartner.id}`).order("created_at",{ascending:false});
 const reqs=data||[];
 $("requestList").innerHTML=reqs.length?reqs.map(r=>`<div class="group"><strong>${esc(r.status)} Link-Up Request</strong><div class="small">${new Date(r.created_at).toLocaleString()}</div>${r.to_partner_id===myPartner.id&&r.status==="Requested"?`<div style="margin-top:10px"><button class="primary" onclick="respondRequest('${r.id}',true)">Approve</button> <button onclick="respondRequest('${r.id}',false)">Decline</button></div>`:""}</div>`).join(""):"<div class='group muted'>No link-up requests.</div>";
}
function renderPartners(){$("partnersTable").innerHTML=`<thead><tr><th>Name</th><th>Email</th><th>Active</th><th>Accepting</th></tr></thead><tbody>`+allPartners.map(p=>`<tr><td>${esc(p.name)}</td><td>${esc(p.email)}</td><td>${p.active?"Yes":"No"}</td><td>${p.accepting_new?"Yes":"No"}</td></tr>`).join("")+"</tbody>"}
async function openOwn(id){
 const r=myRows.find(x=>x.id===id)||(await sb.from("progressions").select("*").eq("id",id).single()).data;if(!r)return;
 $("drawerTitle").textContent=`${r.member_profile_name} · Full Progression`;
 const {data:h}=await sb.from("progression_history").select("*").eq("progression_id",id).order("created_at",{ascending:false});
 $("drawerBody").innerHTML=`<div class="readonly"><strong>Original Member Submission — Read Only</strong><br>The original answers are preserved. Partner updates are recorded separately.</div><div class="section"><h3>Member Submission</h3><div class="grid">${field("Profile",r.member_profile_name)}${field("Email",r.member_email)}${field("Home Area",`${r.home_county} · ${r.partner_area}`)}${field("Interest Pool",r.interest_pool)}${field("Preferred Asset Area",`${r.asset_county||""} · ${r.asset_location||""}`)}${field("Opportunity",r.opportunity)}${field("Asset",r.asset_model)}${field("Budget",r.budget)}${field("Preferred Owners",r.preferred_owners)}${field("Timescale",r.timescale)}${field("Usage",r.usage)}${field("Co-owner Preferences",r.coowner_preferences)}</div></div><div class="section"><h3>Partner Management</h3><div class="grid"><div class="field"><label>Status</label><select id="mStatus">${["New","Under Review","Matching","Potential Group","Formation Ready","Progressed","Withdrawn"].map(s=>`<option ${s===r.status?"selected":""}>${s}</option>`).join("")}</select></div><div class="field"><label>Last Contact</label><input id="mLast" type="date" value="${r.last_contact||""}"></div><div class="field" style="grid-column:1/-1"><label>Next Action</label><input id="mNext" value="${esc(r.next_action||"")}"></div><div class="field" style="grid-column:1/-1"><label>Progress Note</label><textarea id="mNote"></textarea></div></div><div style="padding:0 14px 14px"><button class="primary" onclick="saveManagement('${id}')">Save Partner Update</button></div></div><div class="section"><h3>Progress History</h3><div style="padding:14px">${(h||[]).map(x=>`<p><strong>${new Date(x.created_at).toLocaleDateString()}</strong> · ${esc(x.note)}</p>`).join("")||"<span class='muted'>No updates yet.</span>"}</div></div>`;
 $("modal").classList.remove("hidden");
}
async function openGlobal(id){
 const own=myRows.find(r=>r.id===id);if(own)return openOwn(id);
 const r=globalRows.find(x=>x.id===id);if(!r)return;
 $("drawerTitle").textContent=`${r.member_profile_name} · Matching Summary`;
 $("drawerBody").innerHTML=`<div class="readonly"><strong>Partner matching view</strong><br>Private contact details, internal notes and the full submission are hidden.</div><div class="section"><h3>Matching Summary</h3><div class="grid">${field("Profile",r.member_profile_name)}${field("Lead Partner",r.partner_name)}${field("Home Area",`${r.home_county} · ${r.partner_area}`)}${field("Interest Pool",r.interest_pool)}${field("Preferred Asset Area",`${r.asset_county||""} · ${r.asset_location||""}`)}${field("Opportunity",r.opportunity)}${field("Budget Band",r.budget)}${field("Owners",r.preferred_owners)}${field("Timescale",r.timescale)}${field("Group Availability",r.group_availability)}</div></div>${me?.role==="partner"?`<button class="primary" onclick="requestLinkup('${id}')">Request Link-Up</button>`:""}`;
 $("modal").classList.remove("hidden");
}
async function saveManagement(id){
 const payload={p_progression_id:id,p_status:$("mStatus").value,p_last_contact:$("mLast").value||null,p_next_action:$("mNext").value,p_note:$("mNote").value};
 const {error}=await sb.rpc("update_progression_management",payload);if(error)return alert(error.message);$("modal").classList.add("hidden");await refresh();
}
async function requestLinkup(target){
 if(!myRows.length)return alert("You need an assigned progression before requesting a link-up.");
 const opts=myRows.filter(r=>!["Progressed","Withdrawn"].includes(r.status));const list=opts.map((r,i)=>`${i+1}. ${r.member_profile_name} — ${r.interest_pool}`).join("\n");const n=Number(prompt(`Select your member progression:\n\n${list}`))-1;if(n<0||n>=opts.length)return;
 const {error}=await sb.rpc("request_linkup",{p_source_progression_id:opts[n].id,p_target_progression_id:target});if(error)return alert(error.message);alert("Link-up request sent.");$("modal").classList.add("hidden");await refresh();
}
async function respondRequest(id,approve){const {error}=await sb.rpc("respond_linkup",{p_request_id:id,p_approve:approve});if(error)return alert(error.message);await refresh()}
async function startGroup(){
 if(!myRows.length)return alert("No assigned progressions.");
 const opts=myRows.filter(r=>!["Progressed","Withdrawn"].includes(r.status));const list=opts.map((r,i)=>`${i+1}. ${r.member_profile_name} — ${r.interest_pool}`).join("\n");const raw=prompt(`Enter the numbers of your progressions to link, separated by commas:\n\n${list}`);if(!raw)return;const ids=raw.split(",").map(x=>opts[Number(x.trim())-1]?.id).filter(Boolean);if(!ids.length)return;
 const name=prompt("Group name:",`${opts.find(r=>r.id===ids[0])?.interest_pool||"Circleium"} Potential Group`);if(!name)return;
 const {error}=await sb.rpc("create_potential_group",{p_name:name,p_progression_ids:ids,p_target_owners:4});if(error)return alert(error.message);await refresh();
}
async function invitePartner(){
 const name=prompt("Partner name:");if(!name)return;const email=prompt("Partner email:");if(!email)return;const county=prompt("County:", "Shropshire");const areas=prompt("Circleium areas separated by commas:", "Shrewsbury,Telford,Ludlow");const categories=prompt("Interest Pools/categories separated by commas:", "Personal Watercraft");
 const {data:{session}}=await sb.auth.getSession();
 const res=await fetch("/.netlify/functions/invite-partner",{method:"POST",headers:{"Content-Type":"application/json","Authorization":`Bearer ${session.access_token}`},body:JSON.stringify({name,email,counties:[county],areas:areas.split(",").map(x=>x.trim()),categories:categories.split(",").map(x=>x.trim()),redirectTo:new URL("set-password.html",location.href).href})});
 const j=await res.json();if(!res.ok)return alert(j.error||"Invite failed");alert("Partner invitation sent.");await loadPartners();renderPartners();
}
document.querySelectorAll(".nav[data-view]").forEach(b=>b.onclick=()=>{document.querySelectorAll(".nav[data-view]").forEach(x=>x.classList.remove("active"));b.classList.add("active");["dashboard","global","mine","groups","adminGroups","partners"].forEach(v=>$(v+"View").classList.toggle("hidden",v!==b.dataset.view));});
["gq","gpool","gasset","gtimescale","gstatus"].forEach(id=>$(id).addEventListener(id==="gq"?"input":"change",renderGlobal));
$("loginBtn").onclick=login;$("logoutBtn").onclick=async()=>{await sb.auth.signOut();location.reload()};$("closeDrawer").onclick=()=>$("modal").classList.add("hidden");$("newGroup").onclick=startGroup;$("invitePartner").onclick=invitePartner;
boot();