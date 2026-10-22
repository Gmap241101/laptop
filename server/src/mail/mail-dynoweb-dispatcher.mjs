// P1-03: an in-process (web dyno) dispatcher shell. Real sending is UNCONDITIONALLY
// disabled until a separate approved phase explicitly changes this code.
// Only injected mock senders may be used for deterministic tests; no network calls.
export const P103_REAL_DELIVERY_LOCKED = true;

const classify = (error) => {
  // 429 is an explicit refusal and safe to retry. Network/timeout/5xx response
  // can be ambiguous: provider may already have accepted the message.
  if (error?.status === 429) return Object.freeze({outcome:'retry',code:'provider_rate_limited'});
  if ([400,401,403,404,422].includes(error?.status)) return Object.freeze({outcome:'rejected',code:'provider_rejected'});
  return Object.freeze({outcome:'uncertain',code:'provider_outcome_uncertain'});
};
export const p103BackoffSeconds = (attempt) => Math.min(3600,60 * (2 ** Math.min(6,Math.max(0,Number(attempt||1)-1))));
export const createP103Dispatcher = ({ repository, mockSender, provider='brevo', dailyLimit=300,
    monthlyLimit=9300, owner='web-dyno', leaseSeconds=120 } = {}) => {
  if (!repository || typeof repository.claim!=='function' || typeof repository.conclude!=='function' || typeof repository.quarantineExpired!=='function') {
    throw new TypeError('P1-03 requires durable PostgreSQL repository');
  }
  // Prevent accidentally passing a real provider into the mocked dispatcher.
  if (mockSender?.isMock !== true || typeof mockSender.send !== 'function') throw new Error('p103_mock_sender_required');
  let busy = false;
  return Object.freeze({
    async tick() {
      if (busy) return { state:'busy' };
      busy = true;
      try {
        // Stale leases ALWAYS go to manual-review (uncertain); never auto resend.
        await repository.quarantineExpired({limit:100});
        const claim = await repository.claim({provider,dailyLimit,monthlyLimit,owner,leaseSeconds});
        if (claim.state!=='claimed') return claim;
        try {
          const receipt = await mockSender.send({ ...claim.mail, token:claim.token });
          if (!receipt || typeof receipt.messageId!=='string' || receipt.messageId.length < 3) {
            throw Object.assign(new Error('invalid mock receipt'), {code:'provider_response_uncertain'});
          }
          const result = await repository.conclude({ claim, outcome:'accepted', providerMessageId:receipt.messageId });
          return {state:result.state, mock:true};
        } catch(error) {
          const {outcome,code}=classify(error);
          const result = await repository.conclude({claim,outcome,errorCode:code,
            backoffSeconds:p103BackoffSeconds(claim.mail.attempt)});
          return {state:result.state,code,mock:true};
        }
      } finally { busy = false; }
    },
  });
};

export const createP103WebDynoLoop = ({ dispatcher, intervalMs=60000, schedule=setInterval,
  cancel=clearInterval }={}) => {
  if (!dispatcher || typeof dispatcher.tick!=='function') throw new TypeError('dispatcher required');
  if (!Number.isInteger(intervalMs) || intervalMs < 10000) throw new RangeError('interval too short');
  let handle=null;
  return Object.freeze({
    start() {
      if (handle!==null) return false;
      // No immediate startup send; the real web service does NOT instantiate this in P1-03.
      handle=schedule(()=>{void dispatcher.tick().catch(()=>{});},intervalMs);
      return true;
    },
    stop() { if(handle===null) return false;cancel(handle);handle=null;return true; },
  });
};
