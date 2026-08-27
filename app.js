const BOOT_VERSION = "20260827-8";

globalThis.P708InstallPrompt = null;
window.addEventListener("beforeinstallprompt",event=>{
  event.preventDefault();
  globalThis.P708InstallPrompt=event;
  window.dispatchEvent(new Event("p708installpromptready"));
});
window.addEventListener("appinstalled",()=>{
  globalThis.P708InstallPrompt=null;
  window.dispatchEvent(new Event("p708appinstalled"));
});

function loadKpiPolish(){
  if(document.querySelector('link[data-kpi-polish="1"]'))return;
  const link=document.createElement("link");
  link.rel="stylesheet";
  link.href=`./kpi-polish.css?v=${BOOT_VERSION}`;
  link.dataset.kpiPolish="1";
  document.head.appendChild(link);
}

function showBootFailure(error){
  console.error("P708 boot failed", error);
  const box=document.querySelector("#authGateContent");
  const gate=document.querySelector("#authGate");
  gate?.classList.remove("hidden");
  if(!box)return;
  box.innerHTML=`<h2>Không thể khởi động ứng dụng</h2><p>Một tệp ứng dụng cũ có thể đang bị giữ trong bộ nhớ đệm. Hãy làm mới bộ nhớ đệm rồi thử lại.</p><div class="auth-actions"><button class="btn primary" id="repairBootButton" type="button">Làm mới ứng dụng</button></div><small style="display:block;margin-top:12px;color:#667085">${String(error?.message||error||"Lỗi tải ứng dụng").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;")}</small>`;
  document.querySelector("#repairBootButton")?.addEventListener("click",async()=>{
    try{
      if("caches" in window){const keys=await caches.keys();await Promise.all(keys.filter(k=>k.startsWith("p708-manager-")).map(k=>caches.delete(k)));}
      if("serviceWorker" in navigator){const regs=await navigator.serviceWorker.getRegistrations();await Promise.all(regs.map(r=>r.unregister()));}
    }catch(e){console.warn("P708 cache repair",e);}
    location.replace(`${location.pathname}?refresh=${Date.now()}${location.hash||""}`);
  });
}

try{
  loadKpiPolish();
  await import(`./src/boot/app-loader.js?v=${BOOT_VERSION}`);
}catch(error){
  showBootFailure(error);
}
