// Runtime integrity guards loaded after core/actions/render and before app start.
// These guards keep account mappings one-to-one, clear sensitive local room cache,
// detect duplicate member identities, and repair safe duplicate/mapping cases before
// they become silent billing/realtime errors.

const baseSaveLocal=saveLocal;
saveLocal=function(){
  const mayCacheRoom=authSession?.status==="active"||authSession?.status==="loading"||authSession?.status==="checking";
  if(mayCacheRoom){
    storageSet(CACHE_KEY,JSON.stringify(state));
  }else{
    try{
      localStorage.removeItem(CACHE_KEY);
      localStorage.removeItem("cleaning_shared_apps_script_v2");
      localStorage.removeItem("cleaning_shared_apps_script_v1");
    }catch{}
  }
  storageSet(UI_KEY,JSON.stringify(ui));
};

function memberNameKey(value){
  return String(value||"")
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g," ")
    .toLocaleLowerCase("vi-VN");
}
function activeAccountUsingMember(memberId,exceptUid=""){
  if(!memberId)return null;
  return (accessAccounts||[]).find(x=>x.uid!==exceptUid&&x.active!==false&&x.memberId===memberId)||null;
}
function requireOnlineAction(){
  if(navigator.onLine)return true;
  toast("Đang ngoại tuyến · thao tác quản trị tạm khóa để tránh xung đột dữ liệu",5000);
  return false;
}
function duplicateMemberGroups(){
  const groups=new Map();
  for(const member of state.members||[]){
    const key=memberNameKey(member.name);
    if(!key)continue;
    const list=groups.get(key)||[];list.push(member);groups.set(key,list);
  }
  return [...groups.entries()].filter(([,members])=>members.length>1);
}
function memberReferenceScore(memberId){
  let score=0;
  for(const schedule of state.schedules||[]){
    score+=(schedule.assignments||[]).filter(a=>a?.personId===memberId).length*20;
  }
  for(const bill of state.billing?.months||[]){
    for(const person of bill.people||[]){
      if(person?.memberId!==memberId)continue;
      score+=10;
      for(const value of Object.values(person.days||{}))if(value===true)score++;
      if(person.paid===true)score+=5;
    }
  }
  return score;
}
function trueDayCount(person,bill){
  let count=0;
  for(let day=1;day<=monthDays(bill.month);day++)if(person?.days?.[String(day)]===true)count++;
  return count;
}
function mergeBillingRowsForIdentity(bill,canonicalMember,memberIds,nameKey){
  if(!bill||bill.closed)return 0;
  const candidates=(bill.people||[]).filter(person=>
    memberIds.has(person.memberId)||(!person.memberId&&memberNameKey(person.name)===nameKey)
  );
  if(!candidates.length)return 0;
  const target=[...candidates].sort((a,b)=>{
    const aCanonical=a.memberId===canonicalMember.id?1:0,bCanonical=b.memberId===canonicalMember.id?1:0;
    return bCanonical-aCanonical||trueDayCount(b,bill)-trueDayCount(a,bill)||(Number(b.paidAmount)||0)-(Number(a.paidAmount)||0);
  })[0];
  const mergedDays={};
  for(let day=1;day<=monthDays(bill.month);day++){
    mergedDays[String(day)]=candidates.some(person=>person.days?.[String(day)]===true);
  }
  const paymentSource=[...candidates].sort((a,b)=>(Number(b.paidAmount)||0)-(Number(a.paidAmount)||0))[0];
  target.memberId=canonicalMember.id;
  target.name=canonicalMember.name;
  target.days=mergedDays;
  target.paid=candidates.some(person=>person.paid===true);
  target.paidAmount=Math.max(0,...candidates.map(person=>Number(person.paidAmount)||0));
  target.paidAt=paymentSource?.paidAt||candidates.find(person=>person.paidAt)?.paidAt||null;
  target.paidBy=paymentSource?.paidBy||candidates.find(person=>person.paidBy)?.paidBy||null;
  target.updatedAt=nowIso();
  const removeIds=new Set(candidates.filter(person=>person!==target).map(person=>person.id));
  bill.people=(bill.people||[]).filter(person=>!removeIds.has(person.id));
  if(removeIds.size)bill.updatedAt=nowIso();
  return removeIds.size;
}
function repairDuplicateMembersInMemory({ask=true}={}){
  const groups=duplicateMemberGroups();
  if(!groups.length)return {cancelled:false,mergedGroups:0,removedMembers:0,mergedBillingRows:0,conflicts:[],affectedWeeks:[]};

  const conflictGroups=[];
  const mergePlans=[];
  for(const [key,members] of groups){
    const ids=new Set(members.map(member=>member.id));
    const mappedIds=[...new Set((accessAccounts||[]).filter(account=>ids.has(account.memberId)).map(account=>account.memberId))];
    if(mappedIds.length>1){
      conflictGroups.push(`${members[0].name} (${mappedIds.length} tài khoản đang trỏ vào các ID khác nhau)`);
      continue;
    }
    let canonical=null;
    if(mappedIds.length===1)canonical=members.find(member=>member.id===mappedIds[0])||null;
    if(!canonical){
      canonical=[...members].sort((a,b)=>{
        const scoreDiff=memberReferenceScore(b.id)-memberReferenceScore(a.id);
        if(scoreDiff)return scoreDiff;
        const createdDiff=timeMs(a.createdAt)-timeMs(b.createdAt);
        if(createdDiff)return createdDiff;
        return String(a.id).localeCompare(String(b.id));
      })[0];
    }
    mergePlans.push({key,members,canonical});
  }

  if(ask&&mergePlans.length){
    const preview=mergePlans.slice(0,6).map(plan=>`${plan.canonical.name} ×${plan.members.length}`).join(", ");
    const suffix=mergePlans.length>6?` và ${mergePlans.length-6} nhóm khác`:"";
    if(!confirm(`Phát hiện tên thành viên bị trùng: ${preview}${suffix}.\n\nHệ thống sẽ giữ ID đang được tài khoản liên kết (nếu có), gộp ngày ở của các bản ghi trùng và sửa lại lịch trực. Dữ liệu tháng đã chốt sẽ không bị thay đổi. Tiếp tục?`)){
      return {cancelled:true,mergedGroups:0,removedMembers:0,mergedBillingRows:0,conflicts:conflictGroups,affectedWeeks:[]};
    }
  }

  let removedMembers=0,mergedBillingRows=0,mergedGroups=0;
  const affectedWeeks=new Set();
  for(const plan of mergePlans){
    const {key,members,canonical}=plan;
    const ids=new Set(members.map(member=>member.id));
    const duplicateIds=new Set([...ids].filter(id=>id!==canonical.id));
    if(!duplicateIds.size)continue;

    for(const bill of state.billing?.months||[]){
      mergedBillingRows+=mergeBillingRowsForIdentity(bill,canonical,ids,key);
    }

    for(const schedule of state.schedules||[]){
      let changed=false;
      for(const assignment of schedule.assignments||[]){
        if(!duplicateIds.has(assignment.personId))continue;
        assignment.personId=canonical.id;
        assignment.personName=canonical.name;
        changed=true;
      }
      if(Array.isArray(schedule.absentNames)){
        const seen=new Set();
        schedule.absentNames=schedule.absentNames.filter(name=>{
          const normalized=memberNameKey(name);
          if(seen.has(normalized))return false;
          seen.add(normalized);return true;
        });
      }
      if(changed){schedule.updatedAt=nowIso();affectedWeeks.add(schedule.weekStart);}
    }

    const anyPresent=members.some(member=>state.presence?.[member.id]!==false);
    state.presence[canonical.id]=anyPresent;
    for(const duplicateId of duplicateIds)delete state.presence[duplicateId];
    canonical.createdAt=[...members].map(member=>member.createdAt).filter(Boolean).sort()[0]||canonical.createdAt||nowIso();
    canonical.updatedAt=nowIso();
    state.members=(state.members||[]).filter(member=>!duplicateIds.has(member.id));
    removedMembers+=duplicateIds.size;
    mergedGroups++;
  }
  return {cancelled:false,mergedGroups,removedMembers,mergedBillingRows,conflicts:conflictGroups,affectedWeeks:[...affectedWeeks]};
}

// Override addMember so Unicode composition, casing and repeated whitespace cannot
// create another logical member with a different ID.
addMember=function(){
  if(!requireAdmin())return;
  const input=$("#cleanMemberName"),name=input.value.trim().replace(/\s+/g," ");
  if(!name)return toast("Nhập tên thành viên");
  if(name.length>80)return toast("Tên thành viên quá dài");
  const key=memberNameKey(name);
  const existing=(state.members||[]).find(member=>memberNameKey(member.name)===key);
  if(existing)return toast(`Tên ${existing.name} đã tồn tại. Không tạo thêm ID trùng.`,5000);
  const t=nowIso(),member={id:uid(),name,createdAt:t,updatedAt:t};
  state.members.push(member);state.presence[member.id]=true;input.value="";
  persist("Đã thêm thành viên",{action:"ADD_MEMBER",summary:`Thêm thành viên ${name}`,targetMemberId:member.id});
};

// Override billing sync: first repair safe duplicate member identities, then dedupe
// current-month billing rows by canonical memberId. Conflicting account mappings are
// never guessed or merged automatically.
syncBillingMembers=async function(){
  if(!requireAdmin())return;
  if(!requireOnlineAction())return;
  const bill=ensureBill();if(bill.closed)return toast("Tháng đã chốt sổ");

  const repair=repairDuplicateMembersInMemory({ask:true});
  if(repair.cancelled)return toast("Đã hủy cập nhật danh sách");

  const n=monthDays(bill.month),all=Object.fromEntries(Array.from({length:n},(_,index)=>[String(index+1),true]));
  const stamp=person=>timeMs(person?.updatedAt)||timeMs(person?.createdAt)||Number.MAX_SAFE_INTEGER;
  const sameDays=(a,b)=>{for(let day=1;day<=n;day++)if((a?.days?.[String(day)]===true)!==(b?.days?.[String(day)]===true))return false;return true;};
  const mergePayment=(target,extra)=>{
    target.paid=target.paid||!!extra.paid;
    target.paidAmount=Math.max(Number(target.paidAmount)||0,Number(extra.paidAmount)||0);
    target.paidAt=target.paidAt||extra.paidAt||null;target.paidBy=target.paidBy||extra.paidBy||null;
  };
  const removeExtra=(target,extra)=>{mergePayment(target,extra);bill.people=bill.people.filter(person=>person.id!==extra.id);};
  const memberNameCount=new Map();
  state.members.forEach(member=>memberNameCount.set(memberNameKey(member.name),(memberNameCount.get(memberNameKey(member.name))||0)+1));
  let added=0,relinked=0,merged=repair.mergedBillingRows||0,ambiguous=repair.conflicts.length;

  for(const member of state.members){
    const key=memberNameKey(member.name);
    if(memberNameCount.get(key)!==1){ambiguous++;continue;}
    const exact=bill.people.filter(person=>person.memberId===member.id).sort((a,b)=>stamp(a)-stamp(b));
    const legacy=bill.people.filter(person=>!person.memberId&&memberNameKey(person.name)===key).sort((a,b)=>stamp(a)-stamp(b));
    let person=exact[0]||null;

    if(exact.length>1){
      const canonical=exact.find(row=>trueDayCount(row,bill)>0)||exact[0];
      const conflict=exact.some(row=>row!==canonical&&trueDayCount(row,bill)>0&&!sameDays(row,canonical));
      if(conflict){
        // For the same canonical memberId these rows are definitively the same person;
        // merge by union of stay-days instead of leaving visible duplicates.
        mergeBillingRowsForIdentity(bill,member,new Set([member.id]),key);
        merged+=exact.length-1;
        person=bill.people.find(row=>row.memberId===member.id)||canonical;
      }else{
        person=canonical;
        for(const extra of exact){if(extra===person)continue;removeExtra(person,extra);merged++;}
      }
    }

    if(person&&legacy.length){
      // A legacy unlinked row with the exact unique member name belongs to this member.
      // Unioning true stay-days is loss-averse and prevents 0-day duplicates from
      // hiding the row that actually contains the member's attendance history.
      mergeBillingRowsForIdentity(bill,member,new Set([member.id]),key);
      merged+=legacy.length;
      person=bill.people.find(row=>row.memberId===member.id)||person;
      relinked+=legacy.length;
    }else if(!person&&legacy.length){
      mergeBillingRowsForIdentity(bill,member,new Set([member.id]),key);
      person=bill.people.find(row=>row.memberId===member.id)||null;
      relinked+=legacy.length;
      merged+=Math.max(0,legacy.length-1);
    }

    if(person){
      if(person.memberId!==member.id){person.memberId=member.id;relinked++;}
      if(person.name!==member.name)person.name=member.name;
      person.updatedAt=nowIso();
    }else{
      bill.people.push({id:uid(),memberId:member.id,name:member.name,days:{...all},paid:false,paidAmount:0,updatedAt:nowIso()});added++;
    }
  }

  bill.updatedAt=nowIso();
  if(ui.activeBillPersonId&&!bill.people.some(person=>person.id===ui.activeBillPersonId))ui.activeBillPersonId=bill.people[0]?.id||null;
  else ui.activeBillPersonId=ui.activeBillPersonId||bill.people[0]?.id||null;

  const parts=[];
  if(repair.removedMembers)parts.push(`đã gộp ${repair.removedMembers} ID thành viên trùng`);
  if(merged)parts.push(`đã gộp ${merged} dòng điện nước trùng`);
  if(relinked)parts.push(`đã liên kết lại ${relinked} dòng`);
  if(added)parts.push(`đã thêm ${added} thành viên thiếu`);
  if(repair.conflicts.length)parts.push(`${repair.conflicts.length} nhóm mapping mơ hồ chưa tự gộp`);
  const message=parts.length?parts.join(" · "):"Danh sách đã đúng và không có bản ghi trùng";
  const ok=await persist(message,{
    action:"SYNC_BILL_MEMBERS",
    summary:`Đồng bộ ${monthLabel(bill.month)} · member merge ${repair.removedMembers||0} · row merge ${merged} · relink ${relinked} · add ${added} · conflict ${repair.conflicts.length}`
  });
  if(ok&&repair.affectedWeeks.length){
    for(const weekStart of repair.affectedWeeks){
      const schedule=state.schedules.find(item=>item.weekStart===weekStart);
      if(schedule)await realtimeEngine?.reconcileTaskSubmissions({weekStart,assignments:schedule.assignments}).catch(()=>{});
    }
  }
  if(repair.conflicts.length)toast(`${message}. Kiểm tra Tài khoản vì có mapping cùng tên tới nhiều ID.`,7000);
};

async function approveAccess(targetUid){
  if(!requireOnlineAction())return;
  const memberId=$(`[data-approve-member="${CSS.escape(targetUid)}"]`)?.value||"";
  const role=$(`[data-approve-role="${CSS.escape(targetUid)}"]`)?.value||"member";
  const req=accessRequests.find(x=>x.uid===targetUid);
  if(!req)return toast("Yêu cầu này không còn tồn tại");
  if(memberId){
    const conflict=activeAccountUsingMember(memberId,targetUid);
    if(conflict)return toast(`Thành viên này đang liên kết với ${conflict.displayName||conflict.email||"một tài khoản khác"}. Hãy gỡ liên kết cũ trước.`,6000);
  }else if(role!=="admin"&&!confirm("Tài khoản thành viên chưa được liên kết với người trong phòng nên sẽ không thể tự sửa trạng thái/ngày ở. Vẫn duyệt?"))return;
  try{
    await realtimeEngine?.approveRequest({uid:targetUid,memberId,role,displayName:req.displayName||""});
    toast("Đã duyệt tài khoản");
  }catch(e){toast(e?.message||"Không thể duyệt");}
}

async function saveAccess(targetUid){
  if(!requireOnlineAction())return;
  const memberId=$(`[data-access-member="${CSS.escape(targetUid)}"]`)?.value||"";
  let role=$(`[data-access-role="${CSS.escape(targetUid)}"]`)?.value||"member";
  if(targetUid===authSession.user?.uid&&isAdmin())role="admin";
  const item=accessAccounts.find(x=>x.uid===targetUid);
  if(!item)return toast("Không tìm thấy tài khoản");
  if(memberId){
    const conflict=activeAccountUsingMember(memberId,targetUid);
    if(conflict)return toast(`Thành viên này đang liên kết với ${conflict.displayName||conflict.email||"một tài khoản khác"}. Mỗi thành viên chỉ nên có một tài khoản hoạt động.`,6000);
    const selected=state.members.find(member=>member.id===memberId);
    const sameNameIds=new Set((state.members||[]).filter(member=>memberNameKey(member.name)===memberNameKey(selected?.name)).map(member=>member.id));
    const sameNameMapped=(accessAccounts||[]).filter(account=>account.uid!==targetUid&&sameNameIds.has(account.memberId));
    if(sameNameMapped.length)return toast(`Tên ${selected?.name||"này"} đang có ID trùng được liên kết với tài khoản khác. Hãy bấm Cập nhật danh sách ở Điện nước trước.`,7000);
  }else if(role!=="admin"&&!confirm("Bỏ liên kết thành viên? Tài khoản này sẽ chỉ xem và không thể sửa dữ liệu cá nhân. Vẫn lưu?"))return;
  try{
    await realtimeEngine?.updateAccess({uid:targetUid,memberId,role,displayName:item.displayName||"",active:true});
    toast("Đã cập nhật quyền");
  }catch(e){toast(e?.message||"Không thể cập nhật");}
}

function reportDataIntegrity(){
  if(!isAdmin())return [];
  const issues=[];
  const active=(accessAccounts||[]).filter(x=>x.active!==false);
  const byMember=new Map();
  active.filter(x=>x.memberId).forEach(x=>{const arr=byMember.get(x.memberId)||[];arr.push(x);byMember.set(x.memberId,arr);});
  for(const [memberId,accounts] of byMember){
    if(accounts.length>1){const member=state.members.find(x=>x.id===memberId);issues.push(`Trùng liên kết tài khoản: ${member?.name||memberId} (${accounts.length})`);}
  }

  const duplicateGroups=duplicateMemberGroups();
  for(const [,members] of duplicateGroups){
    const ids=new Set(members.map(member=>member.id));
    const mappedIds=new Set((accessAccounts||[]).filter(account=>ids.has(account.memberId)).map(account=>account.memberId));
    issues.push(mappedIds.size>1
      ?`Mapping mơ hồ: ${members[0].name} có ${members.length} ID và ${mappedIds.size} ID đang gắn tài khoản`
      :`Trùng thành viên: ${members[0].name} có ${members.length} ID`);
  }

  for(const account of active){
    if(account.memberId&&!state.members.some(member=>member.id===account.memberId))issues.push(`Tài khoản ${account.displayName||account.email||account.uid} đang liên kết tới thành viên đã bị xóa`);
    if(account.role!=="admin"&&!account.memberId)issues.push(`Tài khoản ${account.displayName||account.email||account.uid} chưa liên kết thành viên`);
  }

  const monthCounts=new Map();
  for(const bill of state.billing?.months||[]){
    monthCounts.set(bill.month,(monthCounts.get(bill.month)||0)+1);
    const seenMemberIds=new Map(),seenNames=new Map();
    for(const person of bill.people||[]){
      if(person.memberId)seenMemberIds.set(person.memberId,(seenMemberIds.get(person.memberId)||0)+1);
      const key=memberNameKey(person.name);if(key)seenNames.set(key,(seenNames.get(key)||0)+1);
      if(!bill.closed&&person.memberId&&!state.members.some(member=>member.id===person.memberId))issues.push(`${monthLabel(bill.month)}: ${person.name} đang trỏ tới memberId không còn tồn tại`);
    }
    for(const [memberId,count] of seenMemberIds){
      if(count>1){const member=state.members.find(x=>x.id===memberId);issues.push(`${monthLabel(bill.month)} có ${count} dòng cùng memberId của ${member?.name||memberId}`);}
    }
    for(const [key,count] of seenNames){
      if(count>1){
        const name=(bill.people||[]).find(person=>memberNameKey(person.name)===key)?.name||key;
        issues.push(`${monthLabel(bill.month)} có ${count} dòng cùng tên ${name}`);
      }
    }
  }
  for(const [month,count] of monthCounts)if(count>1)issues.push(`${monthLabel(month)} có ${count} bảng hóa đơn trùng tháng`);

  const weekCounts=new Map();
  for(const schedule of state.schedules||[])weekCounts.set(schedule.weekStart,(weekCounts.get(schedule.weekStart)||0)+1);
  for(const [week,count] of weekCounts)if(count>1)issues.push(`Tuần ${week} có ${count} lịch trực trùng`);

  if(typeof relevantTaskSubmissions==="function"){
    const validIds=new Set(relevantTaskSubmissions().map(x=>x.id));
    const stale=(taskSubmissions||[]).filter(x=>!validIds.has(x.id));
    if(stale.length)issues.push(`Có ${stale.length} báo công việc cũ không còn khớp phân công`);
  }
  return [...new Set(issues)];
}
