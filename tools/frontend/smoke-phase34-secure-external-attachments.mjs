import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(path, 'utf8');
const editor = read('src/components/SecureAttachmentEditor.jsx');
const list = read('src/components/SecureAttachmentList.jsx');
const api = read('src/features/attachments/secureAttachmentApi.js');
const boardController = read('src/features/boards/useAdminBoardPostController.js');
const adminDialogs = read('src/admin/AdminDialogs.jsx');
const appDialogs = read('src/dialogs/AppDialogs.jsx');
const userBoard = read('src/user/UserBoardPanel.jsx');
const userInquiry = read('src/user/UserInquiryPanel.jsx');
const adminInquiry = read('src/admin/AdminInquiryPanel.jsx');

for (const marker of ['첨부파일', '외부 HTTPS 직접 다운로드 파일 주소', '기존 보안 링크 유지', '최대 {MAX_ATTACHMENTS}개']) {
  assert.ok(editor.includes(marker), `secure attachment editor marker missing: ${marker}`);
}
assert.match(editor, /targetUrl/);
assert.match(editor, /attachments\.length >= MAX_ATTACHMENTS/);
assert.match(list, /if \(!items\.length\) return null/);
assert.match(list, /getSecureAttachmentUrl/);
assert.match(list, /downloadSecureAttachment/);
assert.match(list, /formatFileSize/);
assert.match(list, /fileSizeBytes/);
assert.match(list, /downloadCount/);
assert.match(list, /다운로드 \{normalizeDownloadCount\(attachment\.downloadCount\)\}회/);
assert.match(list, /용량 미확인/);
assert.doesNotMatch(list, /targetUrl|\.url\b/, 'reader attachment list must not receive or render the external target URL');
assert.match(api, /\/api\/attachments\/\$\{encodeURIComponent\(trim\(attachmentId\)\)\}\/download/);
assert.match(api, /headers\.Authorization = `Bearer/);
assert.match(api, /headers\.Authorization = `Guest/);
assert.match(api, /response\.blob\(\)/);
assert.doesNotMatch(api, /location|redirect\s*:/i, 'frontend attachment API must not follow an application-level external redirect');

assert.match(boardController, /attachments: \[\]/);
assert.match(boardController, /targetUrl: ''/);
assert.match(boardController, /attachments: noticePostForm\.attachments \|\| \[\]/);
assert.match(boardController, /attachments: faqPostForm\.attachments \|\| \[\]/);
assert.match(adminDialogs, /SecureAttachmentEditor/);
assert.match(appDialogs, /SecureAttachmentEditor/);
assert.match(userBoard, /<SecureAttachmentList attachments=\{selectedNoticePost\.attachments\} \/>/);
assert.match(userBoard, /<SecureAttachmentList attachments=\{post\.attachments\} \/>/);
assert.match(userInquiry, /attachments: \[\]/);
assert.match(userInquiry, /SecureAttachmentEditor/);
assert.match(userInquiry, /attachments=\{detail\.attachments\}/);
assert.match(userInquiry, /attachments=\{answer\.attachments\}/);
assert.match(userInquiry, /authMode=\{hasFirebaseAuthSession \? 'clerk' : 'guest'\}/);
assert.match(adminInquiry, /answerAttachments/);
assert.match(adminInquiry, /attachments: answerAttachments/);
assert.match(adminInquiry, /attachments=\{detail\.attachments\}/);
assert.match(adminInquiry, /attachments=\{answer\.attachments\}/);

console.log('[phase34-secure-external-attachments-frontend-smoke] PASS');
