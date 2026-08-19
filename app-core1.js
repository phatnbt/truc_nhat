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
function parseDate(v){ const [y,m,d]=String(v).split("-").map(Number); return new Date(y,m-1,d); }
function addDays(d,n){ const x=new Date(d); x.setDate(x.getDate()+n); return x; }
function monthDays(v){ const [y,m]=String(v).split("-").map(Number); return new Date(y,m,0).getDate(); }
function monthLabel(v){ if(!/^\d{4}-\d{2}$/.test(v||"")) return v||""; const [y,m]=v.split("-"); return `Tháng ${Number(m)}/${y}`; }
function nextMonday(){ const d=new Date(); d.setHours(0,0,0,0); const day=d.getDay(); d.setDate(d.getDate()+(day===0?1:8-day)); return d; }
function weekRange(v){ const s=parseDate(v),e=addDays(s,6); const f=d=>new Intl.DateTimeFormat("vi-VN",{day:"2-digit",month:"2-digit",year:"numeric"}).format(d); return `${f(s)} – ${f(e)}`; }
function timeMs(v){ const n=Date.parse(v||""); return Number.isFinite(n)?n:0; }
function toast(message,duration=3000){ const el=$("#toast"); if(!el)return; el.textContent=message; el.classList.add("show"); clearTimeout(toast.timer); toast.timer=setTimeout(()=>el.classList.remove("show"),duration); }
function defaultState(){ return {members:[],presence:{},schedules:[],billing:{selectedMonth:todayMonth(),months:[]},settings:{weights:Object.fromEntries(TASKS.map(t=>[t.id,t.w]))},updatedAt:""}; }
function defaultUi(){ return {selectedMonth:todayMonth(),selectedScheduleId:null,activeBillPersonId:null}; }

function normalizeState(input){
  const s={...defaultState(),...(input||{})};
  s.members=Array.isArray(s.members)?s.members:[]; s.presence=s.presence||{}; s.schedules=Array.isArray(s.schedules)?s.schedules:[];
  s.settings={...defaultState().settings,...(s.settings||{})}; s.settings.weights={...defaultState().settings.weights,...(s.settings.weights||{})};
  s.billing=s.billing||{selectedMonth:todayMonth(),months:[]}; s.billing.selectedMonth=s.billing.selectedMonth||todayMonth(); s.billing.months=Array.isArray(s.billing.months)?s.billing.months:[];
  s.members.forEach(m=>{m.updatedAt||=s.updatedAt||""; if(s.presence[m.id]===undefined)s.presence[m.id]=true;});
  s.schedules.forEach(schedule=>{schedule.assignments=Array.isArray(schedule.assignments)?schedule.assignments:[];schedule.updatedAt||=schedule.createdAt||s.updatedAt||"";schedule.assignments.forEach(a=>{a.completed=!!a.completed;a.cut=!!a.cut;});});
  s.billing.months.forEach(b=>{b.people=Array.isArray(b.people)?b.people:[];b.electricity=Number(b.electricity)||0;b.water=Number(b.water)||0;b.closed=!!b.closed;b.updatedAt||=s.updatedAt||"";b.people.forEach(p=>{p.days=p.days||{};p.paid=!!p.paid;p.paidAmount=Math.max(0,Number(p.paidAmount)||0);p.updatedAt||=b.updatedAt||"";});});
  return s;
}
function loadState(){
  try {
    const raw=storageGet(CACHE_KEY)||storageGet("cleaning_shared_apps_script_v2")||storageGet("cleaning_shared_apps_script_v1");
    return normalizeState(JSON.parse(raw||"null")||defaultState());
  } catch { return normalizeState(defaultState()); }
}
function loadUi(){ try { return {...defaultUi(),...(JSON.parse(storageGet(UI_KEY)||"null")||{})}; } catch { return defaultUi(); } }
function saveLocal(){ storageSet(CACHE_KEY,JSON.stringify(state)); storageSet(UI_KEY,JSON.stringify(ui)); }

let state=loadState();
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
function submissionFor(schedule,assignment){ return taskSubmissions.find(s=>s.weekStart===schedule?.weekStart&&s.taskId===assignment?.taskId&&s.memberId===assignment?.personId)||null; }
function isBillPaid(person,due){ return Number(due)>0 && person?.paid===true && Number(person?.paidAmount||0)>=Number(due); }
