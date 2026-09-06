(()=>{
  const S=globalThis.P708CleaningStreak;
  if(!S||typeof renderHome!=="function")return;

  function ensureGarden(){
    let section=document.querySelector("#homePetGarden");
    if(section)return section;
    const moduleSection=document.querySelector("#page-home .module-section");
    if(!moduleSection)return null;
    section=document.createElement("section");
    section.id="homePetGarden";
    section.className="home-pet-garden";
    section.setAttribute("aria-label","Vườn pet P708");
    moduleSection.parentElement.insertBefore(section,moduleSection);
    return section;
  }

  function statsFor(member){
    return S.memberStreak({schedules:state.schedules,member,now:Date.now()});
  }

  function renderGarden(){
    const section=ensureGarden();
    if(!section)return;
    const members=state.members||[];
    if(!members.length){
      section.innerHTML=`<div class="pet-garden-shell"><div class="pet-garden-heading"><div><p class="eyebrow">P708 PET GARDEN</p><h2>Vườn pet P708</h2><p>Thêm thành viên để bắt đầu nuôi streak pet.</p></div></div><div class="pet-garden-empty">🥚 Chưa có pet nào trong vườn.</div></div>`;
      return;
    }

    const rows=members.map(member=>{
      const stats=statsFor(member),stage=S.petStage(stats.current),progress=S.petProgress(stats.current);
      return {member,stats,stage,progress};
    });
    const best=rows.slice().sort((a,b)=>b.stats.current-a.stats.current||b.stats.best-a.stats.best)[0];
    const activeCount=rows.filter(row=>row.stats.current>0).length;
    const frozenCount=rows.filter(row=>row.stats.status==="absent").length;
    const mine=typeof myMemberId==="function"?myMemberId():null;

    section.innerHTML=`
      <div class="pet-garden-shell">
        <div class="pet-garden-heading">
          <div><p class="eyebrow">P708 PET GARDEN</p><h2>Vườn pet P708</h2><p>Mỗi tuần trực tốt giúp pet tiến hóa. Chạm vào một pet để gọi bé ra góc màn hình.</p></div>
          <div class="pet-garden-summary">
            <span><b>🔥 ${best?.stats.current||0}</b><small>streak cao nhất</small></span>
            <span><b>${activeCount}/${rows.length}</b><small>pet đang có streak</small></span>
            <span><b>❄️ ${frozenCount}</b><small>đang đóng băng</small></span>
          </div>
        </div>
        <div class="pet-garden-grid">
          ${rows.map(({member,stats,stage,progress})=>{
            const isMine=member.id===mine;
            return `<button class="pet-garden-card ${isMine?"mine":""}" type="button" data-garden-member="${member.id}">
              <div class="garden-pet-scene stage-${stage.level}">
                <span class="garden-pet-glow"></span>
                <span class="garden-pet-emoji">${stage.emoji}</span>
                <span class="garden-fire">🔥 ${stats.current}</span>
              </div>
              <div class="garden-pet-copy">
                <div class="garden-owner"><b>${esc(member.name)}</b>${isMine?'<span class="badge success">Bạn</span>':""}</div>
                <span class="garden-stage">${esc(stage.name)}</span>
                <small>${esc(S.streakStatusLabel(stats.status))}</small>
                <div class="pet-progress garden-progress"><span style="width:${progress}%"></span></div>
                <div class="garden-meta"><span>🏆 ${stats.best}</span><span>✅ ${stats.completedWeeks}</span><span>❄️ ${stats.frozenWeeks}</span></div>
              </div>
            </button>`;
          }).join("")}
        </div>
        <div class="pet-garden-foot"><span>💡 Pet nổi có thể kéo sang bất kỳ góc nào và sẽ nhớ vị trí trên thiết bị này.</span><button class="btn small soft" id="openMyPetButton" type="button">🐾 Gọi pet của tôi</button></div>
      </div>`;

    section.querySelectorAll("[data-garden-member]").forEach(card=>card.addEventListener("click",()=>{
      globalThis.P708PetWidget?.selectMember(card.dataset.gardenMember,{open:true});
    }));
    section.querySelector("#openMyPetButton")?.addEventListener("click",()=>{
      const target=mine||members[0]?.id;
      if(target)globalThis.P708PetWidget?.selectMember(target,{open:true});
    });
  }

  const baseRenderHomeGarden=renderHome;
  renderHome=function(){baseRenderHomeGarden();renderGarden();};
  globalThis.renderHomePetGarden=renderGarden;
})();
