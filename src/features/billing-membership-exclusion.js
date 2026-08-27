(()=>{
  let authoritativeService=null;
  const nameKey=value=>String(value||"").trim().replace(/\s+/g," ").toLocaleLowerCase("vi-VN");

  const getAuthoritativeService=()=>{
    if(authoritativeService)return authoritativeService;
    if(typeof globalThis.createP708AuthoritativeRepair!=="function")throw new Error("Module đồng bộ an toàn chưa sẵn sàng.");
    authoritativeService=globalThis.createP708AuthoritativeRepair({
      firebaseConfig:FIREBASE_CONFIG,
      roomCode:ROOM_CODE,
      deviceId:DEVICE_ID
    });
    return authoritativeService;
  };

  function ensureBillingExclusions(bill){
    if(!bill||typeof bill!=="object")return bill;
    const ids=Array.isArray(bill.excludedMemberIds)?bill.excludedMemberIds:[];
    const keys=Array.isArray(bill.excludedMemberKeys)?bill.excludedMemberKeys:[];
    bill.excludedMemberIds=[...new Set(ids.map(value=>String(value||"").trim()).filter(Boolean))];
    bill.excludedMemberKeys=[...new Set(keys.map(nameKey).filter(Boolean))];
    return bill;
  }

  function exclusionSets(bill){
    ensureBillingExclusions(bill);
    return {
      ids:new Set(bill.excludedMemberIds),
      keys:new Set(bill.excludedMemberKeys)
    };
  }

  function uniqueMemberForName(name){
    const key=nameKey(name);
    const matches=(state.members||[]).filter(member=>nameKey(member?.name)===key);
    return matches.length===1?matches[0]:null;
  }

  function markExcluded(bill,person){
    ensureBillingExclusions(bill);
    const member=person?.memberId
      ?(state.members||[]).find(item=>item.id===person.memberId)||null
      :uniqueMemberForName(person?.name);
    const memberId=person?.memberId||member?.id||null;
    if(memberId&&!bill.excludedMemberIds.includes(memberId))bill.excludedMemberIds.push(memberId);
    const key=nameKey(member?.name||person?.name);
    if(key&&!bill.excludedMemberKeys.includes(key))bill.excludedMemberKeys.push(key);
    return {memberId,key};
  }

  function clearExcluded(bill,member,name){
    ensureBillingExclusions(bill);
    const id=member?.id||null,key=nameKey(member?.name||name);
    if(id)bill.excludedMemberIds=bill.excludedMemberIds.filter(value=>value!==id);
    if(key)bill.excludedMemberKeys=bill.excludedMemberKeys.filter(value=>value!==key);
  }

  function isExcludedMember(bill,member){
    const {ids,keys}=exclusionSets(bill);
    return ids.has(member?.id)||keys.has(nameKey(member?.name));
  }

  function unionDays(target,source,bill){
    target.days=target.days&&typeof target.days==="object"?target.days:{};
    const sourceDays=source?.days&&typeof source.days==="object"?source.days:{};
    for(let day=1;day<=monthDays(bill.month);day++){
      const key=String(day);
      target.days[key]=target.days[key]===true||sourceDays[key]===true;
    }
  }

  function mergePayment(target,source){
    target.paid=!!target.paid||!!source?.paid;
    target.paidAmount=Math.max(Number(target.paidAmount)||0,Number(source?.paidAmount)||0);
    target.paidAt=target.paidAt||source?.paidAt||null;
    target.paidBy=target.paidBy||source?.paidBy||null;
  }

  function mergeRows(bill,target,source){
    if(!target||!source||target===source)return;
    unionDays(target,source,bill);
    mergePayment(target,source);
    bill.people=bill.people.filter(person=>person.id!==source.id);
  }

  syncBillingMembers=function(){
    if(!requireAdmin())return;
    const bill=ensureBill();
    if(bill.closed)return toast("Tháng đã chốt sổ");
    ensureBillingExclusions(bill);

    const {ids:excludedIds,keys:excludedKeys}=exclusionSets(bill);
    const memberNameCounts=new Map();
    for(const member of state.members||[]){
      const key=nameKey(member.name);
      memberNameCounts.set(key,(memberNameCounts.get(key)||0)+1);
    }

    let removedExcluded=0,merged=0,relinked=0,added=0,ambiguous=0;

    bill.people=(bill.people||[]).filter(person=>{
      const key=nameKey(person?.name);
      const shouldRemove=(person?.memberId&&excludedIds.has(person.memberId))||(!person?.memberId&&excludedKeys.has(key));
      if(shouldRemove)removedExcluded++;
      return !shouldRemove;
    });

    const allDays=Object.fromEntries(Array.from({length:monthDays(bill.month)},(_,index)=>[String(index+1),true]));
    const stamp=person=>timeMs(person?.updatedAt)||timeMs(person?.createdAt)||0;

    for(const member of state.members||[]){
      if(isExcludedMember(bill,member))continue;
      const key=nameKey(member.name);
      if(memberNameCounts.get(key)!==1){ambiguous++;continue;}

      const candidates=(bill.people||[])
        .filter(person=>person?.memberId===member.id||(!person?.memberId&&nameKey(person?.name)===key))
        .sort((a,b)=>{
          const exactDiff=Number(b.memberId===member.id)-Number(a.memberId===member.id);
          if(exactDiff)return exactDiff;
          const updatedDiff=stamp(b)-stamp(a);
          if(updatedDiff)return updatedDiff;
          return String(a.id).localeCompare(String(b.id));
        });

      let person=candidates[0]||null;
      if(person){
        for(const extra of candidates.slice(1)){
          mergeRows(bill,person,extra);
          merged++;
        }
        if(person.memberId!==member.id){person.memberId=member.id;relinked++;}
        person.name=member.name;
        person.updatedAt=nowIso();
      }else{
        bill.people.push({
          id:uid(),
          memberId:member.id,
          name:member.name,
          days:{...allDays},
          paid:false,
          paidAmount:0,
          paidAt:null,
          paidBy:null,
          updatedAt:nowIso()
        });
        added++;
      }
    }

    const seenLogicalRows=new Map();
    for(const person of [...bill.people]){
      const logicalKey=person.memberId?`member:${person.memberId}`:`guest:${nameKey(person.name)}`;
      if(!logicalKey||logicalKey==="guest:")continue;
      const existing=seenLogicalRows.get(logicalKey);
      if(!existing){seenLogicalRows.set(logicalKey,person);continue;}
      mergeRows(bill,existing,person);
      merged++;
    }

    bill.updatedAt=nowIso();
    if(ui.activeBillPersonId&&!bill.people.some(person=>person.id===ui.activeBillPersonId))ui.activeBillPersonId=bill.people[0]?.id||null;
    else ui.activeBillPersonId=ui.activeBillPersonId||bill.people[0]?.id||null;

    const parts=[];
    if(removedExcluded)parts.push(`giữ ${removedExcluded} người đã xóa ngoài tháng`);
    if(merged)parts.push(`đã gộp ${merged} bản ghi trùng`);
    if(relinked)parts.push(`đã liên kết lại ${relinked} người`);
    if(added)parts.push(`đã thêm ${added} thành viên`);
    if(ambiguous)parts.push(`${ambiguous} tên trùng cần kiểm tra thủ công`);
    persist(parts.length?parts.join(" · "):"Danh sách đã đầy đủ",{
      action:"SYNC_BILL_MEMBERS",
      summary:`Đồng bộ thành viên vào ${monthLabel(bill.month)}${removedExcluded?` · giữ ${removedExcluded} người đã xóa`:""}${merged?` · gộp ${merged} trùng`:""}${relinked?` · liên kết ${relinked}`:""}${added?` · thêm ${added}`:""}${ambiguous?` · ${ambiguous} mơ hồ`:""}`
    });
  };

  removeBillingPerson=async function(){
    if(!requireAdmin())return;
    const localBill=currentBill(),localPerson=activeBillPerson(localBill);
    if(!localBill||!localPerson)return;
    if(localBill.closed)return toast("Tháng đã chốt sổ");
    if(!confirm(`Xóa ${localPerson.name} khỏi bảng tháng này?`))return;
    if(!navigator.onLine)return toast("Đang ngoại tuyến · kết nối mạng trước khi xóa khỏi tháng",5000);

    const month=localBill.month;
    const target={id:localPerson.id,memberId:localPerson.memberId||null,name:localPerson.name};
    try{
      const service=getAuthoritativeService();
      const snapshot=await service.readServer();
      state=fromSyncShape(snapshot.payload);
      confirmedState=clone(state);
      state.billing.selectedMonth=month;
      ui.selectedMonth=month;

      const bill=state.billing.months.find(item=>item.month===month);
      if(!bill)throw new Error("Không tìm thấy bảng điện nước tháng này trên máy chủ.");
      if(bill.closed)throw new Error("Tháng đã chốt sổ.");

      const exactById=(bill.people||[]).find(person=>person.id===target.id)||null;
      const exactByMember=target.memberId?(bill.people||[]).find(person=>person.memberId===target.memberId)||null:null;
      const sameName=(bill.people||[]).filter(person=>nameKey(person.name)===nameKey(target.name));
      const serverPerson=exactById||exactByMember||(sameName.length===1?sameName[0]:null)||target;
      const exclusion=markExcluded(bill,serverPerson);
      const key=exclusion.key||nameKey(target.name);
      const before=bill.people.length;
      bill.people=bill.people.filter(row=>{
        if(row.id===serverPerson.id||row.id===target.id)return false;
        if(exclusion.memberId&&row.memberId===exclusion.memberId)return false;
        if(!row.memberId&&key&&nameKey(row.name)===key)return false;
        return true;
      });
      const removed=Math.max(0,before-bill.people.length);
      bill.updatedAt=nowIso();
      state.updatedAt=nowIso();
      ui.activeBillPersonId=bill.people[0]?.id||null;

      const desired=toSyncShape(state);
      const audit={
        action:"REMOVE_BILL_PERSON",
        summary:`Xóa ${target.name} khỏi ${monthLabel(month)} · giữ trạng thái loại khỏi tháng khi cập nhật danh sách${removed>1?` · xóa ${removed} bản trùng`:""}`,
        targetMemberId:exclusion.memberId||target.memberId||null
      };
      await service.commit(desired,{expectedRevision:snapshot.revision,audit});
      const verified=await service.verify(desired);
      if(!verified.same)throw new Error("Máy chủ chưa xác nhận việc xóa khỏi tháng. Hệ thống đã dừng để tránh ghi đè dữ liệu khác.");

      if(Array.isArray(verified.accesses))accessAccounts=verified.accesses;
      state=fromSyncShape(verified.payload);
      confirmedState=clone(state);
      state.billing.selectedMonth=month;
      ui.selectedMonth=month;
      if(ui.activeBillPersonId&&!currentBill()?.people?.some(person=>person.id===ui.activeBillPersonId))ui.activeBillPersonId=currentBill()?.people?.[0]?.id||null;
      saveLocal();
      renderAll();
      toast("Đã xóa khỏi bảng tháng");
      return true;
    }catch(error){
      console.error("P708 remove billing person",error);
      toast(error?.message||"Không thể xóa khỏi bảng tháng",7000);
      try{
        const latest=await getAuthoritativeService().readServer();
        if(Array.isArray(latest.accesses))accessAccounts=latest.accesses;
        state=fromSyncShape(latest.payload);
        confirmedState=clone(state);
        state.billing.selectedMonth=month;
        ui.selectedMonth=month;
        saveLocal();
        renderAll();
      }catch(syncError){
        console.warn("P708 remove billing recovery",syncError);
        restoreConfirmedState();
      }
      return false;
    }
  };

  addBillingPerson=function(){
    if(!requireAdmin())return;
    const input=$("#billNewPersonName"),name=input?.value?.trim().replace(/\s+/g," ")||"",bill=ensureBill();
    if(!name)return toast("Nhập tên người");
    if(name.length>80)return toast("Tên quá dài");
    if(bill.closed)return toast("Tháng đã chốt sổ");
    if((bill.people||[]).some(person=>nameKey(person.name)===nameKey(name)))return toast("Tên này đã có");

    const member=uniqueMemberForName(name);
    if(member)clearExcluded(bill,member,name);
    const person={
      id:uid(),
      memberId:member?.id||null,
      name:member?.name||name,
      days:{},
      paid:false,
      paidAmount:0,
      paidAt:null,
      paidBy:null,
      updatedAt:nowIso()
    };
    bill.people.push(person);
    bill.updatedAt=nowIso();
    ui.activeBillPersonId=person.id;
    if(input)input.value="";
    closeModal("memberModal");
    persist(member?"Đã thêm lại thành viên vào tháng":"Đã thêm người/khách",{
      action:"ADD_BILL_PERSON",
      summary:`Thêm ${person.name} vào ${monthLabel(bill.month)}${member?" · khôi phục thành viên đã loại khỏi tháng":""}`,
      targetMemberId:member?.id||null
    });
  };
})();
