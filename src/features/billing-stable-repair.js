(()=>{
  let repairService=null;
  let mappingRepairService=null;
  let expectedRevision=null;
  let beforeRepairPayload=null;

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

  const getMappingRepairService=()=>{
    if(mappingRepairService)return mappingRepairService;
    if(typeof globalThis.createP708CanonicalMappingRepair!=="function")throw new Error("Module sửa mapping chưa sẵn sàng.");
    mappingRepairService=globalThis.createP708CanonicalMappingRepair({
      firebaseConfig:FIREBASE_CONFIG,
      roomCode:ROOM_CODE
    });
    return mappingRepairService;
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

      // The room payload can only keep one canonical member ID. Any access document
      // still pointing at an old duplicate ID must be migrated too, otherwise the next
      // login/sync can revive stale identity data or leave the user unable to edit.
      const mappingResult=await getMappingRepairService().repair({
        beforePayload:beforeRepairPayload||{},
        desiredPayload:desired
      });
      if(Array.isArray(mappingResult?.accesses))accessAccounts=mappingResult.accesses;

      const verified=await service.verify(desired);
      if(!verified.same)throw new Error("Máy chủ chưa giữ bản dữ liệu đã sửa. Hệ thống đã dừng để tránh hiển thị sai.");

      if(Array.isArray(verified.accesses))accessAccounts=verified.accesses;
      state=fromSyncShape(verified.payload);
      confirmedState=clone(state);
      saveLocal();
      renderAll();
      if(message)toast(mappingResult?.remapped?`${message} · đã sửa ${mappingResult.remapped} mapping tài khoản`:message,5000);
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
      beforeRepairPayload=null;
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
      const snapshot=await getRepairService().readServer();
      if(Array.isArray(snapshot.accesses))accessAccounts=snapshot.accesses;
      beforeRepairPayload=clone(snapshot.roomPayload||snapshot.payload||{});
      state=fromSyncShape(snapshot.payload);
      confirmedState=clone(state);
      saveLocal();
      renderAll();
      expectedRevision=snapshot.revision;
      return await baseSyncBillingMembers();
    }catch(error){
      expectedRevision=null;
      beforeRepairPayload=null;
      console.error("P708 prepare billing repair",error);
      toast(error?.message||"Không thể tải dữ liệu mới nhất để sửa trùng",7000);
    }finally{
      expectedRevision=null;
      beforeRepairPayload=null;
    }
  };
})();
