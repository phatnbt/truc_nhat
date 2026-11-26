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

  function petMarkup(stage,member,decoration){
    const renderer=globalThis.P708PetWidget?.renderFace;
    if(typeof renderer==="function")return renderer(stage,member.name,"garden",decoration);
    return `<span class="garden-pet-fallback">${stage.emoji}</span>`;
  }

  let lastMarkup="";
  function renderGarden(){
    const section=ensureGarden();
    if(!section)return;
    const members=state.members||[];
    if(!members.length){
      lastMarkup="";
      section.innerHTML=`<div class="pet-garden-heading-simple"><div><p class="eyebrow">P708 PETS</p><h2>Pet của thành viên</h2><p>Mỗi thành viên sẽ có một pet riêng theo streak trực nhật.</p></div></div><div class="pet-garden-empty">🥚 Chưa có pet nào.</div>`;
      return;
    }

    const mine=typeof myMemberId==="function"?myMemberId():null;
    const goal=S.roomCleaningGoal(state.schedules),themeKey=mine?`P708_PET_DECOR_${mine}`:null;
    const progress=mine?S.petExperience(state.schedules,mine):null;
    const decoration=globalThis.P708PetWidget?.decorationFor(mine);
    const markup=`
      <div class="pet-garden-heading-simple">
        <div><h2>Pet của thành viên</h2><p>Streak cả phòng: ${goal.streak} tuần · Mục tiêu: ${goal.target} tuần</p></div>
        ${progress?.rewards.length?`<label class="field">Trang trí pet của tôi<select id="petDecoration"><option value="">Mặc định</option>${progress.rewards.map(item=>`<option value="${item.value}" ${item===decoration?"selected":""}>${item.label}</option>`).join("")}</select></label>`:""}
      </div>
      <div class="pet-garden-grid">
        ${members.map((member,index)=>{
          const stats=statsFor(member),stage=S.petStage(stats.current),isMine=member.id===mine;
          const experience=S.petExperience(state.schedules,member.id);
          const tag=isMine?"button":"div";
          const attrs=isMine?`type="button" data-garden-member="${member.id}"`:`data-garden-locked="${member.id}" aria-disabled="true"`;
          return `<${tag} class="pet-garden-card ${isMine?"mine":"pet-locked"}" ${attrs} style="--pet-delay:${(index%8)*-.18}s" aria-label="Pet của ${esc(member.name)}, streak ${stats.current} tuần${isMine?", pet của bạn":", chỉ chủ sở hữu mới có thể gọi"}">
            <span class="garden-mini-pet">${petMarkup(stage,member,isMine?decoration:null)}</span>
            <span class="garden-owner-name">${esc(member.name)}</span>
            <span class="garden-streak-line">${isMine?'<i class="mine-dot"></i>':""}<span>${esc(stage.name)} · 🔥 ${stats.current}</span></span>
            <small>Cấp ${experience.level} · ${experience.xp} EXP</small>
            ${isMine?`<progress class="garden-progress" max="50" value="${experience.xp%50}" aria-label="EXP tới cấp tiếp theo"></progress>`:""}
          </${tag}>`;
        }).join("")}
      </div>`;
    if(markup===lastMarkup)return;
    lastMarkup=markup;
    section.innerHTML=markup;

    section.querySelectorAll("[data-garden-member]").forEach(card=>card.addEventListener("click",()=>{
      globalThis.P708PetWidget?.selectMember(card.dataset.gardenMember,{react:true});
    }));
    section.querySelector("#petDecoration")?.addEventListener("change",event=>{
      if(myMemberId()!==mine)return;
      storageSet(themeKey,event.target.value);
      renderGarden();
      globalThis.P708PetWidget?.refresh();
      const accessory=globalThis.P708PetWidget?.decorationFor(mine);
      toast(accessory?`Đã trang bị ${accessory.label}`:"Pet đã trở về trang trí mặc định");
      section.querySelector("#petDecoration")?.focus({preventScroll:true});
    });
  }

  globalThis.renderHomePetGarden=renderGarden;
})();
