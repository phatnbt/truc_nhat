export function splitVnd(total, entries, mode) {
  if (!Number.isSafeInteger(total) || total <= 0) throw new Error("Tổng tiền VND phải là số nguyên dương.");
  if (!entries.length || new Set(entries.map(entry=>entry.id)).size !== entries.length) {
    throw new Error("Chọn các thành viên khác nhau.");
  }
  const rows = entries.map(({id,value})=>({id,value:mode==="equal"?1:Number(value)}));
  if (rows.some(row=>!Number.isSafeInteger(row.value)||row.value<0)) throw new Error("Phần chia phải là số nguyên không âm.");
  const sum = rows.reduce((amount,row)=>amount+BigInt(row.value),0n);
  if (mode==="custom") {
    if (sum!==BigInt(total)) throw new Error("Tổng phần chia phải khớp số tiền.");
    return Object.fromEntries(rows.map(row=>[row.id,row.value]));
  }
  if (!sum) throw new Error("Cần có ít nhất một phần chia lớn hơn 0.");
  const shares = rows.map(row=>{
    const numerator=BigInt(total)*BigInt(row.value);
    return {id:row.id,amount:Number(numerator/sum),remainder:numerator%sum};
  });
  shares.sort((a,b)=>a.remainder===b.remainder?(a.id<b.id?-1:1):a.remainder>b.remainder?-1:1);
  const residual=total-shares.reduce((amount,row)=>amount+row.amount,0);
  for(let i=0;i<residual;i++)shares[i].amount++;
  return Object.fromEntries(shares.map(row=>[row.id,row.amount]));
}
