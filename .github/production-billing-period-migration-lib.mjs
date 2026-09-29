import {
  BILLING_CYCLE_CUTOVER_MONTH,
  cycleBounds,
  dateRangeKeys,
  parseDateKey,
  shiftMonth
} from "../src/core/billing-cycle-period.js";

const clone=value=>value==null?value:JSON.parse(JSON.stringify(value));

function migrateDays(days,month,dates){
  const output=clone(days&&typeof days==="object"&&!Array.isArray(days)?days:{});
  const allowed=new Set(dates);
  for(const [key,value] of Object.entries(output)){
    if(value!==true||parseDateKey(key))continue;
    const day=Number(key);
    if(!Number.isInteger(day)||day<1||day>31)continue;
    const dateMonth=day>=29?shiftMonth(month,-1):month;
    const candidate=`${dateMonth}-${String(day).padStart(2,"0")}`;
    if(allowed.has(candidate))output[candidate]=true;
  }
  for(const date of dates)if(!(date in output))output[date]=false;
  return output;
}

export function migrateBillingPeriods(payload,{updatedAt=new Date().toISOString()}={}){
  const next=clone(payload)||{},changedMonths=[],beforeMonths={};
  next.billingMonths=next.billingMonths&&typeof next.billingMonths==="object"?next.billingMonths:{};

  for(const [month,bill] of Object.entries(next.billingMonths)){
    if(month<BILLING_CYCLE_CUTOVER_MONTH||!bill||typeof bill!=="object")continue;
    const bounds=cycleBounds(month),dates=dateRangeKeys(bounds.start,bounds.end);
    const alreadyCurrent=bill.cycleStart===bounds.start
      &&bill.cycleEnd===bounds.end
      &&bill.cycleRule==="29-28"
      &&bill.dayMode==="date"
      &&bill.cycleCustomized===false;
    if(alreadyCurrent)continue;

    beforeMonths[month]=clone(bill);
    bill.cycleMode="28-27"; // compatibility tag read by older installed PWA clients
    bill.cycleRule="29-28";
    bill.dayMode="date";
    bill.cycleStart=bounds.start;
    bill.cycleEnd=bounds.end;
    bill.cycleCustomized=false;
    bill.updatedAt=updatedAt;
    for(const person of Object.values(bill.people||{})){
      if(!person||typeof person!=="object")continue;
      person.days=migrateDays(person.days,month,dates);
      person.updatedAt=updatedAt;
    }
    changedMonths.push(month);
  }

  return {payload:next,changedMonths,beforeMonths};
}
