import assert from "node:assert/strict";
import { memberStreak, petStage, petProgress, scheduleOutcome } from "../src/core/cleaning-streak.js";

const A={id:"A",name:"Phát"};
const done=(weekStart,personId="A")=>({weekStart,assignments:[{personId,taskId:"lavabo",cut:false,completed:true}]});
const missed=weekStart=>({weekStart,assignments:[{personId:"A",taskId:"lavabo",cut:false,completed:false}]});
const absent=weekStart=>({weekStart,assignments:[],absentMemberIds:["A"],absentNames:["Phát"]});
const rest=weekStart=>({weekStart,assignments:[{personId:"B",taskId:"lavabo",cut:false,completed:true}]});
const NOW=Date.UTC(2026,9,30);

// Three successful duty weeks grow the streak and evolve the pet.
{
  const s=memberStreak({member:A,now:NOW,schedules:[done("2026-09-01"),done("2026-09-08"),done("2026-09-15")]});
  assert.equal(s.current,3);
  assert.equal(s.best,3);
  assert.equal(s.completedWeeks,3);
  assert.equal(petStage(s.current).level,2);
}

// A legitimate absent week freezes the pet instead of destroying the streak.
{
  const s=memberStreak({member:A,now:NOW,schedules:[done("2026-09-01"),absent("2026-09-08"),done("2026-09-15")]});
  assert.equal(s.current,2);
  assert.equal(s.frozenWeeks,1);
}

// No assigned work is neutral: no free +1, no streak loss.
{
  const s=memberStreak({member:A,now:NOW,schedules:[done("2026-09-01"),rest("2026-09-08"),done("2026-09-15")]});
  assert.equal(s.current,2);
}

// A week that has ended with unfinished assigned work breaks current streak.
{
  const s=memberStreak({member:A,now:NOW,schedules:[done("2026-09-01"),done("2026-09-08"),missed("2026-09-15")]});
  assert.equal(s.current,0);
  assert.equal(s.best,2);
  assert.equal(s.missedWeeks,1);
}

// An in-progress week must not break the streak before its seven-day deadline.
{
  const now=Date.UTC(2026,8,18); // 18/09, week 15/09 is still active
  const current=missed("2026-09-15");
  assert.equal(scheduleOutcome(current,A,{now}).status,"pending");
  const s=memberStreak({member:A,now,schedules:[done("2026-09-01"),done("2026-09-08"),current]});
  assert.equal(s.current,2);
}

// Pet evolution remains bounded and deterministic.
assert.equal(petStage(0).emoji,"🥚");
assert.equal(petStage(1).emoji,"🐣");
assert.equal(petStage(3).level,2);
assert.equal(petStage(6).level,3);
assert.equal(petStage(10).level,4);
assert.equal(petProgress(10),100);

console.log("Cleaning mini pet streak tests passed.");
