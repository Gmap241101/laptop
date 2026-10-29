// P1-07: one deterministic, self-contained email design for all 19 events.
// No assets, remote fonts, scripts, tracking pixels, or outbound network calls.
import { escapeMailHtml, renderMailTemplate } from './mail-event-catalog.mjs';
import { getMailPublicSiteUrl } from './mail-public-site-url.mjs';

const fault = (code) => Object.assign(new Error(code), { code, status:400 });
export const DEFAULT_MAIL_DESIGN = Object.freeze({
  senderName: '기기 대여 시스템',
  brandTitle: '기기 대여 시스템',
  footerText: '본 메일은 기기 대여 시스템에서 발송되는 안내입니다.',
  outerBackground:'#f4f5f7', contentBackground:'#ffffff', headerBackground:'#FF6B00',
  headerTextColor:'#ffffff', bodyTextColor:'#1f2937', footerBackground:'#fafafa', footerTextColor:'#64748b',
  contentWidth:640, outerPadding:24, headerPadding:22, bodyPadding:28, footerPadding:18,
  headerFontSize:19, bodyFontSize:14, footerFontSize:12,
  headerAlign:'left', bodyAlign:'left', footerAlign:'left',
  highlightText:'', buttonText:'', buttonUrl:'', buttonBackground:'#FF6B00', buttonTextColor:'#ffffff', buttonFirst:false, showDivider:true,
});
const plain = (value, max, min = 0, allowNewline = false) => {
  if (typeof value !== 'string') throw fault('mail_design_invalid');
  const str = value.trim();
  if (str.length < min || str.length > max || (allowNewline ? /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f<>]/.test(str) : /[\u0000-\u001f\u007f<>]/.test(str)) || str.includes('{{') || str.includes('}}')) throw fault('mail_design_invalid');
  return str;
};
const styleNumbers=Object.freeze({contentWidth:[320,760],outerPadding:[0,64],headerPadding:[8,64],bodyPadding:[8,72],footerPadding:[8,64],headerFontSize:[12,32],bodyFontSize:[11,22],footerFontSize:[10,18]});
const styleColors=['outerBackground','contentBackground','headerBackground','headerTextColor','bodyTextColor','footerBackground','footerTextColor','buttonBackground','buttonTextColor'];
const styleAligns=['headerAlign','bodyAlign','footerAlign'];
const acceptedKeys=new Set(Object.keys(DEFAULT_MAIL_DESIGN));
export const validateMailDesign = (draft) => {
  if (!draft || typeof draft !== 'object' || Array.isArray(draft) || Object.keys(draft).some(key=>!acceptedKeys.has(key))) throw fault('mail_design_invalid');
  const merged={...DEFAULT_MAIL_DESIGN,...draft};
  for (const key of styleColors) {
    if (typeof merged[key]!=='string'||!/^#[0-9a-fA-F]{6}$/.test(merged[key])) throw fault('mail_design_invalid');
  }
  for (const [key,[lo,hi]] of Object.entries(styleNumbers)) {
    if (!Number.isInteger(merged[key])||merged[key]<lo||merged[key]>hi) throw fault('mail_design_invalid');
  }
  for (const key of styleAligns) if(!['left','center','right'].includes(merged[key])) throw fault('mail_design_invalid');
  if(typeof merged.showDivider!=='boolean'||typeof merged.buttonFirst!=='boolean')throw fault('mail_design_invalid');
  if(typeof merged.buttonUrl!=='string'||merged.buttonUrl.length>500 ||
    (merged.buttonUrl && !/^https:\/\/[a-z0-9.-]+(?::443)?(?:\/[a-z0-9_/?#=&%.-]*)?$/i.test(merged.buttonUrl)))throw fault('mail_design_invalid');
  return Object.freeze({...merged,senderName:plain(merged.senderName,80,1),brandTitle:plain(merged.brandTitle,80,1),
    footerText:plain(merged.footerText,360,0,true),highlightText:plain(merged.highlightText,300,0,true),buttonText:plain(merged.buttonText,80,0)});
};
export const resolveMailDesign = (draft) => {
  try {return validateMailDesign({ ...DEFAULT_MAIL_DESIGN, ...draft });}
  catch {return DEFAULT_MAIL_DESIGN;}
};
const textToHtml = (value) => escapeMailHtml(value).replace(/\r?\n/g,'<br>');
const stampKeys=new Set([
  'signupRequestedAt','signupReviewedAt','signupDecisionAt','withdrawnAt','restrictedAt','unrestrictedAt',
  'rentalRequestedAt','rentalApprovedAt','rentalRejectedAt','rentalStartAt','rentalDueAt','rentalReturnedAt',
  'extensionRequestedAt','extensionDecisionAt','previousRentalDueAt','newRentalDueAt',
  'inquirySubmittedAt','answerCreatedAt','rentalCancelledAt',
]);
export function formatMailKoreanDateTime(value) {
  if(typeof value!=='string'||!value.trim())return value;
  const str=value.trim();
  // Date-only inputs are calendar dates and must not be shifted by timezone conversion.
  if(/^\d{4}-\d{2}-\d{2}$/.test(str)){
    const date=new Date(`${str}T00:00:00.000Z`);
    if(Number.isNaN(date.getTime())||date.toISOString().slice(0,10)!==str)return str;
    const [y,m,d]=str.split('-');return `${Number(y)}년 ${Number(m)}월 ${Number(d)}일`;
  }
  const iso=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/i;
  const local=/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::\d{2})?$/;
  let date;
  if(iso.test(str))date=new Date(str);
  else if(local.test(str)){const m=str.match(local);date=new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:00+09:00`);}
  else return str;
  if(Number.isNaN(date.getTime()))return str;
  const pieces=Object.fromEntries(new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',year:'numeric',month:'numeric',day:'numeric',hour:'numeric',minute:'2-digit',hour12:true}).formatToParts(date).map(p=>[p.type,p.value]));
  return `${pieces.year}년 ${pieces.month}월 ${pieces.day}일 ${pieces.dayPeriod} ${pieces.hour}시 ${pieces.minute}분`;
}
export const normalizeMailValues = (values={},variables=[]) => Object.fromEntries(
  Object.entries(values).map(([key,value])=>[key,stampKeys.has(key)&&variables.includes(key)?formatMailKoreanDateTime(value):value])
);
export const renderDesignedMail = ({template, values, variables, design}) => {
  const prefs = resolveMailDesign(design);
  const original = renderMailTemplate(template, normalizeMailValues(values,variables), variables);
  const subject = original.subject;
  const css=(v)=>v; // All CSS values were validated against strict types/hex allowlists.
  const buttonBlock = prefs.buttonText&&prefs.buttonUrl?
    `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin-top:18px"><tr><td style="background-color:${css(prefs.buttonBackground)};padding:12px 20px;text-align:center"><a href="${escapeMailHtml(prefs.buttonUrl)}" style="color:${css(prefs.buttonTextColor)};text-decoration:none;font-size:${prefs.bodyFontSize}px;font-weight:bold">${escapeMailHtml(prefs.buttonText)}</a></td></tr></table>`:'';
  const noticeBlock = prefs.highlightText?`<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:18px;border-collapse:collapse"><tr><td style="padding:12px;border-left:3px solid ${css(prefs.headerBackground)};background-color:${css(prefs.outerBackground)}">${textToHtml(prefs.highlightText)}</td></tr></table>`:'';
  const extraBlocks=prefs.buttonFirst?buttonBlock+noticeBlock:noticeBlock+buttonBlock;
  const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>`+
    `<body style="margin:0;padding:${prefs.outerPadding}px 10px;background-color:${css(prefs.outerBackground)};color:${css(prefs.bodyTextColor)};font-family:Arial,'Malgun Gothic',sans-serif">`+
    `<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width:${prefs.contentWidth}px;margin:0 auto;background-color:${css(prefs.contentBackground)};border-collapse:collapse">`+
    `<tr><td style="background-color:${css(prefs.headerBackground)};padding:${prefs.headerPadding}px 26px;color:${css(prefs.headerTextColor)};font-weight:bold;font-size:${prefs.headerFontSize}px;text-align:${prefs.headerAlign}">${escapeMailHtml(prefs.brandTitle)}</td></tr>`+
    `<tr><td style="padding:${prefs.bodyPadding}px 26px;font-size:${prefs.bodyFontSize}px;line-height:1.8;color:${css(prefs.bodyTextColor)};background-color:${css(prefs.contentBackground)};text-align:${prefs.bodyAlign};overflow-wrap:anywhere">${original.html}${extraBlocks}</td></tr>`+
    `<tr><td style="${prefs.showDivider?'border-top:1px solid #e5e7eb;':''}padding:${prefs.footerPadding}px 26px;background-color:${css(prefs.footerBackground)};color:${css(prefs.footerTextColor)};font-size:${prefs.footerFontSize}px;line-height:1.65;text-align:${prefs.footerAlign}">${textToHtml(prefs.footerText)}</td></tr>`+
    `</table></body></html>`;
  const text = `${original.text}${prefs.highlightText?`\n\n${prefs.highlightText}`:''}${buttonBlock?`\n\n${prefs.buttonText}: ${prefs.buttonUrl}`:''}${prefs.footerText ? `\n\n${prefs.footerText}` : ''}`;
  if (html.length > 32000 || text.length > 20000) throw fault('mail_designed_message_too_long');
  return Object.freeze({ subject, html, text, senderName:prefs.senderName });
};
export const createMailPreviewValues = (variables = []) => {
  const examples = {
    name:'홍길동', teamName:'운영팀', siteUrl:getMailPublicSiteUrl(),
    assetName:'노트북', assetCode:'MK-001', requestNumber:'TEST-0001',
    rentalDueAt:'2026-10-30 18:00', rentalStartAt:'2026-10-23 09:00',
    previousRentalDueAt:'2026-10-30 18:00', newRentalDueAt:'2026-11-02 18:00',
    inquiryTitle:'대여 방법 문의', inquiryNumber:'Q-1001',
  };
  return Object.fromEntries(variables.map((name) => [name,examples[name] || (name.endsWith('Reason') ? '예시 사유' : '2026-10-22 15:00')]));
};
