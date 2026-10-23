// P1-07: one deterministic, self-contained email design for all 19 events.
// No assets, remote fonts, scripts, tracking pixels, or outbound network calls.
import { escapeMailHtml, renderMailTemplate } from './mail-event-catalog.mjs';

const fault = (code) => Object.assign(new Error(code), { code, status:400 });
export const DEFAULT_MAIL_DESIGN = Object.freeze({
  senderName: '기기 대여 시스템',
  brandTitle: '기기 대여 시스템',
  footerText: '본 메일은 기기 대여 시스템에서 발송되는 안내입니다.',
});
const plain = (value, max, min = 0, allowNewline = false) => {
  if (typeof value !== 'string') throw fault('mail_design_invalid');
  const str = value.trim();
  if (str.length < min || str.length > max || (allowNewline ? /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f<>]/.test(str) : /[\u0000-\u001f\u007f<>]/.test(str)) || str.includes('{{') || str.includes('}}')) throw fault('mail_design_invalid');
  return str;
};
export const validateMailDesign = (draft) => {
  if (!draft || typeof draft !== 'object' || Array.isArray(draft) ||
      Object.keys(draft).some((key) => !['senderName','brandTitle','footerText'].includes(key))) throw fault('mail_design_invalid');
  return Object.freeze({
    senderName: plain(draft.senderName, 80, 1),
    brandTitle: plain(draft.brandTitle, 80, 1),
    footerText: plain(draft.footerText, 360, 0, true),
  });
};
export const resolveMailDesign = (draft) => {
  try {return validateMailDesign({ ...DEFAULT_MAIL_DESIGN, ...draft });}
  catch {return DEFAULT_MAIL_DESIGN;}
};
const textToHtml = (value) => escapeMailHtml(value).replace(/\r?\n/g,'<br>');
export const renderDesignedMail = ({template, values, variables, design}) => {
  const prefs = resolveMailDesign(design);
  const original = renderMailTemplate(template, values, variables);
  const subject = original.subject;
  // A single centralized wrapper is used by preview and transactional outbox snapshots.
  const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>`+
    `<body style="margin:0;padding:24px 10px;background-color:#f4f5f7;color:#1f2937;font-family:Arial,'Malgun Gothic',sans-serif">`+
    `<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width:640px;margin:0 auto;background-color:#ffffff;border-collapse:collapse">`+
    `<tr><td style="background-color:#FF6B00;padding:22px 26px;color:#ffffff;font-weight:bold;font-size:19px">${escapeMailHtml(prefs.brandTitle)}</td></tr>`+
    `<tr><td style="padding:28px 26px;font-size:14px;line-height:1.8;overflow-wrap:anywhere">${original.html}</td></tr>`+
    `<tr><td style="border-top:1px solid #e5e7eb;padding:18px 26px;background-color:#fafafa;color:#64748b;font-size:12px;line-height:1.65">${textToHtml(prefs.footerText)}</td></tr>`+
    `</table></body></html>`;
  const text = `${original.text}${prefs.footerText ? `\n\n${prefs.footerText}` : ''}`;
  if (html.length > 32000 || text.length > 20000) throw fault('mail_designed_message_too_long');
  return Object.freeze({ subject, html, text, senderName:prefs.senderName });
};
export const createMailPreviewValues = (variables = []) => {
  const examples = {
    name:'홍길동', teamName:'운영팀', siteUrl:'https://mkrental.vercel.app',
    assetName:'노트북', assetCode:'MK-001', requestNumber:'TEST-0001',
    rentalDueAt:'2026-10-30 18:00', rentalStartAt:'2026-10-23 09:00',
    previousRentalDueAt:'2026-10-30 18:00', newRentalDueAt:'2026-11-02 18:00',
    inquiryTitle:'대여 방법 문의', inquiryNumber:'Q-1001',
  };
  return Object.fromEntries(variables.map((name) => [name,examples[name] || (name.endsWith('Reason') ? '예시 사유' : '2026-10-22 15:00')]));
};
