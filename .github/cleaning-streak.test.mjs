import assert from "node:assert/strict";
import { DAILY_XP, PET_STAGES, petStage, petProgress, xpToNextStage, normalizePetStatus, stageCollection } from "../src/core/cleaning-streak.js";

assert.equal(DAILY_XP,20);
assert.deepEqual(PET_STAGES.map(stage=>stage.threshold),[0,100,300,700]);
assert.equal(petStage(0).level,0);
assert.equal(petStage(99).level,0);
assert.equal(petStage(100).level,1);
assert.equal(petStage(299).level,1);
assert.equal(petStage(300).level,2);
assert.equal(petStage(699).level,2);
assert.equal(petStage(700).level,3);
assert.equal(petProgress(0),0);
assert.equal(petProgress(50),50);
assert.equal(petProgress(100),0);
assert.equal(petProgress(700),100);
assert.equal(xpToNextStage(680),20);
assert.equal(xpToNextStage(700),0);
assert.deepEqual(stageCollection(299).map(stage=>stage.unlocked),[true,true,false,false]);

const normalized=normalizePetStatus({mode:"ready",checkedInToday:true,profile:{xp:305,currentStreak:4,bestStreak:7,unlockedStages:[0,1,2]}});
assert.equal(normalized.profile.stage.level,2);
assert.equal(normalized.profile.currentStreak,4);
assert.equal(normalized.checkedInToday,true);

console.log("Streak Pet XP and evolution tests passed.");
