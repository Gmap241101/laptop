import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(path, 'utf8');

const core = read('src/utils/richTextCore.js');
const editor = read('src/components/RichTextEditor.jsx');
const adminInquiry = read('src/admin/AdminInquiryPanel.jsx');
const userInquiry = read('src/user/UserInquiryPanel.jsx');
const inquiryApi = read('src/features/inquiries/inquiryApi.js');
const inquiryService = read('server/src/inquiries/inquiry-service.mjs');
const inquiryRepository = read('server/src/inquiries/inquiry-repository.mjs');
const boardController = read('src/features/boards/useAdminBoardPostController.js');
const popupController = read('src/features/boards/useAdminPopupPostController.js');
const footerController = read('src/features/boards/useAdminFooterContentController.js');
const signupTerms = read('src/admin/AdminSignupTermsManager.jsx');

const allowedTags = [
  'P','BR','WBR','STRONG','B','EM','I','U','S','STRIKE','DEL','INS','MARK','SMALL','BIG','SUB','SUP',
  'CODE','PRE','KBD','SAMP','VAR','CITE','Q','ABBR','TT','CENTER','FONT','H1','H2','H3','H4','H5','H6',
  'UL','OL','LI','DL','DT','DD','BLOCKQUOTE','A','IMG','PICTURE','SOURCE','FIGURE','FIGCAPTION','HR','DIV','SPAN',
  'TABLE','CAPTION','COLGROUP','COL','THEAD','TBODY','TFOOT','TR','TH','TD','IFRAME','VIDEO',
];
for (const tag of allowedTags) {
  assert.ok(core.includes(`'${tag}'`), `allowed rich-text tag missing from sanitizer contract: ${tag}`);
}
for (const blockedTag of ['SCRIPT','STYLE','OBJECT','EMBED','FORM','INPUT','BUTTON','TEXTAREA','SELECT','OPTION','META','LINK']) {
  assert.match(core, new RegExp(`DROP_CONTENT_TAGS[\\s\\S]*'${blockedTag}'`), `unsafe rich-text tag must remain blocked: ${blockedTag}`);
}

const safeStyleProperties = [
  'text-align','color','background-color','font-weight','font-style','font-family','font-variant','font-size','line-height',
  'letter-spacing','word-spacing','text-indent','text-transform','text-decoration','text-decoration-line','text-decoration-style',
  'text-decoration-color','vertical-align','white-space','list-style-type','width','max-width','height','margin-left','margin-right',
  'margin-top','margin-bottom','padding','padding-top','padding-right','padding-bottom','padding-left','display','border-collapse',
  'border','border-width','border-style','border-color','border-radius','aspect-ratio',
];
for (const property of safeStyleProperties) {
  assert.ok(core.includes(`'${property}'`), `safe rich-text style property missing from sanitizer contract: ${property}`);
}
assert.match(core, /if \(name === 'style'\) \{[\s\S]*sanitizeStyle\(value\)[\s\S]*setAttribute\('style', safeStyle\)/, 'safe inline style attributes must survive sanitizer normalization');
assert.match(core, /element\.tagName === 'FONT'[\s\S]*appendSafeInlineStyle\(element, 'color', color\)/, 'legacy FONT color must normalize to safe inline CSS');
assert.match(core, /getAttribute\('bgcolor'\)[\s\S]*appendSafeInlineStyle\(element, 'background-color'/, 'legacy bgcolor must normalize to safe inline CSS');
assert.match(core, /getAttribute\('align'\)[\s\S]*appendSafeInlineStyle\(element, 'text-align'/, 'legacy align must normalize to safe inline CSS');
assert.match(core, /getAttribute\('valign'\)[\s\S]*appendSafeInlineStyle\(element, 'vertical-align'/, 'legacy valign must normalize to safe inline CSS');

assert.match(editor, /document\.execCommand\('styleWithCSS', false, true\)[\s\S]*document\.execCommand\(command, false, colorValue\)/, 'editor color commands must emit CSS-backed markup');
assert.match(editor, /const commitSourceValue = \(\) => \{[\s\S]*sanitizeRichTextHtml\(sourceValue\)[\s\S]*onChange\?\.\(sanitizedHtml\)/, 'source mode must commit sanitized HTML back to the controlled value');
assert.match(editor, /const currentHtml = getStoredHtmlFromEditor\(editorRef\.current\)[\s\S]*onChange\?\.\(currentHtml\)[\s\S]*setSourceMode\(true\)/, 'entering source mode must synchronize the current editor DOM with the parent save state');
assert.match(editor, /onBlur=\{commitSourceValue\}/, 'source textarea blur must commit canonical HTML before an external save button runs');

for (const [name, source] of [
  ['notice/FAQ', boardController],
  ['popup', popupController],
  ['footer', footerController],
  ['signup terms', signupTerms],
  ['user inquiry', userInquiry],
  ['admin inquiry answer/term', adminInquiry],
]) {
  assert.ok(source.includes('sanitizeRichTextHtml'), `${name} save path must canonicalize rich-text HTML before persistence`);
}
assert.match(signupTerms, /const contentHtml = sanitizeRichTextHtml\(form\.contentHtml \|\| ''\)/, 'signup terms must sanitize at save boundary');
assert.match(userInquiry, /const bodyHtml = sanitizeRichTextHtml\(form\.bodyHtml\)[\s\S]*const bodyText = richTextHtmlToText\(bodyHtml\)/, 'member inquiry save must persist canonical HTML and matching plain text');
assert.match(userInquiry, /const bodyHtml = sanitizeRichTextHtml\(guestForm\.bodyHtml\)[\s\S]*const bodyText = richTextHtmlToText\(bodyHtml\)/, 'guest inquiry save must persist canonical HTML and matching plain text');
assert.match(adminInquiry, /const bodyHtml = sanitizeRichTextHtml\(answerHtml\)[\s\S]*const bodyText = richTextHtmlToText\(bodyHtml\)/, 'administrator answer save must persist canonical HTML and matching plain text');
assert.match(adminInquiry, /const bodyHtml = sanitizeRichTextHtml\(termForm\.bodyHtml\)[\s\S]*const bodyText = richTextHtmlToText\(bodyHtml\)/, 'inquiry-only term save must persist canonical HTML and matching plain text');

assert.match(inquiryService, /const contentHash = hashStructured\(\{ title, bodyHtml, bodyText, required: Boolean\(input\?\.required\) \}\)/, 'inquiry-term version hash must include HTML so formatting-only edits create a new revision');
for (const code of ['inquiry_body_storage_roundtrip_mismatch','inquiry_answer_storage_roundtrip_mismatch','inquiry_term_storage_roundtrip_mismatch']) {
  assert.ok(inquiryService.includes(code), `server must fail closed when stored rich-text HTML changes unexpectedly: ${code}`);
}
assert.match(inquiryRepository, /SET title=\$2,body_html=\$3,body_text=\$4/, 'inquiry-term repository must write body_html directly');
assert.match(inquiryRepository, /contentHtml: row\.body_html \|\| ''/, 'inquiry-term repository must return stored body_html without text-only reconstruction');
assert.match(inquiryRepository, /SET category_id=\$2,title=\$3,body_html=\$4,body_text=\$5/, 'inquiry repository updates must preserve body_html separately from body_text');
assert.match(inquiryRepository, /SET body_html=\$3,body_text=\$4/, 'administrator answer updates must preserve body_html separately from body_text');

assert.match(inquiryApi, /peekPublicConfig\(options = \{\}\) \{[\s\S]*if \(options\?\.includeGuestTerms\) return null;/, 'guest legal-term HTML must never be served from the short-lived summary cache');
assert.match(inquiryApi, /async getPublicConfig\(\{ includeGuestTerms = false, includeCategories = true \} = \{\}\) \{[\s\S]*if \(includeGuestTerms\) \{[\s\S]*requestJson\(\{ path \}\)/, 'guest legal-term reads must bypass the summary cache and fetch current HTML');

const saveTermIndex = inquiryApi.indexOf('async saveInquiryTerm(input)');
assert.ok(saveTermIndex >= 0, 'inquiry term API save function is required');
const saveTermBlock = inquiryApi.slice(saveTermIndex, inquiryApi.indexOf('async deleteInquiryTerm', saveTermIndex));
assert.match(saveTermBlock, /clearInquiryReadCache\('public-config\|'\)/, 'saving an inquiry term must invalidate cached guest-term HTML');
const deleteTermIndex = inquiryApi.indexOf('async deleteInquiryTerm(id)');
const deleteTermBlock = inquiryApi.slice(deleteTermIndex, inquiryApi.indexOf('async addAnswer', deleteTermIndex));
assert.match(deleteTermBlock, /clearInquiryReadCache\('public-config\|'\)/, 'deleting an inquiry term must invalidate cached guest-term HTML');

console.log('[phase34-rich-text-storage-roundtrip-smoke] PASS');
