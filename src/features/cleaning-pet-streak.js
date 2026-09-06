(()=>{
  const S=globalThis.P708CleaningStreak;
  if(!S||typeof renderCleaning!=="function")return;

  const POSITION_KEY_PREFIX="p708_floating_pet_position_v4";
  let suppressClickUntil=0;
  let reactionIndex=0;
  let bubbleTimer=0;

  function ensureStyles(){
    if(document.querySelector('link[data-cleaning-pet="1"]'))return;
    const link=document.createElement("link");
    link.rel="stylesheet";
    link.href="./cleaning-pet.css?v=20260907-4";
    link.dataset.cleaningPet="1";
    document.head.appendChild(link);
  }

  function storageKey(){
    const uid=authSession?.user?.uid||"local";
    return `${POSITION_KEY_PREFIX}:${uid}`;
  }

  function statsFor(member){
    return S.memberStreak({schedules:state.schedules,member,now:Date.now()});
  }

  function ownMemberId(){
    return typeof myMemberId==="function"?myMemberId():null;
  }

  function currentMember(){
    const mine=ownMemberId();
    if(!mine)return null;
    return state.members.find(m=>m.id===mine)||null;
  }

  function petFace(stage,memberName,size="float"){
    const safe=esc(memberName||"Pet P708");
    return `<div class="p708-pet stage-${stage.level} pet-${size}" data-pet-touch="1" role="img" aria-label="Pet của ${safe}">
      <span class="pet-aura"></span>
      <span class="pet-ears"><i></i><i></i></span>
      <span class="pet-body"><i class="pet-eye left"></i><i class="pet-eye right"></i><i class="pet-mouth"></i><i class="pet-cheek left"></i><i class="pet-cheek right"></i><b>${stage.emoji}</b></span>
      <span class="pet-shadow"></span>
    </div>`;
  }

  function ensureWidget(){
    let host=document.querySelector("#floatingPetHost");
    if(host)return host;
    host=document.createElement("aside");
    host.id="floatingPetHost";
    host.className="floating-pet-host dock-right";
    host.setAttribute("aria-label","Mini pet streak trực nhật của tôi");
    host.innerHTML=`
      <button class="pet-float-orb" id="petFloatOrb" type="button" aria-label="Mini pet của tôi">
        <span class="pet-float-visual" id="petFloatVisual"></span>
        <span class="pet-float-fire" id="petFloatFire">🔥0</span>
        <span class="pet-hearts" id="petFloatHearts" aria-hidden="true"></span>
        <span class="pet-sparkles" aria-hidden="true"><i></i><i></i><i></i></span>
      </button>
      <div class="pet-mini-bubble" id="petMiniBubble" aria-live="polite">
        <b id="petMiniOwner">Pet của tôi</b><span id="petMiniStatus">🔥 0 streak</span>
      </div>`;
    document.body.appendChild(host);
    bindWidgetEvents(host);
    restorePosition(host);
    return host;
  }

  function viewportBounds(host,x,y){
    const rect=host.getBoundingClientRect();
    const width=rect.width||58,height=rect.height||58,margin=8;
    const reservedBottom=Math.max(86,Number.parseInt(getComputedStyle(document.documentElement).getPropertyValue("--pet-safe-bottom"))||86);
    const maxX=Math.max(margin,window.innerWidth-width-margin);
    const maxY=Math.max(margin,window.innerHeight-height-reservedBottom-margin);
    return {x:Math.max(margin,Math.min(maxX,x)),y:Math.max(margin,Math.min(maxY,y)),maxX,maxY};
  }

  function setTransform(host,x,y){
    host.dataset.petX=String(x);
    host.dataset.petY=String(y);
    host.style.setProperty("--pet-x",`${x}px`);
    host.style.setProperty("--pet-y",`${y}px`);
  }

  function applyPosition(host,x,y,{save=false,snap=false,animate=false}={}){
    const bounded=viewportBounds(host,x,y);
    let nextX=bounded.x;
    if(snap)nextX=bounded.x<window.innerWidth/2?8:bounded.maxX;
    if(animate){
      host.classList.add("pet-snapping");
      clearTimeout(host._petSnapTimer);
      host._petSnapTimer=setTimeout(()=>host.classList.remove("pet-snapping"),260);
    }
    setTransform(host,nextX,bounded.y);
    const rightSide=nextX>=window.innerWidth/2;
    host.classList.toggle("dock-right",rightSide);
    host.classList.toggle("dock-left",!rightSide);
    if(save){
      try{localStorage.setItem(storageKey(),JSON.stringify({x:nextX,y:bounded.y}));}catch{}
    }
  }

  function restorePosition(host){
    let saved=null;
    try{saved=JSON.parse(localStorage.getItem(storageKey())||"null");}catch{}
    requestAnimationFrame(()=>{
      if(saved&&Number.isFinite(saved.x)&&Number.isFinite(saved.y))applyPosition(host,saved.x,saved.y);
      else applyPosition(host,window.innerWidth-(host.offsetWidth||58)-12,Math.max(80,window.innerHeight-176));
    });
  }

  function showBubble(){
    const bubble=document.querySelector("#petMiniBubble");
    if(!bubble)return;
    clearTimeout(bubbleTimer);
    bubble.classList.add("show");
    bubbleTimer=setTimeout(()=>bubble.classList.remove("show"),1500);
  }

  function animatePet(){
    const pet=document.querySelector("#petFloatVisual .p708-pet");
    const hearts=document.querySelector("#petFloatHearts");
    if(!pet||!hearts)return;
    const reactions=["pet-hop","pet-wiggle","pet-twirl","pet-nuzzle"];
    reactions.forEach(name=>pet.classList.remove(name));
    const reaction=reactions[reactionIndex++%reactions.length];
    void pet.offsetWidth;
    pet.classList.add(reaction);
    hearts.innerHTML="<i>💗</i><i>✨</i><i>💖</i>";
    setTimeout(()=>{hearts.innerHTML="";pet.classList.remove(reaction);},900);
    showBubble();
  }

  function bindWidgetEvents(host){
    const orb=host.querySelector("#petFloatOrb");
    let drag=null,frame=0;

    const flushDrag=()=>{
      frame=0;
      if(!drag||!drag.moved)return;
      applyPosition(host,drag.nextX,drag.nextY);
    };
    const queueDrag=()=>{if(!frame)frame=requestAnimationFrame(flushDrag);};

    orb.addEventListener("pointerdown",event=>{
      if(event.button!==undefined&&event.button!==0)return;
      const x=Number(host.dataset.petX)||0,y=Number(host.dataset.petY)||0;
      drag={pointerId:event.pointerId,startX:event.clientX,startY:event.clientY,baseX:x,baseY:y,nextX:x,nextY:y,moved:false};
      orb.setPointerCapture?.(event.pointerId);
      host.classList.add("pet-dragging");
    });
    orb.addEventListener("pointermove",event=>{
      if(!drag||event.pointerId!==drag.pointerId)return;
      const dx=event.clientX-drag.startX,dy=event.clientY-drag.startY;
      if(Math.hypot(dx,dy)>4)drag.moved=true;
      if(!drag.moved)return;
      event.preventDefault();
      drag.nextX=drag.baseX+dx;
      drag.nextY=drag.baseY+dy;
      queueDrag();
    });
    const finishDrag=event=>{
      if(!drag||event.pointerId!==drag.pointerId)return;
      if(frame){cancelAnimationFrame(frame);frame=0;flushDrag();}
      const moved=drag.moved;
      const x=Number(host.dataset.petX)||drag.nextX,y=Number(host.dataset.petY)||drag.nextY;
      drag=null;
      host.classList.remove("pet-dragging");
      if(moved){
        applyPosition(host,x,y,{save:true,snap:true,animate:true});
        suppressClickUntil=Date.now()+320;
      }
    };
    orb.addEventListener("pointerup",finishDrag);
    orb.addEventListener("pointercancel",finishDrag);
    orb.addEventListener("click",()=>{if(Date.now()>=suppressClickUntil)animatePet();});
    window.addEventListener("resize",()=>{
      const x=Number(host.dataset.petX)||0,y=Number(host.dataset.petY)||0;
      applyPosition(host,x,y,{save:true});
    },{passive:true});
  }

  function refreshWidget(){
    ensureStyles();
    document.querySelector("#cleaningPetPanel")?.remove();
    document.querySelector("#petFloatCard")?.remove();
    const host=ensureWidget();
    const member=currentMember();
    const active=authSession?.status==="active"&&member;
    host.classList.toggle("pet-hidden",!active);
    if(!active)return;

    const stats=statsFor(member),stage=S.petStage(stats.current);
    host.querySelector("#petFloatVisual").innerHTML=petFace(stage,member.name,"float");
    host.querySelector("#petFloatFire").textContent=`🔥${stats.current}`;
    host.querySelector("#petMiniOwner").textContent=member.name;
    host.querySelector("#petMiniStatus").textContent=`${stage.name} · 🔥 ${stats.current} streak`;
    host.querySelector("#petFloatOrb").setAttribute("aria-label",`Pet của ${member.name}, streak ${stats.current} tuần. Chạm để tương tác, kéo để di chuyển.`);
  }

  function decorateMemberRows(){
    const rows=document.querySelector("#cleanMemberList")?.querySelectorAll(".member-row")||[];
    rows.forEach((row,index)=>{
      const member=state.members[index];if(!member)return;
      const stats=statsFor(member),stage=S.petStage(stats.current);
      const target=row.querySelector("div small");
      if(!target)return;
      target.querySelector(".member-streak-chip")?.remove();
      const chip=document.createElement("span");
      chip.className="member-streak-chip";
      chip.textContent=` · ${stage.emoji} 🔥 ${stats.current}`;
      chip.title=`Streak trực nhật: ${stats.current} tuần`;
      target.appendChild(chip);
    });
  }

  function selectMember(memberId,{react=true}={}){
    const mine=ownMemberId();
    if(!mine||memberId!==mine)return false;
    if(!state.members.some(m=>m.id===mine))return false;
    refreshWidget();
    if(react)setTimeout(animatePet,0);
    return true;
  }

  const baseRenderCleaning=renderCleaning;
  renderCleaning=function(){baseRenderCleaning();decorateMemberRows();refreshWidget();};

  if(typeof renderHome==="function"){
    const baseRenderHomePet=renderHome;
    renderHome=function(){baseRenderHomePet();refreshWidget();};
  }

  globalThis.P708PetWidget={
    refresh:refreshWidget,
    selectMember,
    canCallMember:memberId=>!!ownMemberId()&&memberId===ownMemberId(),
    open:()=>{if(currentMember()){showBubble();animatePet();}},
    close:()=>document.querySelector("#petMiniBubble")?.classList.remove("show"),
    touch:()=>{if(currentMember())animatePet();},
    renderFace:petFace
  };
  ensureStyles();
})();
