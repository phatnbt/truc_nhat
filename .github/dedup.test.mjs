import fs from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";

const source=fs.readFileSync("app-integrity-fixes.js","utf8");
const days=(count,total=31)=>Object.fromEntries(Array.from({length:total},(_,i)=>[String(i+1),i<count]));
const monthDays=month=>{
  const [year,mon]=String(month).split("-").map(Number);
  return new Date(year,mon,0).getDate();
};

function makeContext({conflict=false}={}){
  const state={
    members:[
      {id:"tuan-old",name:"Tuấn Anh",createdAt:"2026-01-01T00:00:00Z"},
      {id:"tuan-map",name:"  Tuấn   Anh  ",createdAt:"2026-02-01T00:00:00Z"},
      {id:"hao-map",name:"Hào",createdAt:"2026-01-01T00:00:00Z"},
      {id:"hao-2",name:"Hào",createdAt:"2026-02-01T00:00:00Z"},
      {id:"hao-3",name:"Hào",createdAt:"2026-03-01T00:00:00Z"},
      {id:"hung-1",name:"Hùng",createdAt:"2026-01-01T00:00:00Z"},
      {id:"hung-2",name:"Hùng",createdAt:"2026-02-01T00:00:00Z"},
      {id:"thinh",name:"Thịnh",createdAt:"2026-01-01T00:00:00Z"}
    ],
    presence:{"tuan-old":true,"tuan-map":true,"hao-map":true,"hao-2":true,"hao-3":true,"hung-1":true,"hung-2":true,thinh:true},
    schedules:[{
      id:"week-1",weekStart:"2026-08-31",absentNames:[],
      assignments:[
        {taskId:"lavabo",personId:"hao-2",personName:"Hào",cut:false},
        {taskId:"san",personId:"tuan-old",personName:"Tuấn Anh",cut:false}
      ]
    }],
    billing:{months:[{
      id:"bill-1",month:"2026-08",closed:false,people:[
        {id:"p-tuan-old",memberId:"tuan-old",name:"Tuấn Anh",days:days(0),paid:false,paidAmount:0},
        {id:"p-tuan-map",memberId:"tuan-map",name:"Tuấn Anh",days:days(0),paid:false,paidAmount:0},
        {id:"p-hao-map",memberId:"hao-map",name:"Hào",days:days(0),paid:false,paidAmount:0},
        {id:"p-hao-2",memberId:"hao-2",name:"Hào",days:days(20),paid:false,paidAmount:0},
        {id:"p-hao-3",memberId:"hao-3",name:"Hào",days:days(0),paid:false,paidAmount:0},
        {id:"p-hung-1",memberId:"hung-1",name:"Hùng",days:days(0),paid:false,paidAmount:0},
        {id:"p-hung-2",memberId:"hung-2",name:"Hùng",days:days(4),paid:false,paidAmount:0},
        {id:"legacy-hung",memberId:null,name:" Hùng ",days:days(0),paid:false,paidAmount:0},
        {id:"p-thinh",memberId:"thinh",name:"Thịnh",days:days(20),paid:false,paidAmount:0}
      ]
    }]}
  };
  const accessAccounts=[
    {uid:"u-tuan",memberId:"tuan-map",active:true,displayName:"Tuấn Anh"},
    {uid:"u-hao",memberId:"hao-map",active:true,displayName:"Hào"}
  ];
  if(conflict)accessAccounts.push({uid:"u-hung-2",memberId:"hung-2",active:true,displayName:"Hùng"},{uid:"u-hung-1",memberId:"hung-1",active:true,displayName:"Hùng"});
  const context={
    console,state,accessAccounts,authSession:{status:"active",user:{uid:"admin"},access:{role:"admin",active:true}},
    ui:{},CACHE_KEY:"cache",UI_KEY:"ui",storageSet:()=>true,localStorage:{removeItem(){}},saveLocal(){},
    monthDays,timeMs:value=>Date.parse(value||"")||0,nowIso:()=>"2026-08-27T14:00:00.000Z",confirm:()=>true,
    requireAdmin:()=>true,toast(){},$(){return null;},uid:()=>"new-id",persist:async()=>true,realtimeEngine:null,
    relevantTaskSubmissions:()=>[],taskSubmissions:[],monthLabel:value=>value
  };
  vm.createContext(context);
  vm.runInContext(source,context,{filename:"app-integrity-fixes.js"});
  return context;
}

{
  const context=makeContext();
  const result=context.repairDuplicateMembersInMemory({ask:false});
  assert.equal(result.conflicts.length,0);
  assert.equal(result.mergedGroups,3);
  assert.equal(result.removedMembers,4);
  assert.equal(context.state.members.filter(member=>context.memberNameKey(member.name)==="tuấn anh").length,1);
  assert.equal(context.state.members.find(member=>context.memberNameKey(member.name)==="tuấn anh").id,"tuan-map","mapped Tuấn Anh ID must win");
  assert.equal(context.state.members.find(member=>context.memberNameKey(member.name)==="hào").id,"hao-map","mapped Hào ID must win");

  const bill=context.state.billing.months[0];
  const haoRows=bill.people.filter(person=>context.memberNameKey(person.name)==="hào");
  assert.equal(haoRows.length,1,"Hào billing rows must be deduplicated");
  assert.equal(haoRows[0].memberId,"hao-map");
  assert.equal(Object.values(haoRows[0].days).filter(Boolean).length,20,"20-day Hào history must be preserved by union");

  const hungRows=bill.people.filter(person=>context.memberNameKey(person.name)==="hùng");
  assert.equal(hungRows.length,1,"linked + legacy Hùng rows must collapse to one");
  assert.equal(Object.values(hungRows[0].days).filter(Boolean).length,4);

  assert.equal(context.state.schedules[0].assignments[0].personId,"hao-map","schedule assignment must remap to canonical ID");
  assert.equal(context.state.schedules[0].assignments[1].personId,"tuan-map","schedule assignment must remap to mapped canonical ID");
}

{
  const context=makeContext({conflict:true});
  const result=context.repairDuplicateMembersInMemory({ask:false});
  assert.equal(result.conflicts.length,1,"multiple account mappings for same name must be surfaced as conflict");
  assert.equal(context.state.members.filter(member=>context.memberNameKey(member.name)==="hùng").length,2,"ambiguous mapped members must not be auto-merged");
}

console.log("Duplicate member/mapping regression QA PASSED");
