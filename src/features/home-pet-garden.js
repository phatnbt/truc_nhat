(()=>{
  const S=globalThis.P708CleaningStreak;
  if(!S||typeof renderHome!=="function")return;

  function ensureGarden(){
    let section=document.querySelector("#homePetGarden");if(section)return section;
    const moduleSection=document.querySelector("#page-home .module-section");if(!moduleSection)return null;
    section=document.createElement("section");section.id="homePetGarden";section.className="home-pet-garden";section.setAttribute("aria-label","Bộ sưu tập tiến hóa Streak Pet");moduleSection.parentElement.insertBefore(section,moduleSection);return section;
  }
  function renderFace(stage,name){const renderer=globalThis.P708PetWidget?.renderFace;return typeof renderer==="function"?renderer(stage,name,"garden"):`<img src="${esc(stage.asset)}" alt="">`;}
  function renderGarden(){
    const section=ensureGarden();if(!section)return;
    const member=typeof myMember==="function"?myMember():null,status=S.normalizePetStatus(petStatus||{}),profile=status.profile;
    if(authSession?.status!=="active"||!member){section.innerHTML="";section.hidden=true;return;}section.hidden=false;
    const stages=S.stageCollection(profile.xp);
    section.innerHTML=`<div class="pet-garden-heading-simple"><div><p class="eyebrow">BỘ SƯU TẬP STREAK PET</p><h2>Hành trình tiến hóa của ${esc(member.name)}</h2><p>Điểm danh bằng việc trực hợp lệ mỗi ngày để mở khóa đủ bốn hình dạng.</p></div><button class="btn small soft" id="openMyPetButton" type="button">Mở widget</button></div><div class="pet-garden-grid">${stages.map(stage=>`<article class="pet-garden-card ${stage.unlocked?"unlocked":"locked"}" aria-label="${esc(stage.name)} ${stage.unlocked?"đã mở khóa":`khóa đến ${stage.threshold} XP`}"><span class="garden-mini-pet">${renderFace(stage,member.name)}</span><span class="garden-owner-name">${esc(stage.name)}</span><span class="garden-streak-line"><span>${stage.unlocked?"✓ Đã mở khóa":`${stage.threshold} XP`}</span></span></article>`).join("")}</div>`;
    section.querySelector("#openMyPetButton")?.addEventListener("click",()=>globalThis.P708PetWidget?.open?.());
  }
  const baseRenderHome=renderHome;renderHome=function(){baseRenderHome();renderGarden();};globalThis.renderHomePetGarden=renderGarden;
})();
