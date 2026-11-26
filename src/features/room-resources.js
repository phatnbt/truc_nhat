function renderRoomResources(){
  const inventory=Object.values(state.resources?.inventory||{});
  const expenses=Object.values(state.resources?.expenses||{}).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
  const refill=inventory.filter(item=>item.quantity<=item.threshold);
  const formatItem=item=>`${esc(item.name)} · ${item.quantity} ${esc(item.unit)}`;
  $("#stockList").innerHTML=inventory.length?inventory.map(item=>
    `<div class="room-presence"><div><b>${formatItem(item)}</b><div>${item.quantity<=item.threshold?"Cần mua":"Còn hàng"}${item.condition?" · "+esc(item.condition):""}${item.purchase?" · Lần mua: "+money(item.purchase.amount)+" · "+esc(item.purchase.payerName):""}</div></div>${isAdmin()?`<button class="btn small" data-stock-edit="${esc(item.id)}" type="button">Sửa</button>`:""}</div>`
  ).join(""):'<p class="empty">Chưa có vật dụng.</p>';
  $("#shoppingList").textContent=refill.length?refill.map(item=>item.name).join(" · "):"Chưa có vật dụng cần mua.";
  $("#roomExpenses").innerHTML=expenses.length?expenses.map(item=>
    `<details class="history-details"><summary>${esc(item.name)} · ${money(item.total)}</summary><div class="card-body"><small>${esc(item.createdAt.slice(0,10))} · ${esc(item.payerName)} ứng tiền</small>${Object.entries(item.shares).map(([id,amount])=>`<div class="room-presence"><b>${esc(item.names[id])}</b><span>${money(amount)} · ${id===item.payerId?"Đã ứng":item.settled?.[id]?"Đã đối soát":"Chưa đối soát"}</span>${isAdmin()&&amount>0&&id!==item.payerId?`<button type="button" class="btn small" data-settle-expense="${esc(item.id)}" data-settle-member="${esc(id)}">${item.settled?.[id]?"Hoàn tác":"Đã trả"}</button>`:""}</div>`).join("")}</div></details>`
  ).join(""):'<p class="empty">Chưa có khoản chi.</p>';

  const payer=$("#expensePayer"),purchase=$("#expenseStock");
  const oldPayer=payer.value,oldPurchase=purchase.value;
  payer.replaceChildren(new Option("Chọn người ứng tiền",""),...state.members.map(m=>new Option(m.name,m.id)));
  purchase.replaceChildren(new Option("Không liên kết vật dụng",""),...inventory.map(item=>new Option(item.name,item.id)));
  payer.value=state.members.some(m=>m.id===oldPayer)?oldPayer:"";
  purchase.value=inventory.some(item=>item.id===oldPurchase)?oldPurchase:"";
  const existing=Object.fromEntries($$("[data-share-member]").map(input=>[input.dataset.shareMember,input.value]));
  $("#expenseShares").innerHTML=state.members.map(m=>`<label class="field">${esc(m.name)}<input data-share-member="${esc(m.id)}" type="number" step="1" min="0" value="${esc(existing[m.id]??"1")}"></label>`).join("");
  updateExpenseFields();
}

function updateExpenseFields(){
  const mode=$("#expenseMode").value;
  $("#expenseShares").hidden=!["ratio","custom"].includes(mode);
  $("#purchaseQuantityField").hidden=!$("#expenseStock").value;
}

function editStock(id){
  const form=$("#stockForm"),item=state.resources?.inventory?.[id];
  if(!item)return;
  form.closest("details").open=true;
  for(const key of ["id","name","unit","quantity","threshold","condition"])form.elements.namedItem(key).value=item[key]??"";
  form.elements.namedItem("name").focus();
}

async function saveRoomResource(form,action,summary,change){
  if(!requireAdmin()||form.dataset.saving==="true")return;
  const button=form.querySelector("button[type=submit]");
  form.dataset.saving="true";button.disabled=true;
  try{
    const resources=clone(state.resources||{inventory:{},expenses:{}});
    change(resources);
    state.resources=resources;
    if(await persist("Đã lưu",{action,summary})){
      form.reset();
      form.querySelectorAll("[data-share-member]").forEach(input=>input.value="1");
      updateExpenseFields();
    }
  }catch(e){toast(e.message);}
  finally{delete form.dataset.saving;button.disabled=false;}
}

function saveStock(event){
  event.preventDefault();
  const form=event.currentTarget,fields=new FormData(form);
  const name=String(fields.get("name")).trim(),unit=String(fields.get("unit")).trim();
  const quantity=Number(fields.get("quantity")),threshold=Number(fields.get("threshold"));
  if(!name||!unit||!Number.isSafeInteger(quantity)||quantity<0||!Number.isSafeInteger(threshold)||threshold<0)return toast("Kiểm tra tên, đơn vị và số lượng.");
  void saveRoomResource(form,"SAVE_STOCK",`Cập nhật vật dụng: ${name}`,resources=>{
    const id=fields.get("id")||uid();
    resources.inventory[id]={...resources.inventory[id],id,name,unit,quantity,threshold,condition:String(fields.get("condition")).trim()};
  });
}

function saveRoomExpense(event){
  event.preventDefault();
  const form=event.currentTarget,fields=new FormData(form),payer=state.members.find(m=>m.id===fields.get("payer"));
  const name=String(fields.get("name")).trim(),total=Number(fields.get("amount")),mode=fields.get("mode");
  const inventoryId=fields.get("stock"),quantity=Number(fields.get("purchaseQuantity"));
  if(!name||!payer)return toast("Nhập khoản chi và chọn người ứng tiền.");
  const bill=currentBill();
  if(mode==="days"&&!bill)return toast("Chọn kỳ điện nước có ngày ở trước khi chia.");
  const days=new Map((bill?.people||[]).map(p=>[p.memberId,stayCount(p,bill)]));
  const inputs=new Map($$("[data-share-member]").map(input=>[input.dataset.shareMember,input.value]));
  void saveRoomResource(form,"RECORD_EXPENSE",`Ghi khoản chi: ${name}`,resources=>{
    const shares=splitVnd(total,state.members.map(m=>({id:m.id,value:mode==="days"?days.get(m.id)||0:inputs.get(m.id)})),mode);
    const id=form.dataset.expenseId||uid(),createdAt=nowIso();
    form.dataset.expenseId=id;
    if(resources.expenses[id])return;
    if(inventoryId){
      const item=resources.inventory[inventoryId];
      if(!item||!Number.isSafeInteger(quantity)||quantity<=0||!Number.isSafeInteger(item.quantity+quantity))throw new Error("Kiểm tra số lượng vật dụng đã mua.");
      item.quantity+=quantity;item.purchase={expenseId:id,amount:total,payerName:payer.name,createdAt};
    }
    resources.expenses[id]={id,name,total,payerId:payer.id,payerName:payer.name,mode,shares,createdAt,inventoryId,quantity:inventoryId?quantity:0,names:Object.fromEntries(state.members.map(m=>[m.id,m.name]))};
  }).then(()=>{if(!form.elements.namedItem("name").value)delete form.dataset.expenseId;});
}

function bindRoomResources(){
  $("#stockForm").addEventListener("submit",saveStock);
  $("#expenseForm").addEventListener("submit",saveRoomExpense);
  $("#expenseMode").addEventListener("change",updateExpenseFields);
  $("#expenseStock").addEventListener("change",updateExpenseFields);
  $("#stockList").addEventListener("click",event=>{
    const button=event.target.closest("[data-stock-edit]");
    if(button)editStock(button.dataset.stockEdit);
  });
  $("#roomExpenses").addEventListener("click",event=>{
    const button=event.target.closest("[data-settle-expense]");
    if(!button||!requireAdmin())return;
    const expense=state.resources?.expenses?.[button.dataset.settleExpense],memberId=button.dataset.settleMember;
    if(!expense?.shares?.[memberId])return;
    expense.settled||={};
    expense.settled[memberId]=!expense.settled[memberId];
    void persist("Đã cập nhật đối soát",{action:"SETTLE_EXPENSE",targetMemberId:memberId,summary:`Đối soát ${expense.name}`});
  });
}
