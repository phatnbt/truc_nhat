(()=>{
  try{
    Object.defineProperty(globalThis,"authSession",{
      configurable:true,
      get:()=>authSession
    });
  }catch(error){
    console.warn("P708 install session bridge",error);
  }
})();
