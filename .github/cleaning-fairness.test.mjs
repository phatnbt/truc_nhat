import assert from "node:assert/strict";
import {
  absenceCreditForWeek,
  absenceCreditBreakdown,
  historicalFairnessLoad,
  actualCleaningPoints,
  cleaningPointAdjustment
} from "../src/core/cleaning-fairness.js";

const weights={lavabo:4,san:5,lau:4,quet:3,tham:2,rac:4};
const members=["A","B","C","D","E"].map(id=>({id,name:id}));

function week(weekStart,absentIds=[]){
  const present=members.filter(m=>!absentIds.includes(m.id));
  const tasks=["lavabo","san","lau","quet","tham","rac"];
  const assignments=tasks.map((taskId,i)=>({taskId,personId:present[i%present.length]?.id||null,cut:false}));
  return {weekStart,assignments,absentMemberIds:absentIds,absentNames:absentIds};
}

// Manual manager adjustments participate in fairness without rewriting history.
{
  const schedules=[week("2026-09-01",[])];
  const base=historicalFairnessLoad({schedules,member:members[0],weights});
  assert.equal(historicalFairnessLoad({schedules,member:members[0],weights,manualAdjustment:3}),base+3);
  assert.equal(cleaningPointAdjustment(-3),0);
  assert.equal(cleaningPointAdjustment("invalid"),0);
}

// Visible cleaning points are actual assignments only and respect an admin reset.
{
  const schedules=[week("2026-09-01",[]),week("2026-09-08",[])];
  assert.equal(actualCleaningPoints({schedules,memberId:"A",weights}),16);
  assert.equal(actualCleaningPoints({schedules,memberId:"A",weights,afterWeek:"2026-09-01"}),8);
  assert.equal(actualCleaningPoints({schedules,memberId:"B",weights,afterWeek:"2026-09-01"}),5);
}

// One isolated week of absence must NOT receive fairness credit.
{
  const schedules=[week("2026-09-01",["A"]),week("2026-09-08",[])];
  const rows=absenceCreditBreakdown({schedules,member:members[0],weights,minStreakWeeks:2});
  assert.equal(rows.length,0);
}

// Two consecutive absent weeks activate the rule retroactively for both weeks.
{
  const schedules=[week("2026-09-01",["A"]),week("2026-09-08",["A"]),week("2026-09-15",[])];
  const rows=absenceCreditBreakdown({schedules,member:members[0],weights,minStreakWeeks:2});
  assert.equal(rows.length,2);
  assert.ok(rows.every(r=>r.credit>0));
}

// Four-week legitimate absence should keep A near the average active workload,
// preventing a heavy-work catch-up wave on return.
{
  const schedules=[
    week("2026-09-01",["A"]),week("2026-09-08",["A"]),
    week("2026-09-15",["A"]),week("2026-09-22",["A"])
  ];
  const credit=historicalFairnessLoad({schedules,member:members[0],weights,minStreakWeeks:2});
  const expected=schedules.reduce((sum,s)=>sum+absenceCreditForWeek(s,weights),0);
  assert.equal(credit,expected);
  assert.ok(credit>=20,"four-week absence should receive enough virtual load to avoid catch-up");
}

// A calendar gap breaks the streak; two non-consecutive absences do not qualify.
{
  const schedules=[week("2026-09-01",["A"]),week("2026-09-15",["A"])];
  const rows=absenceCreditBreakdown({schedules,member:members[0],weights,minStreakWeeks:2});
  assert.equal(rows.length,0);
}

// Legacy data without absentMemberIds is still recognized by absentNames.
{
  const s1=week("2026-09-01",["A"]),s2=week("2026-09-08",["A"]);
  delete s1.absentMemberIds;delete s2.absentMemberIds;
  const rows=absenceCreditBreakdown({schedules:[s1,s2],member:members[0],weights,minStreakWeeks:2});
  assert.equal(rows.length,2);
}

console.log("Cleaning long-absence fairness tests passed.");
