(()=>{
  const S=globalThis.P708CleaningStreak;
  if(!S||typeof renderCleaning!=="function")return;

  const POSITION_KEY_PREFIX="p708_floating_pet_position_v2";
  let selectedMemberId=null;
  let suppressClickUntil=0;

  function ensureStyles(){
    if(document.querySelector('link[data-cleaning-pet="1"]'))return;
    const link=document.createElement("link");
    link.rel="stylesheet";
    link.href="./cleaning-pet.css?v=20260907-2";
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

  function currentMember(){
    const mine=typeof myMemberId==="function"?myMemberId():null;
    if(!selectedMemberId||!state.members.some(m=>m.id===selectedMemberId)){
      selectedMemberId=mine||state.members[0]?.id||null;
    }
    return state.members.find(m=>m.id===selectedMemberId)||null;
  }

  function petFace(stage,memberName,large=false){
    const safe=esc(memberName||"Pet P708");
    return `<div class="p708-pet stage-${stage.level} ${large?"pet-large":""}" data-pet-touch="1" role="img" aria-label="Pet của ${safe}">
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
    host.setAttribute("aria-label","Mini pet streak trực nhật");
    host.innerHTML=`
      <div class="pet-float-orb" id="petFloatOrb" role="button" tabindex="0" aria-label="Mở Mini Pet">
        <div id="petFloatVisual"></div>
        <span class="pet-float-fire" id="petFloatFire">🔥 0</span>
        <span class="pet-drag-hint" aria-hidden="true">⋮⋮</span>
        <div class="pet-hearts" id="petFloatHearts" aria-hidden="true"></div>
      </div>
      <section class="pet-float-card" id="petFloatCard" aria-hidden="true">
        <div class="pet-float-card-head">
          <div><span>STREAK PET</span><b id="petFloatOwner">Pet P708</b></div>
          <button class="pet-icon-button" id="petFloatClose" type="button" aria-label="Đóng">×</button>
        </div>
        <div class="pet-float-card-body">
          <div class="pet-popup-scene" id="petPopupScene"></div>
          <div class="pet-popup-copy">
            <h4 id="petFloatStage">Trứng</h4>
            <p id="petFloatStatus">Chưa có dữ liệu</p>
            <div class="pet-progress"><span id="petFloatProgress"></span></div>
            <small id="petFloatNext">Còn 1 tuần để tiến hóa</small>
          </div>
        </div>
        <div class="pet-popup-stats">
          <span><b id="petFloatCurrent">0</b> streak</span>
          <span><b id="petFloatBest">0</b> cao nhất</span>
          <span><b id="petFloatGood">0</b> tuần tốt</span>
        </div>
        <div class="pet-popup-actions">
          <button class="btn small soft" id="petFloatTouch" type="button">💗 Vuốt bé</button>
          <button class="btn small primary" id="petFloatGarden" type="button">🌿 Vườn pet</button>
        </div>
      </section>`;
    document.body.appendChild(host);
    bindWidgetEvents(host);
    restorePosition(host);
    return host;
  }

  function viewportBounds(host,x,y){
    const rect=host.getBoundingClientRect();
    const width=rect.width||76,height=76,margin=10;
    const reservedBottom=Math.max(88,Number.parseInt(getComputedStyle(document.documentElement).getPropertyValue("--pet-safe-bottom"))||88);
    const maxX=Math.max(margin,window.innerWidth-width-margin);
    const maxY=Math.max(margin,window.innerHeight-height-reservedBottom-margin);
    return {
      x:Math.max(margin,Math.min(maxX,x)),
      y:Math.max(margin,Math.min(maxY,y)),
      maxX,maxY
    };
  }

  function applyPosition(host,x,y,{save=false,snap=false}={}){
    const bounded=viewportBounds(host,x,y);
    let nextX=bounded.x;
    if(snap)nextX=bounded.x<window.innerWidth/2?10:bounded.maxX;
    host.style.left=`${nextX}px`;
    host.style.top=`${bounded.y}px`;
    host.style.right="auto";
    host.style.bottom="auto";
    const rightSide=nextX>=window.innerWidth/2;
    host.classList.toggle("dock-right",rightSide);
    host.classList.toggle("dock-left",!rightSide);
    host.classList.toggle("dock-top",bounded.y<300);
    if(save){
      try{localStorage.setItem(storageKey(),JSON.stringify({x:nextX,y:bounded.y}));}catch{}
    }
  }

  function restorePosition(host){
    let saved=null;
    try{saved=JSON.parse(localStorage.getItem(storageKey())||"null");}catch{}
    requestAnimationFrame(()=>{
      if(saved&&Number.isFinite(saved.x)&&Number.isFinite(saved.y)){
        applyPosition(host,saved.x,saved.y);
      }else{
        const rect=host.getBoundingClientRect();
        applyPosition(host,window.innerWidth-(rect.width||76)-16,window.innerHeight-190);
      }
    });
  }

  function setOpen(open){
    const host=document.querySelector("#floatingPetHost"),card=document.querySelector("#petFloatCard");
    if(!host||!card)return;
    host.classList.toggle("pet-open",!!open);
    card.setAttribute("aria-hidden",open?"false":"true");
  }

  function animatePet(){
    const pet=document.querySelector("#petFloatVisual .p708-pet");
    const hearts=document.querySelector("#petFloatHearts");
    if(!pet||!hearts)return;
    pet.classList.remove("pet-bounce");
    void pet.offsetWidth;
    pet.classList.add("pet-bounce");
    hearts.innerHTML="<i>💗</i><i>✨</i><i>💖</i>";
    setTimeout(()=>{hearts.innerHTML="";pet.classList.remove("pet-bounce");},900);
  }

  function openGarden(){
    if(typeof showPage==="function")showPage("home");
    setOpen(false);
    setTimeout(()=>document.querySelector("#homePetGarden")?.scrollIntoView({behavior:"smooth",block:"center"}),120);
  }

  function bindWidgetEvents(host){
    const orb=host.querySelector("#petFloatOrb");
    const close=host.querySelector("#petFloatClose");
    const touch=host.querySelector("#petFloatTouch");
    const garden=host.querySelector("#petFloatGarden");
    let drag=null;

    orb.addEventListener("pointerdown",event=>{
      if(event.button!==undefined&&event.button!==0)return;
      const rect=host.getBoundingClientRect();
      drag={pointerId:event.pointerId,startX:event.clientX,startY:event.clientY,offsetX:event.clientX-rect.left,offsetY:event.clientY-rect.top,moved:false};
      orb.setPointerCapture?.(event.pointerId);
      host.classList.add("pet-dragging");
    });
    orb.addEventListener("pointermove",event=>{
      if(!drag||event.pointerId!==drag.pointerId)return;
      const distance=Math.hypot(event.clientX-drag.startX,event.clientY-drag.startY);
      if(distance>5)drag.moved=true;
      if(!drag.moved)return;
      event.preventDefault();
      applyPosition(host,event.clientX-drag.offsetX,event.clientY-drag.offsetY);
    });
    const finishDrag=event=>{
      if(!drag||event.pointerId!==drag.pointerId)return;
      const moved=drag.moved;
      drag=null;
      host.classList.remove("pet-dragging");
      const rect=host.getBoundingClientRect();
      if(moved){
        applyPosition(host,rect.left,rect.top,{save:true,snap:true});
        suppressClickUntil=Date.now()+350;
      }
    };
    orb.addEventListener("pointerup",finishDrag);
    orb.addEventListener("pointercancel",finishDrag);
    orb.addEventListener("click",()=>{
      if(Date.now()<suppressClickUntil)return;
      animatePet();
      setOpen(!host.classList.contains("pet-open"));
    });
    orb.addEventListener("keydown",event=>{
      if(event.key!=="Enter"&&event.key!==" ")return;
      event.preventDefault();animatePet();setOpen(!host.classList.contains("pet-open"));
    });
    close?.addEventListener("click",()=>setOpen(false));
    touch?.addEventListener("click",animatePet);
    garden?.addEventListener("click",openGarden);
    window.addEventListener("resize",()=>{
      const rect=host.getBoundingClientRect();
      applyPosition(host,rect.left,rect.top,{save:true});
    },{passive:true});
  }

  function refreshWidget(){
    ensureStyles();
    document.querySelector("#cleaningPetPanel")?.remove();
    const host=ensureWidget();
    const member=currentMember();
    const active=authSession?.status==="active"&&member;
    host.classList.toggle("pet-hidden",!active);
    if(!active)return;

    const stats=statsFor(member),stage=S.petStage(stats.current),progress=S.petProgress(stats.current);
    const nextText=stage.next==null?"Đã đạt cấp cao nhất":`Còn ${Math.max(0,stage.next-stats.current)} tuần để pet tiến hóa`;
    host.querySelector("#petFloatVisual").innerHTML=petFace(stage,member.name,false);
    host.querySelector("#petPopupScene").innerHTML=petFace(stage,member.name,true);
    host.querySelector("#petFloatFire").textContent=`🔥 ${stats.current}`;
    host.querySelector("#petFloatOwner").textContent=`Pet của ${member.name}`;
    host.querySelector("#petFloatStage").textContent=stage.name;
    host.querySelector("#petFloatStatus").textContent=S.streakStatusLabel(stats.status);
    host.querySelector("#petFloatProgress").style.width=`${progress}%`;
    host.querySelector("#petFloatNext").textContent=nextText;
    host.querySelector("#petFloatCurrent").textContent=stats.current;
    host.querySelector("#petFloatBest").textContent=stats.best;
    host.querySelector("#petFloatGood").textContent=stats.completedWeeks;
    host.querySelector("#petFloatOrb").setAttribute("aria-label",`Pet của ${member.name}, streak ${stats.current} tuần. Chạm để mở, kéo để di chuyển.`);
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

  function selectMember(memberId,{open=false}={}){
    if(!state.members.some(m=>m.id===memberId))return;
    selectedMemberId=memberId;
    refreshWidget();
    if(open)setOpen(true);
  }

  const baseRenderCleaning=renderCleaning;
  renderCleaning=function(){
    baseRenderCleaning();
    decorateMemberRows();
    refreshWidget();
  };

  if(typeof renderHome==="function"){
    const baseRenderHomePet=renderHome;
    renderHome=function(){baseRenderHomePet();refreshWidget();};
  }

  globalThis.P708PetWidget={refresh:refreshWidget,selectMember,open:()=>setOpen(true),close:()=>setOpen(false),touch:animatePet};
  ensureStyles();
})();
