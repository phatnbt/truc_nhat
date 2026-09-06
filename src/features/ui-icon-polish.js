(()=>{
  const BOOTSTRAP_ICONS_CSS="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css";
  function ensureBootstrapIcons(){
    if(document.querySelector('link[data-bootstrap-icons="1"]'))return;
    const link=document.createElement("link");
    link.rel="stylesheet";
    link.href=BOOTSTRAP_ICONS_CSS;
    link.crossOrigin="anonymous";
    link.dataset.bootstrapIcons="1";
    document.head.appendChild(link);
  }
  function icon(name,label=""){
    return `<i class="bi bi-${name}"${label?` aria-label="${label}"`:""} aria-hidden="${label?"false":"true"}"></i>`;
  }
  function replaceKpis(){
    const mapping=[
      ["#kpiMembers","people-fill"],
      ["#kpiTasks","clipboard2-check-fill"],
      ["#kpiUnpaid","credit-card-2-front-fill"],
      ["#kpiPending","bell-fill"]
    ];
    for(const [valueSelector,iconName] of mapping){
      const value=document.querySelector(valueSelector);
      const card=value?.closest(".kpi-card");
      const iconBox=card?.querySelector(".kpi-icon");
      if(iconBox)iconBox.innerHTML=icon(iconName);
    }
  }
  function replaceModuleIcons(){
    const mapping={
      cleaning:"clipboard2-check-fill",
      billing:"lightning-charge-fill",
      audit:"journal-text"
    };
    document.querySelectorAll(".module-card").forEach(card=>{
      const key=card.classList.contains("cleaning-card")?"cleaning":card.classList.contains("billing-card")?"billing":card.classList.contains("audit-card")?"audit":null;
      if(!key)return;
      const box=card.querySelector(".module-icon");
      if(box)box.innerHTML=icon(mapping[key]);
    });
  }
  function replacePrimaryButtons(){
    document.querySelectorAll('[data-go="cleaning"]').forEach(btn=>{
      if(btn.closest(".bottom-nav")||btn.closest(".mobile-bottom-nav"))return;
      const text=btn.textContent.replace(/^\s*🧹\s*/,"").trim();
      if(btn.classList.contains("hero-primary"))btn.innerHTML=`${icon("clipboard2-check-fill")} <span class="icon-button-label">${text.replace(/→\s*$/,'').trim()}</span><span>→</span>`;
    });
    document.querySelectorAll('[data-go="billing"]').forEach(btn=>{
      if(btn.closest(".bottom-nav")||btn.closest(".mobile-bottom-nav"))return;
      if(btn.classList.contains("hero-secondary"))btn.innerHTML=`${icon("lightning-charge-fill")} <span class="icon-button-label">Điện & nước</span>`;
    });
  }
  function replaceBottomNav(){
    const configs=[
      {page:"home",icon:"house-door-fill",label:"Trang chủ"},
      {page:"cleaning",icon:"clipboard2-check-fill",label:"Trực nhật"},
      {page:"billing",icon:"lightning-charge-fill",label:"Điện nước"}
    ];
    const candidates=[...document.querySelectorAll("nav button,[class*='bottom'] button")];
    for(const cfg of configs){
      const btn=candidates.find(el=>el.dataset.go===cfg.page||el.dataset.page===cfg.page||el.getAttribute("data-page-target")===cfg.page||el.textContent.includes(cfg.label));
      if(!btn)continue;
      btn.classList.add("polished-nav-icon");
      btn.innerHTML=`<span class="polished-nav-glyph">${icon(cfg.icon)}</span><span>${cfg.label}</span>`;
    }
  }
  function polishActionIcons(){
    document.querySelectorAll(".action-icon").forEach(box=>{
      const text=box.textContent.trim();
      const map={"👤":"person-fill","🧹":"clipboard2-check-fill","💰":"cash-stack","🔓":"unlock-fill","⚠️":"exclamation-triangle-fill","⏳":"hourglass-split","💳":"credit-card-2-front-fill","✅":"check-circle-fill"};
      if(map[text])box.innerHTML=icon(map[text]);
    });
  }
  function polish(){
    ensureBootstrapIcons();
    replaceKpis();
    replaceModuleIcons();
    replacePrimaryButtons();
    replaceBottomNav();
    polishActionIcons();
  }
  const observer=new MutationObserver(()=>requestAnimationFrame(polish));
  observer.observe(document.documentElement,{childList:true,subtree:true});
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",polish,{once:true});else polish();
  globalThis.P708PolishIcons=polish;
})();
