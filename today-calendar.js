(()=>{
  const TODAY_SCROLL_KEY="P708_TODAY_CALENDAR_SCROLL";
  let lastScrolled="";

  const pad=value=>String(value).padStart(2,"0");
  const localMonth=date=>`${date.getFullYear()}-${pad(date.getMonth()+1)}`;

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
    .day-cell.is-today:disabled{opacity:.94}
    .day-cell.is-today::before{
      content:"";
      position:absolute;
      top:8px;
      left:8px;
      width:8px;
      height:8px;
      border-radius:999px;
      background:#4f63f5;
      box-shadow:0 0 0 5px rgba(79,99,245,.12);
    }
    .day-cell.is-today::after{
      content:"Hôm nay";
      position:absolute;
      top:7px;
      right:7px;
      padding:3px 7px;
      border-radius:999px;
      background:#e8edff;
      color:#3652d9;
      font-size:9px;
      font-weight:900;
      line-height:1.2;
      letter-spacing:.1px;
      text-transform:none;
    }
    @media(max-width:640px){
      .day-cell.is-today::after{font-size:8px;padding:2px 5px;top:5px;right:5px}
      .day-cell.is-today::before{width:6px;height:6px;top:6px;left:6px;box-shadow:0 0 0 4px rgba(79,99,245,.10)}
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

    const now=new Date();
    const month=localMonth(now);
    if(monthInput.value!==month)return null;

    const cell=calendar.querySelector(`[data-day="${now.getDate()}"]`);
    if(!cell)return null;
    cell.classList.add("is-today");
    cell.setAttribute("aria-current","date");
    cell.setAttribute("title",`Hôm nay · ${now.toLocaleDateString("vi-VN")}`);
    return cell;
  }

  function revealToday(force=false){
    const cell=todayCell();
    if(!cell)return;
    const page=document.querySelector("#page-billing");
    if(!page?.classList.contains("active"))return;

    const month=document.querySelector("#billMonth")?.value||"";
    const person=document.querySelector("#calendarPersonTitle")?.textContent||"";
    const key=`${month}|${new Date().getDate()}|${person}`;
    if(!force&&(lastScrolled===key||sessionStorage.getItem(TODAY_SCROLL_KEY)===key))return;

    lastScrolled=key;
    sessionStorage.setItem(TODAY_SCROLL_KEY,key);
    requestAnimationFrame(()=>setTimeout(()=>cell.scrollIntoView({behavior:"smooth",block:"center",inline:"nearest"}),80));
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
