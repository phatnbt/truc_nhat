const DAY_MS=86400000;

const normName=value=>String(value||"").trim().replace(/\s+/g," ").toLocaleLowerCase("vi-VN");
const dateMs=value=>{
  const match=/^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value||""));
  if(!match)return NaN;
  return Date.UTC(Number(match[1]),Number(match[2])-1,Number(match[3]));
};

export function effectiveTaskWeight(taskId,weights={},fallback=3){
  const value=Number(weights?.[taskId]);
  return Number.isFinite(value)&&value>=0?value:Number(fallback)||0;
}

export function memberWasAbsent(schedule,member){
  if(!schedule||!member)return false;
  const assigned=(schedule.assignments||[]).some(a=>!a?.cut&&a?.personId===member.id);
  if(assigned)return false;
  if(Array.isArray(schedule.absentMemberIds)&&schedule.absentMemberIds.length){
    return schedule.absentMemberIds.map(String).includes(String(member.id));
  }
  const target=normName(member.name);
  return !!target&&Array.isArray(schedule.absentNames)&&schedule.absentNames.some(name=>normName(name)===target);
}

export function assignedLoad(schedule,weights={}){
  return (schedule?.assignments||[])
    .filter(a=>a&&!a.cut&&a.personId)
    .reduce((sum,a)=>sum+effectiveTaskWeight(a.taskId,weights,3),0);
}

export function actualCleaningPoints({schedules=[],memberId,beforeWeek="9999-99-99",afterWeek="",weights={}}={}){
  if(!memberId)return 0;
  return (schedules||[])
    .filter(s=>s?.weekStart&&s.weekStart<beforeWeek&&(!afterWeek||s.weekStart>afterWeek))
    .reduce((sum,s)=>sum+(s.assignments||[])
      .filter(a=>a?.personId===memberId&&!a.cut)
      .reduce((points,a)=>points+effectiveTaskWeight(a.taskId,weights,3),0),0);
}

export function activeAssigneeCount(schedule){
  return new Set((schedule?.assignments||[])
    .filter(a=>a&&!a.cut&&a.personId)
    .map(a=>String(a.personId))).size;
}

// Virtual load for a legitimate long absence = average real load carried by
// the people who were present that week. This neutralizes future catch-up
// without awarding achievement points: it is used only by the scheduler.
export function absenceCreditForWeek(schedule,weights={}){
  const count=activeAssigneeCount(schedule);
  if(!count)return 0;
  return assignedLoad(schedule,weights)/count;
}

export function absenceCreditBreakdown({schedules=[],member,beforeWeek="9999-99-99",weights={},minStreakWeeks=2}={}){
  const ordered=(schedules||[])
    .filter(s=>s?.weekStart&&s.weekStart<beforeWeek)
    .slice().sort((a,b)=>a.weekStart.localeCompare(b.weekStart));
  const credits=[];
  let streak=[];

  const flush=()=>{
    if(streak.length>=minStreakWeeks){
      for(const schedule of streak){
        credits.push({
          weekStart:schedule.weekStart,
          credit:absenceCreditForWeek(schedule,weights),
          streakWeeks:streak.length
        });
      }
    }
    streak=[];
  };

  for(const schedule of ordered){
    const absent=memberWasAbsent(schedule,member);
    if(!absent){flush();continue;}
    if(streak.length){
      const previous=streak[streak.length-1];
      const gap=(dateMs(schedule.weekStart)-dateMs(previous.weekStart))/DAY_MS;
      if(gap!==7)flush();
    }
    streak.push(schedule);
  }
  flush();
  return credits;
}

export function longAbsenceCredit(options={}){
  return absenceCreditBreakdown(options).reduce((sum,row)=>sum+row.credit,0);
}

export function cleaningPointAdjustment(value){
  const adjustment=Number(value);
  return Number.isFinite(adjustment)&&adjustment>=0?adjustment:0;
}

export function historicalFairnessLoad({schedules=[],member,beforeWeek="9999-99-99",weights={},minStreakWeeks=2,manualAdjustment=0}={}){
  if(!member)return 0;
  const actual=(schedules||[])
    .filter(s=>s?.weekStart<beforeWeek)
    .reduce((sum,s)=>sum+(s.assignments||[])
      .filter(a=>a?.personId===member.id&&!a.cut)
      .reduce((z,a)=>z+effectiveTaskWeight(a.taskId,weights,3),0),0);
  return actual+longAbsenceCredit({schedules,member,beforeWeek,weights,minStreakWeeks})+cleaningPointAdjustment(manualAdjustment);
}

function seededRank(seed, taskId, memberId) {
  let hash=2166136261;
  for(const char of JSON.stringify([seed,taskId,memberId]))hash=Math.imul(hash^char.charCodeAt(0),16777619);
  return hash>>>0;
}

export function proposeCleaningSchedule({members,presence,tasks,schedules,week,weights,adjustments={},resetThrough="",fixed={},seed=week}){
  const absent=members.filter(member=>presence[member.id]===false);
  const people=members.filter(member=>presence[member.id]!==false);
  if(!people.length)return [];
  const history=schedules.filter(schedule=>schedule.weekStart<week).sort((a,b)=>b.weekStart.localeCompare(a.weekStart));
  const ledger=history.filter(schedule=>schedule.weekStart>resetThrough);
  const loads=new Map(people.map(member=>[member.id,historicalFairnessLoad({
    schedules:ledger,member,beforeWeek:week,weights,manualAdjustment:adjustments[member.id]
  })]));
  const weight=task=>effectiveTaskWeight(task.id,weights,task.w);
  for(const task of tasks){
    const memberId=fixed[task.id];
    if(loads.has(memberId))loads.set(memberId,loads.get(memberId)+weight(task));
  }
  const assignment=(task,member,reason)=>({
    taskId:task.id,task:task.name,personId:member?.id||null,personName:member?.name||"Tạm cắt",
    completed:false,cut:!member,reason
  });
  return [...tasks].sort((a,b)=>weight(b)-weight(a)||a.id.localeCompare(b.id)).map(task=>{
    const pinned=people.find(member=>member.id===fixed[task.id]);
    if(pinned)return assignment(task,pinned,{kind:"fixed"});
    if(fixed[task.id]===null||(absent.length===1&&task.id==="rac"))return assignment(task,null,{kind:"exempt"});
    const ranked=people.map(member=>{
      const lastSame=history.find(s=>s.assignments.some(a=>!a.cut&&a.personId===member.id&&a.taskId===task.id))?.weekStart||"";
      const lastAny=history.find(s=>s.assignments.some(a=>!a.cut&&a.personId===member.id))?.weekStart||"";
      return {member,load:loads.get(member.id),repeat:dateMs(week)-dateMs(lastSame)===7*DAY_MS,lastSame,lastAny,rank:seededRank(seed,task.id,member.id)};
    }).sort((a,b)=>Number(a.repeat)-Number(b.repeat)||a.load-b.load||
      a.lastSame.localeCompare(b.lastSame)||a.lastAny.localeCompare(b.lastAny)||a.rank-b.rank||a.member.id.localeCompare(b.member.id));
    const {member,load,repeat,lastSame,lastAny}=ranked[0];
    loads.set(member.id,load+weight(task));
    return assignment(task,member,{kind:"proposal",load,repeat,lastSame,lastAny});
  });
}
