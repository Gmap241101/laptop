import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(path, 'utf8');
const routes = read('src/routing/appRoutes.js');
const navigation = read('src/routing/useAppNavigationController.js');
const userShell = read('src/user/UserShell.jsx');
const userWorkspace = read('src/user/UserWorkspace.jsx');
const userPanel = read('src/user/UserInquiryPanel.jsx');
const adminWorkspace = read('src/admin/AdminWorkspace.jsx');
const adminPanel = read('src/admin/AdminInquiryPanel.jsx');
const api = read('src/features/inquiries/inquiryApi.js');
const context = read('src/context/appContextSlices.js');
const richTextEditor = read('src/components/RichTextEditor.jsx');
const commonUi = read('src/components/CommonUI.jsx');

assert.match(routes, /inquiry:\s*'\/board\/inquiry'/);
assert.match(routes, /pathname === '\/board\/inquiry'/);
assert.match(navigation, /const goToUserInquiry = useCallback/);
assert.match(userShell, />\s*문의하기\s*</);
assert.match(userShell, /\['notice', 'faq', 'inquiry'\]/);
assert.match(userWorkspace, /UserInquiryPanel/);
assert.match(context, /inquiry:\s*contextKeys\('goToUserLogin hasFirebaseAuthSession triggerToast'\)/);

for (const marker of [
  '회원 로그인', '비회원 문의 및 조회', '비회원 문의 작성', '비회원 문의 확인',
  '문의 확인 비밀번호', '문의 확인 비밀번호 확인', '조회 방법', '이메일', '연락처',
  '비회원 문의 확인 비밀번호는 재설정할 수 없습니다.', '답변대기', '답변완료', '추가답변',
  '관리자 답변', '문의 등록', '문의 수정', '문의 작성', '문의내역 검색',
  'mk_laptop_guest_inquiry_access', 'window.sessionStorage', 'RichTextEditor',
]) assert.ok(userPanel.includes(marker), `User inquiry marker missing: ${marker}`);
assert.doesNotMatch(userPanel, /localStorage/);
assert.match(userPanel, /Number\(detail\.answerCount \|\| 0\) === 0/);
assert.doesNotMatch(userPanel, /setActiveFaqCategoryId|카테고리 탭/);

// User inquiry must use the shared rich-text editor directly in the page instead of a create/edit modal textarea.
assert.match(userPanel, /import\s*\{[^}]*RichTextEditor[^}]*\}\s*from\s*['"]\.\.\/components\/RichTextEditor\.jsx['"]/);
assert.match(userPanel, /<RichTextEditor[\s\S]*label="문의 본문"/);
assert.doesNotMatch(userPanel, /<textarea[^>]*bodyText/);
assert.doesNotMatch(userPanel, /formOpen|<ModalShell/);

// CommonUI Input/Select emit the value directly. Inquiry panels must never dereference target.value from those callbacks.
assert.match(commonUi, /onChange=\{\(e\) => onChange\(e\.target\.value\)\}/);
assert.doesNotMatch(userPanel, /<Input[^>]*onChange=\{\(e\)\s*=>[^}]*e\.target\.value/);
assert.doesNotMatch(userPanel, /<Select[^>]*onChange=\{\(e\)\s*=>[^}]*e\.target\.value/);
assert.doesNotMatch(adminPanel, /<Input[^>]*onChange=\{\(e\)\s*=>[^}]*e\.target\.value/);
assert.doesNotMatch(adminPanel, /<Select[^>]*onChange=\{\(e\)\s*=>[^}]*e\.target\.value/);

// Member-only mode redirects to the existing login route and preserves the inquiry return target via goToUserLogin.
assert.match(userPanel, /hasFirebaseAuthSession\s*\|\|\s*config\.allowGuest\s*\|\|\s*redirectingToLoginRef\.current/);
assert.match(userPanel, /redirectingToLoginRef\.current\s*=\s*true;\s*goToUserLogin\(\)/s);

// Member inquiry opens on the searchable list and loads the list in parallel with lightweight config. Guest terms remain lazy-loaded.
assert.match(userPanel, /useState\('list'\)/);
assert.doesNotMatch(userPanel, />\s*내 문의 내역\s*</);
assert.match(userPanel, /Promise\.all\(\[[\s\S]*loadSummaryConfig\(\)[\s\S]*loadList\(\{ targetPage: 1, search: '' \}\)/);
assert.match(userPanel, /문의내역 검색/);
assert.match(userPanel, /placeholder="문의 제목 또는 본문 검색"/);
assert.match(userPanel, /\['이전글', detail\.navigation\?\.previous\]/);
assert.match(userPanel, /\['다음글', detail\.navigation\?\.next\]/);
for (const marker of ['제목', '등록자', '등록일', '조회수']) assert.ok(userPanel.includes(marker), `Inquiry detail navigation header missing: ${marker}`);
const inquiryNavigationIndex = userPanel.indexOf("['이전글', detail.navigation?.previous]");
const inquiryDetailListButtonIndex = userPanel.indexOf('<ArrowLeft size={14} /> 목록으로', inquiryNavigationIndex);
assert.ok(inquiryNavigationIndex >= 0 && inquiryDetailListButtonIndex > inquiryNavigationIndex, 'inquiry detail action buttons must render below previous/next navigation');
assert.match(userPanel, /includeGuestTerms: true, includeCategories: true/);
assert.match(userPanel, /guestMode === 'create' && guestTermsLoading/);
assert.match(api, /includeGuestTerms: includeGuestTerms \? '1' : ''/);
assert.match(api, /includeCategories: includeCategories \? '' : '0'/);
assert.match(api, /async listMember\(\{ search = '', page = 1, pageSize \} = \{\}\)/);
assert.match(api, /queryString\(\{ search, page, pageSize \}\)/);
assert.match(api, /async listGuest\(\{ token, page = 1, pageSize \} = \{\}\)/);

// Inquiry uses the same public-board hero/header shell as notices.
assert.match(userPanel, /bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 px-6 py-10 text-white/);
assert.match(userPanel, /relative mx-auto max-w-3xl text-center/);
assert.match(userPanel, /text-2xl font-black tracking-tight/);
assert.doesNotMatch(userPanel, /<Plus[^>]*\/?\s*>/);

assert.match(adminWorkspace, /\['inquiryPosts', ClipboardList, '문의하기 관리'\]/);
assert.match(adminWorkspace, /<AdminInquiryPanel ctx=\{panelCtx\}/);
assert.match(context, /inquiryPosts:\s*contextKeys\('triggerConfirm triggerToast'\)/);

for (const marker of [
  '문의하기 관리', '문의 검색', '답변대기', '답변완료', '추가답변',
  '회원구분', '카테고리', '작성자', '작성일시', '답변수', '최근 답변일시',
  '카테고리 관리', '문의 설정', '회원만 문의 가능', '회원 + 비회원 문의 가능',
  '비회원 문의 적용 약관', '기존 회원가입 약관', '문의 전용 약관',
  '관리자 답변 등록', '관리자 답변 수정', 'RichTextEditor', '논리삭제',
  'sm:grid-cols-[1fr_auto_1fr]',
]) assert.ok(adminPanel.includes(marker), `Admin inquiry marker missing: ${marker}`);
assert.match(adminPanel, /제목, 본문, 작성자명, 이메일, 연락처 검색/);
assert.match(adminPanel, /<th[^>]*>제목<\/th>/);
assert.doesNotMatch(adminPanel, /<th[^>]*>이메일<\/th>/);
assert.doesNotMatch(adminPanel, /<th[^>]*>연락처<\/th>/);
assert.match(adminPanel, /<span className="text-slate-400">이메일<\/span>/);
assert.match(adminPanel, /<span className="text-slate-400">연락처<\/span>/);
assert.match(adminPanel, /회원 UID/);

assert.match(adminPanel, /import\s*\{[^}]*RichTextEditor[^}]*\}\s*from\s*['"]\.\.\/components\/RichTextEditor\.jsx['"]/);
assert.doesNotMatch(adminPanel, /import\s+RichTextEditor\s+from\s*['"]\.\.\/components\/RichTextEditor\.jsx['"]/);
assert.match(richTextEditor, /export\s+function\s+RichTextEditor\s*\(/);

for (const endpoint of [
  '/api/inquiries/config', '/api/inquiries/member', '/api/inquiries/guest',
  '/api/inquiries/guest/verify', '/api/admin/inquiries', '/api/admin/inquiries/settings',
  '/api/admin/inquiries/categories', '/api/admin/inquiries/terms',
]) assert.ok(api.includes(endpoint), `Inquiry API endpoint missing: ${endpoint}`);
assert.match(api, /Authorization = `Guest \$\{normalizedGuestToken\}`/);
assert.match(api, /Authorization = `Bearer \$\{token\}`/);

for (const source of [userPanel, adminPanel, api]) {
  assert.doesNotMatch(source, /from\s+['"][^'"]*(?:firebase|firestore)|\b(?:getDocs|collection|onSnapshot)\s*\(/i);
}
assert.doesNotMatch(userPanel + adminPanel, /setInterval\s*\(|setTimeout\s*\([^,]+,\s*(?:1000|5000|10000|30000)\s*\)/);

console.log('[phase34-private-inquiry-frontend-smoke] PASS');
