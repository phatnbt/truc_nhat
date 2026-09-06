(()=>{
  const S=globalThis.P708CleaningStreak;
  if(!S||typeof renderCleaning!=="function")return;

  let selectedMemberId=null;
  const baseRenderCleaning=renderCleaning;

  function ensureStyles(){
    if(document.querySelector('link[data-cleaning-pet="1"]'))return;
    const link=document.createElement("link");
    link.rel="stylesheet";
    link.href="./cleaning-pet.css?v=20260907-1";
    link.dataset.cleaningPet="1";
    document.head.appendChild(link);
  }

  function statsFor(member){
    return S.memberStreak({schedules:state.schedules,member,now:Date.now()});
  }

  function ensurePanel(){
    const host=$("#cleanMemberList")?.parentElement;
    if(!host)return null;
    let panel=$("#cleaningPetPanel");
    if(panel)return panel;
    panel=document.createElement("section");
    panel.id="cleaningPetPanel";
    panel.className="pet-streak-panel";
    panel.setAttribute("aria-label","Mini pet streak trực nhật");
    host.appendChild(panel);
    return panel;
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

  function selectedMember(){
    const mine=myMemberId?.();
    if(!selectedMemberId||!state.members.some(m=>m.id===selectedMemberId))selectedMemberId=mine||state.members[0]?.id||null;
    return state.members.find(m=>m.id===selectedMemberId)||null;
  }

  function renderPanel(){
    ensureStyles();
    const panel=ensurePanel();
    if(!panel)return;
    const members=state.members||[];
    if(!members.length){
      panel.innerHTML='<div class="pet-empty">🥚 Thêm thành viên để bắt đầu nuôi pet streak.</div>';
      return;
    }

    const member=selectedMember();
    const stats=statsFor(member);
    const stage=S.petStage(stats.current);
    const progress=S.petProgress(stats.current);
    const nextText=stage.next==null?"Đã đạt cấp cao nhất":`Còn ${Math.max(0,stage.next-stats.current)} tuần để pet tiến hóa`;
    const garden=members.map(m=>{
      const st=statsFor(m),sg=S.petStage(st.current),mine=m.id===myMemberId?.();
      return `<button class="pet-member ${m.id===member.id?"active":""}" data-pet-member="${m.id}" type="button" aria-pressed="${m.id===member.id}">
        <span class="pet-member-avatar">${sg.emoji}</span>
        <span><b>${esc(m.name)}${mine?" · Bạn":""}</b><small>🔥 ${st.current} tuần · ${esc(sg.name)}</small></span>
      </button>`;
    }).join("");

    panel.innerHTML=`
      <div class="pet-panel-head"><div><p class="pet-eyebrow">STREAK PET</p><h3>Nuôi bé bằng tuần trực tốt</h3></div><span class="pet-fire">🔥 ${stats.current}</span></div>
      <div class="pet-hero-card">
        <div class="pet-scene">${petFace(stage,member.name,true)}<div class="pet-hearts" id="petHearts" aria-hidden="true"></div></div>
        <div class="pet-copy">
          <span class="pet-owner">Pet của ${esc(member.name)}</span>
          <h4>${esc(stage.name)}</h4>
          <p>${esc(S.streakStatusLabel(stats.status))}</p>
          <div class="pet-progress"><span style="width:${progress}%"></span></div>
          <small>${esc(nextText)}</small>
          <div class="pet-stats"><span><b>${stats.current}</b> streak</span><span><b>${stats.best}</b> cao nhất</span><span><b>${stats.completedWeeks}</b> tuần tốt</span></div>
          <button class="btn small soft pet-touch-button" id="petTouchButton" type="button">💗 Vuốt bé</button>
        </div>
      </div>
      <div class="pet-rule-note"><b>Luật streak:</b> hoàn thành toàn bộ việc được giao trong tuần = +1. Tuần vắng hoặc không được giao việc sẽ đóng băng, không làm mất streak. Tuần đã kết thúc mà còn việc chưa xong mới làm streak về 0.</div>
      <div class="pet-garden-title"><b>Vườn pet P708</b><small>Chạm một thành viên để xem pet</small></div>
      <div class="pet-garden">${garden}</div>`;

    panel.querySelectorAll('[data-pet-member]').forEach(btn=>btn.addEventListener("click",()=>{
      selectedMemberId=btn.dataset.petMember;
      renderPanel();
    }));
    panel.querySelector("#petTouchButton")?.addEventListener("click",animatePet);
    panel.querySelector('[data-pet-touch]')?.addEventListener("click",animatePet);
  }

  function animatePet(){
    const pet=$("#cleaningPetPanel")?.querySelector(".p708-pet");
    const hearts=$("#petHearts");
    if(!pet||!hearts)return;
    pet.classList.remove("pet-bounce");
    void pet.offsetWidth;
    pet.classList.add("pet-bounce");
    hearts.innerHTML='<i>💗</i><i>✨</i><i>💖</i>';
    setTimeout(()=>{hearts.innerHTML="";pet.classList.remove("pet-bounce");},900);
  }

  function decorateMemberRows(){
    const rows=$("#cleanMemberList")?.querySelectorAll(".member-row")||[];
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

  renderCleaning=function(){
    baseRenderCleaning();
    decorateMemberRows();
    renderPanel();
  };

  ensureStyles();
})();
