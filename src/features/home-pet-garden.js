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
    section.setAttribute("aria-label","Pet của các thành viên P708");
    moduleSection.parentElement.insertBefore(section,moduleSection);
    return section;
  }

  function statsFor(member){
    return S.memberStreak({schedules:state.schedules,member,now:Date.now()});
  }

  function petMarkup(stage,member,index){
    const renderer=globalThis.P708PetWidget?.renderFace;
    if(typeof renderer==="function")return renderer(stage,member.name,"garden");
    return `<span class="garden-pet-fallback">${stage.emoji}</span>`;
  }

  function renderGarden(){
    const section=ensureGarden();
    if(!section)return;
    const members=state.members||[];
    if(!members.length){
      section.innerHTML=`<div class="pet-garden-heading-simple"><div><p class="eyebrow">P708 PETS</p><h2>Pet của thành viên</h2><p>Mỗi thành viên sẽ có một pet riêng theo streak trực nhật.</p></div></div><div class="pet-garden-empty">🥚 Chưa có pet nào.</div>`;
      return;
    }

    const mine=typeof myMemberId==="function"?myMemberId():null;
    section.innerHTML=`
      <div class="pet-garden-heading-simple">
        <div><p class="eyebrow">P708 PETS</p><h2>Pet của thành viên</h2><p>Bạn chỉ có thể gọi và tương tác với pet của chính mình.</p></div>
      </div>
      <div class="pet-garden-grid">
        ${members.map((member,index)=>{
          const stats=statsFor(member),stage=S.petStage(stats.current),isMine=member.id===mine;
          const tag=isMine?"button":"div";
          const attrs=isMine?`type="button" data-garden-member="${member.id}"`:`data-garden-locked="${member.id}" aria-disabled="true"`;
          return `<${tag} class="pet-garden-card ${isMine?"mine":"pet-locked"}" ${attrs} style="--pet-delay:${(index%8)*-.18}s" aria-label="Pet của ${esc(member.name)}, streak ${stats.current} tuần${isMine?", pet của bạn":", chỉ chủ sở hữu mới có thể gọi"}">
            <span class="garden-mini-pet">${petMarkup(stage,member,index)}</span>
            <span class="garden-owner-name">${esc(member.name)}</span>
            <span class="garden-streak-line">${isMine?'<i class="mine-dot"></i>':""}<span>${esc(stage.name)} · 🔥 ${stats.current}</span></span>
          </${tag}>`;
        }).join("")}
      </div>`;

    section.querySelectorAll("[data-garden-member]").forEach(card=>card.addEventListener("click",()=>{
      globalThis.P708PetWidget?.selectMember(card.dataset.gardenMember,{react:true});
    }));
  }

  const baseRenderHomeGarden=renderHome;
  renderHome=function(){baseRenderHomeGarden();renderGarden();};
  globalThis.renderHomePetGarden=renderGarden;
})();
