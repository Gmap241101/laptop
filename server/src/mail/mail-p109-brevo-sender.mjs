// Production-only provider transport, backed by the existing validated Brevo contract.
import { executeBrevoTransaction } from './brevo-transaction-contract.mjs';
export function createP109BrevoSender({config,fetchImpl=fetch}={}){
  if(config?.environment!=='production'||config?.provider!=='brevo'||config?.enabled!==true||
     config?.configured!==true||!config?.sender?.endsWith('@mail.notebook.recruit.kro.kr'))
    throw new Error('p109_brevo_config_invalid');
  if(typeof fetchImpl!=='function')throw new TypeError('p109_fetch_required');
  return Object.freeze({
    async send(mail){
      const receipt=await executeBrevoTransaction({config,message:mail,fetchImpl});
      return {messageId:receipt.providerMessageId};
    },
  });
}
