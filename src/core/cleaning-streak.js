const DAY_MS=86400000;

const dateMs=value=>{
  const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value||""));
  if(!m)return NaN;
  return Date.UTC(Number(m[1]),Number(m[2])-1,Number(m[3]));
};

const norm=value=>String(value||"").trim().replace(/\s+/g," ").toLocaleLowerCase("vi-VN");

function absentInSchedule(schedule,member){
  if(!schedule||!member)return false;
  if(Array.isArray(schedule.absentMemberIds)&&schedule.absentMemberIds.length){
    return schedule.absentMemberIds.map(String).includes(String(member.id));
  }
  const name=norm(member.name);
  return !!name&&Array.isArray(schedule.absentNames)&&schedule.absentNames.some(x=>norm(x)===name);
}

export function scheduleOutcome(schedule,member,{now=Date.now()}={}){
  if(!schedule?.weekStart||!member)return {status:"none",assigned:0,completed:0};
  if(absentInSchedule(schedule,member))return {status:"absent",assigned:0,completed:0};

  const assigned=(schedule.assignments||[]).filter(a=>a&&!a.cut&&String(a.personId)===String(member.id));
  if(!assigned.length)return {status:"rest",assigned:0,completed:0};

  const completed=assigned.filter(a=>a.completed===true).length;
  if(completed===assigned.length)return {status:"complete",assigned:assigned.length,completed};

  const start=dateMs(schedule.weekStart);
  const deadline=Number.isFinite(start)?start+7*DAY_MS:Infinity;
  return {
    status:now>=deadline?"missed":"pending",
    assigned:assigned.length,
    completed
  };
}

export function memberStreak({schedules=[],member,now=Date.now()}={}){
  if(!member)return {current:0,best:0,completedWeeks:0,missedWeeks:0,frozenWeeks:0,status:"none",lastWeek:null};
  const ordered=(schedules||[]).filter(s=>s?.weekStart).slice().sort((a,b)=>a.weekStart.localeCompare(b.weekStart));
  let current=0,best=0,completedWeeks=0,missedWeeks=0,frozenWeeks=0,lastStatus="none",lastWeek=null;

  for(const schedule of ordered){
    const outcome=scheduleOutcome(schedule,member,{now});
    if(outcome.status==="complete"){
      current+=1;completedWeeks+=1;best=Math.max(best,current);lastStatus="complete";lastWeek=schedule.weekStart;
      continue;
    }
    if(outcome.status==="missed"){
      current=0;missedWeeks+=1;lastStatus="missed";lastWeek=schedule.weekStart;
      continue;
    }
    if(outcome.status==="absent"){
      frozenWeeks+=1;lastStatus="absent";lastWeek=schedule.weekStart;
      continue;
    }
    if(outcome.status==="pending"){
      lastStatus="pending";lastWeek=schedule.weekStart;
      continue;
    }
    // Tuần không được giao việc hoặc không có dữ liệu là neutral: không tăng,
    // không phá streak vì thành viên không có nghĩa vụ để hoàn thành.
    if(outcome.status==="rest"){
      lastStatus="rest";lastWeek=schedule.weekStart;
    }
  }

  return {current,best,completedWeeks,missedWeeks,frozenWeeks,status:lastStatus,lastWeek};
}

export function petStage(streak=0){
  const n=Math.max(0,Number(streak)||0);
  if(n>=10)return {level:4,name:"Siêu chăm",emoji:"🐦",next:null};
  if(n>=6)return {level:3,name:"Lớn nhanh",emoji:"🐥",next:10};
  if(n>=3)return {level:2,name:"Bé khỏe",emoji:"🐤",next:6};
  if(n>=1)return {level:1,name:"Mới nở",emoji:"🐣",next:3};
  return {level:0,name:"Trứng",emoji:"🥚",next:1};
}

export function petProgress(streak=0){
  const stage=petStage(streak);
  if(stage.next==null)return 100;
  const starts=[0,1,3,6,10];
  const start=starts[stage.level]||0;
  return Math.max(0,Math.min(100,Math.round(((Number(streak)||0)-start)/(stage.next-start)*100)));
}

export function streakStatusLabel(status){
  return ({
    complete:"Tuần này đã giữ streak",
    pending:"Tuần này đang chờ hoàn thành",
    missed:"Streak vừa bị ngắt",
    absent:"Tuần vắng · streak được đóng băng",
    rest:"Tuần này không được giao việc",
    none:"Chưa có lịch trực"
  })[status]||"Chưa có dữ liệu";
}
