// Runtime integrity guards loaded after core/actions/render and before app start.
// Prevent two active accounts from controlling the same room member and migrate
// per-account memberData after an admin changes an existing account mapping.

function activeAccountUsingMember(memberId,exceptUid=""){
  if(!memberId)return null;
  return (accessAccounts||[]).find(x=>x.uid!==exceptUid&&x.active!==false&&x.memberId===memberId)||null;
}

async function approveAccess(targetUid){
  const memberId=$(`[data-approve-member="${CSS.escape(targetUid)}"]`)?.value||"";
  const role=$(`[data-approve-role="${CSS.escape(targetUid)}"]`)?.value||"member";
  const req=accessRequests.find(x=>x.uid===targetUid);
  if(memberId){
    const conflict=activeAccountUsingMember(memberId,targetUid);
    if(conflict)return toast(`Thành viên này đang liên kết với ${conflict.displayName||conflict.email||"một tài khoản khác"}. Hãy gỡ liên kết cũ trước.`,6000);
  }else if(role!=="admin"&&!confirm("Tài khoản thành viên chưa được liên kết với người trong phòng nên sẽ không thể tự sửa trạng thái/ngày ở. Vẫn duyệt?"))return;
  try{
    await realtimeEngine?.approveRequest({uid:targetUid,memberId,role,displayName:req?.displayName||""});
    toast("Đã duyệt tài khoản");
  }catch(e){toast(e?.message||"Không thể duyệt");}
}

async function saveAccess(targetUid){
  const memberId=$(`[data-access-member="${CSS.escape(targetUid)}"]`)?.value||"";
  let role=$(`[data-access-role="${CSS.escape(targetUid)}"]`)?.value||"member";
  if(targetUid===authSession.user?.uid&&isAdmin())role="admin";
  const item=accessAccounts.find(x=>x.uid===targetUid);
  if(!item)return toast("Không tìm thấy tài khoản");
  if(memberId){
    const conflict=activeAccountUsingMember(memberId,targetUid);
    if(conflict)return toast(`Thành viên này đang liên kết với ${conflict.displayName||conflict.email||"một tài khoản khác"}. Mỗi thành viên chỉ nên có một tài khoản hoạt động.`,6000);
  }else if(role!=="admin"&&!confirm("Bỏ liên kết thành viên? Tài khoản này sẽ chỉ xem và không thể sửa dữ liệu cá nhân. Vẫn lưu?"))return;
  const mappingChanged=(item.memberId||"")!==memberId;
  try{
    await realtimeEngine?.updateAccess({uid:targetUid,memberId,role,displayName:item.displayName||"",active:true});
    // Once the access listener receives the new memberId, one shape write migrates
    // the memberData override to the newly linked member and avoids stale overlays.
    if(mappingChanged){
      await new Promise(resolve=>setTimeout(resolve,450));
      await realtimeEngine?.recordShape(toSyncShape(state),{});
    }
    toast("Đã cập nhật quyền");
  }catch(e){toast(e?.message||"Không thể cập nhật");}
}

function reportDataIntegrity(){
  if(!isAdmin())return [];
  const issues=[];
  const active=(accessAccounts||[]).filter(x=>x.active!==false&&x.memberId);
  const byMember=new Map();
  active.forEach(x=>{const arr=byMember.get(x.memberId)||[];arr.push(x);byMember.set(x.memberId,arr);});
  for(const [memberId,accounts] of byMember){if(accounts.length>1){const m=state.members.find(x=>x.id===memberId);issues.push(`Trùng liên kết tài khoản: ${m?.name||memberId} (${accounts.length})`);}}
  for(const a of active){if(!state.members.some(m=>m.id===a.memberId))issues.push(`Tài khoản ${a.displayName||a.email||a.uid} đang liên kết tới thành viên đã bị xóa`);}
  for(const b of state.billing?.months||[]){
    const seen=new Map();
    for(const p of b.people||[]){if(!p.memberId)continue;seen.set(p.memberId,(seen.get(p.memberId)||0)+1);}
    for(const [memberId,count] of seen){if(count>1){const m=state.members.find(x=>x.id===memberId);issues.push(`${monthLabel(b.month)} có ${count} bản ghi cho ${m?.name||memberId}`);}}
  }
  return issues;
}
