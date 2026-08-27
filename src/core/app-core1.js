const TASKS = [
  {id:"lavabo",name:"Lavabo - Toilet",emoji:"🚽",w:5},
  {id:"san",name:"Sàn NVS - cống",emoji:"🧼",w:5},
  {id:"quet",name:"Quét nhà",emoji:"🧹",w:3},
  {id:"lau",name:"Lau nhà",emoji:"🪣",w:4},
  {id:"tham",name:"Giặt thảm",emoji:"🧺",w:2},
  {id:"rac",name:"Vứt rác, bình nước",emoji:"🗑️",w:2}
];
const FIREBASE_CONFIG = {
  apiKey:"AIzaSyAY42QGO8uYHJ9OZgfFw1kNKfnOv9hiHgc",
  authDomain:"p708-room-manager.firebaseapp.com",
  projectId:"p708-room-manager",
  storageBucket:"p708-room-manager.firebasestorage.app",
  messagingSenderId:"1073859440549",
  appId:"1:1073859440549:web:21879794f23e4d2ecc824c",
  measurementId:"G-PEW1YC01GY"
};
const ROOM_CODE = "P708";
const CACHE_KEY = "P708_MANAGER_STATE_V5";
const UI_KEY = "P708_MANAGER_UI_V5";
const DEVICE_KEY = "P708_DEVICE_ID";
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
const nowIso = () => new Date().toISOString();
const uid = () => crypto.randomUUID?.() || `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
const esc = value => String(value ?? "").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");
const money = value => `${new Intl.NumberFormat("vi-VN").format(Math.round(Number(value)||0))} đ`;
const storageGet = key => { try { return localStorage.getItem(key); } catch { return null; } };
const storageSet = (key,value) => { try { localStorage.setItem(key,value); return true; } catch { return false; } };

function getDeviceId(){
  const old = storageGet(DEVICE_KEY);
  if(old) return old;
  const value = uid(); storageSet(DEVICE_KEY,value); return value;
}
const DEVICE_ID = getDeviceId();

function todayMonth(){ const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`; }
function dateValue(d){ return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; }
function validMonthKey(v){ return /^\d{4}-(0[1-9]|1[0-2])$/.test(String(v||"")); }
function validDateKey(v){ return /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(String(v||"")); }
function parseDate(v){ if(!validDateKey(v))return new Date(NaN); const [y,m,d]=String(v).split("-").map(Number); return new Date(y,m-1,d); }
function addDays(d,n){ const x=new Date(d); x.setDate(x.getDate()+n); return x; }
function monthDays(v){ if(!validMonthKey(v))return 0; const [y,m]=String(v).split("-").map(Number); return new Date(y,m,0).getDate(); }
function monthLabel(v){ if(!validMonthKey(v)) return String(v||""); const [y,m]=v.split("-"); return `Tháng ${Number(m)}/${y}`; }
function nextMonday(){ const d=new Date(); d.setHours(0,0,0,0); const day=d.getDay(); d.setDate(d.getDate()+(day===0?1:8-day)); return d; }
function weekRange(v){ const s=parseDate(v); if(Number.isNaN(s.getTime()))return String(v||""); const e=addDays(s,6); const f=d=>new Intl.DateTimeFormat("vi-VN",{day:"2-digit",month:"2-digit",year:"numeric"}).format(d); return `${f(s)} – ${f(e)}`; }
function timeMs(v){ const n=Date.parse(v||""); return Number.isFinite(n)?n:0; }
function toast(message,duration=3000){ const el=$("#toast"); if(!el)return; el.textContent=message; el.classList.add("show"); clearTimeout(toast.timer); toast.timer=setTimeout(()=>el.classList.remove("show"),duration); }
function defaultState(){ return {members:[],presence:{},schedules:[],billing:{selectedMonth:todayMonth(),months:[]},settings:{weights:Object.fromEntries(TASKS.map(t=>[t.id,t.w]))},updatedAt:""}; }
function defaultUi(){ return {selectedMonth:todayMonth(),selectedScheduleId:null,activeBillPersonId:null}; }

function normalizeState(input){
  const s={...defaultState(),...(input||{})};
  s.members=Array.isArray(s.members)?s.members:[];
  s.presence=s.presence&&typeof s.presence==="object"&&!Array.isArray(s.presence)?s.presence:{};
  s.schedules=Array.isArray(s.schedules)?s.schedules:[];
  s.settings={...defaultState().settings,...(s.settings||{})};
  s.settings.weights={...defaultState().settings.weights,...(s.settings.weights||{})};
  for(const task of TASKS){const value=Number(s.settings.weights[task.id]);s.settings.weights[task.id]=Number.isFinite(value)&&value>=0?value:task.w;}
  s.billing=s.billing&&typeof s.billing==="object"?s.billing:{selectedMonth:todayMonth(),months:[]};
  s.billing.selectedMonth=validMonthKey(s.billing.selectedMonth)?s.billing.selectedMonth:todayMonth();
  s.billing.months=Array.isArray(s.billing.months)?s.billing.months:[];

  const seenMemberIds=new Set();
  s.members=s.members.filter(m=>m&&typeof m==="object").map(m=>{
    const copy=m;
    copy.id=String(copy.id||uid());
    while(seenMemberIds.has(copy.id))copy.id=uid();
    seenMemberIds.add(copy.id);
    copy.name=String(copy.name||"Thành viên").trim().replace(/\s+/g," ").slice(0,80)||"Thành viên";
    copy.updatedAt||=s.updatedAt||"";
    if(s.presence[copy.id]===undefined)s.presence[copy.id]=true;
    else s.presence[copy.id]=s.presence[copy.id]!==false;
    return copy;
  });

  s.schedules=s.schedules.filter(schedule=>schedule&&validDateKey(schedule.weekStart)).map(schedule=>{
    schedule.id=String(schedule.id||uid());
    schedule.assignments=Array.isArray(schedule.assignments)?schedule.assignments:[];
    schedule.updatedAt||=schedule.createdAt||s.updatedAt||"";
    schedule.assignments=schedule.assignments.filter(a=>a&&typeof a==="object").map(a=>{
      a.completed=!!a.completed;a.cut=!!a.cut;
      a.taskId=String(a.taskId||"");a.task=String(a.task||TASKS.find(t=>t.id===a.taskId)?.name||a.taskId).slice(0,120);
      a.personId=a.personId?String(a.personId):null;a.personName=String(a.personName||"").slice(0,80);
      return a;
    });
    schedule.absentNames=Array.isArray(schedule.absentNames)?schedule.absentNames.map(x=>String(x).slice(0,80)):[];
    return schedule;
  });

  s.billing.months=s.billing.months.filter(b=>b&&validMonthKey(b.month)).map(b=>{
    b.id=String(b.id||uid());
    b.people=Array.isArray(b.people)?b.people:[];
    b.electricity=Math.max(0,Math.round(Number(b.electricity)||0));
    b.water=Math.max(0,Math.round(Number(b.water)||0));
    b.closed=!!b.closed;b.updatedAt||=s.updatedAt||"";
    const seenPersonIds=new Set();
    b.people=b.people.filter(p=>p&&typeof p==="object").map(p=>{
      p.id=String(p.id||uid());while(seenPersonIds.has(p.id))p.id=uid();seenPersonIds.add(p.id);
      p.memberId=p.memberId?String(p.memberId):null;p.name=String(p.name||"Người chưa đặt tên").trim().replace(/\s+/g," ").slice(0,80)||"Người chưa đặt tên";
      p.days=p.days&&typeof p.days==="object"&&!Array.isArray(p.days)?p.days:{};
      const maxDay=monthDays(b.month),cleanDays={};for(let d=1;d<=maxDay;d++)cleanDays[String(d)]=p.days[String(d)]===true;p.days=cleanDays;
      p.paid=!!p.paid;p.paidAmount=Math.max(0,Math.round(Number(p.paidAmount)||0));p.updatedAt||=b.updatedAt||"";
      return p;
    });
    return b;
  });
  return s;
}
function loadState(){
  try {
    const raw=storageGet(CACHE_KEY)||storageGet("cleaning_shared_apps_script_v2")||storageGet("cleaning_shared_apps_script_v1");
    return normalizeState(JSON.parse(raw||"null")||defaultState());
  } catch { return normalizeState(defaultState()); }
}
function loadUi(){ try { const parsed=JSON.parse(storageGet(UI_KEY)||"null")||{};return {...defaultUi(),...parsed,selectedMonth:validMonthKey(parsed.selectedMonth)?parsed.selectedMonth:todayMonth()}; } catch { return defaultUi(); } }
function saveLocal(){ storageSet(CACHE_KEY,JSON.stringify(state)); storageSet(UI_KEY,JSON.stringify(ui)); }

let state=loadState();
let confirmedState=clone(state);
let ui=loadUi();
let authSession={status:"loading",user:null,access:null,request:null,adminExists:false};
let accessRequests=[];
let accessAccounts=[];
let auditLogs=[];
let taskSubmissions=[];
let auditFilters={member:"all",action:"all",query:""};
let realtimeEngine=null;
let syncStatus={mode:"loading",text:"Đang kết nối…"};

function isAdmin(){ return authSession.access?.active && authSession.access?.role==="admin"; }
function myMemberId(){ return authSession.access?.memberId||null; }
function myMember(){ return state.members.find(m=>m.id===myMemberId())||null; }
function requireAdmin(){ if(isAdmin())return true; toast("Chỉ trưởng phòng được thực hiện thao tác này"); return false; }
function canEditMember(memberId){ return isAdmin() || (myMemberId()&&myMemberId()===memberId); }
function canEditBillingPerson(person){ return !!person && (isAdmin() || (myMemberId()&&person.memberId===myMemberId())); }
function currentSchedule(){
  if(ui.selectedScheduleId){ const found=state.schedules.find(s=>s.id===ui.selectedScheduleId); if(found)return found; }
  const latest=[...state.schedules].sort((a,b)=>b.weekStart.localeCompare(a.weekStart))[0]||null;
  ui.selectedScheduleId=latest?.id||null; return latest;
}
function currentBill(){ return state.billing.months.find(b=>b.month===state.billing.selectedMonth)||null; }
function ensureBill(){ let b=currentBill(); if(b)return b; b={id:uid(),month:state.billing.selectedMonth,electricity:0,water:0,closed:false,people:[],updatedAt:nowIso()}; state.billing.months.push(b); return b; }
function activeBillPerson(b=currentBill()){ if(!b)return null; if(ui.activeBillPersonId){const found=b.people.find(p=>p.id===ui.activeBillPersonId); if(found)return found;} ui.activeBillPersonId=b.people[0]?.id||null; return b.people[0]||null; }
function stayCount(person,bill=currentBill()){ if(!person||!bill)return 0; let count=0; for(let d=1;d<=monthDays(bill.month);d++) if(person.days?.[String(d)])count++; return count; }
function allocate(total,people,bill){ total=Math.max(0,Math.round(Number(total)||0)); const rows=people.map((p,i)=>({id:p.id,i,days:stayCount(p,bill),base:0,frac:0})); const totalDays=rows.reduce((s,r)=>s+r.days,0); if(!total||!totalDays)return Object.fromEntries(rows.map(r=>[r.id,0])); let used=0; rows.forEach(r=>{const exact=total*r.days/totalDays;r.base=Math.floor(exact);r.frac=exact-r.base;used+=r.base;}); rows.sort((a,b)=>b.frac-a.frac||b.days-a.days||a.i-b.i); for(let i=0;i<total-used;i++)rows[i%rows.length].base++; return Object.fromEntries(rows.map(r=>[r.id,r.base])); }
function billCalc(b=currentBill()){ const bill=b||{month:state.billing.selectedMonth,electricity:0,water:0,people:[],closed:false}; const people=bill.people||[]; const electric=allocate(bill.electricity,people,bill),water=allocate(bill.water,people,bill); const totalDays=people.reduce((sum,p)=>sum+stayCount(p,bill),0); return {b:bill,people,electric,water,totalDays,due:Object.fromEntries(people.map(p=>[p.id,(electric[p.id]||0)+(water[p.id]||0)]))}; }
function submissionFor(schedule,assignment){ return taskSubmissions.find(s=>s.weekStart===schedule?.weekStart&&(!s.scheduleId||s.scheduleId===schedule?.id)&&s.taskId===assignment?.taskId&&s.memberId===assignment?.personId)||null; }
function isBillPaid(person,due){ return Number(due)>0 && person?.paid===true && Number(person?.paidAmount||0)>=Number(due); }
function billPaymentState(person,due){ const amount=Number(due)||0; return amount<=0?"none":isBillPaid(person,amount)?"paid":"unpaid"; }
