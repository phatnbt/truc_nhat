const BOOT_VERSION = "20261127-11";
globalThis.P708_RELEASE=BOOT_VERSION;
globalThis.P708Debug?.("release",BOOT_VERSION);

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

try{
  const requested=new URL(import.meta.url).searchParams.get("v");
  if(requested&&requested!==BOOT_VERSION)throw new Error("release-mismatch");
  setBootProgress("Đang tải ứng dụng…","Đang chuẩn bị kết nối Firebase.");
  await import(`./src/boot/app-loader.js?v=${BOOT_VERSION}`);
}catch(error){
  console.error("P708 startup",error?.code||error?.name);
  globalThis.P708ShowBootRecovery?.(error.message==="release-mismatch"?"release-mismatch":"module-load");
}
