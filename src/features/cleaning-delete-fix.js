(()=>{
  let deletingWeek=false;

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

      // Cập nhật local ngay để UI không giữ card cũ trong lúc listener Firestore phản hồi.
      state.schedules=state.schedules.filter(item=>item.weekStart!==weekStart&&item.id!==scheduleId);
      ui.selectedScheduleId=null;
      saveLocal();renderCleaning();

      await syncFromServer();
      const stillThere=state.schedules.some(item=>item.weekStart===weekStart);
      if(stillThere){
        toast("Máy chủ vẫn còn lịch tuần này sau khi xóa trực tiếp. Hãy gửi ảnh màn hình này để kiểm tra quyền Firestore.",6500);
        return;
      }

      const next=[...state.schedules].sort((a,b)=>b.weekStart.localeCompare(a.weekStart))[0]||null;
      ui.selectedScheduleId=next?.id||null;
      if($("#cleanWeek"))$("#cleanWeek").value=next?.weekStart||dateValue(nextMonday());
      saveLocal();renderCleaning();
      toast(result?.removed===false?"Tuần này đã được xóa trước đó":"Đã xóa tuần khỏi máy chủ");
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
