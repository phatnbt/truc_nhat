function renderRoomCalendar(){
  const root=$("#roomCalendarList");
  if(!root)return;
  const period=P708BillingCycle;
  const today=period.roomDateKey(),date=period.parseDateKey(today),view=$("#roomCalendarView").value;
  const monday=period.dateKey(period.addUtcDays(date,-((date.getUTCDay()+6)%7)));
  const start=view==="today"?today:view==="month"?today.slice(0,7)+"-01":monday;
  const end=view==="today"?today:view==="month"?today.slice(0,7)+"-31":period.dateKey(period.addUtcDays(period.parseDateKey(monday),6));
  const rows=[];
  let assigned=0,completed=0;
  for(const schedule of state.schedules){
    const first=period.parseDateKey(schedule.weekStart);
    if(!first)continue;
    const last=period.dateKey(period.addUtcDays(first,6));
    if(schedule.weekStart>end||last<start)continue;
    const tasks=schedule.assignments.filter(a=>!a.cut&&(view!=="personal"||a.personId===myMemberId()));
    assigned+=tasks.length;completed+=tasks.filter(task=>task.completed).length;
    for(const a of tasks)rows.push({date:schedule.weekStart,title:a.task,detail:a.completed?"Đã hoàn thành":a.personName,scheduleId:schedule.id});
    if(view!=="personal"&&schedule.absentNames?.length)rows.push({date:schedule.weekStart,title:"Vắng mặt",detail:schedule.absentNames.join(", ")});
  }
  if(view!=="personal")for(const bill of state.billing.months){
    if(bill.cycleEnd>=start&&bill.cycleEnd<=end)rows.push({date:bill.cycleEnd,title:"Kết thúc kỳ điện nước",detail:monthLabel(bill.month)});
  }
  if(view!=="personal")for(const event of Object.values(state.settings.roomEvents||{})){
    if(event.date>=start&&event.date<=end)rows.push({date:event.date,title:event.title,detail:ROOM_EVENT_LABELS[event.kind]});
  }
  root.innerHTML=rows.length?`<p class="calendar-progress">${completed}/${assigned} việc đã xác nhận</p>`+rows.sort((a,b)=>a.date.localeCompare(b.date)).map(item=>
    `<div class="room-presence"><div><b>${esc(item.title)}</b><div>${esc(item.detail)}</div></div>${item.scheduleId?`<button class="btn small" type="button" data-room-calendar-week="${esc(item.scheduleId)}">${esc(item.date)}</button>`:`<span>${esc(item.date)}</span>`}</div>`
  ).join(""):'<p class="empty">Chưa có sự kiện trong khoảng này.</p>';
  root.querySelectorAll("[data-room-calendar-week]").forEach(button=>button.onclick=()=>selectSchedule(button.dataset.roomCalendarWeek));
}

const ROOM_EVENT_LABELS={shared:"Sự kiện phòng",cleanup:"Tổng vệ sinh",payment:"Hạn thanh toán"};
async function saveRoomCalendarEvent(event){
  event.preventDefault();
  if(!requireAdmin())return;
  const form=event.currentTarget,fields=new FormData(form);
  const date=fields.get("date"),kind=fields.get("kind"),title=String(fields.get("title")).trim();
  if(!title||!P708BillingCycle.parseDateKey(date)||!Object.prototype.hasOwnProperty.call(ROOM_EVENT_LABELS,kind))return toast("Kiểm tra nội dung sự kiện.");
  const button=form.querySelector("button[type=submit]");
  if(button.disabled)return;
  button.disabled=true;
  try{
    const id=uid();
    state.settings.roomEvents={...state.settings.roomEvents,[id]:{date,kind,title}};
    if(await persist("Đã thêm vào lịch phòng",{action:"ADD_ROOM_EVENT",summary:title}))form.reset();
  }finally{button.disabled=false;}
}

(()=>{
  const TODAY_SCROLL_KEY="P708_TODAY_CALENDAR_SCROLL";
  let lastScrolled="";


  const style=document.createElement("style");
  style.dataset.todayCalendar="1";
  style.textContent=`
    .day-cell.is-today{
      position:relative;
      border:2px solid #4f63f5!important;
      background:linear-gradient(180deg,#eef2ff 0%,#ffffff 100%);
      box-shadow:0 10px 26px rgba(79,99,245,.18),inset 0 0 0 1px rgba(255,255,255,.8);
      color:#172033;
      transform:translateY(-1px);
      z-index:1;
    }
    .day-cell.is-today.stay{
      background:linear-gradient(180deg,#e9fbf1 0%,#eef2ff 100%);
      border-color:#4f63f5!important;
      color:#166534;
    }
    .day-cell.is-today:disabled{opacity:.96}
    .day-cell.is-today::before{
      content:"";
      position:absolute;
      top:9px;
      left:9px;
      width:8px;
      height:8px;
      border-radius:999px;
      background:#4f63f5;
      box-shadow:0 0 0 5px rgba(79,99,245,.12);
    }
    @media(max-width:640px){
      .day-cell.is-today::before{
        width:6px;
        height:6px;
        top:7px;
        left:7px;
        box-shadow:0 0 0 4px rgba(79,99,245,.10);
      }
    }
  `;
  if(!document.querySelector('style[data-today-calendar="1"]'))document.head.appendChild(style);

  function todayCell(){
    const monthInput=document.querySelector("#billMonth");
    const calendar=document.querySelector("#billCalendar");
    if(!monthInput||!calendar)return null;

    calendar.querySelectorAll(".day-cell.is-today").forEach(cell=>{
      cell.classList.remove("is-today");
      cell.removeAttribute("aria-current");
      cell.removeAttribute("title");
    });

    const today=P708BillingCycle.roomDateKey();
    const cell=calendar.querySelector(`[data-date="${today}"],[data-day="${today}"]`)||
      (monthInput.value===today.slice(0,7)?calendar.querySelector(`[data-day="${Number(today.slice(8))}"]`):null);
    if(!cell)return null;
    cell.classList.add("is-today");
    cell.setAttribute("aria-current","date");
    cell.setAttribute("title",today);
    return cell;
  }

  function revealToday(force=false){
    const cell=todayCell();
    if(!cell)return;
    const page=document.querySelector("#page-billing");
    if(!page?.classList.contains("active"))return;

    const month=document.querySelector("#billMonth")?.value||"";
    const person=document.querySelector("#calendarPersonTitle")?.textContent||"";
    const key=`${month}|${P708BillingCycle.roomDateKey()}|${person}`;
    let saved;
    try{saved=sessionStorage.getItem(TODAY_SCROLL_KEY);}catch{}
    if(!force&&(lastScrolled===key||saved===key))return;

    lastScrolled=key;
    try{sessionStorage.setItem(TODAY_SCROLL_KEY,key);}catch{}
    requestAnimationFrame(()=>{if(cell.isConnected&&page.classList.contains("active"))cell.scrollIntoView({behavior:"instant",block:"center",inline:"nearest"});});
  }

  const previousRenderBilling=renderBilling;
  renderBilling=function(...args){
    const result=previousRenderBilling(...args);
    requestAnimationFrame(()=>revealToday(false));
    return result;
  };

  document.addEventListener("click",event=>{
    const go=event.target.closest?.('[data-go="billing"]');
    if(go)setTimeout(()=>revealToday(true),120);
  });

  document.querySelector("#billMonth")?.addEventListener("change",()=>setTimeout(()=>revealToday(true),100));
  document.querySelector("#billPeopleList")?.addEventListener("click",()=>setTimeout(()=>revealToday(false),100));
  window.addEventListener("hashchange",()=>{if(location.hash==="#billing")setTimeout(()=>revealToday(true),120);});
  document.addEventListener("visibilitychange",()=>{if(!document.hidden)setTimeout(()=>revealToday(false),80);});

  setTimeout(()=>revealToday(false),500);
})();
