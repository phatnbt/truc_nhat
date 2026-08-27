export function identityNameKey(value){
  return String(value||"")
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g," ")
    .toLocaleLowerCase("vi-VN");
}

export function buildCanonicalNameMap(payload={}){
  const groups=new Map();
  for(const member of Object.values(payload?.members||{})){
    const key=identityNameKey(member?.name);
    if(!key||!member?.id)continue;
    const list=groups.get(key)||[];
    list.push(member.id);
    groups.set(key,list);
  }
  const result=new Map();
  for(const [key,ids] of groups){
    if(ids.length===1)result.set(key,ids[0]);
  }
  return result;
}

export function buildCanonicalAccessRemapPlan({beforePayload={},desiredPayload={},accesses=[]}={}){
  const canonicalByName=buildCanonicalNameMap(desiredPayload);
  const beforeMembers=beforePayload?.members||{};
  const desiredMembers=desiredPayload?.members||{};
  const plan=[];

  for(const account of accesses||[]){
    const oldMemberId=account?.memberId;
    if(!oldMemberId||desiredMembers[oldMemberId])continue;
    const oldMember=beforeMembers[oldMemberId];
    const key=identityNameKey(oldMember?.name||account?.displayName);
    const canonicalMemberId=canonicalByName.get(key)||null;
    if(!canonicalMemberId||canonicalMemberId===oldMemberId)continue;
    plan.push({
      uid:account.uid,
      oldMemberId,
      canonicalMemberId,
      name:oldMember?.name||account?.displayName||""
    });
  }
  return plan;
}
