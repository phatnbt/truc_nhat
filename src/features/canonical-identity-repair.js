(()=>{
  const baseRepairDuplicateMembersInMemory=repairDuplicateMembersInMemory;

  function mergeOrphanBillingRows(){
    const memberIds=new Set((state.members||[]).map(member=>member.id));
    const byName=new Map();
    for(const member of state.members||[]){
      const key=memberNameKey(member.name);
      if(!key)continue;
      const list=byName.get(key)||[];
      list.push(member);
      byName.set(key,list);
    }

    let merged=0;
    for(const bill of state.billing?.months||[]){
      if(!bill||bill.closed)continue;
      for(const [key,members] of byName){
        if(members.length!==1)continue;
        const canonical=members[0];
        const sameName=(bill.people||[]).filter(person=>memberNameKey(person.name)===key);
        if(sameName.length<2)continue;

        const candidateIds=new Set([canonical.id]);
        let hasRepairableAlias=false;
        for(const person of sameName){
          if(!person.memberId){hasRepairableAlias=true;continue;}
          if(person.memberId===canonical.id)continue;
          if(!memberIds.has(person.memberId)){
            candidateIds.add(person.memberId);
            hasRepairableAlias=true;
          }
        }
        if(!hasRepairableAlias&&sameName.filter(person=>person.memberId===canonical.id).length<2)continue;
        merged+=mergeBillingRowsForIdentity(bill,canonical,candidateIds,key);
      }
    }
    return merged;
  }

  repairDuplicateMembersInMemory=function(options={}){
    const allAccounts=accessAccounts;
    const groups=duplicateMemberGroups();
    const preferredByName=new Map();

    for(const [key,members] of groups){
      const ids=new Set(members.map(member=>member.id));
      const mappedIds=[...new Set((allAccounts||[])
        .filter(account=>account?.active!==false&&ids.has(account.memberId))
        .map(account=>account.memberId))];
      if(!mappedIds.length)continue;
      const preferred=[...members]
        .filter(member=>mappedIds.includes(member.id))
        .sort((a,b)=>{
          const scoreDiff=memberReferenceScore(b.id)-memberReferenceScore(a.id);
          if(scoreDiff)return scoreDiff;
          const createdDiff=timeMs(a.createdAt)-timeMs(b.createdAt);
          if(createdDiff)return createdDiff;
          return String(a.id).localeCompare(String(b.id));
        })[0];
      if(preferred)preferredByName.set(key,preferred.id);
    }

    let result;
    try{
      accessAccounts=(allAccounts||[]).filter(account=>{
        if(account?.active===false)return false;
        if(!account?.memberId)return true;
        const member=(state.members||[]).find(item=>item.id===account.memberId);
        const key=memberNameKey(member?.name);
        const preferred=preferredByName.get(key);
        return !preferred||account.memberId===preferred;
      });
      result=baseRepairDuplicateMembersInMemory(options);
    }finally{
      accessAccounts=allAccounts;
    }

    if(result?.cancelled)return result;
    const orphanRows=mergeOrphanBillingRows();
    if(orphanRows){
      result={...result,mergedBillingRows:(result?.mergedBillingRows||0)+orphanRows};
    }
    return result;
  };
})();
