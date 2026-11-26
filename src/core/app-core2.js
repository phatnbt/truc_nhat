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
    ...(s.resources?{resources:clone(s.resources)}:{}),
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
    ...(shape?.resources?{resources:clone(shape.resources)}:{}),
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
      ...audit,
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

const VALID_PAGES=new Set(["home","cleaning","billing","resources","audit"]);
function showPage(page,options={}){
  page=VALID_PAGES.has(page)?page:"home";
  if(page==="audit"&&!isAdmin())page="home";
  document.body.dataset.page=page;
  $$(".page").forEach(p=>p.classList.toggle("active",p.dataset.page===page));
  $$(".mobile-nav button,.desktop-nav button").forEach(button=>{
    const current=button.dataset.go===page;
    button.classList.toggle("active",current);
    if(current)button.setAttribute("aria-current","page");else button.removeAttribute("aria-current");
  });
  const target=page==="home"?`${location.pathname}${location.search}`:`${location.pathname}${location.search}#${page}`;
  const current=`${location.pathname}${location.search}${location.hash}`;
  if(options.updateLocation!==false&&current!==target){
    if(options.replace===true)history.replaceState({page},"",target);
    else history.pushState({page},"",target);
  }
  if(options.scroll!==false)window.scrollTo({top:0,behavior:"instant"});
  if(page==="audit")renderAudit();
}
const modalFocus=new WeakMap();
function openModal(id){
  const modal=document.getElementById(id);
  if(!modal||modal.classList.contains("show"))return;
  modalFocus.set(modal,document.activeElement);
  modal.classList.add("show");
  document.body.classList.add("modal-open");
  modal.querySelector("[data-close]")?.focus({preventScroll:true});
}
function closeModal(id){
  const modal=document.getElementById(id);
  if(!modal?.classList.contains("show"))return;
  modal.classList.remove("show");
  document.body.classList.toggle("modal-open",!!$(".modal.show"));
  const opener=modalFocus.get(modal);
  if(opener?.isConnected)opener.focus({preventScroll:true});
}

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
  delete box.dataset.bootProgress;
  const {status,offline}=authSession;
  document.querySelectorAll("body > main,body > .app-toolbar,body > .mobile-nav").forEach(element=>element.inert=status!=="active");
  if(status==="active"){gate.classList.add("hidden");return;}
  gate.classList.remove("hidden");
  if(status==="loading"||status==="restoring"){box.innerHTML='<h2>Đang khôi phục phiên…</h2><p>Đang kiểm tra phiên trên thiết bị này.</p>';return;}
  if(["checking","loadingRoom","error","denied"].includes(status)){
    const title=status==="denied"?"Chưa được phép vào phòng":offline?"Đang ngoại tuyến":status==="error"
      ?authSession.roomError?"Chưa tải được dữ liệu phòng":"Chưa thể kiểm tra quyền"
      :status==="checking"?"Đang kiểm tra quyền…":"Đang tải dữ liệu phòng…";
    const hint=status==="denied"?"Tài khoản đã bị khóa hoặc chưa liên kết đúng với thành viên. Hãy liên hệ trưởng phòng."
      :offline?"Hãy kết nối lại mạng. Phiên đăng nhập trên thiết bị vẫn được giữ."
      :authSession.roomError==="invalid-member"?"Trưởng phòng cần kiểm tra liên kết của tài khoản với danh sách thành viên."
      :status==="error"?"Hãy kiểm tra kết nối rồi thử lại.":"Phiên Google đã được nhận. Đang chờ máy chủ P708.";
    box.innerHTML=`<h2>${title}</h2><p>${hint}</p><div class="auth-actions">${status==="error"||offline?'<button class="btn primary" id="retryAccessButton" type="button">Thử lại</button>':""}${authSession.user?'<button class="btn" id="gateSignOutButton" type="button">Đăng xuất</button>':""}</div>`;
    $("#retryAccessButton")?.addEventListener("click",()=>authSession.user?realtimeEngine?.retryAccess():location.reload());
    $("#gateSignOutButton")?.addEventListener("click",secureSignOut);return;
  }
  if(!authSession.user){
    const {embedded,standalone,mobile}=realtimeEngine?.environment?.()||{};
    const destination=P708MobileAuth.authDestination(location.hash);
    const error=authSession.authError?P708MobileAuth.authErrorMessage(authSession.authError):offline?"Hãy kết nối mạng để đăng nhập.":"";
    const hint=embedded?"Mở menu ⋯ của ứng dụng, chọn mở bằng Safari hoặc Chrome. Bạn cũng có thể sao chép link rồi dán vào trình duyệt."
      :standalone?"Hãy đăng nhập từ ứng dụng này. Nếu Google không quay về P708, sao chép link Firebase và dùng link đó để cài P708.":mobile?"Dùng Safari hoặc Chrome để hoàn tất đăng nhập.":"";
    box.innerHTML=`<h2>${embedded?"Mở P708 bằng trình duyệt":"Đăng nhập để vào P708"}</h2>
      ${hint?`<p>${hint}</p>`:""}${error?`<p class="auth-feedback" role="alert">${esc(error)}</p>`:""}
      <div class="auth-actions">${embedded?"":`<button class="btn primary" id="googleLoginButton" type="button" ${status==="signingIn"||offline?"disabled":""}>${status==="signingIn"?"Đang mở Google…":"G · Đăng nhập bằng Google"}</button>`}
      ${embedded||mobile||standalone||error?'<button class="btn" id="copyAuthLink" type="button">Sao chép link P708</button>':""}</div>
      <div id="authCopyStatus" role="status"></div>`;
    $("#googleLoginButton")?.addEventListener("click",secureGoogleLogin);
    $("#copyAuthLink")?.addEventListener("click",async()=>{
      const feedback=$("#authCopyStatus");
      try{await navigator.clipboard.writeText(destination);feedback.textContent="Đã sao chép link.";}
      catch{
        const link=document.createElement("input");
        link.readOnly=true;link.value=destination;link.setAttribute("aria-label","Link P708 để sao chép");
        feedback.replaceChildren(document.createTextNode("Giữ và sao chép link dưới đây."),link);
        link.focus();link.select();
      }
    });return;
  }
  if(authSession.status==="pending"){
    box.innerHTML=`<h2>Đang chờ trưởng phòng duyệt</h2>${authUserCard()}<p>Yêu cầu với tên <b>${esc(authSession.request?.displayName||"")}</b> đã được gửi.</p><div class="auth-actions"><button class="btn danger" id="cancelRequestButton" type="button">Hủy yêu cầu</button><button class="btn" id="gateSignOutButton" type="button">Đăng xuất</button></div>`;
    $("#cancelRequestButton")?.addEventListener("click",cancelAccessRequest);$("#gateSignOutButton")?.addEventListener("click",secureSignOut);return;
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
  html+=`<p class="muted">Phiên bản P708 <span id="appVersionText">${esc(globalThis.P708_RELEASE||"chưa rõ")}</span></p>`;
  if(!globalThis.P708Debug)html+='<button class="btn small" id="openPwaDiagnostics" type="button">Mở chẩn đoán</button>';
  if(isAdmin()){
    html+=`<section class="access-section"><h4>Yêu cầu đang chờ (${accessRequests.length})</h4><div class="access-grid">${accessRequests.length?accessRequests.map(r=>`<div class="access-row"><div><b>${esc(r.displayName||"Chưa đặt tên")}</b><small>${esc(r.email||"")}</small></div><select data-approve-member="${r.uid}">${memberOptions()}</select><select data-approve-role="${r.uid}"><option value="member">Thành viên</option><option value="admin">Quản trị viên</option></select><div class="access-actions"><button class="btn small primary" data-approve="${r.uid}" type="button">Duyệt</button></div></div>`).join(""):'<div class="empty">Không có yêu cầu mới.</div>'}</div></section>`;
    html+=`<section class="access-section"><h4>Tài khoản đã cấp quyền (${accessAccounts.length})</h4><div class="access-grid">${accessAccounts.length?accessAccounts.map(x=>`<div class="access-row"><div><b>${esc(x.displayName||"Thành viên")}${x.uid===u?.uid?" · Bạn":""}</b><small>${esc(x.email||x.uid)} · ${x.active===false?"Đã khóa":"Đang hoạt động"}</small></div><select data-access-member="${x.uid}">${memberOptions(x.memberId||"")}</select><select data-access-role="${x.uid}" ${x.uid===u?.uid?"disabled":""}><option value="member" ${x.role!=="admin"?"selected":""}>Thành viên</option><option value="admin" ${x.role==="admin"?"selected":""}>Quản trị viên</option></select><div class="access-actions"><button class="btn small soft" data-save-access="${x.uid}" type="button">Lưu</button>${x.uid!==u?.uid?`<button class="btn small" data-revoke="${x.uid}" type="button">Khóa</button><button class="btn small danger" data-delete-account="${x.uid}" type="button">Xóa khỏi phòng</button>`:""}</div></div>`).join(""):'<div class="empty">Chưa có tài khoản.</div>'}</div><div class="danger-zone" style="margin-top:12px"><b>Bản Free:</b> “Xóa khỏi phòng” sẽ xóa quyền, email và dữ liệu tài khoản trong Firestore, xóa báo công việc của tài khoản và gỡ email khỏi nhật ký. Tài khoản Firebase Authentication vẫn tồn tại; nếu muốn xóa luôn Auth, thực hiện thủ công trong Firebase Console → Authentication → Users.</div></section>`;
  }
  body.innerHTML=html;
  $("#openPwaDiagnostics")?.addEventListener("click",()=>{
    if(realtimeEngine?.hasPendingWork()||globalThis.P708HasExternalWrites?.())
      return toast("Đợi lưu xong rồi mở chẩn đoán.");
    const target=new URL(location.href);
    target.searchParams.set("debug","1");
    location.assign(target.href);
  });
  $$('[data-approve]').forEach(btn=>btn.addEventListener("click",()=>approveAccess(btn.dataset.approve)));
  $$('[data-save-access]').forEach(btn=>btn.addEventListener("click",()=>saveAccess(btn.dataset.saveAccess)));
  $$('[data-revoke]').forEach(btn=>btn.addEventListener("click",()=>revokeAccess(btn.dataset.revoke)));
  $$('[data-delete-account]').forEach(btn=>btn.addEventListener("click",()=>removeAccountFromRoom(btn.dataset.deleteAccount)));
}

async function secureGoogleLogin(){try{await realtimeEngine?.signInGoogle();}catch(e){toast(P708MobileAuth.authErrorMessage(e?.code));}}
async function secureSignOut(){try{closeModal("accessModal");await realtimeEngine?.signOut();}catch(e){toast(e?.message||"Không thể đăng xuất");}}
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
