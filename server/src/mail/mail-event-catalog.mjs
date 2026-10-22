// P1 notification catalog: immutable event keys. No message is sent by this module.
// The eight new events are kept distinct so every subtype has its own toggle/template.
const entry = (key, category, title, recipient, body, variables = ['name', 'siteUrl']) => Object.freeze({
  key, category, title, recipient,
  defaultEnabled: false, // No event can send without deliberate administrator opt-in.
  defaultSubject: `[기기 대여 시스템] ${title}`,
  defaultBody: body,
  variables: Object.freeze([...variables]),
});

export const MAIL_EVENTS = Object.freeze([
  entry('signup_submitted','회원','회원가입 신청 완료','user','{{name}}님, 회원가입 신청이 접수되었습니다. 승인 결과는 별도로 안내합니다.\n{{siteUrl}}'),
  entry('signup_approved','회원','회원가입 승인 완료','user','{{name}}님, 회원가입이 승인되었습니다.\n{{siteUrl}}'),
  entry('signup_rejected','회원','회원가입 거절','user','{{name}}님, 회원가입 신청이 승인되지 않았습니다. 자세한 내용은 담당자에게 문의해 주세요.\n{{siteUrl}}'),
  entry('rental_submitted','대여','대여 신청 완료','user','{{name}}님, 기기 대여 신청이 접수되었습니다.\n{{siteUrl}}'),
  entry('rental_approved','대여','대여 승인 완료','user','{{name}}님, 기기 대여가 승인되었습니다. 반납 예정일을 확인해 주세요.\n{{siteUrl}}'),
  entry('rental_rejected','대여','대여 거절','user','{{name}}님, 대여 신청이 승인되지 않았습니다.\n{{siteUrl}}'),
  entry('rental_returned','대여','반납 완료','user','{{name}}님, 기기 반납이 완료 처리되었습니다.\n{{siteUrl}}'),
  entry('rental_overdue','대여','연체 중 안내','user','{{name}}님, 대여 기기가 연체 상태입니다. 반납 현황을 확인해 주세요.\n{{siteUrl}}'),
  entry('membership_withdrawn','회원','회원 탈퇴 완료','user','{{name}}님, 회원 탈퇴가 완료되었습니다.'),
  entry('admin_signup_pending','관리자','가입 승인 요청','admin','신규 회원가입 승인 요청이 접수되었습니다. 관리자 페이지에서 확인해 주세요.\n{{siteUrl}}'),
  entry('admin_rental_pending','관리자','대여 신청 요청','admin','신규 기기 대여 신청이 접수되었습니다. 관리자 페이지에서 확인해 주세요.\n{{siteUrl}}'),
  entry('rental_due_reminder','대여','반납 예정일 사전 알림','user','{{name}}님, 대여 기기의 반납 예정일이 다가왔습니다.\n{{siteUrl}}'),
  entry('extension_approved','대여','대여 연장 승인','user','{{name}}님, 대여 기간 연장이 승인되었습니다. 변경된 반납일을 확인해 주세요.\n{{siteUrl}}'),
  entry('extension_rejected','대여','대여 연장 거절','user','{{name}}님, 대여 연장 신청이 승인되지 않았습니다. 기존 반납일을 확인해 주세요.\n{{siteUrl}}'),
  entry('inquiry_first_answer','문의','1:1 문의 최초 답변','user','문의하신 내용에 답변이 등록되었습니다. 1:1 문의 페이지에서 확인해 주세요.\n{{siteUrl}}'),
  entry('inquiry_followup_answer','문의','1:1 문의 추가답변','user','문의하신 내용에 추가답변이 등록되었습니다. 1:1 문의 페이지에서 확인해 주세요.\n{{siteUrl}}'),
  entry('account_restricted','회원','계정 이용 제한','user','{{name}}님, 계정 이용이 제한되었습니다. 관리자에게 문의해 주세요.\n{{siteUrl}}'),
  entry('account_unrestricted','회원','계정 이용 제한 해제','user','{{name}}님, 계정 이용 제한이 해제되었습니다.\n{{siteUrl}}'),
  entry('rental_cancelled','대여','대여 신청 취소 완료','user','{{name}}님, 기기 대여 신청이 취소되었습니다.\n{{siteUrl}}'),
]);

export const MAIL_EVENT_BY_KEY = Object.freeze(Object.fromEntries(MAIL_EVENTS.map((event) => [event.key, event])));

const mailError = (code, status = 400) => Object.assign(new Error(code), { code, status });
const validatePlaceholders = (value, allowed) => {
  const token = /{{\s*([^{}]+?)\s*}}/g;
  for (const match of value.matchAll(token)) {
    if (!allowed.includes(match[1])) throw mailError('mail_template_variable_not_allowed');
  }
  if (value.replace(token, '').includes('{{') || value.replace(token, '').includes('}}')) {
    throw mailError('mail_template_variable_invalid');
  }
};

export const validateMailEventUpdate = (key, input) => {
  const event = MAIL_EVENT_BY_KEY[key];
  if (!event) throw mailError('mail_event_unknown', 404);
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw mailError('mail_template_invalid');
  const allowedFields = ['enabled','subject','body','expectedRevision'];
  if (Object.keys(input).some((field) => !allowedFields.includes(field))) throw mailError('mail_template_field_unknown');
  if (typeof input.enabled !== 'boolean' || typeof input.subject !== 'string' || typeof input.body !== 'string') {
    throw mailError('mail_template_invalid');
  }
  if (!Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 0) throw mailError('mail_revision_invalid');
  const subject = input.subject.trim();
  const body = input.body.trim();
  if (subject.length < 1 || subject.length > 150 || /[\r\n<>]/.test(subject)) throw mailError('mail_subject_invalid');
  if (body.length < 1 || body.length > 6000 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(body)) throw mailError('mail_body_invalid');
  validatePlaceholders(subject, event.variables);
  validatePlaceholders(body, event.variables);
  return Object.freeze({ enabled: input.enabled, subject, body, expectedRevision: input.expectedRevision });
};

export const escapeMailHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
  '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
}[char]));

export const renderMailTemplate = (template, values, variables) => {
  const fill = (str) => str.replace(/{{\s*([^{}]+?)\s*}}/g, (_, key) => {
    if (!variables.includes(key)) throw mailError('mail_template_variable_not_allowed');
    return String(values?.[key] ?? '');
  });
  const subject = fill(template.subject);
  const text = fill(template.body);
  return Object.freeze({ subject, text, html: `<div style="font-family:Arial,sans-serif;white-space:pre-wrap;line-height:1.7">${escapeMailHtml(text)}</div>` });
};
