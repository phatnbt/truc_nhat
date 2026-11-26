(()=>{
  const Period=globalThis.P708BillingCycle;
  if(!Period)throw new Error("Billing cycle utilities are not available");

  const nameKey=value=>String(value||"").normalize("NFKC").trim().replace(/\s+/g," ").toLocaleLowerCase("vi-VN");
  // "28-27" is the legacy persisted tag. Keep accepting it for older installed
  // clients; cycleRule carries the actual 29→28 rule on new/updated records.
  const isCycleBill=bill=>["28-27","29-28"].includes(bill?.cycleMode);
  const baseNormalizeState=normalizeState;
  const baseEnsureBill=ensureBill;
  const baseStayCount=stayCount;

  function displayDate(value){
    const match=/^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value||""));
    if(!match)return String(value||"");
    return `${match[3]}/${match[2]}/${match[1]}`;
  }
  function resolvedCycleBounds(bill){
    if(!bill||!validMonthKey(bill.month))return null;
    return Period.resolveCycleBounds(bill.month,bill.cycleStart,bill.cycleEnd);
  }
  function calendarDateKeys(bill){
    if(!bill||!validMonthKey(bill.month))return [];
    if(isCycleBill(bill)){
      const bounds=resolvedCycleBounds(bill);
      return Period.periodDateKeys(bill.month,bounds);
    }
    const [year,month]=bill.month.split("-").map(Number),count=monthDays(bill.month),result=[];
    for(let day=1;day<=count;day++)result.push(`${year}-${String(month).padStart(2,"0")}-${String(day).padStart(2,"0")}`);
    return result;
  }
  function storageKeyForDate(bill,dateKey){
    if(isCycleBill(bill))return dateKey;
    return String(Number(String(dateKey||"").slice(-2))||0);
  }
  function cleanCycleDays(rawDays,bill){
    const allowed=calendarDateKeys(bill),allowedSet=new Set(allowed),output={};
    const raw=rawDays&&typeof rawDays==="object"&&!Array.isArray(rawDays)?rawDays:{};
    // Keep valid historical date keys even when the manager narrows a period.
    // They stay outside the calculation, but are recoverable if the range is expanded again.
    for(const [key,value] of Object.entries(raw))if(Period.parseDateKey(key))output[key]=value===true;
    for(const date of allowed)if(!(date in output))output[date]=false;
    for(const [legacyKey,value] of Object.entries(raw)){
      if(value!==true||/^\d{4}-\d{2}-\d{2}$/.test(legacyKey))continue;
      const day=Number(legacyKey);if(!Number.isInteger(day)||day<1||day>31)continue;
      const targetMonth=day>=28?Period.shiftMonth(bill.month,-1):bill.month;
      const candidate=`${targetMonth}-${String(day).padStart(2,"0")}`;
      if(allowedSet.has(candidate)&&!Object.prototype.hasOwnProperty.call(raw,candidate))output[candidate]=true;
    }
    return output;
  }
  function cycleCaptureKey(person){
    if(person?.id)return `id:${person.id}`;
    if(person?.memberId)return `member:${person.memberId}`;
    return `name:${nameKey(person?.name)}`;
  }

  normalizeState=function(input){
    const source=clone(input||{}),prepared=clone(input||{}),captures=new Map();
    for(const bill of source?.billing?.months||[]){
      if(!isCycleBill(bill))continue;
      const monthMap=new Map();
      for(const person of bill.people||[])monthMap.set(cycleCaptureKey(person),clone(person.days||{}));
      captures.set(bill.month,monthMap);
    }
    for(const bill of prepared?.billing?.months||[]){
      if(!isCycleBill(bill))continue;
      for(const person of bill.people||[])person.days={};
    }
    const normalized=baseNormalizeState(prepared);
    for(const bill of normalized.billing?.months||[]){
      if(!isCycleBill(bill))continue;
      const bounds=resolvedCycleBounds(bill);
      bill.cycleStart=bounds?.start||"";
      bill.cycleEnd=bounds?.end||"";
      const defaults=Period.cycleBounds(bill.month);
      bill.cycleCustomized=!!defaults&&(bill.cycleStart!==defaults.start||bill.cycleEnd!==defaults.end);
      bill.dayMode="date";
      const monthMap=captures.get(bill.month)||new Map();
      for(const person of bill.people||[]){
        const raw=monthMap.get(cycleCaptureKey(person))||{};
        person.days=cleanCycleDays(raw,bill);
      }
    }
    return normalized;
  };

  state=normalizeState(state);
  confirmedState=normalizeState(confirmedState);

  ensureBill=function(){
    let bill=currentBill();
    if(bill)return bill;
    if(!Period.isCycleMonth(state.billing.selectedMonth))return baseEnsureBill();
    const bounds=Period.cycleBounds(state.billing.selectedMonth);
    bill={
      id:uid(),month:state.billing.selectedMonth,electricity:0,water:0,closed:false,people:[],
      cycleMode:"28-27",dayMode:"date",cycleRule:"29-28",cycleStart:bounds.start,cycleEnd:bounds.end,updatedAt:nowIso()
    };
    state.billing.months.push(bill);
    return bill;
  };

  stayCount=function(person,bill=currentBill()){
    if(!person||!bill)return 0;
    if(!isCycleBill(bill))return baseStayCount(person,bill);
    return calendarDateKeys(bill).reduce((sum,date)=>sum+(person.days?.[date]===true?1:0),0);
  };

  function ensureCycleMetadata(bill){
    if(!bill||!Period.isCycleMonth(bill.month))return bill;
    if(!isCycleBill(bill))return bill;
    const bounds=resolvedCycleBounds(bill);
    bill.cycleStart=bounds.start;bill.cycleEnd=bounds.end;bill.dayMode="date";
    bill.cycleRule="29-28";
    const defaults=Period.cycleBounds(bill.month);
    bill.cycleCustomized=bill.cycleStart!==defaults.start||bill.cycleEnd!==defaults.end;
    return bill;
  }
  function allPeriodDays(bill,value=true){
    return Object.fromEntries(calendarDateKeys(bill).map(date=>[storageKeyForDate(bill,date),!!value]));
  }
  function mergePersonRows(bill,target,source){
    target.days=target.days&&typeof target.days==="object"?target.days:{};
    const sourceDays=source?.days&&typeof source.days==="object"?source.days:{};
    if(isCycleBill(bill))for(const [key,value] of Object.entries(sourceDays))if(Period.parseDateKey(key)&&value===true)target.days[key]=true;
    for(const date of calendarDateKeys(bill)){
      const key=storageKeyForDate(bill,date);
      target.days[key]=target.days[key]===true||sourceDays[key]===true;
    }
    target.paid=!!target.paid||!!source?.paid;
    target.paidAmount=Math.max(Number(target.paidAmount)||0,Number(source?.paidAmount)||0);
    target.paidAt=target.paidAt||source?.paidAt||null;
    target.paidBy=target.paidBy||source?.paidBy||null;
    bill.people=bill.people.filter(person=>person.id!==source.id);
  }
  function billingExclusionSets(bill){
    bill.excludedMemberIds=Array.isArray(bill.excludedMemberIds)?[...new Set(bill.excludedMemberIds.map(x=>String(x||"").trim()).filter(Boolean))]:[];
    bill.excludedMemberKeys=Array.isArray(bill.excludedMemberKeys)?[...new Set(bill.excludedMemberKeys.map(nameKey).filter(Boolean))]:[];
    return {ids:new Set(bill.excludedMemberIds),keys:new Set(bill.excludedMemberKeys)};
  }
  function uniqueMemberByName(name){
    const key=nameKey(name),matches=(state.members||[]).filter(member=>nameKey(member?.name)===key);
    return matches.length===1?matches[0]:null;
  }

  syncBillingMembers=async function(){
    if(!requireAdmin())return false;
    const bill=ensureCycleMetadata(ensureBill());
    if(bill.closed)return toast("Kỳ đã chốt sổ");
    const exclusions=billingExclusionSets(bill),memberNameCounts=new Map();
    for(const member of state.members||[]){const key=nameKey(member.name);memberNameCounts.set(key,(memberNameCounts.get(key)||0)+1);}
    let removedExcluded=0,merged=0,relinked=0,added=0,ambiguous=0;

    bill.people=(bill.people||[]).filter(person=>{
      const key=nameKey(person?.name),remove=(person?.memberId&&exclusions.ids.has(person.memberId))||(!person?.memberId&&exclusions.keys.has(key));
      if(remove)removedExcluded++;
      return !remove;
    });

    const defaultDays=allPeriodDays(bill,true),stamp=person=>timeMs(person?.updatedAt)||timeMs(person?.createdAt)||0;
    for(const member of state.members||[]){
      const key=nameKey(member.name);
      if(exclusions.ids.has(member.id)||exclusions.keys.has(key))continue;
      if(memberNameCounts.get(key)!==1){ambiguous++;continue;}
      const candidates=(bill.people||[])
        .filter(person=>person?.memberId===member.id||(!person?.memberId&&nameKey(person?.name)===key))
        .sort((a,b)=>Number(b.memberId===member.id)-Number(a.memberId===member.id)||stamp(b)-stamp(a)||String(a.id).localeCompare(String(b.id)));
      let person=candidates[0]||null;
      if(person){
        for(const extra of candidates.slice(1)){mergePersonRows(bill,person,extra);merged++;}
        if(person.memberId!==member.id){person.memberId=member.id;relinked++;}
        person.name=member.name;person.updatedAt=nowIso();
      }else{
        bill.people.push({id:uid(),memberId:member.id,name:member.name,days:{...defaultDays},paid:false,paidAmount:0,paidAt:null,paidBy:null,updatedAt:nowIso()});
        added++;
      }
    }

    const logicalRows=new Map();
    for(const person of [...bill.people]){
      const logical=person.memberId?`member:${person.memberId}`:`guest:${nameKey(person.name)}`;
      const existing=logicalRows.get(logical);
      if(!existing){logicalRows.set(logical,person);continue;}
      mergePersonRows(bill,existing,person);merged++;
    }

    bill.updatedAt=nowIso();
    if(ui.activeBillPersonId&&!bill.people.some(person=>person.id===ui.activeBillPersonId))ui.activeBillPersonId=bill.people[0]?.id||null;
    else ui.activeBillPersonId=ui.activeBillPersonId||bill.people[0]?.id||null;
    const parts=[];
    if(removedExcluded)parts.push(`giữ ${removedExcluded} người đã xóa ngoài kỳ`);
    if(merged)parts.push(`đã gộp ${merged} bản ghi trùng`);
    if(relinked)parts.push(`đã liên kết lại ${relinked} người`);
    if(added)parts.push(`đã thêm ${added} thành viên`);
    if(ambiguous)parts.push(`${ambiguous} tên trùng cần kiểm tra thủ công`);
    return persist(parts.length?parts.join(" · "):"Danh sách đã đầy đủ",{
      action:"SYNC_BILL_MEMBERS",
      summary:`Đồng bộ thành viên vào ${billingPeriodTitle(bill.month)}${merged?` · gộp ${merged} trùng`:""}${relinked?` · liên kết ${relinked}`:""}${added?` · thêm ${added}`:""}${ambiguous?` · ${ambiguous} mơ hồ`:""}`
    });
  };

  addBillingPerson=function(){
    if(!requireAdmin())return;
    const input=$("#billNewPersonName"),name=input?.value?.trim().replace(/\s+/g," ")||"",bill=ensureCycleMetadata(ensureBill());
    if(!name)return toast("Nhập tên người");
    if(name.length>80)return toast("Tên quá dài");
    if(bill.closed)return toast("Kỳ đã chốt sổ");
    if((bill.people||[]).some(person=>nameKey(person.name)===nameKey(name)))return toast("Tên này đã có");
    const member=uniqueMemberByName(name);
    billingExclusionSets(bill);
    if(member)bill.excludedMemberIds=bill.excludedMemberIds.filter(value=>value!==member.id);
    const clearKey=nameKey(member?.name||name);if(clearKey)bill.excludedMemberKeys=bill.excludedMemberKeys.filter(value=>value!==clearKey);
    const person={id:uid(),memberId:member?.id||null,name:member?.name||name,days:{},paid:false,paidAmount:0,paidAt:null,paidBy:null,updatedAt:nowIso()};
    bill.people.push(person);bill.updatedAt=nowIso();ui.activeBillPersonId=person.id;
    if(input)input.value="";closeModal("memberModal");
    persist(member?"Đã thêm lại thành viên vào kỳ":"Đã thêm người/khách",{
      action:"ADD_BILL_PERSON",summary:`Thêm ${person.name} vào ${billingPeriodTitle(bill.month)}`,targetMemberId:member?.id||null
    });
  };

  function billingPeriodTitle(month){
    if(Period.isCycleMonth(month))return `Kỳ ${Number(String(month).slice(5,7))}/${String(month).slice(0,4)}`;
    return monthLabel(month);
  }
  function periodBillForDisplay(){
    const existing=currentBill();if(existing)return existing;
    const month=state.billing.selectedMonth;
    if(Period.isCycleMonth(month)){
      const bounds=Period.cycleBounds(month);
      return {month,electricity:0,water:0,closed:false,people:[],cycleMode:"28-27",dayMode:"date",cycleRule:"29-28",cycleStart:bounds.start,cycleEnd:bounds.end};
    }
    return {month,electricity:0,water:0,closed:false,people:[]};
  }
  function preservePersonTarget(){
    const bill=currentBill(),person=activeBillPerson(bill);
    return {memberId:person?.memberId||(!isAdmin()?myMemberId():null),name:person?.name||""};
  }
  function selectPersonForPeriod(target){
    const bill=currentBill();if(!bill){ui.activeBillPersonId=null;return;}
    const match=(target.memberId&&bill.people.find(person=>person.memberId===target.memberId))||
      (target.name&&bill.people.find(person=>nameKey(person.name)===nameKey(target.name)))||
      (!isAdmin()&&myMemberId()?bill.people.find(person=>person.memberId===myMemberId()):null)||bill.people[0]||null;
    ui.activeBillPersonId=match?.id||null;
  }
  function goToBillingPeriod(month){
    if(!validMonthKey(month))return;
    const target=preservePersonTarget();
    state.billing.selectedMonth=month;ui.selectedMonth=month;
    selectPersonForPeriod(target);saveLocal();renderBilling();
  }
  function shiftBillingPeriod(offset){goToBillingPeriod(Period.shiftMonth(state.billing.selectedMonth,offset));}

  setBillMonth=function(value){
    if(!validMonthKey(value))return toast("Kỳ không hợp lệ");
    goToBillingPeriod(value);
  };

  function actualDateForInput(bill,value){
    if(/^\d{4}-\d{2}-\d{2}$/.test(String(value||"")))return String(value);
    const day=Number(value);if(!Number.isInteger(day)||day<1||day>31)return "";
    if(isCycleBill(bill)){
      const month=day>=28?Period.shiftMonth(bill.month,-1):bill.month;
      return `${month}-${String(day).padStart(2,"0")}`;
    }
    return `${bill.month}-${String(day).padStart(2,"0")}`;
  }
  function isDateInBill(bill,date){return calendarDateKeys(bill).includes(date);}

  const pendingDays=new Set();
  async function saveDaySelection(dates,value,action,message){
    const bill=currentBill(),person=activeBillPerson(bill);
    if(!person)return toast("Chọn người trước.");
    if(!canEditBillingPerson(person))return toast("Bạn chỉ được chỉnh ngày ở của mình.");
    if(bill.closed)return toast("Kỳ đã chốt sổ.");
    if(!realtimeEngine?.saveBillingDays)return toast("Chưa kết nối Firebase. Hãy thử lại.");
    const actor=authSession.user?.uid,keys=dates.map(date=>storageKeyForDate(bill,date));
    const writes=keys.map(key=>JSON.stringify([actor,bill.month,person.id,key]));
    if(writes.some(key=>pendingDays.has(key)))return toast("Ngày đã chọn đang được lưu. Hãy thử lại sau khi đồng bộ.");
    writes.forEach(key=>pendingDays.add(key));
    toast("Đang lưu ngày ở…");
    try{
      await realtimeEngine.saveBillingDays({month:bill.month,billId:bill.id,personId:person.id,memberId:person.memberId||null,
        changes:Object.fromEntries(keys.map((key,index)=>[key,value(dates[index])])),
        audit:{action,summary:`${person.name}: ${message}`,targetMemberId:person.memberId||null}});
      if(authSession.user?.uid===actor)toast(message);
    }catch(error){
      if(authSession.user?.uid===actor)toast(error?.code==="permission-denied"?"Không thể lưu ngày ở. Kiểm tra quyền và kỳ rồi thử lại.":error?.message||"Không thể lưu ngày ở. Hãy thử lại.",5000);
    }
    finally{writes.forEach(key=>pendingDays.delete(key));}
  }

  setBillDay=function(value){
    const bill=currentBill(),person=activeBillPerson(bill);if(!person)return toast("Chọn người trước.");
    const date=actualDateForInput(bill,value);if(!date||!isDateInBill(bill,date))return toast("Ngày nằm ngoài kỳ điện nước.");
    const present=person.days?.[storageKeyForDate(bill,date)]!==true;
    const label=isCycleBill(bill)?displayDate(date):`ngày ${Number(date.slice(-2))}`;
    return saveDaySelection([date],()=>present,"UPDATE_BILL_DAY",`${label}: ${present?"Có ở":"Vắng"}`);
  };

  applyStayRange=function(value){
    const bill=currentBill(),person=activeBillPerson(bill);if(!person)return toast("Chọn người trước.");
    let from=$("#stayFrom")?.value||"",to=$("#stayTo")?.value||"";
    if(!isDateInBill(bill,from)||!isDateInBill(bill,to))return toast("Chọn ngày nằm trong kỳ điện nước.");
    if(from>to)[from,to]=[to,from];
    if(!value&&!confirm(`Đánh dấu vắng từ ${displayDate(from)} đến ${displayDate(to)}?`))return;
    const dates=calendarDateKeys(bill).filter(date=>date>=from&&date<=to);
    return saveDaySelection(dates,()=>!!value,"UPDATE_BILL_RANGE",
      `Đã đánh dấu ${value?"ở":"vắng"} ${displayDate(from)} – ${displayDate(to)}`);
  };

  presetStay=function(mode){
    const bill=currentBill(),person=activeBillPerson(bill);if(!person)return toast("Chọn người trước.");
    if(!["all","weekdays","none"].includes(mode))return toast("Chế độ không hợp lệ.");
    if(mode==="none"&&!confirm("Bỏ toàn bộ ngày ở trong kỳ?"))return;
    return saveDaySelection(calendarDateKeys(bill),date=>{
      const weekday=Period.parseDateKey(date).getUTCDay();
      return mode==="all"||(mode==="weekdays"&&weekday!==0&&weekday!==6);
    },"PRESET_BILL_DAYS","Đã cập nhật nhanh ngày ở");
  };

  let billingPeriodSavePending=false;
  function periodRangeText(bill){
    const bounds=resolvedCycleBounds(bill);
    return bounds?Period.formatDateRange(bounds.start,bounds.end):"";
  }
  function billHasPaymentRecords(bill){
    return (bill?.people||[]).some(person=>person?.paid===true||(Number(person?.paidAmount)||0)>0||person?.paidAt);
  }
  function overlappingCycleBill(month,start,end){
    return (state.billing?.months||[]).find(other=>{
      if(other?.month===month||!isCycleBill(other))return false;
      const bounds=resolvedCycleBounds(other);
      return !!bounds&&Period.rangesOverlap(start,end,bounds.start,bounds.end);
    })||null;
  }
  function updateBillingPeriodEditorNotice(){
    const start=$("#billingPeriodStart")?.value||"",end=$("#billingPeriodEnd")?.value||"",notice=$("#billingPeriodEditorWarning");
    if(!notice)return;
    const dates=Period.dateRangeKeys(start,end);
    notice.textContent=dates.length
      ?`${dates.length} ngày · Tiền điện nước sẽ tự tính lại theo số ngày ở trong khoảng này.`
      :`Ngày bắt đầu phải trước ngày kết thúc và kỳ không được dài quá ${Period.MAX_CUSTOM_PERIOD_DAYS} ngày.`;
    notice.classList.toggle("period-editor-error",!dates.length);
  }
  function openBillingPeriodEditor(){
    if(!requireAdmin())return;
    const bill=periodBillForDisplay();
    if(!isCycleBill(bill))return toast("Chỉ chỉnh được kỳ điện nước từ 09/2026");
    if(bill.closed)return toast("Hãy mở khóa kỳ trước khi chỉnh ngày");
    if(billHasPaymentRecords(bill))return toast("Hãy hủy ghi nhận thanh toán trước khi chỉnh kỳ",5000);
    const bounds=resolvedCycleBounds(bill);
    $("#billingPeriodEditorTitle").textContent=`Chỉnh ${billingPeriodTitle(bill.month)}`;
    $("#billingPeriodEditorCurrent").textContent=`Đang áp dụng: ${Period.formatDateRange(bounds.start,bounds.end)}`;
    $("#billingPeriodStart").value=bounds.start;$("#billingPeriodEnd").value=bounds.end;
    updateBillingPeriodEditorNotice();openModal("billingPeriodModal");
  }
  function resetBillingPeriodEditor(){
    const defaults=Period.cycleBounds(state.billing.selectedMonth);if(!defaults)return;
    $("#billingPeriodStart").value=defaults.start;$("#billingPeriodEnd").value=defaults.end;updateBillingPeriodEditorNotice();
  }
  async function saveBillingPeriodEditor(){
    if(billingPeriodSavePending||!requireAdmin())return;
    const month=state.billing.selectedMonth,existing=currentBill(),start=$("#billingPeriodStart")?.value||"",end=$("#billingPeriodEnd")?.value||"";
    if(!Period.isCycleMonth(month))return toast("Kỳ này không hỗ trợ chỉnh ngày");
    const dates=Period.dateRangeKeys(start,end);
    if(!dates.length)return toast(`Kỳ phải hợp lệ và không dài quá ${Period.MAX_CUSTOM_PERIOD_DAYS} ngày`,5000);
    if(existing?.closed)return toast("Hãy mở khóa kỳ trước khi chỉnh ngày");
    if(billHasPaymentRecords(existing))return toast("Hãy hủy ghi nhận thanh toán trước khi chỉnh kỳ",5000);
    const overlap=overlappingCycleBill(month,start,end);
    if(overlap){
      const bounds=resolvedCycleBounds(overlap);
      return toast(`Khoảng này trùng ${billingPeriodTitle(overlap.month)} (${Period.formatDateRange(bounds.start,bounds.end)})`,6000);
    }
    const previous=resolvedCycleBounds(existing||periodBillForDisplay()),nextSet=new Set(dates);
    if(previous.start===start&&previous.end===end){closeModal("billingPeriodModal");return toast("Kỳ điện nước không thay đổi");}
    const hiddenMarkedDays=(existing?.people||[]).reduce((count,person)=>count+Object.entries(person.days||{}).filter(([key,value])=>value===true&&Period.parseDateKey(key)&&!nextSet.has(key)).length,0);
    const detail=hiddenMarkedDays?` ${hiddenMarkedDays} lượt ngày ở nằm ngoài kỳ mới sẽ được giữ lại an toàn nhưng không tham gia tính tiền.`:"";
    if(!confirm(`Đổi kỳ từ ${Period.formatDateRange(previous.start,previous.end)} thành ${Period.formatDateRange(start,end)}? Tiền chia sẽ được tính lại.${detail}`))return;
    const bill=ensureCycleMetadata(ensureBill()),defaults=Period.cycleBounds(month);
    bill.cycleStart=start;bill.cycleEnd=end;bill.cycleRule="29-28";bill.cycleCustomized=start!==defaults.start||end!==defaults.end;bill.updatedAt=nowIso();
    for(const person of bill.people||[]){
      person.days=person.days&&typeof person.days==="object"?person.days:{};
      for(const date of dates)if(!(date in person.days))person.days[date]=false;
      person.updatedAt=nowIso();
    }
    billingPeriodSavePending=true;const button=$("#saveBillingPeriodButton");if(button)button.disabled=true;
    const ok=await persist("Đã cập nhật kỳ điện nước",{
      action:"UPDATE_BILLING_PERIOD",summary:`${billingPeriodTitle(month)}: ${Period.formatDateRange(start,end)}`,
      periodMonth:month,expectedPeriodExists:!!existing,expectedPeriodStart:previous.start,expectedPeriodEnd:previous.end
    });
    billingPeriodSavePending=false;if(button)button.disabled=false;if(ok)closeModal("billingPeriodModal");
  }

  globalThis.openBillingPeriodEditor=openBillingPeriodEditor;
  globalThis.resetBillingPeriodEditor=resetBillingPeriodEditor;
  globalThis.saveBillingPeriodEditor=saveBillingPeriodEditor;

  function ensureBillingCycleUi(){
    const card=document.querySelector(".calendar-card"),head=card?.querySelector(":scope > .card-head");
    if(card&&head&&!$("#billingPeriodNav")){
      const nav=document.createElement("div");nav.id="billingPeriodNav";nav.className="billing-period-nav";
      nav.innerHTML=`<button class="period-arrow" id="billingPeriodPrev" type="button" aria-label="Kỳ trước">‹</button><div class="period-copy"><b id="billingPeriodLabel">Kỳ điện nước</b><small id="billingPeriodDates"></small></div><button class="btn small soft admin-only" id="billingPeriodEdit" type="button">Chỉnh kỳ</button><button class="btn small soft" id="billingPeriodCurrent" type="button">Kỳ hiện tại</button><button class="period-arrow" id="billingPeriodNext" type="button" aria-label="Kỳ sau">›</button>`;
      head.insertAdjacentElement("afterend",nav);
      $("#billingPeriodPrev")?.addEventListener("click",()=>shiftBillingPeriod(-1));
      $("#billingPeriodNext")?.addEventListener("click",()=>shiftBillingPeriod(1));
      $("#billingPeriodCurrent")?.addEventListener("click",()=>goToBillingPeriod(Period.currentPeriodMonth(new Date())));
      $("#billingPeriodEdit")?.addEventListener("click",openBillingPeriodEditor);
    }
    const wrap=document.querySelector(".calendar-wrap");
    if(wrap&&!wrap.dataset.billingSwipeBound){
      wrap.dataset.billingSwipeBound="1";let startX=0,startY=0;
      wrap.addEventListener("touchstart",event=>{const touch=event.changedTouches?.[0];if(!touch)return;startX=touch.clientX;startY=touch.clientY;},{passive:true});
      wrap.addEventListener("touchend",event=>{const touch=event.changedTouches?.[0];if(!touch)return;const dx=touch.clientX-startX,dy=touch.clientY-startY;if(Math.abs(dx)<70||Math.abs(dx)<Math.abs(dy)*1.2)return;shiftBillingPeriod(dx<0?1:-1);},{passive:true});
    }
  }

  function legacyPeriodRange(bill){
    const count=monthDays(bill.month),[year,month]=bill.month.split("-");
    return `01/${month}/${year} – ${String(count).padStart(2,"0")}/${month}/${year}`;
  }
  function renderPeriodHeader(bill){
    const cycle=isCycleBill(bill);
    const label=$("#billingPeriodLabel"),dates=$("#billingPeriodDates");
    if(label)label.textContent=cycle?billingPeriodTitle(bill.month):`${monthLabel(bill.month)} · dữ liệu cũ`;
    if(dates)dates.textContent=cycle?`${periodRangeText(bill)}${bill.cycleCustomized?" · Đã tùy chỉnh":""}`:legacyPeriodRange(bill);
    const edit=$("#billingPeriodEdit");if(edit){edit.classList.toggle("role-hidden",!isAdmin());edit.disabled=!cycle;edit.title=bill.closed?"Kỳ đang khóa — bấm để xem hướng dẫn":"Chỉnh ngày bắt đầu và kết thúc kỳ";}
  }

  let calendarMarkup="",calendarPersonId=null,billingPeopleMarkup="";
  renderBilling=function(){
    ensureBillingCycleUi();
    const realBill=currentBill(),bill=periodBillForDisplay(),calc=billCalc(bill);
    let person=activeBillPerson(realBill);
    if(!isAdmin()&&myMemberId()){
      const own=calc.people.find(item=>item.memberId===myMemberId());
      if(own&&(!person||!canEditBillingPerson(person))){ui.activeBillPersonId=own.id;person=own;}
    }
    renderPeriodHeader(bill);
    $("#billMonth").value=bill.month;
    $("#billElectricity").value=bill.electricity||"";$("#billWater").value=bill.water||"";
    $("#billTotalDays").textContent=calc.totalDays;$("#billTotalMoney").textContent=money(bill.electricity+bill.water);
    const own=myMemberId()?calc.people.find(item=>item.memberId===myMemberId()):null;
    const ownDue=own?Math.max(0,(calc.due[own.id]||0)-(Number(own.paidAmount)||0)):null;
    $("#billOverviewPeriod").textContent=isCycleBill(bill)?periodRangeText(bill):monthLabel(bill.month);
    $("#billOverviewDue").textContent=ownDue===null?"—":money(ownDue);
    $("#billOverviewStay").textContent=own?`${stayCount(own,bill)} ngày ở · ${bill.closed?"Đã chốt":"Tạm tính"}`:"";
    $("#billClosedBadge").textContent=bill.closed?"🔒 Đã chốt":"Đang mở";$("#billClosedBadge").className=`badge ${bill.closed?"warning":"success"}`;

    const peopleMarkup=calc.people.length?calc.people.map(item=>{
      const due=calc.due[item.id]||0;
      return `<button class="person-pick ${person?.id===item.id?"active":""}" data-person="${item.id}" type="button"><span class="avatar">${esc(item.name.charAt(0).toUpperCase())}</span><span><b>${esc(item.name)}${item.memberId===myMemberId()?" · Bạn":""}</b><small>${stayCount(item,bill)} ngày · ${esc(paymentLabel(item,due))}</small></span><span class="person-amount">${money(due)}</span></button>`;
    }).join(""):'<div class="empty">Chưa có người trong kỳ này.</div>';
    if(billingPeopleMarkup!==peopleMarkup){
      billingPeopleMarkup=peopleMarkup;
      const list=$("#billPeopleList");
      list.innerHTML=peopleMarkup;
      list.querySelectorAll('[data-person]').forEach(button=>button.addEventListener("click",()=>selectBillPerson(button.dataset.person)));
    }

    const editable=!!realBill&&canEditBillingPerson(person)&&!bill.closed;
    $("#calendarPersonTitle").textContent=person?`Lịch ở của ${person.name}`:"Chọn một người";
    $("#calendarPersonHint").textContent=person?(editable?"Bấm ngày để đổi trạng thái. Vuốt ngang để đổi kỳ.":"Lịch chỉ xem. Vuốt ngang để đổi kỳ."):"Chọn người trong danh sách để xem lịch.";
    $("#billRangePanel").hidden=!editable;

    const dates=calendarDateKeys(bill),firstDate=dates[0]||"",firstParts=firstDate.split("-").map(Number),first=firstDate?(new Date(firstParts[0],firstParts[1]-1,firstParts[2]).getDay()+6)%7:0,today=Period.roomDateKey();
    let cells="";for(let index=0;index<first;index++)cells+='<span class="day-cell blank"></span>';
    let previousMonth="";
    for(const dateKey of dates){
      const parts=dateKey.split("-").map(Number),monthToken=`${parts[0]}-${String(parts[1]).padStart(2,"0")}`,day=parts[2],storageKey=storageKeyForDate(bill,dateKey),stay=person?.days?.[storageKey]===true;
      const showMonth=monthToken!==previousMonth;previousMonth=monthToken;
      const currentDay=dateKey===today;
      cells+=`<button class="day-cell ${stay?"stay":""} ${currentDay?"today":""}" data-billing-date="${dateKey}" type="button" ${person&&editable?"":"disabled"} ${currentDay?'aria-current="date"':""} aria-label="${displayDate(dateKey)}, ${stay?"có ở":"vắng"}" aria-pressed="${stay}">${showMonth?`<span class="day-month-tag">T${parts[1]}</span>`:""}<b>${day}</b><small>${stay?"✓ Có ở":"Vắng"}</small></button>`;
    }
    const personId=person?.id||null;
    if(calendarMarkup!==cells||calendarPersonId!==personId){
      calendarMarkup=cells;calendarPersonId=personId;
      const calendar=$("#billCalendar");
      calendar.innerHTML=cells;
      calendar.querySelectorAll('[data-billing-date]').forEach(button=>button.addEventListener("click",()=>setBillDay(button.dataset.billingDate)));
    }

    if(person){
      const due=calc.due[person.id]||0,status=billPaymentState(person,due),suffix=status==="none"?" · Không phát sinh":status==="paid"?" · ✅ Đã đóng":" · 🔴 Chưa đóng";
      $("#billPersonSummary").innerHTML=`<b>${esc(person.name)}</b><span>${stayCount(person,bill)} ngày · ${money(due)}${suffix}</span>`;
    }else $("#billPersonSummary").innerHTML='<b>Chưa chọn người</b><span>0 ngày</span>';

    const min=dates[0]||`${bill.month}-01`,max=dates[dates.length-1]||`${bill.month}-01`;
    ["#stayFrom","#stayTo"].forEach(id=>{const element=$(id);if(!element)return;element.min=min;element.max=max;element.disabled=!editable;if(!element.value||element.value<min||element.value>max)element.value=id==="#stayFrom"?min:max;});
    $("#billCloseButton").textContent=bill.closed?"🔓 Mở khóa":"🔒 Chốt sổ";

    const rows=calc.people.length?calc.people.map(item=>{
      const due=calc.due[item.id]||0,status=billPaymentState(item,due),button=status==="none"?'<span class="badge">—</span>':`<button class="btn small ${status==="paid"?"":"green"} payment-button" data-payment="${item.id}" type="button">${status==="paid"?"Hủy đã đóng":"Đã thu tiền"}</button>`;
      return `<tr><td data-label="Tên"><b>${esc(item.name)}</b></td><td data-label="Ngày ở">${stayCount(item,bill)}</td><td data-label="Điện">${money(calc.electric[item.id])}</td><td data-label="Nước">${money(calc.water[item.id])}</td><td data-label="Tổng"><b>${money(due)}</b></td><td data-label="Thanh toán">${paymentMarkup(item,due)}</td><td data-label="Thao tác">${isAdmin()?button:"—"}</td></tr>`;
    }).join(""):'<tr><td colspan="7">Chưa có dữ liệu.</td></tr>';
    const collected=calc.people.reduce((sum,item)=>{const due=calc.due[item.id]||0;return sum+(billPaymentState(item,due)==="paid"?due:Math.min(Math.max(0,Number(item.paidAmount)||0),due));},0);
    $("#billingTable").innerHTML=`<table><thead><tr><th>Tên</th><th>Ngày</th><th>Điện</th><th>Nước</th><th>Tổng</th><th>Thanh toán</th><th></th></tr></thead><tbody>${rows}</tbody><tfoot><tr><td data-label="Tổng"><b>TỔNG</b></td><td data-label="Ngày">${calc.totalDays}</td><td data-label="Điện">${money(bill.electricity)}</td><td data-label="Nước">${money(bill.water)}</td><td data-label="Tổng">${money(bill.electricity+bill.water)}</td><td data-label="Đã thu"><b>${money(collected)}</b></td><td data-label="Còn thiếu"><b>${money(Math.max(0,bill.electricity+bill.water-collected))}</b></td></tr></tfoot></table>`;
    $$('[data-payment]').forEach(button=>button.addEventListener("click",()=>togglePayment(button.dataset.payment)));
  };

  const baseBillingText=billingText;
  billingText=function(){
    const bill=currentBill();if(!bill||!isCycleBill(bill))return baseBillingText();
    const calc=billCalc(bill);
    return [`⚡💧 ĐIỆN NƯỚC ${billingPeriodTitle(bill.month).toUpperCase()}`,`📅 ${periodRangeText(bill)}`,`Tổng: ${money(calc.b.electricity+calc.b.water)}`,"",...calc.people.map(person=>{
      const due=calc.due[person.id]||0,status=billPaymentState(person,due),label=status==="none"?"KHÔNG PHÁT SINH":status==="paid"?"ĐÃ ĐÓNG":"CHƯA ĐÓNG";
      return `• ${person.name}: ${stayCount(person,calc.b)} ngày · ${money(due)} · ${label}`;
    })].join("\n");
  };

  globalThis.P708BillingCycleUi={goToBillingPeriod,shiftBillingPeriod,billingPeriodTitle,calendarDateKeys,updateBillingPeriodEditorNotice};
})();
