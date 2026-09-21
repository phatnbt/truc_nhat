(()=>{
  const S=globalThis.P708CleaningStreak;
  if(!S||typeof renderCleaning!=="function")return;

  const POSITION_KEY_PREFIX="p708_floating_pet_position_v5";
  let suppressClickUntil=0,bubbleTimer=0,lastCelebratedStage=-1;

  function ensureStyles(){
    if(document.querySelector('link[data-cleaning-pet="1"]'))return;
    const link=document.createElement("link");link.rel="stylesheet";link.href="./cleaning-pet.css?v=20260921-5";link.dataset.cleaningPet="1";document.head.appendChild(link);
  }
  function storageKey(){return `${POSITION_KEY_PREFIX}:${authSession?.user?.uid||"local"}`;}
  function ownMemberId(){return typeof myMemberId==="function"?myMemberId():null;}
  function currentMember(){const id=ownMemberId();return id?state.members.find(member=>member.id===id)||null:null;}
  function currentStatus(){return S.normalizePetStatus(petStatus||{});}
  function petFace(stage,memberName,size="float"){
    const safe=esc(memberName||"Streak Pet P708"),asset=esc(stage?.asset||S.PET_STAGES[0].asset);
    return `<div class="p708-pet stage-${stage?.level||0} pet-${size}" data-pet-touch="1" role="img" aria-label="${esc(stage?.name||"Streak Pet")} của ${safe}"><span class="pet-aura"></span><img src="${asset}" alt="" draggable="false"><span class="pet-shadow"></span></div>`;
  }
  function collectionMarkup(xp){
    return S.stageCollection(xp).map(stage=>`<div class="pet-evolution-item ${stage.unlocked?"unlocked":"locked"}" aria-label="${esc(stage.name)} ${stage.unlocked?"đã mở khóa":`mở ở ${stage.threshold} XP`}"><span>${petFace(stage,"Bộ sưu tập","collection")}</span><b>${esc(stage.name)}</b><small>${stage.unlocked?"Đã mở khóa":`${stage.threshold} XP`}</small></div>`).join("");
  }
  function ensureWidget(){
    let host=document.querySelector("#floatingPetHost");if(host)return host;
    host=document.createElement("aside");host.id="floatingPetHost";host.className="floating-pet-host dock-right";host.setAttribute("aria-label","Streak Pet của tôi");
    host.innerHTML=`<button class="pet-float-orb" id="petFloatOrb" type="button" aria-label="Mở Streak Pet"><span class="pet-float-visual" id="petFloatVisual"></span><span class="pet-float-fire" id="petFloatFire">🔥0</span><span class="pet-hearts" id="petFloatHearts" aria-hidden="true"></span></button><section class="pet-dashboard" id="petDashboard" aria-label="Thông tin Streak Pet"><div class="pet-dashboard-head"><div><p>STREAK PET</p><h2 id="petOwnerName">Pet của tôi</h2></div><button class="pet-close" id="petCloseButton" type="button" aria-label="Đóng">✕</button></div><div class="pet-status-banner" id="petStatusBanner" aria-live="polite"></div><div class="pet-hero"><div class="pet-hero-visual" id="petHeroVisual"></div><div class="pet-hero-copy"><span id="petStageName">Mầm Mây</span><strong id="petStreakValue">🔥 0 ngày</strong><small id="petBestStreak">Kỷ lục 0 ngày</small></div></div><div class="pet-xp-row"><span><b id="petXpValue">0 XP</b><small id="petNextStage">Còn 100 XP</small></span><b id="petProgressPercent">0%</b></div><div class="pet-progress" role="progressbar" aria-label="Tiến độ tiến hóa" aria-valuemin="0" aria-valuemax="100"><i id="petProgressBar"></i></div><div class="pet-next-preview" id="petNextPreview" aria-label="Hình dạng tiếp theo"></div><button class="btn primary pet-checkin-button" id="petCheckInButton" type="button">Điểm danh +20 XP</button><p class="pet-rule-note">Mỗi ngày tối đa 20 XP. Báo hoàn thành một việc trực hợp lệ để điểm danh.</p><div class="pet-collection-title"><b>Bộ sưu tập tiến hóa</b><span>0 · 100 · 300 · 700 XP</span></div><div class="pet-evolution-grid" id="petEvolutionGrid"></div><div class="pet-levelup" id="petLevelUp" aria-live="assertive"><span>✨</span><b>Tiến hóa mới!</b></div></section>`;
    document.body.appendChild(host);bindWidgetEvents(host);restorePosition(host);return host;
  }
  function viewportBounds(host,x,y){
    const rect=host.getBoundingClientRect(),width=rect.width||58,height=rect.height||58,margin=8,reservedBottom=Math.max(86,Number.parseInt(getComputedStyle(document.documentElement).getPropertyValue("--pet-safe-bottom"))||86);
    const maxX=Math.max(margin,window.innerWidth-width-margin),maxY=Math.max(margin,window.innerHeight-height-reservedBottom-margin);
    return {x:Math.max(margin,Math.min(maxX,x)),y:Math.max(margin,Math.min(maxY,y)),maxX,maxY};
  }
  function setTransform(host,x,y){host.dataset.petX=String(x);host.dataset.petY=String(y);host.style.setProperty("--pet-x",`${x}px`);host.style.setProperty("--pet-y",`${y}px`);}
  function applyPosition(host,x,y,{save=false,snap=false,animate=false}={}){
    const bounded=viewportBounds(host,x,y),nextX=snap?(bounded.x<window.innerWidth/2?8:bounded.maxX):bounded.x;
    if(animate){host.classList.add("pet-snapping");clearTimeout(host._petSnapTimer);host._petSnapTimer=setTimeout(()=>host.classList.remove("pet-snapping"),260);}
    setTransform(host,nextX,bounded.y);host.classList.toggle("dock-right",nextX>=window.innerWidth/2);host.classList.toggle("dock-left",nextX<window.innerWidth/2);
    if(save)try{localStorage.setItem(storageKey(),JSON.stringify({x:nextX,y:bounded.y}));}catch{}
  }
  function restorePosition(host){let saved=null;try{saved=JSON.parse(localStorage.getItem(storageKey())||"null");}catch{}requestAnimationFrame(()=>saved&&Number.isFinite(saved.x)&&Number.isFinite(saved.y)?applyPosition(host,saved.x,saved.y):applyPosition(host,window.innerWidth-(host.offsetWidth||58)-12,Math.max(80,window.innerHeight-176)));}
  function animatePet(levelUp=false){
    const pet=document.querySelector("#petFloatVisual .p708-pet"),hearts=document.querySelector("#petFloatHearts");if(!pet||!hearts)return;
    pet.classList.remove("pet-hop","pet-level-burst");void pet.offsetWidth;pet.classList.add(levelUp?"pet-level-burst":"pet-hop");hearts.innerHTML=levelUp?"<i>⭐</i><i>✨</i><i>🌟</i>":"<i>💗</i><i>✨</i><i>💖</i>";setTimeout(()=>{hearts.innerHTML="";pet.classList.remove("pet-hop","pet-level-burst");},1100);
  }
  function toggleDashboard(force){const dashboard=document.querySelector("#petDashboard");if(!dashboard)return;dashboard.classList.toggle("open",force===undefined?!dashboard.classList.contains("open"):!!force);}
  function bindWidgetEvents(host){
    const orb=host.querySelector("#petFloatOrb");let drag=null,frame=0;
    const flush=()=>{frame=0;if(drag?.moved)applyPosition(host,drag.nextX,drag.nextY);};
    orb.addEventListener("pointerdown",event=>{if(event.button!==undefined&&event.button!==0)return;drag={pointerId:event.pointerId,startX:event.clientX,startY:event.clientY,baseX:Number(host.dataset.petX)||0,baseY:Number(host.dataset.petY)||0,nextX:0,nextY:0,moved:false};orb.setPointerCapture?.(event.pointerId);host.classList.add("pet-dragging");});
    orb.addEventListener("pointermove",event=>{if(!drag||event.pointerId!==drag.pointerId)return;const dx=event.clientX-drag.startX,dy=event.clientY-drag.startY;if(Math.hypot(dx,dy)>4)drag.moved=true;if(!drag.moved)return;event.preventDefault();drag.nextX=drag.baseX+dx;drag.nextY=drag.baseY+dy;if(!frame)frame=requestAnimationFrame(flush);});
    const finish=event=>{if(!drag||event.pointerId!==drag.pointerId)return;if(frame){cancelAnimationFrame(frame);frame=0;flush();}const moved=drag.moved,x=Number(host.dataset.petX)||drag.nextX,y=Number(host.dataset.petY)||drag.nextY;drag=null;host.classList.remove("pet-dragging");if(moved){applyPosition(host,x,y,{save:true,snap:true,animate:true});suppressClickUntil=Date.now()+320;}};
    orb.addEventListener("pointerup",finish);orb.addEventListener("pointercancel",finish);orb.addEventListener("click",()=>{if(Date.now()<suppressClickUntil)return;animatePet();toggleDashboard();});
    host.querySelector("#petCloseButton").addEventListener("click",()=>toggleDashboard(false));
    host.querySelector("#petHeroVisual").addEventListener("click",()=>animatePet());
    host.querySelector("#petCheckInButton").addEventListener("click",async()=>{try{await realtimeEngine?.checkInPet?.(currentStatus().eligibleActivityId);toast("Đã điểm danh Streak Pet +20 XP");}catch(error){toast(error?.message||"Không thể điểm danh",5000);}});
    window.addEventListener("resize",()=>applyPosition(host,Number(host.dataset.petX)||0,Number(host.dataset.petY)||0,{save:true}),{passive:true});
  }
  function refreshWidget(){
    ensureStyles();const host=ensureWidget(),member=currentMember(),active=authSession?.status==="active"&&member;host.classList.toggle("pet-hidden",!active);if(!active)return;
    const status=currentStatus(),profile=status.profile,stage=profile.stage||S.petStage(profile.xp),progress=S.petProgress(profile.xp),remaining=S.xpToNextStage(profile.xp);
    host.querySelector("#petFloatVisual").innerHTML=petFace(stage,member.name,"float");host.querySelector("#petFloatFire").textContent=`🔥${profile.currentStreak}`;host.querySelector("#petOwnerName").textContent=`Pet của ${member.name}`;host.querySelector("#petHeroVisual").innerHTML=petFace(stage,member.name,"hero");host.querySelector("#petStageName").textContent=stage.name;host.querySelector("#petStreakValue").textContent=`🔥 ${profile.currentStreak} ngày`;host.querySelector("#petBestStreak").textContent=`Kỷ lục ${profile.bestStreak} ngày`;host.querySelector("#petXpValue").textContent=`${profile.xp} XP`;host.querySelector("#petNextStage").textContent=stage.next?`Còn ${remaining} XP để thành ${stage.next.name}`:"Đã đạt hình dạng tối đa";host.querySelector("#petProgressPercent").textContent=`${progress}%`;host.querySelector("#petProgressBar").style.width=`${progress}%`;host.querySelector(".pet-progress").setAttribute("aria-valuenow",String(progress));const nextPreview=host.querySelector("#petNextPreview");nextPreview.hidden=!stage.next;nextPreview.innerHTML=stage.next?`${petFace(stage.next,"Hình dạng tiếp theo","collection")}<span><small>Hình dạng tiếp theo</small><b>${esc(stage.next.name)}</b><em>${stage.next.threshold} XP</em></span>`:"";host.querySelector("#petEvolutionGrid").innerHTML=collectionMarkup(profile.xp);
    const banner=host.querySelector("#petStatusBanner"),button=host.querySelector("#petCheckInButton");banner.className="pet-status-banner";button.disabled=true;button.hidden=false;
    if(status.mode==="loading"){banner.classList.add("loading");banner.textContent="Đang đồng bộ Streak Pet…";button.textContent="Đang xử lý…";}
    else if(status.mode==="error"){banner.classList.add("error");banner.textContent=status.error||"Lỗi mạng khi tải Streak Pet";button.disabled=!status.eligibleActivityId;button.textContent="Thử điểm danh lại";}
    else if(status.checkedInToday){banner.classList.add("success");banner.textContent=status.awarded?`Điểm danh thành công +${status.xpAwarded||20} XP`:"Đã điểm danh hôm nay";button.hidden=true;}
    else if(status.canCheckIn){banner.classList.add("ready");banner.textContent="Hoạt động hợp lệ đã sẵn sàng";button.disabled=false;button.textContent="Nhận 20 XP hôm nay";}
    else{banner.textContent="Báo hoàn thành việc trực để nhận 20 XP";button.textContent="Chưa thể điểm danh";}
    host.querySelector("#petFloatOrb").setAttribute("aria-label",`${stage.name}, ${profile.xp} XP, streak ${profile.currentStreak} ngày. Chạm để mở, kéo để di chuyển.`);
    if(status.leveledUp&&stage.level>lastCelebratedStage){lastCelebratedStage=stage.level;const level=host.querySelector("#petLevelUp");level.classList.add("show");toggleDashboard(true);animatePet(true);setTimeout(()=>level.classList.remove("show"),2200);}
  }
  function decorateMemberRows(){
    const mine=ownMemberId(),status=currentStatus();document.querySelector("#cleanMemberList")?.querySelectorAll(".member-row")?.forEach((row,index)=>{const member=state.members[index],target=row.querySelector("div small");if(!member||!target)return;target.querySelector(".member-streak-chip")?.remove();if(member.id!==mine)return;const chip=document.createElement("span");chip.className="member-streak-chip";chip.textContent=` · 🔥 ${status.profile.currentStreak} ngày · ${status.profile.xp} XP`;target.appendChild(chip);});
  }
  const baseRenderCleaning=renderCleaning;renderCleaning=function(){baseRenderCleaning();decorateMemberRows();refreshWidget();};
  if(typeof renderHome==="function"){const baseRenderHome=renderHome;renderHome=function(){baseRenderHome();refreshWidget();};}
  globalThis.P708PetWidget={refresh:refreshWidget,open:()=>toggleDashboard(true),close:()=>toggleDashboard(false),touch:()=>animatePet(),renderFace:petFace};
  ensureStyles();
})();
