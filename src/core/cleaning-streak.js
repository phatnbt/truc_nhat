export const DAILY_XP=20;
export const PET_STAGES=Object.freeze([
  Object.freeze({level:0,threshold:0,name:"Mầm Mây",asset:"./icons/pets/cloud-sprout.svg"}),
  Object.freeze({level:1,threshold:100,name:"Mèo Mây",asset:"./icons/pets/cloud-cat.svg"}),
  Object.freeze({level:2,threshold:300,name:"Linh Thú Mây",asset:"./icons/pets/cloud-guardian.svg"}),
  Object.freeze({level:3,threshold:700,name:"Thần Thú P708",asset:"./icons/pets/cloud-celestial.svg"})
]);

export function petStage(xp=0){
  const safe=Math.max(0,Math.floor(Number(xp)||0));
  let stage=PET_STAGES[0];
  for(const candidate of PET_STAGES)if(safe>=candidate.threshold)stage=candidate;
  return {...stage,next:PET_STAGES[stage.level+1]||null};
}

export function petProgress(xp=0){
  const safe=Math.max(0,Math.floor(Number(xp)||0)),stage=petStage(safe);
  if(!stage.next)return 100;
  return Math.max(0,Math.min(100,Math.round((safe-stage.threshold)/(stage.next.threshold-stage.threshold)*100)));
}

export function xpToNextStage(xp=0){
  const safe=Math.max(0,Math.floor(Number(xp)||0)),stage=petStage(safe);
  return stage.next?Math.max(0,stage.next.threshold-safe):0;
}

export function normalizePetStatus(input={}){
  const source=input&&typeof input==="object"?input:{},profile=source.profile&&typeof source.profile==="object"?source.profile:{};
  const xp=Math.max(0,Math.floor(Number(profile.xp)||0)),stage=petStage(xp);
  return {
    mode:String(source.mode||"idle"),error:String(source.error||""),serverDate:String(source.serverDate||""),
    checkedInToday:source.checkedInToday===true,canCheckIn:source.canCheckIn===true,
    eligibleActivityId:source.eligibleActivityId?String(source.eligibleActivityId):null,
    awarded:source.awarded===true,alreadyCheckedIn:source.alreadyCheckedIn===true,leveledUp:source.leveledUp===true,
    xpAwarded:Math.max(0,Math.floor(Number(source.xpAwarded)||0)),
    profile:{xp,currentStreak:Math.max(0,Math.floor(Number(profile.currentStreak)||0)),bestStreak:Math.max(0,Math.floor(Number(profile.bestStreak)||0)),lastCheckInDate:String(profile.lastCheckInDate||""),unlockedStages:Array.isArray(profile.unlockedStages)?profile.unlockedStages.map(Number).filter(Number.isInteger):[0],stage}
  };
}

export function stageCollection(xp=0){
  const safe=Math.max(0,Math.floor(Number(xp)||0));
  return PET_STAGES.map(stage=>({...stage,unlocked:safe>=stage.threshold}));
}
