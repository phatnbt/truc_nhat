(()=>{
  const BOOTSTRAP_ICONS_CSS="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css";
  const ICON_CSS_VERSION="20260913-2";
  const iconMap=new Map([
    ["🔐","lock-fill"],["🏠","house-door-fill"],["🔔","bell-fill"],["🧹","brush-fill"],
    ["⚡","lightning-charge-fill"],["👥","people-fill"],["💳","credit-card-2-front-fill"],
    ["👑","shield-lock-fill"],["🧾","receipt-cutoff"],["☁️","cloud-arrow-up-fill"],
    ["📋","clipboard2-fill"],["✨","stars"],["🚽","badge-wc-fill"],["🧼","droplet-fill"],
    ["🪣","bucket-fill"],["🧺","basket2-fill"],["🗑️","trash3-fill"],["👤","person-fill"],
    ["💰","cash-stack"],["🔓","unlock-fill"],["🔒","lock-fill"],["⚠️","exclamation-triangle-fill"],
    ["⏳","hourglass-split"],["✅","check-circle-fill"],["🟢","circle-fill"],["⚪","circle"],
    ["🔴","circle-fill"],["📅","calendar-week"],["🗓️","calendar-week"],["🚫","slash-circle"],
    ["🏡","house-door-fill"],["💧","droplet-fill"],["💡","lightbulb-fill"],["📊","bar-chart-fill"],
    ["📈","graph-up-arrow"],["📉","graph-down-arrow"],["🔄","arrow-repeat"],["↻","arrow-clockwise"],
    ["✓","check-lg"],["←","arrow-left"],["→","arrow-right"]
  ]);
  const emojiPattern=/🔐|🏠|🔔|🧹|⚡|👥|💳|👑|🧾|☁️|📋|✨|🚽|🧼|🪣|🧺|🗑️|👤|💰|🔓|🔒|⚠️|⏳|✅|🟢|⚪|🔴|📅|🗓️|🚫|🏡|💧|💡|📊|📈|📉|🔄|↻|✓|←|→/g;

  function ensureIconStyles(){
    if(!document.querySelector('link[data-bootstrap-icons="1"]')){
      const link=document.createElement("link");
      link.rel="stylesheet";link.href=BOOTSTRAP_ICONS_CSS;link.crossOrigin="anonymous";link.dataset.bootstrapIcons="1";document.head.appendChild(link);
    }
    if(!document.querySelector('link[data-icon-polish="1"]')){
      const link=document.createElement("link");
      link.rel="stylesheet";link.href=`./icon-polish.css?v=${ICON_CSS_VERSION}`;link.dataset.iconPolish="1";document.head.appendChild(link);
    }
  }
  function icon(name){return `<i class="bi bi-${name}" aria-hidden="true"></i>`;}
  function createIcon(name){const el=document.createElement("i");el.className=`bi bi-${name} app-bi`;el.setAttribute("aria-hidden","true");return el;}
  function isPetUi(element){return !!element?.closest?.(".p708-pet,.floating-pet-host,.pet-garden-card,.pet-mini-bubble,[class*='pet-stage'],[class*='pet-visual']");}
  function replaceTextIcons(root=document.body){
    if(!root)return;
    const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT,{acceptNode(node){
      const parent=node.parentElement;if(!parent)return NodeFilter.FILTER_REJECT;
      emojiPattern.lastIndex=0;if(!emojiPattern.test(node.nodeValue||""))return NodeFilter.FILTER_REJECT;emojiPattern.lastIndex=0;
      if(parent.closest("script,style,textarea,input,select,option,code,pre")||parent.closest(".bi")||isPetUi(parent))return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    }});
    const nodes=[];while(walker.nextNode())nodes.push(walker.currentNode);
    for(const node of nodes){
      const value=node.nodeValue||"";emojiPattern.lastIndex=0;let match,last=0,changed=false;const frag=document.createDocumentFragment();
      while((match=emojiPattern.exec(value))){
        const name=iconMap.get(match[0]);if(!name)continue;changed=true;
        if(match.index>last)frag.append(document.createTextNode(value.slice(last,match.index)));
        frag.append(createIcon(name));last=match.index+match[0].length;
      }
      if(!changed)continue;if(last<value.length)frag.append(document.createTextNode(value.slice(last)));node.replaceWith(frag);
    }
  }
  function replaceKpis(){const mapping=[["#kpiMembers","people-fill"],["#kpiTasks","clipboard2-check-fill"],["#kpiUnpaid","credit-card-2-front-fill"],["#kpiPending","bell-fill"]];for(const [valueSelector,iconName] of mapping){const value=document.querySelector(valueSelector),box=value?.closest(".kpi-card")?.querySelector(".kpi-icon");if(box&&!box.querySelector(".bi"))box.innerHTML=icon(iconName);}}
  function replaceModuleIcons(){const mapping={cleaning:"brush-fill",billing:"lightning-charge-fill",audit:"receipt-cutoff"};document.querySelectorAll(".module-card").forEach(card=>{const key=card.classList.contains("cleaning-card")?"cleaning":card.classList.contains("billing-card")?"billing":card.classList.contains("audit-card")?"audit":null;const box=card.querySelector(".module-icon");if(key&&box&&!box.querySelector(".bi"))box.innerHTML=icon(mapping[key]);});}
  function replaceBottomNav(){const configs=[{page:"home",icon:"house-door-fill",label:"Trang chủ"},{page:"cleaning",icon:"brush-fill",label:"Trực nhật"},{page:"billing",icon:"lightning-charge-fill",label:"Điện nước"}];const candidates=[...document.querySelectorAll("nav button,[class*='bottom'] button,.mobile-nav button")];for(const cfg of configs){const btn=candidates.find(el=>el.dataset.go===cfg.page||el.dataset.page===cfg.page||el.getAttribute("data-page-target")===cfg.page||el.textContent.includes(cfg.label));if(!btn||btn.dataset.iconPolished==="1")continue;btn.dataset.iconPolished="1";btn.classList.add("polished-nav-icon");btn.innerHTML=`<span class="polished-nav-glyph">${icon(cfg.icon)}</span><span>${cfg.label}</span>`;}}
  function polishActionIcons(){const map={"👤":"person-fill","🧹":"brush-fill","💰":"cash-stack","🔓":"unlock-fill","⚠️":"exclamation-triangle-fill","⏳":"hourglass-split","💳":"credit-card-2-front-fill","✅":"check-circle-fill","🔔":"bell-fill","📋":"clipboard2-fill"};document.querySelectorAll(".action-icon").forEach(box=>{const name=map[box.textContent.trim()];if(name)box.innerHTML=icon(name);});}
  function polish(){ensureIconStyles();replaceKpis();replaceModuleIcons();replaceBottomNav();polishActionIcons();replaceTextIcons();}
  let scheduled=false;const schedule=()=>{if(scheduled)return;scheduled=true;requestAnimationFrame(()=>{scheduled=false;polish();});};
  const observer=new MutationObserver(schedule);observer.observe(document.documentElement,{childList:true,subtree:true,characterData:true});
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",polish,{once:true});else polish();
  globalThis.P708PolishIcons=polish;
})();
