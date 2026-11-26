const BOOT_VERSION = "20261127-14";
globalThis.P708_RELEASE=BOOT_VERSION;
globalThis.P708Debug?.("release",BOOT_VERSION);
globalThis.P708Boot?.mark("SCRIPT_START");

function setBootProgress(title,detail){
  const box=document.querySelector("#authGateContent");
  if(!box||!box.textContent.includes("Đang khởi động")&&!box.dataset.bootProgress)return;
  box.dataset.bootProgress="1";
  box.innerHTML=`<h2>${title}</h2><p>${detail}</p>`;
}
globalThis.P708SetBootProgress=setBootProgress;
setBootProgress("Đang tải ứng dụng…","Đang chuẩn bị các thành phần cần thiết.");

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

async function boot(){
  let code="module-load";
  try{
    const requested=new URL(import.meta.url).searchParams.get("v");
    if(requested&&requested!==BOOT_VERSION){code="release-mismatch";throw new Error(code);}
    if(typeof fetch!=="function"||typeof Promise!=="function"){code="browser-api";throw new Error(code);}
    globalThis.P708Boot?.mark("COMPAT_CHECK");
    const loader=await import(`./src/boot/app-loader.js?v=${BOOT_VERSION}`);
    await loader.startApplication();
  }catch(error){
    globalThis.P708ShowBootRecovery?.(error?.bootCode||(error?.message==="release-mismatch"?"release-mismatch":code));
  }
}
void boot();
