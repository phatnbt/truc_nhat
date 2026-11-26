const official="https://p708-room-manager.web.app/firebase-config.runtime.json";
const sdk="https://www.gstatic.com/firebasejs/12.16.0";
const local=["localhost","127.0.0.1","[::1]"].includes(location.hostname);
const preview=/^p708-room-manager--[^.]+\.web\.app$/.test(location.hostname);
const firebaseHost=preview||["p708-room-manager.firebaseapp.com","p708-room-manager.web.app"].includes(location.hostname);

export async function runFirebaseChecks({record,failure,bounded}){
  let config,app,auth,firestore;
  try{
    const response=await bounded(fetch(firebaseHost||local?"/__/firebase/init.json":official,{cache:"no-store",credentials:"omit"}),6000);
    if(!response.ok)throw {code:`http-${response.status}`};
    config=await bounded(response.json(),3000);
    if(!(config?.apiKey&&config.authDomain&&config.appId&&config.projectId===(local?"demo-p708-production-audit":"p708-room-manager")))
      throw {code:"invalid-config"};
    record("config","PASS");
  }catch(error){failure("config",error,"Endpoint không trả cấu hình Firebase hợp lệ.");return;}
  try{
    const [firebase,authSdk,dbSdk]=await bounded(Promise.all([
      import(`${sdk}/firebase-app.js`),import(`${sdk}/firebase-auth.js`),import(`${sdk}/firebase-firestore.js`)
    ]),9000);
    auth=authSdk;
    firestore=dbSdk;
    record("sdk","PASS",null,"SDK 12.16.0");
    try{
      app=firebase.initializeApp(config,"p708-ios-diagnostic");
      record("firebase","PASS");
    }catch(error){failure("firebase",error,"Không khởi tạo được Firebase App.");return;}
  }catch(error){failure("sdk",error,"Không tải được JavaScript SDK từ CDN.");return;}
  try{
    const instance=auth.initializeAuth(app,{persistence:auth.inMemoryPersistence});
    if(local)auth.connectAuthEmulator(instance,"http://127.0.0.1:9099",{disableWarnings:true});
    await bounded(instance.authStateReady(),6000);
    record("auth","PASS",null,"Phiên chẩn đoán dùng bộ nhớ và không khởi động OAuth.");
  }catch(error){failure("auth",error,"Quá trình khởi tạo Firebase Auth thất bại.");return;}
  if(preview){
    record("firestore","NOT TESTED","preview-isolated","Preview tách khỏi Firestore thật.");
    return;
  }
  try{
    const db=firestore.initializeFirestore(app,{localCache:firestore.memoryLocalCache()});
    if(local)firestore.connectFirestoreEmulator(db,"127.0.0.1",8080);
    // Rules intentionally deny this unused top-level path. No room or member path is touched.
    await bounded(firestore.getDocFromServer(firestore.doc(db,"diagnosticProbes","connectivity")),8000);
    record("firestore","FAIL","unexpected-access","Endpoint kiểm tra lẽ ra bị từ chối.");
  }catch(error){
    if(error.code==="permission-denied")record("firestore","PASS","permission-denied","Máy chủ phản hồi và giữ kiểm tra ngoài quyền truy cập.");
    else failure("firestore",error,"Không xác nhận được phản hồi máy chủ Firestore.");
  }
}
