const checks=window.P708IOSChecks;
async function run(){
  let probe;
  try{
    probe=await checks.bounded(import("./ios-diagnostics-firebase.js"),6000);
    checks.record("dynamic","PASS");
  }catch(error){
    checks.failure("dynamic",error,"Không tải được module kiểm tra Firebase.");
    return;
  }
  await probe.runFirebaseChecks(checks);
}
void run();
