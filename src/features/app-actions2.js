function updateBill(kind,value){
  if(!requireAdmin())return renderBilling();
  if(!["electricity","water"].includes(kind))return toast("Loại hóa đơn không hợp lệ");
  const b=ensureBill();if(b.closed)return toast("Tháng đã chốt sổ");
  b[kind]=Math.max(0,Math.round(Number(value)||0));b.updatedAt=nowIso();
  persist("Đã cập nhật hóa đơn",{action:"UPDATE_BILL",summary:`Cập nhật ${kind==="electricity"?"tiền điện":"tiền nước"} ${monthLabel(b.month)}`});
}
function setBillMonth(value){
  if(!validMonthKey(value))return toast("Tháng không hợp lệ");
  state.billing.selectedMonth=value;ui.selectedMonth=value;ui.activeBillPersonId=currentBill()?.people?.[0]?.id||null;saveLocal();renderAll();
}
function syncBillingMembers(){
  if(!requireAdmin())return;
  const b=ensureBill();if(b.closed)return toast("Tháng đã chốt sổ");
  const n=monthDays(b.month),all=Object.fromEntries(Array.from({length:n},(_,i)=>[String(i+1),true]));
  const norm=v=>String(v||"").trim().replace(/\s+/g," ").toLowerCase();
  const stamp=p=>timeMs(p?.updatedAt)||timeMs(p?.createdAt)||Number.MAX_SAFE_INTEGER;
  const trueDays=p=>{let c=0;for(let d=1;d<=n;d++)if(p?.days?.[String(d)]===true)c++;return c;};
  const sameDays=(a,z)=>{for(let d=1;d<=n;d++)if((a?.days?.[String(d)]===true)!==(z?.days?.[String(d)]===true))return false;return true;};
  const mergePayment=(target,extra)=>{
    target.paid=target.paid||!!extra.paid;
    target.paidAmount=Math.max(Number(target.paidAmount)||0,Number(extra.paidAmount)||0);
    target.paidAt=target.paidAt||extra.paidAt||null;target.paidBy=target.paidBy||extra.paidBy||null;
  };
  const removeExtra=(target,extra)=>{mergePayment(target,extra);b.people=b.people.filter(p=>p.id!==extra.id);};
  const memberNameCount=new Map();state.members.forEach(m=>memberNameCount.set(norm(m.name),(memberNameCount.get(norm(m.name))||0)+1));
  let added=0,relinked=0,merged=0,ambiguous=0;

  for(const m of state.members){
    const key=norm(m.name);
    if(memberNameCount.get(key)!==1){ambiguous++;continue;}
    const exact=b.people.filter(p=>p.memberId===m.id).sort((a,z)=>stamp(a)-stamp(z));
    const legacy=b.people.filter(p=>!p.memberId&&norm(p.name)===key).sort((a,z)=>stamp(a)-stamp(z));
    let person=exact[0]||null;

    if(exact.length>1){
      const canonical=exact.find(p=>trueDays(p)>0)||exact[0];
      const conflict=exact.some(p=>p!==canonical&&trueDays(p)>0&&!sameDays(p,canonical));
      if(conflict){ambiguous++;continue;}
      person=canonical;
      for(const extra of exact){if(extra===person)continue;removeExtra(person,extra);merged++;}
    }

    if(person&&legacy.length){
      const meaningful=legacy.filter(p=>trueDays(p)>0&&!sameDays(p,person));
      if(trueDays(person)===0&&meaningful.length===1){person.days={...meaningful[0].days};}
      else if(meaningful.length>0){ambiguous++;continue;}
      for(const extra of legacy){removeExtra(person,extra);merged++;}
    }else if(!person&&legacy.length===1){
      person=legacy[0];person.memberId=m.id;relinked++;
    }else if(!person&&legacy.length>1){
      const canonical=legacy.find(p=>trueDays(p)>0)||legacy[0];
      const conflict=legacy.some(p=>p!==canonical&&trueDays(p)>0&&!sameDays(p,canonical));
      if(conflict){ambiguous++;continue;}
      person=canonical;person.memberId=m.id;relinked++;
      for(const extra of legacy){if(extra===person)continue;removeExtra(person,extra);merged++;}
    }

    if(person){
      if(person.memberId!==m.id){person.memberId=m.id;relinked++;}
      if(person.name!==m.name)person.name=m.name;
      person.updatedAt=nowIso();
    }else{
      b.people.push({id:uid(),memberId:m.id,name:m.name,days:{...all},paid:false,paidAmount:0,updatedAt:nowIso()});added++;
    }
  }

  b.updatedAt=nowIso();
  if(ui.activeBillPersonId&&!b.people.some(p=>p.id===ui.activeBillPersonId))ui.activeBillPersonId=b.people[0]?.id||null;
  else ui.activeBillPersonId=ui.activeBillPersonId||b.people[0]?.id||null;
  const parts=[];
  if(merged)parts.push(`đã gộp ${merged} bản ghi trùng`);
  if(relinked)parts.push(`đã liên kết lại ${relinked} người`);
  if(added)parts.push(`đã thêm ${added} thành viên`);
  if(ambiguous)parts.push(`${ambiguous} trường hợp dữ liệu khác nhau cần kiểm tra thủ công`);
  persist(parts.length?parts.join(" · "):"Danh sách đã đầy đủ",{
    action:"SYNC_BILL_MEMBERS",
    summary:`Đồng bộ thành viên vào ${monthLabel(b.month)}${merged?` · gộp ${merged} trùng`:""}${relinked?` · liên kết lại ${relinked}`:""}${added?` · thêm ${added}`:""}${ambiguous?` · ${ambiguous} mơ hồ`:""}`
  });
}
function addBillingPerson(){
  if(!requireAdmin())return;
  const input=$("#billNewPersonName"),name=input.value.trim().replace(/\s+/g," "),b=ensureBill();
  if(!name)return toast("Nhập tên người");if(name.length>80)return toast("Tên quá dài");if(b.closed)return toast("Tháng đã chốt sổ");
  if(b.people.some(p=>p.name.toLowerCase()===name.toLowerCase()))return toast("Tên này đã có");
  const p={id:uid(),memberId:null,name,days:{},paid:false,paidAmount:0,updatedAt:nowIso()};b.people.push(p);b.updatedAt=nowIso();ui.activeBillPersonId=p.id;input.value="";closeModal("memberModal");
  persist("Đã thêm người/khách",{action:"ADD_BILL_PERSON",summary:`Thêm ${name} vào ${monthLabel(b.month)}`});
}
function selectBillPerson(personId){ui.activeBillPersonId=personId;saveLocal();renderBilling();}
function removeBillingPerson(){
  if(!requireAdmin())return;const b=currentBill(),p=activeBillPerson(b);if(!b||!p)return;if(b.closed)return toast("Tháng đã chốt sổ");
  if(!confirm(`Xóa ${p.name} khỏi bảng tháng này?`))return;
  b.people=b.people.filter(x=>x.id!==p.id);b.updatedAt=nowIso();ui.activeBillPersonId=b.people[0]?.id||null;
  persist("Đã xóa khỏi bảng tháng",{action:"REMOVE_BILL_PERSON",summary:`Xóa ${p.name} khỏi ${monthLabel(b.month)}`,targetMemberId:p.memberId||null});
}
function setBillDay(day){
  const b=currentBill(),p=activeBillPerson(b);if(!p)return toast("Chọn người trước");if(!canEditBillingPerson(p))return toast("Bạn chỉ được chỉnh ngày ở của chính mình");if(b.closed)return toast("Tháng đã chốt sổ");
  if(!Number.isInteger(day)||day<1||day>monthDays(b.month))return toast("Ngày không hợp lệ");
  p.days[String(day)]=!p.days?.[String(day)];p.updatedAt=nowIso();b.updatedAt=nowIso();
  persist(p.days[String(day)]?`Ngày ${day}: Có ở`:`Ngày ${day}: Vắng`,{action:"UPDATE_BILL_DAY",summary:`${p.name} ngày ${day}: ${p.days[String(day)]?"Có ở":"Vắng"}`,targetMemberId:p.memberId||null});
}
function dateDay(value,bill){
  if(!validDateKey(value)||!bill||!validMonthKey(bill.month))return null;
  const [y,m,d]=value.split("-").map(Number),[by,bm]=bill.month.split("-").map(Number);
  return y===by&&m===bm&&d>=1&&d<=monthDays(bill.month)?d:null;
}
function applyStayRange(value){
  const b=currentBill(),p=activeBillPerson(b);if(!p)return toast("Chọn người trước");if(!canEditBillingPerson(p))return toast("Bạn chỉ được chỉnh ngày ở của mình");if(b.closed)return toast("Tháng đã chốt sổ");
  let from=dateDay($("#stayFrom")?.value,b),to=dateDay($("#stayTo")?.value,b);if(!from||!to)return toast("Chọn đủ khoảng ngày");if(from>to)[from,to]=[to,from];
  if(!value&&!confirm(`Đánh dấu vắng từ ngày ${from} đến ${to}?`))return;
  for(let d=from;d<=to;d++)p.days[String(d)]=value;p.updatedAt=nowIso();b.updatedAt=nowIso();
  persist(value?`Đã đánh dấu ở ngày ${from}–${to}`:`Đã đánh dấu vắng ngày ${from}–${to}`,{action:"UPDATE_BILL_RANGE",summary:`${p.name}: ${value?"Có ở":"Vắng"} ngày ${from}–${to}`,targetMemberId:p.memberId||null});
}
function presetStay(mode){
  const b=currentBill(),p=activeBillPerson(b);if(!p)return toast("Chọn người trước");if(!canEditBillingPerson(p))return toast("Bạn chỉ được chỉnh ngày ở của mình");if(b.closed)return toast("Tháng đã chốt sổ");
  if(!["all","weekdays","none"].includes(mode))return toast("Chế độ không hợp lệ");if(mode==="none"&&!confirm("Bỏ toàn bộ ngày ở?"))return;
  const [y,m]=b.month.split("-").map(Number),n=monthDays(b.month);p.days={};
  for(let d=1;d<=n;d++){const dow=new Date(y,m-1,d).getDay();p.days[String(d)]=mode==="all"||(mode==="weekdays"&&dow!==0&&dow!==6);}
  p.updatedAt=nowIso();b.updatedAt=nowIso();
  persist("Đã cập nhật nhanh ngày ở",{action:"PRESET_BILL_DAYS",summary:`${p.name}: cập nhật nhanh ngày ở ${monthLabel(b.month)}`,targetMemberId:p.memberId||null});
}
let billDecision=null;

function openBillDecision(action,bill,person,due=0){
  billDecision={action,month:bill.month,personId:person?.id,uid:authSession.user?.uid,expectedPaid:Number(person?.paidAmount)||0,due};
  $("#billingDecisionForm").reset();
  const payment=action==="RECORD_PAYMENT",amount=$("#billingDecisionAmount");
  $("#billingDecisionAmountField").hidden=!payment;
  amount.disabled=!payment;
  if(payment){amount.max=String(due);amount.value=String(billDecision.expectedPaid||due);}
  $("#billingDecisionTitle").textContent=payment?"Ghi nhận thanh toán":action==="CLOSE_BILL"?"Chốt sổ điện nước":"Mở khóa kỳ điện nước";
  $("#billingDecisionDetail").textContent=payment?`${person.name} · Phải đóng ${money(due)}`:
    `${monthLabel(bill.month)} · ${money((bill.electricity||0)+(bill.water||0))}`;
  openModal("billingDecisionModal");
}

function toggleBillClosed(){
  if(!requireAdmin())return;
  const bill=currentBill();
  if(!bill)return toast("Chưa có dữ liệu tháng");
  if(bill.closed&&bill.people.some(person=>Number(person.paidAmount)>0))return toast("Kỳ đã có thanh toán. Đối soát trước khi mở khóa.");
  if(!bill.closed&&!billCalc(bill).totalDays)return toast("Chưa có ngày ở để chốt");
  openBillDecision(bill.closed?"OPEN_BILL":"CLOSE_BILL",bill);
}

function togglePayment(personId){
  if(!requireAdmin())return;
  const bill=currentBill(),person=bill?.people?.find(item=>item.id===personId);
  if(!person)return;
  if(!bill.closed)return toast("Hãy chốt sổ trước khi ghi nhận thanh toán");
  const due=billCalc(bill).due[personId]||0;
  if(due<=0)return toast("Người này không có khoản phải thu");
  openBillDecision("RECORD_PAYMENT",bill,person,due);
}

async function confirmBillingDecision(event){
  event.preventDefault();
  const draft=billDecision,bill=currentBill(),form=event.currentTarget;
  if(!requireAdmin()||!draft||draft.uid!==authSession.user?.uid||draft.month!==bill?.month)return;
  const button=form.querySelector("button[type=submit]");
  if(button.disabled)return;
  const {action,month,personId,expectedPaid,due}=draft;
  let message,summary,targetMemberId=null;
  const editedAt=nowIso();
  if(action==="RECORD_PAYMENT"){
    const person=bill.people.find(item=>item.id===personId),amount=Number($("#billingDecisionAmount").value);
    if(!person||!bill.closed||billCalc(bill).due[personId]!==due||(Number(person.paidAmount)||0)!==expectedPaid)return toast("Hóa đơn vừa thay đổi. Hãy mở lại thao tác.");
    if(!Number.isSafeInteger(amount)||amount<0||amount>due)return toast("Nhập số nguyên VND trong giới hạn khoản phải thu.");
    if(amount===expectedPaid){closeModal("billingDecisionModal");billDecision=null;return;}
    person.paid=amount===due;person.paidAmount=amount;person.paidAt=amount?editedAt:null;
    person.paidBy=amount?authSession.user.uid:null;person.updatedAt=editedAt;targetMemberId=person.memberId;
    message=`Đã ghi nhận ${money(amount)} của ${person.name}`;
    summary=`${person.name}: đã thu ${money(amount)} / ${money(due)}`;
  }else{
    bill.closed=action==="CLOSE_BILL";
    message=bill.closed?"Đã chốt sổ":"Đã mở khóa sổ";
    summary=`${message} ${monthLabel(month)}`;
  }
  bill.updatedAt=editedAt;
  button.disabled=true;
  try{
    if(await persist(message,{action,month,personId,expectedPaid,summary,targetMemberId})){
      billDecision=null;closeModal("billingDecisionModal");
    }
  }finally{button.disabled=false;}
}
function billingText(){
  const c=billCalc();
  return [`⚡💧 ĐIỆN NƯỚC ${monthLabel(c.b.month).toUpperCase()}`,`Tổng: ${money(c.b.electricity+c.b.water)}`,"",...c.people.map(p=>{
    const due=c.due[p.id]||0,state=billPaymentState(p,due),label=state==="none"?"KHÔNG PHÁT SINH":state==="paid"?"ĐÃ ĐÓNG":"CHƯA ĐÓNG";
    return `• ${p.name}: ${stayCount(p,c.b)} ngày · ${money(due)} · ${label}`;
  })].join("\n");
}
function downloadBillingCsv(){
  const c=billCalc();
  const rows=[["Tên","Ngày ở","Tiền điện","Tiền nước","Tổng","Thanh toán","Đã thu"],...c.people.map(p=>{
    const due=c.due[p.id]||0,state=billPaymentState(p,due),collected=state==="paid"?due:Math.min(Math.max(0,Number(p.paidAmount)||0),due);
    return [p.name,stayCount(p,c.b),c.electric[p.id],c.water[p.id],due,state==="none"?"Không phát sinh":state==="paid"?"Đã đóng":"Chưa đóng",collected];
  }),["TỔNG",c.totalDays,c.b.electricity,c.b.water,c.b.electricity+c.b.water,"",c.people.reduce((s,p)=>{const due=c.due[p.id]||0;return s+(billPaymentState(p,due)==="paid"?due:Math.min(Math.max(0,Number(p.paidAmount)||0),due));},0)]];
  const csv="\ufeff"+rows.map(r=>r.map(v=>{
    const value=String(v),safe=typeof v==="string"&&/^[\s=+@-]/.test(value)?"'"+value:value;
    return `"${safe.replaceAll('"','""')}"`;
  }).join(",")).join("\n");
  const a=document.createElement("a"),url=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"}));a.href=url;a.download=`dien-nuoc-${c.b.month}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast("Đã tải CSV");
}

function auditTimeMs(log){try{if(log?.createdAt?.toDate)return log.createdAt.toDate().getTime();const n=new Date(log?.createdAt||0).getTime();return Number.isFinite(n)?n:0;}catch{return 0;}}
function auditActorKey(log){return String(log?.actorUid||log?.actorEmail||log?.actorName||"unknown").toLowerCase();}
function auditActorName(log){return log?.actorName||log?.actorEmail||"Không xác định";}
function auditActionLabel(action){
  const labels={UPDATE_DATA:"Cập nhật dữ liệu",ADD_MEMBER:"Thêm thành viên",REMOVE_MEMBER:"Xóa thành viên",UPDATE_PRESENCE:"Cập nhật có mặt",SET_ALL_PRESENCE:"Cập nhật toàn phòng",CREATE_SCHEDULE:"Tạo lịch",UPDATE_SCHEDULE:"Sửa phân công",UPDATE_TASK:"Cập nhật công việc",SUBMIT_TASK:"Báo hoàn thành",VERIFY_TASK:"Xác nhận công việc",REJECT_TASK:"Yêu cầu làm lại",DELETE_SCHEDULE:"Xóa lịch",RESET_CLEANING_POINTS:"Reset điểm trực nhật",SEND_CLEANING_REMINDER:"Nhắc thành viên trực nhật",UPDATE_BILL:"Cập nhật hóa đơn",UPDATE_BILLING_PERIOD:"Chỉnh kỳ điện nước",SYNC_BILL_MEMBERS:"Đồng bộ thành viên",ADD_BILL_PERSON:"Thêm người hóa đơn",REMOVE_BILL_PERSON:"Xóa người hóa đơn",UPDATE_BILL_DAY:"Sửa ngày ở",UPDATE_BILL_RANGE:"Sửa khoảng ngày",PRESET_BILL_DAYS:"Cập nhật nhanh ngày ở",CLOSE_BILL:"Chốt sổ",OPEN_BILL:"Mở khóa",MARK_BILL_PAID:"Đã thu tiền",MARK_BILL_UNPAID:"Hủy thu tiền",APPROVE_ACCESS:"Duyệt tài khoản",UPDATE_ACCESS:"Sửa quyền",REVOKE_ACCESS:"Khóa tài khoản",REMOVE_ACCOUNT:"Xóa tài khoản khỏi phòng",DELETE_ACCOUNT:"Xóa hoàn toàn tài khoản",CLEANUP_AUDIT:"Dọn nhật ký"};
  return labels[action]||action||"Cập nhật";
}
function filteredLogs(){
  const q=auditFilters.query.trim().toLowerCase();
  return [...auditLogs].sort((a,b)=>auditTimeMs(b)-auditTimeMs(a)).filter(log=>{
    if(auditFilters.member!=="all"&&auditActorKey(log)!==auditFilters.member)return false;
    if(auditFilters.action!=="all"&&(log.action||"UPDATE_DATA")!==auditFilters.action)return false;
    if(!q)return true;
    return [log.summary,log.action,auditActorName(log),log.actorEmail].some(v=>String(v||"").toLowerCase().includes(q));
  });
}
