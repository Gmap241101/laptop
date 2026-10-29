import { createMailDeliveryRepository } from './mail-delivery-repository.mjs';
import { createP109BrevoSender } from './mail-p109-brevo-sender.mjs';
import { loadP101MailConfig } from './mail-provider-config.mjs';
import { eligibleP109Environment } from './mail-p109-runtime-control.mjs';

export const classifyP109Failure=(error)=>{
  if(error?.status===429)return {outcome:'retry',errorCode:'provider_rate_limited'};
  if([400,401,403,404,422].includes(error?.status))return {outcome:'rejected',errorCode:'provider_rejected'};
  return {outcome:'uncertain',errorCode:'provider_outcome_uncertain'};
};
export function createP109Dispatcher({repository,sender,gateRead,provider='brevo',dailyLimit=300,monthlyLimit=9300}={}){
  if(!repository?.claim||!repository?.conclude||!repository?.quarantineExpired||!sender?.send||typeof gateRead!=='function')
    throw new TypeError('p109_dispatcher_incomplete');
  let busy=false;
  return Object.freeze({async tick(){
    if(busy)return {state:'busy'};busy=true;
    try{
      // Never enter claim if the control plane cannot be read.
      if(await gateRead()!==true)return {state:'master_disabled'};
      await repository.quarantineExpired({limit:100});
      const claim=await repository.claim({provider,dailyLimit,monthlyLimit,owner:'web-dyno',leaseSeconds:120});
      if(claim.state!=='claimed')return claim;
      // A second check immediately before network send narrows the OFF race.
      // Once a request has started, emergency OFF cannot retract it.
      try{
        if(await gateRead()!==true){
          await repository.conclude({claim,outcome:'uncertain',errorCode:'mail_disabled_after_claim'});
          return {state:'uncertain',code:'mail_disabled_after_claim'};
        }
        const receipt=await sender.send(claim.mail);
        await repository.conclude({claim,outcome:'accepted',providerMessageId:receipt.messageId});
        return {state:'sent'};
      }catch(e){
        const classified=classifyP109Failure(e);
        await repository.conclude({claim,...classified,backoffSeconds:Math.min(3600,60*2**Math.min(6,claim.mail.attempt-1))});
        return {state:classified.outcome,code:classified.errorCode};
      }
    }finally{busy=false;}
  }});
}
export function startP109WebDyno({pool,env=process.env,schedule=setInterval,cancel=clearInterval,fetchImpl=fetch}={}){
  if(!eligibleP109Environment(env))return Object.freeze({enabled:false,start:()=>false,stop:()=>false});
  const cfg=loadP101MailConfig(env);
  if(!cfg.configured||cfg.provider!=='brevo'||cfg.environment!=='production'||!cfg.sender.endsWith('@mail.notebook.recruit.kro.kr'))
    throw new Error('p109_runtime_provider_not_ready');
  const repo=createMailDeliveryRepository(pool,{requireRuntimeGate:true});
  const sender=createP109BrevoSender({config:cfg,fetchImpl});
  const gateRead=async()=>{
    const result=await pool.query("SELECT payload FROM app_system_configuration WHERE config_key='mail-notification-settings'");
    return result.rows[0]?.payload?.delivery?.enabled===true;
  };
  const dispatcher=createP109Dispatcher({repository:repo,sender,gateRead,dailyLimit:cfg.dailyLimit,monthlyLimit:cfg.monthlyLimit});
  let handle=null;
  return Object.freeze({enabled:true,start(){if(handle!==null)return false;
    handle=schedule(()=>{void dispatcher.tick().catch(()=>{});},60000);return true;},
    stop(){if(handle===null)return false;cancel(handle);handle=null;return true;},tick:()=>dispatcher.tick()});
}
