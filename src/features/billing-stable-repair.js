(()=>{
  let repairService=null;
  let expectedRevision=null;

  const getRepairService=()=>{
    if(repairService)return repairService;
    if(typeof globalThis.createP708AuthoritativeRepair!=="function")throw new Error("Module sửa dữ liệu chưa sẵn sàng.");
    repairService=globalThis.createP708AuthoritativeRepair({
      firebaseConfig:FIREBASE_CONFIG,
      roomCode:ROOM_CODE,
      deviceId:DEVICE_ID
    });
    return repairService;
  };

  const basePersist=persist;
  persist=async function(message,audit={}){
    if(audit?.action!=="SYNC_BILL_MEMBERS")return basePersist(message,audit);
    if(!navigator.onLine){
      restoreConfirmedState();
      toast("Đang ngoại tuyến · chưa thể sửa dữ liệu trùng",5000);
      return false;
    }

    state.updatedAt=nowIso();
    saveLocal();
    renderAll();

    const desired=toSyncShape(state);
    try{
      const service=getRepairService();
      await service.commit(desired,{expectedRevision,audit});
      const verified=await service.verify(desired);
      if(!verified.same)throw new Error("Máy chủ chưa giữ bản dữ liệu đã sửa. Hệ thống đã dừng để tránh hiển thị sai.");

      if(Array.isArray(verified.accesses))accessAccounts=verified.accesses;
      state=fromSyncShape(verified.payload);
      confirmedState=clone(state);
      saveLocal();
      renderAll();
      if(message)toast(message,5000);
      return true;
    }catch(error){
      console.error("P708 authoritative billing repair",error);
      restoreConfirmedState();
      toast(error?.message||"Không thể sửa dữ liệu trùng trên máy chủ",7000);
      try{
        const latest=await getRepairService().readServer();
        if(Array.isArray(latest.accesses))accessAccounts=latest.accesses;
        state=fromSyncShape(latest.payload);
        confirmedState=clone(state);
        saveLocal();
        renderAll();
      }catch(syncError){
        console.warn("P708 repair recovery",syncError);
      }
      return false;
    }finally{
      expectedRevision=null;
    }
  };

  const baseSyncBillingMembers=syncBillingMembers;
  syncBillingMembers=async function(){
    if(!requireAdmin())return;
    if(!navigator.onLine){
      toast("Đang ngoại tuyến · kết nối mạng trước khi cập nhật danh sách",5000);
      return;
    }

    try{
      // Use one authoritative server snapshot for BOTH room data and account mappings.
      // Realtime UI state can lag behind Firestore by a few seconds; stale access data
      // previously made revoked/inactive mappings look active and blocked safe dedup.
      const snapshot=await getRepairService().readServer();
      if(Array.isArray(snapshot.accesses))accessAccounts=snapshot.accesses;
      state=fromSyncShape(snapshot.payload);
      confirmedState=clone(state);
      saveLocal();
      renderAll();
      expectedRevision=snapshot.revision;
      return await baseSyncBillingMembers();
    }catch(error){
      expectedRevision=null;
      console.error("P708 prepare billing repair",error);
      toast(error?.message||"Không thể tải dữ liệu mới nhất để sửa trùng",7000);
    }finally{
      expectedRevision=null;
    }
  };
})();
