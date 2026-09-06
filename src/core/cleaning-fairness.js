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

export function historicalFairnessLoad({schedules=[],member,beforeWeek="9999-99-99",weights={},minStreakWeeks=2}={}){
  if(!member)return 0;
  const actual=(schedules||[])
    .filter(s=>s?.weekStart<beforeWeek)
    .reduce((sum,s)=>sum+(s.assignments||[])
      .filter(a=>a?.personId===member.id&&!a.cut)
      .reduce((z,a)=>z+effectiveTaskWeight(a.taskId,weights,3),0),0);
  return actual+longAbsenceCredit({schedules,member,beforeWeek,weights,minStreakWeeks});
}
