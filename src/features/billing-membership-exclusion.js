(()=>{
  const nameKey=value=>String(value||"").trim().replace(/\s+/g," ").toLocaleLowerCase("vi-VN");

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

  removeBillingPerson=function(){
    if(!requireAdmin())return;
    const bill=currentBill(),person=activeBillPerson(bill);
    if(!bill||!person)return;
    if(bill.closed)return toast("Tháng đã chốt sổ");
    if(!confirm(`Xóa ${person.name} khỏi bảng tháng này?`))return;

    const exclusion=markExcluded(bill,person);
    const key=exclusion.key||nameKey(person.name);
    const before=bill.people.length;
    bill.people=bill.people.filter(row=>{
      if(row.id===person.id)return false;
      if(exclusion.memberId&&row.memberId===exclusion.memberId)return false;
      if(!row.memberId&&key&&nameKey(row.name)===key)return false;
      return true;
    });
    const removed=Math.max(1,before-bill.people.length);
    bill.updatedAt=nowIso();
    ui.activeBillPersonId=bill.people[0]?.id||null;
    persist("Đã xóa khỏi bảng tháng",{
      action:"REMOVE_BILL_PERSON",
      summary:`Xóa ${person.name} khỏi ${monthLabel(bill.month)} · giữ trạng thái loại khỏi tháng khi cập nhật danh sách${removed>1?` · xóa ${removed} bản trùng`:""}`,
      targetMemberId:exclusion.memberId||person.memberId||null
    });
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
