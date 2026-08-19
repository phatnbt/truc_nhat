(()=>{
  const ua=navigator.userAgent||"";
  const isIOS=/iPad|iPhone|iPod/.test(ua)||(navigator.platform==="MacIntel"&&navigator.maxTouchPoints>1);
  const isAndroid=/Android/i.test(ua);
  const platform=isIOS?"ios":isAndroid?"android":"other";
  const isMobile=platform!=="other";
  const isStandalone=()=>window.matchMedia?.("(display-mode: standalone)")?.matches||navigator.standalone===true;
  const isSafari=isIOS&&/Safari/i.test(ua)&&!/CriOS|FxiOS|EdgiOS|OPiOS/i.test(ua);
  const isChromeAndroid=isAndroid&&/Chrome|CriOS/i.test(ua)&&!/EdgA|OPR/i.test(ua);
  const seenKey=`P708_INSTALL_GUIDE_SEEN_${platform}_V1`;

  if(!isMobile)return;

  const style=document.createElement("style");
  style.dataset.mobileInstallGuide="1";
  style.textContent=`
    .mobile-install-card{display:none;margin:-2px 0 18px;padding:16px 17px;border:1px solid #dbe5ff;border-radius:22px;background:linear-gradient(135deg,rgba(255,255,255,.96),rgba(239,244,255,.96));box-shadow:0 14px 38px rgba(44,62,130,.09);align-items:center;gap:13px}
    .mobile-install-card.show{display:flex}.mobile-install-icon{width:48px;height:48px;min-width:48px;border-radius:15px;display:grid;place-items:center;background:linear-gradient(135deg,#355df5,#7047ee);color:#fff;font-weight:950;font-size:22px;box-shadow:0 8px 20px rgba(65,83,220,.25)}
    .mobile-install-copy{min-width:0;flex:1}.mobile-install-copy b{display:block;font-size:14px}.mobile-install-copy small{display:block;margin-top:4px;color:#667085;font-size:11px;line-height:1.45}.mobile-install-actions{display:flex;gap:7px;flex-wrap:wrap;justify-content:flex-end}
    .install-guide-modal{position:fixed;inset:0;z-index:150;display:none;align-items:flex-end;justify-content:center;background:rgba(15,23,42,.48);backdrop-filter:blur(8px);padding:16px}.install-guide-modal.show{display:flex}.install-guide-sheet{width:min(520px,100%);max-height:88vh;overflow:auto;border-radius:28px 28px 20px 20px;background:#fff;box-shadow:0 30px 80px rgba(15,23,42,.28)}.install-guide-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:20px 20px 14px;border-bottom:1px solid #e8ecf3}.install-guide-head h2{margin:0;font-size:21px}.install-guide-head p{margin:5px 0 0;color:#667085;font-size:12px;line-height:1.5}.install-guide-close{width:38px;height:38px;border-radius:12px;border:1px solid #e4e8f0;background:#fff;font-size:20px}.install-guide-body{padding:18px 20px 22px}.install-device-badge{display:inline-flex;align-items:center;gap:7px;padding:7px 10px;border-radius:999px;background:#eef3ff;color:#3652d9;font-size:11px;font-weight:900;margin-bottom:14px}.install-warning{padding:12px 13px;border:1px solid #fed7aa;border-radius:14px;background:#fff7ed;color:#9a3412;font-size:12px;line-height:1.55;margin-bottom:14px}.install-steps{display:grid;gap:11px}.install-step{display:grid;grid-template-columns:34px 1fr;gap:11px;align-items:flex-start;padding:12px;border:1px solid #e5eaf2;border-radius:15px;background:#fbfcff}.install-step-num{width:34px;height:34px;border-radius:11px;display:grid;place-items:center;background:#eef2ff;color:#4f46e5;font-weight:950}.install-step b{display:block;font-size:13px}.install-step p{margin:4px 0 0;color:#667085;font-size:11px;line-height:1.55}.install-guide-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:16px}.install-note{margin-top:14px;padding:11px 12px;border-radius:13px;background:#ecfdf3;color:#166534;font-size:11px;line-height:1.5}.install-only-mobile{display:none!important}@media(max-width:900px){.install-only-mobile{display:inline-flex!important}}@media(max-width:640px){.mobile-install-card{padding:14px;align-items:flex-start}.mobile-install-actions{width:100%;justify-content:flex-start}.mobile-install-card{flex-wrap:wrap}.mobile-install-copy{min-width:calc(100% - 64px)}.install-guide-modal{padding:0}.install-guide-sheet{border-radius:26px 26px 0 0;max-height:92vh}}
    @media(display-mode:standalone){.mobile-install-card{display:none!important}}
  `;
  if(!document.querySelector('style[data-mobile-install-guide="1"]'))document.head.appendChild(style);

  const card=document.createElement("section");
  card.className="mobile-install-card";
  card.id="mobileInstallCard";
  const hero=document.querySelector(".hero-panel");
  if(hero)hero.insertAdjacentElement("afterend",card);

  const modal=document.createElement("div");
  modal.className="install-guide-modal";
  modal.id="installGuideModal";
  modal.innerHTML='<div class="install-guide-sheet" role="dialog" aria-modal="true" aria-labelledby="installGuideTitle"><div class="install-guide-head"><div><h2 id="installGuideTitle">Cài P708</h2><p id="installGuideSubtitle"></p></div><button class="install-guide-close" id="installGuideClose" type="button" aria-label="Đóng">×</button></div><div class="install-guide-body" id="installGuideBody"></div></div>';
  document.body.appendChild(modal);

  const closeModal=()=>modal.classList.remove("show");
  document.querySelector("#installGuideClose")?.addEventListener("click",closeModal);
  modal.addEventListener("click",event=>{if(event.target===modal)closeModal();});

  async function copyLink(){
    try{await navigator.clipboard.writeText(location.href);toast?.("Đã sao chép liên kết P708");}
    catch{toast?.("Không thể sao chép tự động. Hãy sao chép địa chỉ trên thanh trình duyệt.");}
  }

  async function installAndroid(){
    const prompt=globalThis.P708InstallPrompt;
    if(!prompt){openGuide();return;}
    try{
      await prompt.prompt();
      await prompt.userChoice.catch(()=>null);
      globalThis.P708InstallPrompt=null;
      refreshCard();
    }catch{openGuide();}
  }

  function iosGuide(){
    const browserNote=isSafari?"":'<div class="install-warning"><b>Bạn chưa mở bằng Safari.</b><br>Trên iPhone/iPad, hãy mở P708 bằng Safari trước khi thêm vào Màn hình chính.</div>';
    const copyButton=isSafari?"":'<button class="btn soft" id="copyInstallLink" type="button">📋 Sao chép liên kết</button>';
    return `${browserNote}<span class="install-device-badge"> iPhone / iPad</span><div class="install-steps"><div class="install-step"><span class="install-step-num">1</span><div><b>Mở P708 bằng Safari</b><p>Nếu đang ở Chrome hoặc trình duyệt khác, sao chép liên kết P708 rồi dán vào Safari.</p></div></div><div class="install-step"><span class="install-step-num">2</span><div><b>Nhấn nút Chia sẻ</b><p>Trong Safari, nhấn biểu tượng hình vuông có mũi tên hướng lên. Tùy bố cục Safari, bạn có thể cần nhấn nút Thêm/Menu rồi chọn Chia sẻ.</p></div></div><div class="install-step"><span class="install-step-num">3</span><div><b>Chọn “Thêm vào Màn hình chính”</b><p>Cuộn danh sách tác vụ xuống. Nếu chưa thấy mục này, chọn “Sửa tác vụ” rồi thêm “Thêm vào Màn hình chính”.</p></div></div><div class="install-step"><span class="install-step-num">4</span><div><b>Bật “Mở dưới dạng ứng dụng web”</b><p>Giữ tên P708 Manager, bật tùy chọn mở dưới dạng web app nếu Safari hiển thị tùy chọn này.</p></div></div><div class="install-step"><span class="install-step-num">5</span><div><b>Nhấn “Thêm”</b><p>Biểu tượng P708 sẽ xuất hiện trên Màn hình chính. Từ lần sau hãy mở P708 bằng biểu tượng này.</p></div></div></div><div class="install-guide-actions">${copyButton}<button class="btn primary" id="finishInstallGuide" type="button">Đã hiểu</button></div><div class="install-note">Sau khi cài, mở P708 từ Màn hình chính rồi bật 🔔 Nhắc việc để nhận thông báo trực nhật và kết toán.</div>`;
  }

  function androidGuide(){
    const nativeReady=!!globalThis.P708InstallPrompt;
    const browserNote=isChromeAndroid?"":'<div class="install-warning"><b>Nên dùng Google Chrome trên Android.</b><br>Nếu trình duyệt hiện tại không có nút cài, hãy mở P708 bằng Chrome.</div>';
    const nativeStep=nativeReady?'<div class="install-step"><span class="install-step-num">1</span><div><b>Nhấn “Cài P708 ngay” bên dưới</b><p>Chrome sẽ mở hộp thoại cài đặt chính thức của ứng dụng PWA.</p></div></div><div class="install-step"><span class="install-step-num">2</span><div><b>Xác nhận “Cài đặt”</b><p>Chờ vài giây để biểu tượng P708 xuất hiện trên Màn hình chính hoặc danh sách ứng dụng.</p></div></div>':'<div class="install-step"><span class="install-step-num">1</span><div><b>Mở P708 bằng Chrome</b><p>Đảm bảo bạn đang mở đúng website P708 bằng Google Chrome.</p></div></div><div class="install-step"><span class="install-step-num">2</span><div><b>Mở menu Chrome ⋮</b><p>Nhấn biểu tượng ba chấm ở góc trên bên phải.</p></div></div><div class="install-step"><span class="install-step-num">3</span><div><b>Chọn “Cài ứng dụng”</b><p>Tùy phiên bản Chrome, mục này có thể hiện là “Cài ứng dụng”, “Install app” hoặc “Thêm vào Màn hình chính”.</p></div></div><div class="install-step"><span class="install-step-num">4</span><div><b>Xác nhận cài</b><p>Nhấn “Cài đặt” hoặc “Thêm”. Sau đó mở P708 từ biểu tượng trên điện thoại.</p></div></div>';
    return `${browserNote}<span class="install-device-badge">🤖 Android</span><div class="install-steps">${nativeStep}</div><div class="install-guide-actions">${nativeReady?'<button class="btn primary" id="nativeInstallButton" type="button">⬇ Cài P708 ngay</button>':''}<button class="btn soft" id="copyInstallLink" type="button">📋 Sao chép liên kết</button><button class="btn" id="finishInstallGuide" type="button">Đã hiểu</button></div><div class="install-note">Sau khi cài, mở P708 bằng biểu tượng ứng dụng. Khi thấy 🔔 Bật nhắc việc, hãy cho phép thông báo để nhận lịch trực và kết toán.</div>`;
  }

  function openGuide(){
    if(isStandalone())return;
    document.querySelector("#installGuideSubtitle").textContent=isIOS?"Hướng dẫn riêng cho thiết bị iOS của bạn":"Hướng dẫn riêng cho thiết bị Android của bạn";
    const body=document.querySelector("#installGuideBody");
    body.innerHTML=isIOS?iosGuide():androidGuide();
    body.querySelector("#copyInstallLink")?.addEventListener("click",copyLink);
    body.querySelector("#nativeInstallButton")?.addEventListener("click",installAndroid);
    body.querySelector("#finishInstallGuide")?.addEventListener("click",()=>{localStorage.setItem(seenKey,"1");closeModal();});
    modal.classList.add("show");
  }

  function refreshCard(){
    if(!card)return;
    const active=globalThis.authSession?.status==="active";
    if(!active||isStandalone()){
      card.classList.remove("show");
      return;
    }
    const title=isIOS?"Cài P708 trên iPhone":"Cài P708 trên Android";
    const hint=isIOS?"Thêm P708 vào Màn hình chính bằng Safari để dùng như một ứng dụng.":globalThis.P708InstallPrompt?"Thiết bị đã sẵn sàng cài P708. Nhấn để cài ngay.":"Thêm P708 vào Màn hình chính để mở nhanh như một ứng dụng.";
    card.innerHTML=`<span class="mobile-install-icon">P</span><div class="mobile-install-copy"><b>${title}</b><small>${hint}</small></div><div class="mobile-install-actions">${isAndroid&&globalThis.P708InstallPrompt?'<button class="btn primary small" id="mobileInstallNow" type="button">⬇ Cài ngay</button>':''}<button class="btn soft small" id="mobileInstallHelp" type="button">Hướng dẫn</button></div>`;
    card.classList.add("show");
    card.querySelector("#mobileInstallHelp")?.addEventListener("click",openGuide);
    card.querySelector("#mobileInstallNow")?.addEventListener("click",installAndroid);

    if(localStorage.getItem(seenKey)!=="1"&&document.querySelector("#page-home")?.classList.contains("active")){
      localStorage.setItem(seenKey,"1");
      setTimeout(openGuide,650);
    }
  }

  const previousRenderAll=globalThis.renderAll;
  if(typeof previousRenderAll==="function"){
    globalThis.renderAll=function(...args){const result=previousRenderAll(...args);setTimeout(refreshCard,0);return result;};
  }

  window.addEventListener("p708installpromptready",refreshCard);
  window.addEventListener("p708appinstalled",()=>{card?.classList.remove("show");closeModal();toast?.("P708 đã được cài trên thiết bị");});
  window.matchMedia?.("(display-mode: standalone)")?.addEventListener?.("change",refreshCard);
  document.addEventListener("visibilitychange",()=>{if(!document.hidden)refreshCard();});
  setTimeout(refreshCard,600);
})();
