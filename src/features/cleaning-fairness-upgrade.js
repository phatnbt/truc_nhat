(()=>{
  const F=globalThis.P708CleaningFairness;
  if(!F)return;

  historicalPoints=function(memberId,beforeWeek="9999-99-99"){
    const member=state.members.find(m=>m.id===memberId);
    return F.historicalFairnessLoad({
      schedules:state.schedules,
      member,
      beforeWeek,
      weights:state.settings.weights,
      minStreakWeeks:2
    });
  };

  createSchedule=async function(){
    if(!requireAdmin())return;
    const week=$("#cleanWeek").value;
    if(!week)return toast("Chọn tuần bắt đầu");
    const people=state.members.filter(m=>state.presence[m.id]!==false);
    if(!people.length)return toast("Không có thành viên có mặt");

    let tasks=[...TASKS];
    const absentMembers=state.members.filter(m=>state.presence[m.id]===false);
    const absent=absentMembers.length;
    if(absent===1)tasks=tasks.filter(t=>t.id!=="rac");

    const weightOf=task=>F.effectiveTaskWeight(task.id,state.settings.weights,task.w);
    const loads=Object.fromEntries(people.map(p=>[p.id,{
      base:historicalPoints(p.id,week),week:0,count:0
    }]));

    const assignments=tasks.slice().sort((a,b)=>weightOf(b)-weightOf(a)).map(task=>{
      const ranked=people.map(p=>({
        p,
        repeat:wasSameTaskLastWeek(p.id,task.id,week)?1:0,
        last:previousAssignment(p.id,task.id,week),
        load:loads[p.id].base+loads[p.id].week,
        count:loads[p.id].count
      })).sort((a,b)=>a.repeat-b.repeat||a.load-b.load||a.count-b.count||(a.last||"").localeCompare(b.last||""));
      const chosen=ranked[0].p;
      loads[chosen.id].week+=weightOf(task);
      loads[chosen.id].count++;
      return {taskId:task.id,task:task.name,personId:chosen.id,personName:chosen.name,completed:false,cut:false};
    });

    if(absent===1)assignments.push({taskId:"rac",task:"Vứt rác, bình nước",personId:null,personName:"Tạm cắt",completed:false,cut:true});

    const old=state.schedules.find(s=>s.weekStart===week);
    if(old&&!confirm("Tuần này đã có lịch. Ghi đè? Mọi trạng thái hoàn thành của tuần này sẽ được tạo lại."))return;
    const t=nowIso(),schedule={
      id:old?.id||uid(),weekStart:week,createdAt:old?.createdAt||t,updatedAt:t,assignments,
      absentNames:absentMembers.map(m=>m.name),
      absentMemberIds:absentMembers.map(m=>m.id),
      fairnessPolicy:{longAbsenceMinWeeks:2,longAbsenceCredit:"present_average_load",version:1}
    };
    const index=state.schedules.findIndex(s=>s.weekStart===week);
    if(index>=0)state.schedules[index]=schedule;else state.schedules.push(schedule);
    state.schedules.sort((a,b)=>a.weekStart.localeCompare(b.weekStart));
    ui.selectedScheduleId=schedule.id;
    const ok=await persist("Đã tạo lịch công bằng",{action:"CREATE_SCHEDULE",summary:`Tạo lịch tuần ${week}`});
    if(ok)await realtimeEngine?.reconcileTaskSubmissions({weekStart:week,assignments:schedule.assignments}).catch(()=>{});
  };
})();
