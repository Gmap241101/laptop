// Phase 34 P1-08 D01-D05: offline-only, owner-reviewed dispatch contract.
// The module intentionally has NO HTTP imports, NO fetch default, NO timer, and
// is NOT imported by server/src/index.mjs. It cannot authorize live delivery.
import { createP103Dispatcher, P103_REAL_DELIVERY_LOCKED } from './mail-dynoweb-dispatcher.mjs';
import { prepareBrevoTransaction, parseBrevoAcceptance, classifyBrevoSendFailure } from './brevo-transaction-contract.mjs';
import { parseMailAddress } from './mail-provider-config.mjs';

export const P108_REAL_DELIVERY_LOCKED = true;
const error = (code, status = null) => Object.assign(new Error(code), {code, status});
const eligibleEnvironment = (value) => ['staging', 'test', 'local', 'development'].includes(value);
const validResponseId = (value) => typeof value === 'string' && value.length >= 3 && value.length <= 255 && !/[\u0000-\u001f\u007f]/.test(value);
const validSubject = (value) => typeof value === 'string' && value.trim().length > 0 && value.length <= 500 && !/[\u0000-\u001f\u007f]/.test(value);

export const evaluateP108OfflineGate = ({ config, operatorRole, mockApproval, offlineTransport } = {}) => {
  const blockers = [];
  if (P103_REAL_DELIVERY_LOCKED !== true || P108_REAL_DELIVERY_LOCKED !== true) blockers.push('real_delivery_lock_missing');
  if (!eligibleEnvironment(config?.environment)) blockers.push('offline_environment_only');
  if (operatorRole !== 'owner' || mockApproval !== true) blockers.push('offline_owner_approval_required');
  if (!['brevo','resend'].includes(config?.provider) || config?.enabled !== true || config?.domainVerified !== true ||
      !parseMailAddress(config?.sender)) blockers.push('provider_not_configured_for_mock');
  if (!(config?.allowlist instanceof Set) || config.allowlist.size < 1) blockers.push('offline_recipient_allowlist_missing');
  if (config?.liveSendingReady !== false) blockers.push('unlocked_config_not_allowed');
  if (offlineTransport?.isMock !== true || typeof offlineTransport.simulate !== 'function') blockers.push('explicit_mock_transport_required');
  const maxDay = config?.provider === 'brevo' ? 300 : 100;
  const maxMonth = config?.provider === 'brevo' ? 9300 : 3000;
  if (!Number.isSafeInteger(config?.dailyLimit) || config.dailyLimit < 1 || config.dailyLimit > maxDay ||
      !Number.isSafeInteger(config?.monthlyLimit) || config.monthlyLimit < 1 || config.monthlyLimit > maxMonth) {
    blockers.push('quota_limit_invalid');
  }
  return Object.freeze({readyForMock:blockers.length===0,liveSendingReady:false,blockers:Object.freeze(blockers)});
};

const assertRecipient = (config, message) => {
  const address = parseMailAddress(message?.to);
  if (!address || config.allowlist?.has(address) !== true) throw error('recipient_not_allowlisted');
  return address;
};

const resendMockPayload = (config, message, to) => {
  if (!/^\d+$/.test(String(message?.id ?? '')) || BigInt(message.id) <= 0n ||
      !/^[a-f0-9-]{36}$/i.test(String(message?.token ?? '')) || !Number.isSafeInteger(message?.attempt) || message.attempt < 1) {
    throw error('mail_claim_invalid');
  }
  if (!validSubject(message.subject)) throw error('message_subject_invalid');
  const text = typeof message.text === 'string' ? message.text : '';
  const html = typeof message.html === 'string' ? message.html : '';
  if ((!text.trim() && !html.trim()) || text.length > 40000 || html.length > 64000) throw error('message_body_invalid');
  const senderName = message.senderName ?? config.senderName ?? '';
  if (typeof senderName !== 'string' || senderName.length > 100 || /[\r\n<>]/.test(senderName)) throw error('sender_name_invalid');
  // Stable per-Outbox idempotency marker (mock only), never a claim token or a secret.
  return Object.freeze({from:senderName.trim()?`${senderName.trim()} <${config.sender}>`:config.sender,
    to:Object.freeze([to]),subject:message.subject,text,html,idempotencyKey:`outbox-${message.id}`});
};

export const createP108OfflineProviderSender = ({config, offlineTransport} = {}) => {
  if (offlineTransport?.isMock !== true || typeof offlineTransport.simulate !== 'function') throw error('explicit_mock_transport_required');
  if (!eligibleEnvironment(config?.environment) || !['brevo','resend'].includes(config?.provider)) throw error('offline_environment_only');
  if (!P103_REAL_DELIVERY_LOCKED || !P108_REAL_DELIVERY_LOCKED || config.liveSendingReady !== false) throw error('live_sender_not_permitted');
  return Object.freeze({isMock:true, async send(message) {
    const to = assertRecipient(config,message);
    let payload;
    if (config.provider === 'brevo') {
      payload = prepareBrevoTransaction({config,message:{...message,to}}).payload;
    } else {
      payload = resendMockPayload(config,message,to);
    }
    // Only the sanitized payload is supplied to the explicitly injected mock.
    // No API key, URL, headers, HTTP client or delivery authorization is passed.
    let result;
    try {
      result = await offlineTransport.simulate(Object.freeze({provider:config.provider, payload}));
    } catch (cause) {
      // A mock status 429 is an explicit rejection. Every other exception is uncertain.
      if (cause?.status === 429) throw error('provider_rate_limited',429);
      if ([400,401,403,404,422].includes(cause?.status)) throw error('provider_rejected',cause.status);
      throw error('provider_outcome_uncertain',cause?.status ?? null);
    }
    const status = result?.status;
    if (config.provider === 'brevo') {
      if (status !== 201) throw classifyBrevoSendFailure(status);
      const accepted = parseBrevoAcceptance(status,result?.body);
      return Object.freeze({messageId:accepted.providerMessageId});
    }
    if (status === 429) throw error('provider_rate_limited',429);
    if ([400,401,403,404,422].includes(status)) throw error('provider_rejected',status);
    if (status !== 200 || !validResponseId(result?.body?.id)) throw error('provider_outcome_uncertain',status);
    return Object.freeze({messageId:result.body.id});
  }});
};

export const createP108OfflineDispatcher = ({repository,config,offlineTransport,operatorRole,mockApproval,owner='p108-offline'}={}) => {
  const gate=evaluateP108OfflineGate({config,offlineTransport,operatorRole,mockApproval});
  if (!gate.readyForMock) throw error(`p108_offline_gate_denied_${gate.blockers[0]}`);
  const mockSender=createP108OfflineProviderSender({config,offlineTransport});
  const mockDispatcher=createP103Dispatcher({repository,mockSender,provider:config.provider,
    dailyLimit:config.dailyLimit,monthlyLimit:config.monthlyLimit,owner});
  return Object.freeze({
    // The only tick in this phase is explicitly called in isolated Mock tests.
    tickMock:()=>mockDispatcher.tick(),
    tickLive:async()=>{throw error('p108_real_delivery_locked');},
    status:()=>Object.freeze({mockReady:true,liveSendingReady:false}),
  });
};
