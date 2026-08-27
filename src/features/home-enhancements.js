(()=>{
  const link=document.createElement("link");
  link.rel="stylesheet";link.href="./utility-chart.css?v=20260819-4";link.dataset.utilityChart="1";
  if(!document.querySelector('link[data-utility-chart="1"]'))document.head.appendChild(link);

  document.querySelector(".hero-proof")?.remove();

  function shiftMonth(key,offset){
    const [year,month]=String(key||"").split("-").map(Number);
    const d=new Date(year||new Date().getFullYear(),(month||new Date().getMonth()+1)-1+offset,1);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
  }
  function shortMonth(key){const [,m]=String(key).split("-");return `T${Number(m)||"?"}`;}
  function utilityMonths(){
    const months=Array.isArray(state?.billing?.months)?state.billing.months:[];
    const latest=months.map(item=>item?.month).filter(Boolean).sort().at(-1);
    const anchor=latest||state?.billing?.selectedMonth||todayMonth();
    const byMonth=new Map(months.map(item=>[item.month,item]));
    return Array.from({length:6},(_,index)=>{
      const month=shiftMonth(anchor,index-5),item=byMonth.get(month)||{};
      return {month,electricity:Number(item.electricity)||0,water:Number(item.water)||0};
    });
  }
  function renderUtilityHeroChart(){
    const card=document.querySelector(".preview-large");if(!card)return;
    const visual=document.querySelector(".hero-visual");visual?.removeAttribute("aria-hidden");
    const data=utilityMonths();
    const max=Math.max(1,...data.flatMap(item=>[item.electricity,item.water]));
    const current=data.at(-1),previous=data.at(-2),currentTotal=current.electricity+current.water,previousTotal=(previous?.electricity||0)+(previous?.water||0);
    const delta=previousTotal>0?Math.round(((currentTotal-previousTotal)/previousTotal)*100):null;
    const trend=delta===null?"6 tháng gần nhất":delta===0?"Không đổi":`${delta>0?"+":""}${delta}% so tháng trước`;
    const trendClass=delta===null||delta===0?"":delta>0?"up":"down";
    const hasData=data.some(item=>item.electricity||item.water);
    const bars=data.map(item=>{
      const electricHeight=item.electricity?Math.max(5,Math.round(item.electricity/max*100)):3;
      const waterHeight=item.water?Math.max(5,Math.round(item.water/max*100)):3;
      return `<div class="utility-month"><div class="utility-bars"><i class="utility-bar electric" style="height:${electricHeight}%" title="${shortMonth(item.month)} · Điện: ${money(item.electricity)}"></i><i class="utility-bar water" style="height:${waterHeight}%" title="${shortMonth(item.month)} · Nước: ${money(item.water)}"></i></div><span class="utility-label">${shortMonth(item.month)}</span></div>`;
    }).join("");
    card.innerHTML=`<div class="utility-preview"><div class="utility-preview-head"><div><small>Điện & nước hằng tháng</small><strong>${money(currentTotal)}</strong></div><em class="utility-preview-trend ${trendClass}">${trend}</em></div><div class="utility-chart" role="img" aria-label="Biểu đồ tiền điện và nước 6 tháng gần nhất">${hasData?bars:`<div class="utility-empty">Chưa có dữ liệu hóa đơn. Biểu đồ sẽ tự cập nhật khi bạn nhập tiền điện và nước.</div>`}</div><div class="utility-legend"><span><i class="electric"></i>Tiền điện</span><span><i class="water"></i>Tiền nước</span><span>${shortMonth(current.month)}: ${money(currentTotal)}</span></div></div>`;
  }

  const baseRenderHome=renderHome;
  renderHome=function(){baseRenderHome();renderUtilityHeroChart();};
  globalThis.renderUtilityHeroChart=renderUtilityHeroChart;
})();
