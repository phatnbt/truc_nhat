(function(){
  "use strict";
  var report={},start=Date.now(),suiteTimeout=18000;
  var ids=["html","css","javascript","dom","promise","fetch","module","dynamic","local","session","indexed","cache","worker","config","sdk","firebase","auth","firestore"];
  var byId=function(id){return document.getElementById(id);};
  function record(id,status,code,description){
    var cell=byId(id);
    if(!cell)return;
    var at=new Date().toISOString();
    var item={status:status,at:at,elapsedMs:Date.now()-start};
    if(code&&/^[a-zA-Z0-9/-]{1,48}$/.test(code))item.code=code;
    if(description)item.detail=description;
    report[id]=item;
    cell.textContent=status+(item.code?" · "+item.code:"")+(description?" · "+description:"")+
      (status==="FAIL"?" · "+at:"");
  }
  function failure(id,error,description){
    record(id,"FAIL",error&&(error.code||error.name)||"error",description);
  }
  function supported(id,value){
    if(!value)record(id,"NOT SUPPORTED");
    return !!value;
  }
  function capability(id,read){
    try{
      var candidate=read();
      return supported(id,candidate)?candidate:null;
    }catch(error){failure(id,error,"Trình duyệt chặn API này.");return null;}
  }
  function storage(id,name){
    var key="p708-ios-probe-"+Math.random().toString(36).slice(2);
    try{
      var store=window[name];
      if(!supported(id,store))return;
      store.setItem(key,"1");
      var ok=store.getItem(key)==="1";
      store.removeItem(key);
      record(id,ok?"PASS":"FAIL",ok?null:"read-back","Ghi và đọc dữ liệu thử.");
    }catch(error){failure(id,error,"Thiết bị từ chối ghi hoặc đọc vùng lưu trữ.");}
  }
  function serialize(){
    return JSON.stringify({origin:location.protocol+"//"+location.host,
      path:location.pathname.replace(/[^/]*$/,"ios-diagnostics.html"),
      display:navigator.standalone===true||(window.matchMedia&&matchMedia("(display-mode: standalone)").matches)?"standalone":"browser",
      online:navigator.onLine,checks:report},null,2);
  }
  function selectReport(){
    var output=byId("diag-report");
    output.value=serialize();output.hidden=false;output.focus();output.select();
    byId("diag-message").textContent="Giữ vùng văn bản được chọn và chọn Sao chép.";
  }
  function bounded(work,ms){
    return new Promise(function(resolve,reject){
      var timer=setTimeout(function(){reject({code:"timeout"});},ms);
      Promise.resolve(work).then(function(value){clearTimeout(timer);resolve(value);},function(error){clearTimeout(timer);reject(error);});
    });
  }
  ids.forEach(function(id){record(id,"NOT TESTED");});
  record("html","PASS");
  record("javascript","PASS");
  record("css",getComputedStyle(byId("css")).paddingTop==="6px"?"PASS":"FAIL",null,"Kiểm tra kiểu dáng của bảng.");
  var interaction=document.createElement("button");
  interaction.addEventListener("click",function(){record("dom","PASS");});
  interaction.click();
  byId("diag-copy").disabled=false;
  byId("diag-copy").addEventListener("click",function(){
    if(navigator.clipboard&&navigator.clipboard.writeText){
      navigator.clipboard.writeText(serialize()).then(function(){byId("diag-message").textContent="Đã sao chép.";},selectReport);
    }else selectReport();
  });
  storage("local","localStorage");
  storage("session","sessionStorage");

  var indexed=capability("indexed",function(){return window.indexedDB;});
  if(indexed){
    var dbName="p708-ios-probe-"+Math.random().toString(36).slice(2);
    var dbTimer=setTimeout(function(){failure("indexed",{code:"timeout"},"Chờ IndexedDB quá lâu.");},4000);
    try{
      var probe=indexed.open(dbName,1);
      probe.onupgradeneeded=function(){probe.result.createObjectStore("probe");};
      probe.onerror=probe.onblocked=function(){clearTimeout(dbTimer);failure("indexed",{code:"open-blocked"},"Không mở được cơ sở dữ liệu thử.");};
      probe.onsuccess=function(){
        var db=probe.result;
        function complete(status,code){
          clearTimeout(dbTimer);record("indexed",status,code);
          db.close();indexed.deleteDatabase(dbName);
        }
        try{
          var task=db.transaction("probe","readwrite"),store=task.objectStore("probe");
          store.put("1","key");
          var read=store.get("key");
          task.oncomplete=function(){complete(read.result==="1"?"PASS":"FAIL",read.result==="1"?null:"read-back");};
          task.onabort=function(){complete("FAIL","transaction-aborted");};
        }catch(error){complete("FAIL",error&&error.name||"transaction");}
      };
    }catch(error){clearTimeout(dbTimer);failure("indexed",error,"Trình duyệt từ chối IndexedDB.");}
  }
  if(!supported("promise",typeof Promise==="function"))return;
  Promise.resolve().then(function(){record("promise","PASS");});
  if(supported("fetch",typeof fetch==="function")){
    bounded(fetch("./ios-diagnostics.html",{cache:"no-store"}),4000).then(function(response){
      if(!response.ok)throw {code:"http-"+response.status};
      record("fetch","PASS",null,"Đọc HTML cùng origin.");
    }).catch(function(error){failure("fetch",error,"Không đọc được HTML cùng origin.");});
  }
  var cacheStorage=capability("cache",function(){return window.caches;});
  if(cacheStorage){
    var cacheName="p708-ios-probe-"+Math.random().toString(36).slice(2);
    bounded(cacheStorage.open(cacheName).then(function(cache){
      return cache.put("./ios-diagnostics.html",new Response("probe")).then(function(){return cache.match("./ios-diagnostics.html");})
        .then(function(response){return response&&response.text();});
    }),4000).then(function(value){
      record("cache",value==="probe"?"PASS":"FAIL",value==="probe"?null:"read-back");
    },function(error){failure("cache",error,"Không ghi hoặc đọc được Cache Storage.");}).then(function(){
      return cacheStorage.delete(cacheName).catch(function(){});
    });
  }
  var workers=capability("worker",function(){return navigator.serviceWorker;});
  if(workers){
    bounded(workers.getRegistration(),3500).then(function(registration){
      record("worker","PASS",null,registration?"Có đăng ký cùng scope.":"Chưa có đăng ký. Trang kiểm tra vẫn chạy.");
    },function(error){failure("worker",error,"Trình duyệt từ chối kiểm tra đăng ký.");});
  }
  var moduleTimeout=setTimeout(function(){
    if(report.module.status==="NOT TESTED")record("module","NOT SUPPORTED","module-unavailable");
  },4000);
  window.P708IOSChecks={record:record,failure:failure,bounded:bounded,moduleReady:function(){
    clearTimeout(moduleTimeout);
    record("module","PASS");
    var script=document.createElement("script"),timer=setTimeout(function(){
      if(report.dynamic.status==="NOT TESTED")failure("dynamic",{code:"timeout"},"Không tải được module kiểm tra.");
    },suiteTimeout);
    script.type="module";
    script.src="./src/boot/ios-diagnostics-module.js";
    script.onload=function(){clearTimeout(timer);};
    script.onerror=function(){clearTimeout(timer);failure("dynamic",{code:"module-load"},"Trình duyệt hoặc mạng từ chối module động.");};
    document.head.appendChild(script);
  }};
})();
