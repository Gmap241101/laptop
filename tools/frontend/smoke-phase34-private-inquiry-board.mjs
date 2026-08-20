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
  '회원 문의', '비회원 문의', '비회원 문의 등록', '비회원 문의 등록 및 확인',
  '문의 확인 비밀번호', '문의 확인 비밀번호 확인', '이메일', '연락처',
  '비회원 문의 확인 비밀번호는 재설정할 수 없습니다.', '답변대기', '답변완료', '추가답변',
  '관리자 답변', '문의 등록', '문의 수정', '문의 작성', '문의내역 검색',
  'mk_laptop_guest_inquiry_access', 'window.sessionStorage', 'RichTextEditor',
]) assert.ok(userPanel.includes(marker), `User inquiry marker missing: ${marker}`);
assert.doesNotMatch(userPanel, /localStorage/);
assert.match(userPanel, /Number\(detail\.answerCount \|\| 0\) === 0/);
assert.doesNotMatch(userPanel, /setActiveFaqCategoryId|카테고리 탭/);
assert.doesNotMatch(userPanel, /guestInquiryLookupMethod|조회 방법|guestVerify\.method|guestVerify\.identifier/);
assert.match(userPanel, /로그인하시면 기존 문의를 확인하거나 새 문의를 작성할 수 있습니다\./);
assert.match(userPanel, /성명, 이메일, 연락처, 비밀번호를 입력하시면 기존 문의를 확인하거나 새 문의를 작성할 수 있습니다\./);
assert.match(userPanel, /성명, 이메일, 연락처, 문의 확인 비밀번호를 입력해 기존 문의를 확인하거나 새 문의를 등록할 수 있습니다\./);
assert.match(userPanel, />비회원 문의 등록 및 확인<\/Button>/);
assert.match(userPanel, /const parseDomesticPhoneDraft = \(value\) =>/);
assert.match(userPanel, /normalizePhoneMiddleDigits\(rawMiddle\)/);
assert.match(userPanel, /normalizePhoneDigits\(rawLast, 4\)/);
assert.doesNotMatch(userPanel, /parseDomesticPhoneNumber\(guest(?:Form|Verify)\.phone\)/);
assert.match(userPanel, /useState\('verify'\)/);
assert.match(userPanel, /parseDomesticPhoneDraft/);
assert.match(userPanel, /<DomesticPhoneInput[\s\S]*parseDomesticPhoneDraft\(guestVerify\.phone\)/);
assert.match(userPanel, /onClick=\{prepareGuestCreate\}>\{guestPrepareLoading \? '확인 중' : '문의 등록'\}/);
assert.match(userPanel, /onClick=\{verifyGuest\}>\{guestVerifyLoading \? '확인 중' : '문의 확인'\}/);
assert.match(userPanel, /guest_inquiry_identity_password_mismatch/);
assert.match(userPanel, /const PasswordInput = \(\{ value, onChange, autoComplete = 'current-password', disabled = false \}\) =>/);
assert.match(userPanel, /<EyeOff size=\{17\} \/> : <Eye size=\{17\} \/>/);
assert.match(userPanel, /aria-label=\{visible \? '비밀번호 숨기기' : '비밀번호 보기'\}/);
assert.match(userPanel, /const IdentityText = \(\{ label, value \}\) =>/);
assert.match(userPanel, /<IdentityText label="성명" value=\{guestForm\.name\} \/>/);
assert.match(userPanel, /<IdentityText label="이메일" value=\{guestForm\.email\} \/>/);
assert.match(userPanel, /<IdentityText label="연락처" value=\{guestForm\.phone\} \/>/);
assert.doesNotMatch(userPanel, /<Input value=\{guestForm\.name\}/);
assert.doesNotMatch(userPanel, /<Input type="email" value=\{guestForm\.email\}/);
assert.doesNotMatch(userPanel, /<DomesticPhoneInput[\s\S]{0,240}parseDomesticPhoneDraft\(guestForm\.phone\)/);
assert.match(userPanel, /setGuestPreparedPassword\(guestVerify\.password\)/);
assert.match(userPanel, /passwordConfirm: ''/);
assert.match(userPanel, /currentPassword: guestPreparedPassword/);
assert.match(userPanel, /<PasswordInput value=\{guestVerify\.password\}/);
assert.match(userPanel, /<PasswordInput value=\{guestForm\.password\}/);
assert.match(userPanel, /<PasswordInput value=\{guestForm\.passwordConfirm\}/);
assert.match(userPanel, /문의 등록 및 확인 페이지에서 입력한 성명, 이메일, 연락처는 변경할 수 없습니다\. 문의 확인 비밀번호는 아래 확인란에 다시 입력하시고, 비밀번호 변경시 새 비밀번호를 두 칸에 동일하게 입력해 주세요\./);
assert.match(userPanel, /<div className="grid gap-4 md:grid-cols-3">[\s\S]*?<Field label="부서\/팀">[\s\S]*?<Field label="문의 확인 비밀번호">[\s\S]*?<Field label="문의 확인 비밀번호 확인">/, 'guest inquiry compose must place team and both password fields in one equal 1:1:1 desktop row');
assert.match(userPanel, /rounded-full border px-2 py-0\.5 text-\[10px\] font-bold/);
assert.doesNotMatch(userPanel, /\{term\.required \? '\[필수\]' : '\[선택\]'\}/);
assert.doesNotMatch(userPanel, />\s*처음으로\s*</);
assert.doesNotMatch(userPanel, /variant=\{guestMode === 'create' \? 'primary' : 'outline'\}/);
assert.doesNotMatch(userPanel, /variant=\{guestMode === 'verify' \? 'primary' : 'outline'\}/);

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
assert.match(userPanel, /\{label\}이 없습니다\./, 'missing inquiry neighbor must render only the missing-title message');
assert.doesNotMatch(userPanel, /\{item \? item\.authorName \|\| '-' : '-'\}/, 'missing inquiry neighbor metadata must not render dash placeholders');
assert.match(userPanel, /text-sm font-normal text-slate-800 hover:text-orange-600/, 'inquiry previous/next titles must use normal font weight');
assert.doesNotMatch(userPanel, /min-h-\[220px\]/, 'short inquiry body must not reserve a fixed minimum height');
const inquiryNavigationIndex = userPanel.indexOf("['이전글', detail.navigation?.previous]");
const inquiryDetailListButtonIndex = userPanel.indexOf('<ArrowLeft size={14} /> 목록으로', inquiryNavigationIndex);
assert.ok(inquiryNavigationIndex >= 0 && inquiryDetailListButtonIndex > inquiryNavigationIndex, 'inquiry detail action buttons must render below previous/next navigation');
const inquiryNavigationBlock = userPanel.slice(inquiryNavigationIndex, inquiryDetailListButtonIndex);
assert.doesNotMatch(inquiryNavigationBlock, /<thead[^>]*>/, 'inquiry previous/next navigation must not render a gray title header');
assert.match(userPanel, /includeGuestTerms: true, includeCategories: true/);
assert.match(userPanel, /guestMode === 'create' && guestTermsLoading/);
assert.match(api, /includeGuestTerms: includeGuestTerms \? '1' : ''/);
assert.match(api, /includeCategories: includeCategories \? '' : '0'/);
assert.match(api, /async listMember\(\{ search = '', page = 1, pageSize \} = \{\}\)/);
assert.match(api, /queryString\(\{ search, page, pageSize \}\)/);
assert.match(api, /async listGuest\(\{ token, page = 1, pageSize \} = \{\}\)/);
assert.match(api, /async prepareGuestCreate\(input\)/);

// Inquiry uses the same public-board hero/header shell as notices.
assert.match(userPanel, /bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 px-6 py-10 text-white/);
assert.match(userPanel, /relative mx-auto max-w-3xl text-center/);

assert.match(userPanel, /md:grid-cols-\[minmax\(0,1fr\)_minmax\(0,4fr\)\]/, 'desktop inquiry compose must place inquiry type and title in a 1:4 row');
assert.match(userPanel, /mb-1\.5 text-xs font-semibold text-slate-600/, 'inquiry type and title labels must match the rich-text body label size');
assert.match(userPanel, /이용 중 궁금하신 점을 작성해주세요\. 담당자 확인 후 답변드리겠습니다\./, 'member inquiry compose guidance copy must match the requested wording');
assert.doesNotMatch(userPanel, /categoryId: current\.categoryId \|\| next\.categories\?\.\[0\]\?\.id/, 'loading inquiry config must not auto-select the first inquiry type');
assert.doesNotMatch(userPanel, /categoryId: categories\[0\]\?\.id \|\| ''/, 'new inquiry forms must default inquiry type to the explicit 선택 option');
assert.ok(!userPanel.includes('문의 카테고리'), 'user inquiry UI must use 문의 구분 terminology');
assert.ok(!adminPanel.includes('문의 카테고리'), 'admin inquiry UI must use 문의 구분 terminology');
assert.match(userPanel, /flex min-h-0 flex-1 flex-col gap-5/, 'short inquiry detail must flex-fill the available viewport body area');
assert.match(userPanel, /flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white/, 'inquiry body card must expand into remaining viewport height');
assert.match(userPanel, /text-2xl font-black tracking-tight/);
assert.doesNotMatch(userPanel, /<Plus[^>]*\/?\s*>/);

assert.match(adminWorkspace, /\['inquiryPosts', ClipboardList, '문의하기 관리'\]/);
assert.match(adminWorkspace, /<AdminInquiryPanel ctx=\{panelCtx\}/);
assert.match(context, /inquiryPosts:\s*contextKeys\('triggerConfirm triggerToast'\)/);

for (const marker of [
  '문의하기 관리', '문의 검색', '답변대기', '답변완료', '추가답변',
  '회원구분', '문의 구분', '작성자', '작성일시', '답변수', '최근 답변일시',
  '문의 구분 관리', '문의 설정', '회원만 문의 가능', '회원 + 비회원 문의 가능',
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
  '/api/inquiries/guest/prepare', '/api/inquiries/guest/verify', '/api/admin/inquiries', '/api/admin/inquiries/settings',
  '/api/admin/inquiries/categories', '/api/admin/inquiries/terms',
]) assert.ok(api.includes(endpoint), `Inquiry API endpoint missing: ${endpoint}`);
assert.match(api, /Authorization = `Guest \$\{normalizedGuestToken\}`/);
assert.match(api, /Authorization = `Bearer \$\{token\}`/);

for (const source of [userPanel, adminPanel, api]) {
  assert.doesNotMatch(source, /from\s+['"][^'"]*(?:firebase|firestore)|\b(?:getDocs|collection|onSnapshot)\s*\(/i);
}
assert.doesNotMatch(userPanel + adminPanel, /setInterval\s*\(|setTimeout\s*\([^,]+,\s*(?:1000|5000|10000|30000)\s*\)/);

console.log('[phase34-private-inquiry-frontend-smoke] PASS');
