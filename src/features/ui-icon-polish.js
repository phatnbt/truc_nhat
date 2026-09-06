(()=>{
  const BOOTSTRAP_ICONS_CSS="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css";
  function ensureIconStyles(){
    if(!document.querySelector('link[data-bootstrap-icons="1"]')){
      const link=document.createElement("link");
      link.rel="stylesheet";link.href=BOOTSTRAP_ICONS_CSS;link.crossOrigin="anonymous";link.dataset.bootstrapIcons="1";document.head.appendChild(link);
    }
    if(!document.querySelector('link[data-icon-polish="1"]')){
      const link=document.createElement("link");
      link.rel="stylesheet";link.href="./icon-polish.css?v=20260907-6";link.dataset.iconPolish="1";document.head.appendChild(link);
    }
  }
  function icon(name){return `<i class="bi bi-${name}" aria-hidden="true"></i>`;}
  function replaceKpis(){
    const mapping=[["#kpiMembers","people-fill"],["#kpiTasks","clipboard2-check-fill"],["#kpiUnpaid","credit-card-2-front-fill"],["#kpiPending","bell-fill"]];
    for(const [valueSelector,iconName] of mapping){const value=document.querySelector(valueSelector),box=value?.closest(".kpi-card")?.querySelector(".kpi-icon");if(box&&!box.querySelector(".bi"))box.innerHTML=icon(iconName);}
  }
  function replaceModuleIcons(){
    const mapping={cleaning:"clipboard2-check-fill",billing:"lightning-charge-fill",audit:"journal-text"};
    document.querySelectorAll(".module-card").forEach(card=>{const key=card.classList.contains("cleaning-card")?"cleaning":card.classList.contains("billing-card")?"billing":card.classList.contains("audit-card")?"audit":null;const box=card.querySelector(".module-icon");if(key&&box&&!box.querySelector(".bi"))box.innerHTML=icon(mapping[key]);});
  }
  function replaceBottomNav(){
    const configs=[{page:"home",icon:"house-door-fill",label:"Trang chủ"},{page:"cleaning",icon:"clipboard2-check-fill",label:"Trực nhật"},{page:"billing",icon:"lightning-charge-fill",label:"Điện nước"}];
    const candidates=[...document.querySelectorAll("nav button,[class*='bottom'] button")];
    for(const cfg of configs){const btn=candidates.find(el=>el.dataset.go===cfg.page||el.dataset.page===cfg.page||el.getAttribute("data-page-target")===cfg.page||el.textContent.includes(cfg.label));if(!btn||btn.dataset.iconPolished==="1")continue;btn.dataset.iconPolished="1";btn.classList.add("polished-nav-icon");btn.innerHTML=`<span class="polished-nav-glyph">${icon(cfg.icon)}</span><span>${cfg.label}</span>`;}
  }
  function polishActionIcons(){
    const map={"👤":"person-fill","🧹":"clipboard2-check-fill","💰":"cash-stack","🔓":"unlock-fill","⚠️":"exclamation-triangle-fill","⏳":"hourglass-split","💳":"credit-card-2-front-fill","✅":"check-circle-fill"};
    document.querySelectorAll(".action-icon").forEach(box=>{const name=map[box.textContent.trim()];if(name)box.innerHTML=icon(name);});
  }
  function polish(){ensureIconStyles();replaceKpis();replaceModuleIcons();replaceBottomNav();polishActionIcons();}
  let scheduled=false;const schedule=()=>{if(scheduled)return;scheduled=true;requestAnimationFrame(()=>{scheduled=false;polish();});};
  const observer=new MutationObserver(schedule);observer.observe(document.documentElement,{childList:true,subtree:true});
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",polish,{once:true});else polish();
  globalThis.P708PolishIcons=polish;
})();
