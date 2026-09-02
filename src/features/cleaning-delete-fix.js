(()=>{
  let deletingWeek=false;
  const baseToSyncShape=toSyncShape;
  const baseFromSyncShape=fromSyncShape;
  const baseCreateSchedule=createSchedule;

  // Giữ tombstone trong shape đồng bộ và loại mọi lịch đã bị xóa trước khi đưa
  // dữ liệu server vào state. Đây là chốt chặn chống snapshot/device cũ resurrect.
  toSyncShape=function(source=state){
    const shape=baseToSyncShape(source);
    shape._sync=clone(source?._sync||{});
    shape._sync.deletedSchedules=clone(shape._sync.deletedSchedules||{});
    return shape;
  };

  fromSyncShape=function(shape){
    const clean=clone(shape)||{};
    const deleted=clean?._sync?.deletedSchedules||{};
    clean.schedules=clean.schedules&&typeof clean.schedules==="object"?clean.schedules:{};
    for(const weekStart of Object.keys(deleted))delete clean.schedules[weekStart];
    const next=baseFromSyncShape(clean);
    next._sync=clone(clean._sync||{});
    next._sync.deletedSchedules=clone(deleted);
    return next;
  };

  async function syncFromServer(){
    if(!realtimeEngine?.forceSync)return true;
    return realtimeEngine.forceSync().catch(()=>false);
  }

  function scheduleForDelete(){
    const week=$("#cleanWeek")?.value||"";
    if(week){
      const exact=state.schedules.find(schedule=>schedule.weekStart===week);
      if(exact)return exact;
    }
    return currentSchedule();
  }

  // Khi người dùng CHỦ ĐỘNG tạo lại đúng tuần đã xóa thì mới gỡ tombstone.
  createSchedule=async function(){
    const week=$("#cleanWeek")?.value||"";
    if(!week)return baseCreateSchedule();
    const people=state.members.filter(m=>state.presence[m.id]!==false);
    if(!people.length)return baseCreateSchedule();
    const tombstone=state?._sync?.deletedSchedules?.[week];
    if(tombstone&&typeof globalThis.restoreScheduleWeek==="function"){
      try{
        await globalThis.restoreScheduleWeek({
          firebaseConfig:FIREBASE_CONFIG,
          roomCode:ROOM_CODE,
          deviceId:DEVICE_ID,
          weekStart:week
        });
        state._sync=state._sync||{};
        state._sync.deletedSchedules=state._sync.deletedSchedules||{};
        delete state._sync.deletedSchedules[week];
      }catch(error){
        console.error("P708 restore deleted schedule week",error);
        return toast(error?.message||"Không thể tạo lại tuần đã xóa",6000);
      }
    }
    return baseCreateSchedule();
  };

  deleteSchedule=async function(){
    if(!requireAdmin()||deletingWeek)return;
    if(!navigator.onLine)return toast("Đang ngoại tuyến · không thể xóa tuần",5000);

    const button=$("#deleteScheduleButton"),oldText=button?.textContent||"Xóa tuần";
    deletingWeek=true;
    if(button){button.disabled=true;button.textContent="Đang kiểm tra…";}

    try{
      const synced=await syncFromServer();
      if(!synced)return toast("Không lấy được dữ liệu mới nhất từ máy chủ",5000);

      const schedule=scheduleForDelete();
      if(!schedule)return toast("Không tìm thấy lịch tuần cần xóa",5000);
      const weekStart=schedule.weekStart,scheduleId=schedule.id;
      if(!confirm(`Xóa lịch ${weekRange(weekStart)}?\n\nCác báo hoàn thành của tuần này cũng sẽ được dọn.`))return;

      if(button)button.textContent="Đang xóa…";
      if(typeof globalThis.deleteScheduleAuthoritatively!=="function")throw new Error("Chức năng xóa máy chủ chưa sẵn sàng. Hãy tải lại ứng dụng.");

      const result=await globalThis.deleteScheduleAuthoritatively({
        firebaseConfig:FIREBASE_CONFIG,
        roomCode:ROOM_CODE,
        deviceId:DEVICE_ID,
        weekStart,
        scheduleId
      });

      if(result?.reason==="changed")throw new Error("Lịch tuần này đã thay đổi trên thiết bị khác. Hãy tải lại rồi thử xóa lại.");

      await realtimeEngine?.deleteTaskSubmissionsForWeek(weekStart).catch(error=>{
        console.warn("P708 cleanup week submissions",error);
      });

      const tombstone={deletedAt:nowIso(),deletedBy:authSession.user?.uid||"",scheduleId};
      state._sync=state._sync||{};
      state._sync.deletedSchedules=state._sync.deletedSchedules||{};
      state._sync.deletedSchedules[weekStart]=tombstone;
      state.schedules=state.schedules.filter(item=>item.weekStart!==weekStart&&item.id!==scheduleId);
      ui.selectedScheduleId=null;
      saveLocal();renderCleaning();

      await syncFromServer();
      const stillThere=state.schedules.some(item=>item.weekStart===weekStart);
      if(stillThere){
        toast("Lịch tuần vẫn xuất hiện sau tombstone. Hệ thống đã chặn ghi tiếp để tránh sai dữ liệu.",6500);
        return;
      }

      const next=[...state.schedules].sort((a,b)=>b.weekStart.localeCompare(a.weekStart))[0]||null;
      ui.selectedScheduleId=next?.id||null;
      if($("#cleanWeek"))$("#cleanWeek").value=next?.weekStart||dateValue(nextMonday());
      saveLocal();renderCleaning();
      toast(result?.reason==="already_deleted"?"Tuần này đã được xóa trước đó":"Đã xóa tuần khỏi máy chủ");
    }catch(error){
      console.error("P708 delete schedule",error);
      toast(error?.message||"Không thể xóa tuần",6000);
      await syncFromServer();
    }finally{
      deletingWeek=false;
      if(button){button.disabled=false;button.textContent=oldText;}
    }
  };
})();
