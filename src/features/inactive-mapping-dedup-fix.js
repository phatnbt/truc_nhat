(()=>{
  // Legacy/revoked accounts may still keep an old memberId. Those inactive mappings
  // must not block identity repair, otherwise duplicate members can never be merged.
  // Only active accounts are authoritative for choosing/locking a canonical member ID.
  const baseRepairDuplicateMembersInMemory=repairDuplicateMembersInMemory;
  repairDuplicateMembersInMemory=function(options={}){
    const allAccounts=accessAccounts;
    try{
      accessAccounts=(allAccounts||[]).filter(account=>account?.active!==false);
      return baseRepairDuplicateMembersInMemory(options);
    }finally{
      accessAccounts=allAccounts;
    }
  };
})();
