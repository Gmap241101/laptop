// P1 email event catalog. Immutable keys and default OFF status. No live sending here.
export const MAIL_COMMON_VARIABLES = Object.freeze(['name', 'siteUrl', 'teamName']);
const entry = (key, category, title, recipient, body, variableKeys = []) => Object.freeze({
  key, category, title, recipient, defaultEnabled: false,
  defaultSubject: `[기기 대여 시스템] ${title}`,
  // Existing plaintext templates remain supported; Rich Text Editor upgrades on first save.
  defaultBody: body, defaultBodyFormat: 'text',
  variables: Object.freeze([...new Set([...MAIL_COMMON_VARIABLES, ...variableKeys])]),
});
export const MAIL_EVENTS = Object.freeze([
  entry('signup_submitted','회원','회원가입 신청 완료','user','{{name}}님, {{signupRequestedAt}}에 회원가입 신청이 접수되었습니다.\n{{siteUrl}}',['signupRequestedAt']),
  entry('signup_approved','회원','회원가입 승인 완료','user','{{name}}님, {{signupReviewedAt}}에 회원가입이 승인되었습니다.\n{{siteUrl}}',['signupRequestedAt','signupReviewedAt']),
  entry('signup_rejected','회원','회원가입 거절','user','{{name}}님, 회원가입 신청이 승인되지 않았습니다.\n{{siteUrl}}',['signupRequestedAt','signupReviewedAt','signupDecisionAt']),
  entry('rental_submitted','대여','대여 신청 완료','user','{{name}}님, {{rentalRequestedAt}}에 대여 신청이 접수되었습니다.\n{{assetName}}\n{{siteUrl}}',['rentalRequestedAt','assetName','assetCode','requestNumber','rentalStartAt','rentalDueAt']),
  entry('rental_approved','대여','대여 승인 완료','user','{{name}}님, 대여가 승인되었습니다.\n반납 예정일: {{rentalDueAt}}\n{{siteUrl}}',['rentalRequestedAt','rentalApprovedAt','rentalStartAt','rentalDueAt','assetName','assetCode','requestNumber']),
  entry('rental_rejected','대여','대여 거절','user','{{name}}님, 대여 신청이 승인되지 않았습니다.\n{{siteUrl}}',['rentalRequestedAt','rentalRejectedAt','rentalRejectionReason','assetName','requestNumber']),
  entry('rental_returned','대여','반납 완료','user','{{name}}님, {{rentalReturnedAt}}에 반납이 완료되었습니다.\n{{siteUrl}}',['rentalRequestedAt','rentalDueAt','rentalReturnedAt','assetName','assetCode','requestNumber']),
  entry('rental_overdue','대여','연체 중 안내','user','{{name}}님, 대여 기기가 연체 상태입니다.\n반납 예정일: {{rentalDueAt}}\n{{siteUrl}}',['rentalDueAt','rentalStartAt','assetName','assetCode','requestNumber']),
  entry('membership_withdrawn','회원','회원 탈퇴 완료','user','{{name}}님, 회원 탈퇴가 완료되었습니다.',['withdrawnAt']),
  entry('admin_signup_pending','관리자','가입 승인 요청','admin','{{name}}님의 회원가입 요청이 접수되었습니다.\n신청일시: {{signupRequestedAt}}\n{{siteUrl}}',['signupRequestedAt']),
  entry('admin_rental_pending','관리자','대여 신청 요청','admin','{{name}}님의 대여 신청이 접수되었습니다.\n신청일시: {{rentalRequestedAt}}\n{{siteUrl}}',['rentalRequestedAt','rentalStartAt','rentalDueAt','assetName','assetCode','requestNumber']),
  entry('rental_due_reminder','대여','반납 예정일 사전 알림','user','{{name}}님, 반납 예정일이 다가왔습니다.\n{{rentalDueAt}}\n{{siteUrl}}',['rentalDueAt','rentalStartAt','assetName','assetCode','requestNumber']),
  entry('extension_approved','대여','대여 연장 승인','user','{{name}}님, 연장 신청이 승인되었습니다.\n변경된 반납 예정일: {{newRentalDueAt}}\n{{siteUrl}}',['extensionRequestedAt','extensionDecisionAt','previousRentalDueAt','newRentalDueAt','assetName','requestNumber']),
  entry('extension_rejected','대여','대여 연장 거절','user','{{name}}님, 연장 신청이 승인되지 않았습니다.\n기존 반납 예정일: {{previousRentalDueAt}}\n{{siteUrl}}',['extensionRequestedAt','extensionDecisionAt','previousRentalDueAt','extensionRejectionReason','assetName','requestNumber']),
  entry('inquiry_first_answer','문의','1:1 문의 최초 답변','user','{{name}}님, {{answerCreatedAt}}에 문의 답변이 등록되었습니다.\n{{siteUrl}}',['inquirySubmittedAt','answerCreatedAt','inquiryTitle','inquiryNumber']),
  entry('inquiry_followup_answer','문의','1:1 문의 추가답변','user','{{name}}님, {{answerCreatedAt}}에 추가 답변이 등록되었습니다.\n{{siteUrl}}',['inquirySubmittedAt','answerCreatedAt','inquiryTitle','inquiryNumber']),
  entry('account_restricted','회원','계정 이용 제한','user','{{name}}님, 계정 이용이 제한되었습니다.\n{{siteUrl}}',['restrictedAt','restrictionReason']),
  entry('account_unrestricted','회원','계정 이용 제한 해제','user','{{name}}님, 계정 이용 제한이 해제되었습니다.\n{{siteUrl}}',['unrestrictedAt']),
  entry('rental_cancelled','대여','대여 신청 취소 완료','user','{{name}}님, {{rentalCancelledAt}}에 대여 신청이 취소되었습니다.\n{{siteUrl}}',['rentalRequestedAt','rentalCancelledAt','assetName','assetCode','requestNumber']),
]);
export const MAIL_EVENT_BY_KEY = Object.freeze(Object.fromEntries(MAIL_EVENTS.map((event) => [event.key, event])));
const mailError = (code, status = 400) => Object.assign(new Error(code), { code, status });
const variableToken = /{{\s*([^{}]+?)\s*}}/g;
export const escapeMailHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
  '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
}[char]));
export const legacyMailTextToHtml = (value) => String(value ?? '').split(/\r?\n/).map((line) => `<p>${escapeMailHtml(line) || '&nbsp;'}</p>`).join('');

// Restrictive mail-HTML whitelist. Reject active media, embedded code, event handlers,
// non-https links and unapproved attributes. Never send untrusted editor HTML directly.
const allowedTags = new Set(['p','div','span','br','b','strong','i','em','u','s','strike','blockquote','ul','ol','li','h1','h2','h3','hr','table','thead','tbody','tr','td','th','a']);
const voidTags = new Set(['br','hr']);
const allowedStyles = new Set(['color','background-color','text-align','font-size','font-weight','text-decoration','line-height']);
const allowedCssValue = (key, value) => {
  if (['color','background-color'].includes(key)) return /^(#[0-9a-f]{3,8}|rgba?\([0-9.,\s%]+\)|[a-z]{3,20})$/i.test(value) && !/url|expression|var/i.test(value);
  if (key === 'text-align') return /^(left|right|center|justify)$/.test(value);
  if (key === 'font-size') return /^(\d{1,2}(\.\d)?px|inherit)$/.test(value);
  if (key === 'font-weight') return /^(normal|bold|[1-9]00)$/.test(value);
  if (key === 'text-decoration') return /^(none|underline|line-through)$/.test(value);
  if (key === 'line-height') return /^(normal|[12](\.\d{1,2})?)$/.test(value);
  return false;
};
export function sanitizeMailHtml(html) {
  if (typeof html !== 'string' || html.length > 16000) throw mailError('mail_body_invalid');
  let output = ''; let cursor = 0;
  const tags = /<[^>]*>/g;
  for (const found of html.matchAll(tags)) {
    const rawText = html.slice(cursor, found.index);
    if (rawText.includes('<') || rawText.includes('>')) throw mailError('mail_html_unsafe');
    output += rawText;
    const tag = found[0].match(/^<\s*(\/?)\s*([a-z][a-z0-9]*)\s*([^<>]*)>$/i);
    if (!tag || !allowedTags.has(tag[2].toLowerCase())) throw mailError('mail_html_unsafe');
    const name = tag[2].toLowerCase();
    if (tag[1]) {
      if (tag[3].trim() || voidTags.has(name)) throw mailError('mail_html_unsafe');
      output += `</${name}>`;
    } else {
      let attrs = tag[3].trim().replace(/\/$/, '').trim();
      const safeAttrs = [];
      while (attrs) {
        const attribute = attrs.match(/^([a-z][a-z0-9-]*)\s*=\s*("[^"]*"|'[^']*')(?:\s+|$)/i);
        if (!attribute) throw mailError('mail_html_unsafe');
        attrs = attrs.slice(attribute[0].length);
        const attrName = attribute[1].toLowerCase();
        const value = attribute[2].slice(1, -1);
        if (attrName === 'style') {
          const cleaned = [];
          for (const decl of value.split(';').map((x) => x.trim()).filter(Boolean)) {
            const pos = decl.indexOf(':');
            if (pos < 1) throw mailError('mail_html_unsafe');
            const key = decl.slice(0, pos).trim().toLowerCase();
            const cssValue = decl.slice(pos + 1).trim().toLowerCase();
            if (!allowedStyles.has(key) || !allowedCssValue(key, cssValue)) throw mailError('mail_html_unsafe');
            cleaned.push(`${key}:${cssValue}`);
          }
          if (cleaned.length) safeAttrs.push(`style="${cleaned.join(';')}"`);
        } else if (attrName === 'href' && name === 'a') {
          if (!/^https:\/\/[^\s"'<>&]+$/i.test(value)) throw mailError('mail_html_unsafe');
          safeAttrs.push(`href="${escapeMailHtml(value)}"`);
        } else if (attrName === 'target' && name === 'a' && value === '_blank') {
          safeAttrs.push('target="_blank"');
        } else if (attrName === 'rel' && name === 'a' && value === 'noopener noreferrer') {
          safeAttrs.push('rel="noopener noreferrer"');
        } else if (['colspan','rowspan'].includes(attrName) && ['td','th'].includes(name) && /^[1-9][0-9]?$/.test(value)) {
          safeAttrs.push(`${attrName}="${value}"`);
        } else { throw mailError('mail_html_unsafe'); }
      }
      output += `<${name}${safeAttrs.length ? ' ' + safeAttrs.join(' ') : ''}>`;
    }
    cursor = found.index + found[0].length;
  }
  const tail = html.slice(cursor);
  if (tail.includes('<') || tail.includes('>')) throw mailError('mail_html_unsafe');
  return output + tail;
}
const validatePlaceholders = (value, allowed) => {
  for (const match of value.matchAll(variableToken)) if (!allowed.includes(match[1])) throw mailError('mail_template_variable_not_allowed');
  const rest = value.replace(variableToken, '');
  if (rest.includes('{{') || rest.includes('}}')) throw mailError('mail_template_variable_invalid');
};
export const validateMailEventUpdate = (key, input) => {
  const event = MAIL_EVENT_BY_KEY[key];
  if (!event) throw mailError('mail_event_unknown', 404);
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw mailError('mail_template_invalid');
  if (Object.keys(input).some((field) => !['enabled','subject','body','bodyFormat','expectedRevision'].includes(field))) throw mailError('mail_template_field_unknown');
  if (typeof input.enabled !== 'boolean' || typeof input.subject !== 'string' || typeof input.body !== 'string') throw mailError('mail_template_invalid');
  if (!Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 0) throw mailError('mail_revision_invalid');
  const subject = input.subject.trim(); const format = input.bodyFormat ?? 'text';
  if (!['text','html'].includes(format)) throw mailError('mail_body_format_invalid');
  const body = format === 'html' ? sanitizeMailHtml(input.body.trim()) : input.body.trim();
  if (subject.length < 1 || subject.length > 150 || /[\r\n<>]/.test(subject)) throw mailError('mail_subject_invalid');
  if (body.length < 1 || body.length > (format === 'html' ? 16000 : 6000) || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(body)) throw mailError('mail_body_invalid');
  validatePlaceholders(subject, event.variables);
  validatePlaceholders(body, event.variables);
  return Object.freeze({ enabled: input.enabled, subject, body, bodyFormat: format, expectedRevision: input.expectedRevision });
};
const textFromMailHtml = (value) => value.replace(/<\/(p|div|h[1-3]|li|tr)>/gi, '\n').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g,' ').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&amp;/g,'&').trim();
export const renderMailTemplate = (template, values, variables) => {
  const fill = (str, html = false) => str.replace(variableToken, (_, key) => {
    if (!variables.includes(key)) throw mailError('mail_template_variable_not_allowed');
    if (typeof values?.[key] !== 'string' && typeof values?.[key] !== 'number') throw mailError('mail_template_variable_missing');
    const value = String(values[key]);
    return html ? escapeMailHtml(value) : value;
  });
  const subject = fill(template.subject);
  const bodyFormat = template.bodyFormat === 'html' ? 'html' : 'text';
  if (bodyFormat === 'html') {
    const html = fill(sanitizeMailHtml(template.body), true);
    return Object.freeze({ subject, text: textFromMailHtml(html), html });
  }
  const text = fill(template.body);
  return Object.freeze({ subject, text, html: `<div style="font-family:Arial,sans-serif;white-space:pre-wrap;line-height:1.7">${escapeMailHtml(text)}</div>` });
};
