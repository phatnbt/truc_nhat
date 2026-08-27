function syncShapeValidationErrors(source=state){
  const errors=[];
  const schedules=new Set();
  for(const schedule of source.schedules||[]){
    if(schedules.has(schedule.weekStart))errors.push(`Có nhiều lịch cùng tuần ${schedule.weekStart}`);
    schedules.add(schedule.weekStart);
  }
  const months=new Set();
  for(const bill of source.billing?.months||[]){
    if(months.has(bill.month))errors.push(`Có nhiều bảng điện nước cùng tháng ${bill.month}`);
    months.add(bill.month);
  }
  return errors;
}
function toSyncShape(source=state){
  const s=normalizeState(clone(source)),errors=syncShapeValidationErrors(s);
  if(errors.length)throw new Error(`${errors[0]}. Hãy xử lý dữ liệu trùng trước khi lưu.`);
  return {
    members:Object.fromEntries(s.members.map(m=>[m.id,clone(m)])),
    presence:clone(s.presence),
    schedules:Object.fromEntries(s.schedules.map(x=>[x.weekStart,clone(x)])),
    billingMonths:Object.fromEntries(s.billing.months.map(b=>[
      b.month,
      {...clone(b),people:Object.fromEntries((b.people||[]).map(p=>[`person:${p.id}`,clone(p)]))}
    ])),
    settings:clone(s.settings)
  };
}
function fromSyncShape(shape){
  const months=Object.values(shape?.billingMonths||{}).map(b=>({...clone(b),people:Object.values(b?.people||{}).map(clone)}));
  return normalizeState({
    ...defaultState(),
    members:Object.values(shape?.members||{}).map(clone),
    presence:clone(shape?.presence||{}),
    schedules:Object.values(shape?.schedules||{}).map(clone),
    billing:{selectedMonth:ui.selectedMonth||state.billing?.selectedMonth||todayMonth(),months},
    settings:{...defaultState().settings,...clone(shape?.settings||{})},
    updatedAt:nowIso()
  });
}

function restoreConfirmedState(){
  state=normalizeState(clone(confirmedState||defaultState()));
  if(!validMonthKey(ui.selectedMonth))ui.selectedMonth=state.billing.selectedMonth||todayMonth();
  state.billing.selectedMonth=ui.selectedMonth;
  saveLocal();renderAll();
}
async function persist(message,audit={}){
  if(!navigator.onLine){
    restoreConfirmedState();
    toast("Đang ngoại tuyến · thay đổi chưa được lưu",5000);
    return false;
  }
  if(!realtimeEngine){
    restoreConfirmedState();
    toast("Chưa kết nối Firebase");
    return false;
  }
  state.updatedAt=nowIso();
  saveLocal();renderAll();
  try{
    await realtimeEngine.recordShape(toSyncShape(state),{
      action:audit.action||"UPDATE_DATA",
      summary:audit.summary||message||"Cập nhật dữ liệu",
      targetMemberId:audit.targetMemberId||null
    });
    if(message)toast(message);
    return true;
  }catch(error){
    restoreConfirmedState();
    toast(error?.message||"Không thể lưu thay đổi",5000);
    if(navigator.onLine)await realtimeEngine.forceSync().catch(()=>{});
    return false;
  }
}
async function forceSync(){
  if(!realtimeEngine)return toast("Chưa kết nối Firebase");
  syncStatus={mode:"syncing",text:"Đang đồng bộ…"};renderSync();
  const ok=await realtimeEngine.forceSync().catch(()=>false);
  toast(ok?"Đã đồng bộ dữ liệu":"Không thể kết nối máy chủ");
}

const VALID_PAGES=new Set(["home","cleaning","billing","audit"]);
function showPage(page,options={}){
  page=VALID_PAGES.has(page)?page:"home";
  if(page==="audit"&&!isAdmin())page="home";
  $$(".page").forEach(p=>p.classList.toggle("active",p.dataset.page===page));
  $$(".mobile-nav button").forEach(b=>b.classList.toggle("active",b.dataset.go===page));
  const target=page==="home"?`${location.pathname}${location.search}`:`${location.pathname}${location.search}#${page}`;
  const current=`${location.pathname}${location.search}${location.hash}`;
  if(current!==target){
    if(options.replace===true)history.replaceState({page},"",target);
    else history.pushState({page},"",target);
  }
  if(options.scroll!==false)window.scrollTo({top:0,behavior:options.instant?"auto":"smooth"});
  if(page==="audit")renderAudit();
}
function openModal(id){ $("#"+id)?.classList.add("show"); }
function closeModal(id){ $("#"+id)?.classList.remove("show"); }

function renderPermission(){
  $$(".admin-only").forEach(el=>el.classList.toggle("role-hidden",!isAdmin()));
  const e=$("#billElectricity"),w=$("#billWater");
  if(e)e.disabled=!isAdmin();if(w)w.disabled=!isAdmin();
}
function renderAccountButton(){
  const btn=$("#accountButton");if(!btn)return;
  btn.classList.toggle("show",!!authSession.user);
  $("#accountName").textContent=authSession.access?.displayName||authSession.user?.displayName||authSession.user?.email||"Tài khoản";
  $("#accountRole").textContent=authSession.status==="active"?(isAdmin()?"Trưởng phòng · Quản trị":"Thành viên · Dữ liệu cá nhân"):(authSession.status==="pending"?"Đang chờ duyệt":"Chưa có quyền");
  const avatar=$("#accountAvatar");
  avatar.innerHTML=authSession.user?.photoURL?`<img src="${esc(authSession.user.photoURL)}" alt="">`:(isAdmin()?"👑":"👤");
}
function authUserCard(){
  const u=authSession.user;if(!u)return "";
  return `<div class="auth-user">${u.photoURL?`<img src="${esc(u.photoURL)}" alt="">`:`<span class="avatar">${esc((u.displayName||u.email||"?").charAt(0))}</span>`}<div><b>${esc(u.displayName||"Tài khoản Google")}</b><small>${esc(u.email||"")}</small></div></div>`;
}
function renderAuthGate(){
  const gate=$("#authGate"),box=$("#authGateContent");if(!gate||!box)return;renderAccountButton();
  if(authSession.status==="active"){gate.classList.add("hidden");return;}
  gate.classList.remove("hidden");
  if(authSession.status==="loading"||authSession.status==="checking"){box.innerHTML='<h2>Đang kiểm tra quyền…</h2><p>Đang tải dữ liệu phòng và quyền truy cập.</p>';return;}
  if(!authSession.user){
    box.innerHTML='<h2>Đăng nhập để vào P708</h2><p>Mỗi tài khoản Google được liên kết với một thành viên trong phòng.</p><div class="auth-actions"><button class="btn primary" id="googleLoginButton" type="button">G · Đăng nhập bằng Google</button></div>';
    $("#googleLoginButton")?.addEventListener("click",secureGoogleLogin);return;
  }
  if(authSession.status==="pending"){
    box.innerHTML=`<h2>Đang chờ trưởng phòng duyệt</h2>${authUserCard()}<p>Yêu cầu với tên <b>${esc(authSession.request?.displayName||"")}</b> đã được gửi.</p><div class="auth-actions"><button class="btn danger" id="cancelRequestButton" type="button">Hủy yêu cầu</button><button class="btn" id="gateSignOutButton" type="button">Đăng xuất</button></div>`;
    $("#cancelRequestButton")?.addEventListener("click",cancelAccessRequest);$("#gateSignOutButton")?.addEventListener("click",secureSignOut);return;
  }
  if(!authSession.adminExists){
    box.innerHTML=`<h2>Thiết lập trưởng phòng đầu tiên</h2>${authUserCard()}<p>Chỉ người quản lý phòng nên nhận quyền này trước khi chia link.</p><div class="field"><label>Tên hiển thị</label><input id="claimAdminName" maxlength="80" value="${esc(authSession.user.displayName||"")}"></div><div class="auth-actions"><button class="btn primary" id="claimAdminButton" type="button">👑 Nhận quyền trưởng phòng</button><button class="btn" id="gateSignOutButton" type="button">Đăng xuất</button></div>`;
    $("#claimAdminButton")?.addEventListener("click",claimFirstAdmin);$("#gateSignOutButton")?.addEventListener("click",secureSignOut);return;
  }
  box.innerHTML=`<h2>Gửi yêu cầu tham gia phòng</h2>${authUserCard()}<p>Nhập đúng tên đang có trong danh sách phòng để trưởng phòng liên kết tài khoản.</p><div class="field"><label>Tên trong phòng</label><input id="requestDisplayName" maxlength="80" value="${esc(authSession.user.displayName||"")}"></div><div class="auth-actions"><button class="btn primary" id="sendRequestButton" type="button">Gửi yêu cầu</button><button class="btn" id="gateSignOutButton" type="button">Đăng xuất</button></div>`;
  $("#sendRequestButton")?.addEventListener("click",sendAccessRequest);$("#gateSignOutButton")?.addEventListener("click",secureSignOut);
}

function memberOptions(selected=""){
  return `<option value="">— Chưa liên kết —</option>${state.members.map(m=>`<option value="${m.id}" ${m.id===selected?"selected":""}>${esc(m.name)}</option>`).join("")}`;
}
function renderAccessModal(){
  const body=$("#accessModalBody");if(!body)return;const u=authSession.user,a=authSession.access;
  const modalHint=$("#accessModal .card-head p");if(modalHint)modalHint.textContent="Bản Free: xóa khỏi phòng sẽ gỡ quyền, email và dữ liệu Firestore; Firebase Authentication vẫn được giữ.";
  let html=`<section class="access-section"><h4>Tài khoản hiện tại</h4><div class="auth-user">${u?.photoURL?`<img src="${esc(u.photoURL)}" alt="">`:`<span class="avatar">${esc((u?.displayName||u?.email||"?").charAt(0))}</span>`}<div><b>${esc(a?.displayName||u?.displayName||"Tài khoản")}</b><small>${esc(u?.email||"")}</small></div><span class="badge ${isAdmin()?"admin":"success"}">${isAdmin()?"👑 Trưởng phòng":"👤 Thành viên"}</span></div></section>`;
  if(isAdmin()){
    html+=`<section class="access-section"><h4>Yêu cầu đang chờ (${accessRequests.length})</h4><div class="access-grid">${accessRequests.length?accessRequests.map(r=>`<div class="access-row"><div><b>${esc(r.displayName||"Chưa đặt tên")}</b><small>${esc(r.email||"")}</small></div><select data-approve-member="${r.uid}">${memberOptions()}</select><select data-approve-role="${r.uid}"><option value="member">Thành viên</option><option value="admin">Quản trị viên</option></select><div class="access-actions"><button class="btn small primary" data-approve="${r.uid}" type="button">Duyệt</button></div></div>`).join(""):'<div class="empty">Không có yêu cầu mới.</div>'}</div></section>`;
    html+=`<section class="access-section"><h4>Tài khoản đã cấp quyền (${accessAccounts.length})</h4><div class="access-grid">${accessAccounts.length?accessAccounts.map(x=>`<div class="access-row"><div><b>${esc(x.displayName||"Thành viên")}${x.uid===u?.uid?" · Bạn":""}</b><small>${esc(x.email||x.uid)} · ${x.active===false?"Đã khóa":"Đang hoạt động"}</small></div><select data-access-member="${x.uid}">${memberOptions(x.memberId||"")}</select><select data-access-role="${x.uid}" ${x.uid===u?.uid?"disabled":""}><option value="member" ${x.role!=="admin"?"selected":""}>Thành viên</option><option value="admin" ${x.role==="admin"?"selected":""}>Quản trị viên</option></select><div class="access-actions"><button class="btn small soft" data-save-access="${x.uid}" type="button">Lưu</button>${x.uid!==u?.uid?`<button class="btn small" data-revoke="${x.uid}" type="button">Khóa</button><button class="btn small danger" data-delete-account="${x.uid}" type="button">Xóa khỏi phòng</button>`:""}</div></div>`).join(""):'<div class="empty">Chưa có tài khoản.</div>'}</div><div class="danger-zone" style="margin-top:12px"><b>Bản Free:</b> “Xóa khỏi phòng” sẽ xóa quyền, email và dữ liệu tài khoản trong Firestore, xóa báo công việc của tài khoản và gỡ email khỏi nhật ký. Tài khoản Firebase Authentication vẫn tồn tại; nếu muốn xóa luôn Auth, thực hiện thủ công trong Firebase Console → Authentication → Users.</div></section>`;
  }
  body.innerHTML=html;
  $$('[data-approve]').forEach(btn=>btn.addEventListener("click",()=>approveAccess(btn.dataset.approve)));
  $$('[data-save-access]').forEach(btn=>btn.addEventListener("click",()=>saveAccess(btn.dataset.saveAccess)));
  $$('[data-revoke]').forEach(btn=>btn.addEventListener("click",()=>revokeAccess(btn.dataset.revoke)));
  $$('[data-delete-account]').forEach(btn=>btn.addEventListener("click",()=>removeAccountFromRoom(btn.dataset.deleteAccount)));
}

async function secureGoogleLogin(){try{await realtimeEngine?.signInGoogle();}catch(e){toast(e?.message||"Không thể đăng nhập Google");}}
async function secureSignOut(){try{closeModal("accessModal");await realtimeEngine?.signOut();}catch(e){toast(e?.message||"Không thể đăng xuất");}}
async function claimFirstAdmin(){try{await realtimeEngine?.claimAdmin($("#claimAdminName")?.value?.trim());toast("Đã thiết lập trưởng phòng");}catch(e){toast(e?.message||"Không thể nhận quyền");}}
async function sendAccessRequest(){try{await realtimeEngine?.requestAccess($("#requestDisplayName")?.value?.trim());toast("Đã gửi yêu cầu");}catch(e){toast(e?.message||"Không thể gửi yêu cầu");}}
async function cancelAccessRequest(){try{await realtimeEngine?.cancelAccessRequest();toast("Đã hủy yêu cầu");}catch(e){toast(e?.message||"Không thể hủy");}}
async function approveAccess(targetUid){
  const memberId=$(`[data-approve-member="${CSS.escape(targetUid)}"]`)?.value||"",role=$(`[data-approve-role="${CSS.escape(targetUid)}"]`)?.value||"member",req=accessRequests.find(x=>x.uid===targetUid);
  if(!memberId&&!confirm("Chưa liên kết với thành viên. Vẫn duyệt?"))return;
  try{await realtimeEngine?.approveRequest({uid:targetUid,memberId,role,displayName:req?.displayName||""});toast("Đã duyệt tài khoản");}catch(e){toast(e?.message||"Không thể duyệt");}
}
async function saveAccess(targetUid){
  const memberId=$(`[data-access-member="${CSS.escape(targetUid)}"]`)?.value||"";let role=$(`[data-access-role="${CSS.escape(targetUid)}"]`)?.value||"member";
  if(targetUid===authSession.user?.uid&&isAdmin())role="admin";
  const item=accessAccounts.find(x=>x.uid===targetUid);
  try{await realtimeEngine?.updateAccess({uid:targetUid,memberId,role,displayName:item?.displayName||"",active:true});toast("Đã cập nhật quyền");}catch(e){toast(e?.message||"Không thể cập nhật");}
}
async function revokeAccess(targetUid){
  const item=accessAccounts.find(x=>x.uid===targetUid);if(!confirm(`Khóa quyền của ${item?.displayName||item?.email||"tài khoản này"}?`))return;
  try{await realtimeEngine?.revokeAccess(targetUid);toast("Đã khóa quyền truy cập");}catch(e){toast(e?.message||"Không thể khóa");}
}
async function removeAccountFromRoom(targetUid){
  if(!requireAdmin())return;const item=accessAccounts.find(x=>x.uid===targetUid);if(!item)return toast("Không tìm thấy tài khoản");
  const label=item.displayName||item.email||targetUid;
  if(!confirm(`XÓA ${label} KHỎI PHÒNG?\n\nEmail và dữ liệu tài khoản trong Firestore sẽ bị xóa. Tài khoản Firebase Authentication vẫn tồn tại trên gói Free.`))return;
  const typed=prompt("Nhập XOA để xác nhận:");if(String(typed||"").trim().toUpperCase()!=="XOA")return toast("Đã hủy xóa");
  try{const result=await realtimeEngine?.deleteAccountFromRoom(targetUid);toast(`Đã xóa khỏi phòng${result?.auditRedacted?` · gỡ email khỏi ${result.auditRedacted} log`:""}`,5000);closeModal("accessModal");}
  catch(e){toast(e?.message||"Không thể xóa tài khoản khỏi phòng",6000);}
}
