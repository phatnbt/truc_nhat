import assert from "node:assert/strict";
import {expect} from "@playwright/test";
import {collection,doc,FieldPath,getDocFromServer,getDocsFromServer,increment,setDoc,updateDoc} from "firebase/firestore";
import {addUtcDays,dateKey,parseDateKey} from "../src/core/billing-cycle-period.js";

const taskIds=["lavabo","san","quet","lau","tham","rac"];
const memberIds=["b","c","d"];
const reportId=({weekStart,taskId,memberId})=>[weekStart,taskId,memberId].join("__");
const stamp=({seconds,nanoseconds})=>({seconds,nanoseconds});
const submit=(page,task)=>page.evaluate(task=>realtimeEngine.submitTask({...task,checks:["task","finish"]}),task);
const review=(page,task,submittedAt,status="approved")=>page.evaluate(args=>realtimeEngine.reviewTask(args),{
  submissionId:reportId(task),status,expectedSubmittedAt:stamp(submittedAt)
});
const toDocumentMap=snapshot=>new Map(snapshot.docs.map(entry=>[entry.id,entry.data()]));

export async function runCriticalCleaningStress({env,browser,manager,resident,member,monday,testAccount,login,room,viewport}){
  const [c,d,delegate]=await Promise.all([
    testAccount("stress-member-c","chromium"),testAccount("stress-member-d","chromium"),testAccount("stress-admin","chromium")
  ]);
  const accounts={b:member,c,d};
  const names={b:"Bình",c:"Chi",d:"Dũng"};
  const weeks=Array.from({length:7},(_,index)=>{
    const weekStart=dateKey(addUtcDays(parseDateKey(monday),-7*(index+1)));
    return taskIds.map((taskId,taskIndex)=>({
      weekStart,scheduleId:`qa-stress-${weekStart}`,taskId,memberId:memberIds[(taskIndex+index)%memberIds.length]
    }));
  });
  const removed=weeks.pop()[0];
  const before=await readServer();
  await env.withSecurityRulesDisabled(async context=>{
    const db=context.firestore(),fields=[];
    for(const [memberId,account] of Object.entries({c,d})){
      fields.push(new FieldPath("payload","members",memberId),{id:memberId,name:names[memberId]});
      await setDoc(doc(db,room,"access",account.uid),{active:true,role:"member",memberId,displayName:names[memberId],email:account.email});
    }
    await setDoc(doc(db,room,"access",delegate.uid),{active:true,role:"admin",memberId:null,displayName:"Quản trị QA",email:delegate.email});
    for(const tasks of [...weeks,[removed]]){
      const {weekStart,scheduleId}=tasks[0];
      const assignments=tasks.map(({taskId,memberId})=>({
        taskId,task:taskId,personId:memberId,personName:names[memberId],completed:false
      }));
      fields.push(new FieldPath("payload","schedules",weekStart),{id:scheduleId,weekStart,assignments});
    }
    await updateDoc(doc(db,room),...fields,"revision",increment(1));
  });

  const pages={b:resident,c:await browser.newPage({viewport}),d:await browser.newPage({viewport})};
  const secondAdmin=await browser.newPage({viewport});
  const secondDevice=await browser.newPage({viewport});
  try{
    const errors=await Promise.all([login(pages.c,c,4),login(pages.d,d,4),login(secondAdmin,delegate,4),login(secondDevice,member,4)]);
    const tasks=weeks.flat();
    const sample=weeks[0][0];

    // A failed offline attempt must not be queued or later count as another completion.
    await resident.context().setOffline(true);
    try{await assert.rejects(submit(resident,sample),/ngoại tuyến/i);}
    finally{await resident.context().setOffline(false);}
    await assert.rejects(submit(pages.c,sample),/công việc của mình/i);
    assert.equal((await readServer()).reports.has(reportId(sample)),false);

    await submit(pages[removed.memberId],removed);
    const tombstoneResult=await manager.evaluate(({weekStart,scheduleId})=>globalThis.deleteScheduleAuthoritatively({
      firebaseConfig:FIREBASE_CONFIG,roomCode:ROOM_CODE,deviceId:DEVICE_ID,weekStart,scheduleId
    }),removed);
    assert.equal(tombstoneResult?.reason,"deleted");
    assert.equal(await manager.evaluate(({weekStart,scheduleId})=>realtimeEngine.deleteTaskSubmissionsForWeek(weekStart,scheduleId),removed),1);
    await assert.rejects(submit(pages[removed.memberId],removed),/không còn được phân/i);

    let submitted=0,retries=0,rejected=0,approved=0;
    for(const week of weeks){
      for(let index=0;index<week.length;index+=3){
        await Promise.all(week.slice(index,index+3).map(task=>submit(pages[task.memberId],task)));
        submitted+=3;
      }
    }
    const firstReports=(await readServer()).reports;
    for(let index=0;index<10;index++){
      await Promise.all([resident,secondDevice].map(page=>submit(page,sample)));
      retries+=2;
    }
    const retriedReports=(await readServer()).reports;
    for(const task of tasks)assert.deepEqual(retriedReports.get(reportId(task)),firstReports.get(reportId(task)));

    for(const week of weeks){
      const task=week[0],report=firstReports.get(reportId(task));
      await review(manager,task,report.submittedAt,"rejected");
      rejected++;
      await submit(pages[task.memberId],task);
      submitted++;
      await assert.rejects(review(secondAdmin,task,report.submittedAt),/báo cáo mới/i);
    }
    const pending=(await readServer()).reports;
    for(let index=0;index<tasks.length;index+=2){
      await Promise.all(tasks.slice(index,index+2).map((task,offset)=>
        review(offset===0?manager:secondAdmin,task,pending.get(reportId(task)).submittedAt)));
      approved+=2;
    }
    const concurrentRetry=tasks[0];
    await Promise.all([manager,secondAdmin].map(page=>review(page,concurrentRetry,pending.get(reportId(concurrentRetry)).submittedAt)));
    retries+=2;
    assert.equal(await manager.evaluate(({weekStart,scheduleId})=>realtimeEngine.reconcileTaskSubmissions({weekStart,scheduleId}),sample),0);

    const after=await readServer();
    assert.equal(after.reports.size,before.reports.size+tasks.length);
    assert.equal(after.payload.schedules[removed.weekStart],undefined);
    assert.equal(after.payload._sync.deletedSchedules[removed.weekStart].scheduleId,removed.scheduleId);
    assert.equal(after.reports.has(reportId(removed)),false);
    for(const [id,report] of before.reports)assert.deepEqual(after.reports.get(id),report);
    for(const [week,schedule] of Object.entries(before.payload.schedules))assert.deepEqual(after.payload.schedules[week],schedule);
    for(const week of weeks){
      const {weekStart,scheduleId}=week[0];
      const schedule=after.payload.schedules[weekStart];
      assert.equal(schedule.id,scheduleId);
      assert.equal(schedule.assignments.length,week.length);
      for(const task of week){
        const assignment=schedule.assignments.find(entry=>entry.taskId===task.taskId);
        assert.equal(assignment.personId,task.memberId);
        assert.equal(assignment.completed,true);
        const report=after.reports.get(reportId(task));
        assert.equal(report.status,"approved");
        assert.equal(report.actorUid,accounts[task.memberId].uid);
        for(const field of ["scheduleId","weekStart","taskId","memberId"])assert.equal(report[field],task[field]);
      }
    }
    const current=after.payload.schedules[monday].assignments.filter(task=>!task.cut);
    await expect(manager.locator("#kpiTasks")).toHaveText(`${current.filter(task=>task.completed).length}/${current.length}`);
    for(const [memberId,page] of Object.entries(pages)){
      const prior=Object.values(before.payload.schedules).flatMap(schedule=>schedule.assignments)
        .filter(task=>task.personId===memberId&&task.completed&&!task.cut).length;
      const added=tasks.filter(task=>task.memberId===memberId).length;
      const priorWeeks=Object.values(before.payload.schedules).filter(schedule=>{
        const assigned=schedule.assignments.filter(task=>task.personId===memberId&&!task.cut);
        return assigned.length&&assigned.every(task=>task.completed===true);
      }).length;
      const garden=page.locator(`#homePetGarden [data-garden-member="${memberId}"]`);
      await expect(garden).toContainText(`${(prior+added)*10} EXP`);
      await expect(garden).toHaveAttribute("aria-label",new RegExp(`streak ${priorWeeks+weeks.length} tuần`));
      await page.reload();
      await expect(garden).toContainText(`${(prior+added)*10} EXP`);
      await expect(garden).toHaveAttribute("aria-label",new RegExp(`streak ${priorWeeks+weeks.length} tuần`));
    }
    for(const pageErrors of errors)assert.deepEqual(pageErrors,[]);
    const operations=submitted+rejected+approved+retries;
    assert.ok(operations>=100);
    console.log(`Critical cleaning stress PASS: ${operations} operations (${submitted} submissions, ${rejected} rejections, ${approved} approvals, ${retries} retries), ${weeks.length} weeks, ${memberIds.length} assignees, 2 managers, 1 tombstone verified.`);
  }finally{
    await Promise.all([pages.c,pages.d,secondAdmin,secondDevice].map(page=>page.close()));
  }

  async function readServer(){
    let snapshot;
    await env.withSecurityRulesDisabled(async context=>{
      const db=context.firestore();
      const [roomPath,reports]=await Promise.all([
        getDocFromServer(doc(db,room)),getDocsFromServer(collection(db,room,"taskSubmissions"))
      ]);
      snapshot={payload:roomPath.data().payload,reports:toDocumentMap(reports)};
    });
    return snapshot;
  }
}
