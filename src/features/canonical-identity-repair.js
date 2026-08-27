(()=>{
  const baseRepairDuplicateMembersInMemory=repairDuplicateMembersInMemory;

  repairDuplicateMembersInMemory=function(options={}){
    const allAccounts=accessAccounts;
    const groups=duplicateMemberGroups();
    if(!groups.length)return baseRepairDuplicateMembersInMemory(options);

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

    try{
      // The application now enforces one logical member per normalized name. When old
      // data has multiple active account mappings for IDs with that same name, treat
      // them as aliases of one person, pick the most referenced ID as canonical, and
      // let the server-side repair remap every account to that canonical ID afterward.
      accessAccounts=(allAccounts||[]).filter(account=>{
        if(account?.active===false)return false;
        if(!account?.memberId)return true;
        const member=(state.members||[]).find(item=>item.id===account.memberId);
        const key=memberNameKey(member?.name);
        const preferred=preferredByName.get(key);
        return !preferred||account.memberId===preferred;
      });
      return baseRepairDuplicateMembersInMemory(options);
    }finally{
      accessAccounts=allAccounts;
    }
  };
})();
