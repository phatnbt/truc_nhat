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

  async function removeScheduleOnce(weekStart,scheduleId){
    state.schedules=state.schedules.filter(schedule=>schedule.weekStart!==weekStart&&schedule.id!==scheduleId);
    ui.selectedScheduleId=null;
    return persist("",{
      action:"DELETE_SCHEDULE",
      summary:`Xóa lịch tuần ${weekStart}`
    });
  }

  deleteSchedule=async function(){
    if(!requireAdmin()||deletingWeek)return;
    if(!navigator.onLine)return toast("Đang ngoại tuyến · không thể xóa tuần",5000);

    const button=$("#deleteScheduleButton"),oldText=button?.textContent||"Xóa tuần";
    deletingWeek=true;
    if(button){button.disabled=true;button.textContent="Đang kiểm tra…";}

    try{
      // Luôn đọc snapshot mới nhất trước khi xác định tuần cần xóa. Điều này tránh
      // xóa trên state cũ rồi listener realtime đưa lịch cũ trở lại.
      const synced=await syncFromServer();
      if(!synced)return toast("Không lấy được dữ liệu mới nhất từ máy chủ",5000);

      const schedule=scheduleForDelete();
      if(!schedule)return toast("Không tìm thấy lịch tuần cần xóa",5000);
      const weekStart=schedule.weekStart,scheduleId=schedule.id;
      if(!confirm(`Xóa lịch ${weekRange(weekStart)}?\n\nCác báo hoàn thành của tuần này cũng sẽ được dọn.`))return;

      if(button)button.textContent="Đang xóa…";
      let saved=await removeScheduleOnce(weekStart,scheduleId);
      if(!saved)return;

      // Dọn báo công việc sau khi lịch chính đã được xóa. Lỗi dọn báo không được
      // phép làm sống lại lịch đã xóa.
      await realtimeEngine?.deleteTaskSubmissionsForWeek(weekStart).catch(error=>{
        console.warn("P708 cleanup week submissions",error);
      });

      await syncFromServer();
      let returned=state.schedules.some(item=>item.weekStart===weekStart||item.id===scheduleId);

      // Nếu một snapshot cũ/race condition vừa ghi lịch trở lại, thực hiện lại
      // trên chính snapshot server vừa đọc. Không dựa vào state trước thao tác.
      if(returned){
        const latest=state.schedules.find(item=>item.weekStart===weekStart||item.id===scheduleId);
        saved=await removeScheduleOnce(weekStart,latest?.id||scheduleId);
        if(saved){
          await realtimeEngine?.deleteTaskSubmissionsForWeek(weekStart).catch(()=>{});
          await syncFromServer();
        }
        returned=state.schedules.some(item=>item.weekStart===weekStart||item.id===scheduleId);
      }

      if(returned){
        toast("Máy chủ vẫn còn lịch tuần này. Hệ thống đã dừng để tránh hiển thị sai.",6000);
        return;
      }

      const next=[...state.schedules].sort((a,b)=>b.weekStart.localeCompare(a.weekStart))[0]||null;
      ui.selectedScheduleId=next?.id||null;
      if($("#cleanWeek"))$("#cleanWeek").value=next?.weekStart||dateValue(nextMonday());
      saveLocal();renderCleaning();
      toast("Đã xóa tuần và đồng bộ máy chủ");
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
