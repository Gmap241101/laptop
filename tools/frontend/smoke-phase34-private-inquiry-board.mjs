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
const adminInquiryCategoryDialog = read('src/admin/AdminInquiryCategoryDialog.jsx');
const adminFaqCategoryDialog = read('src/admin/AdminFaqCategoryDialog.jsx');
const api = read('src/features/inquiries/inquiryApi.js');
const context = read('src/context/appContextSlices.js');
const richTextEditor = read('src/components/RichTextEditor.jsx');
const commonUi = read('src/components/CommonUI.jsx');
const paginationControls = read('src/components/PaginationControls.jsx');

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
assert.match(userPanel, />답변 \{Number\(detail\.answerCount \|\| 0\)\}건<\/h4>/);
assert.match(userPanel, /index === 0 \? '답변입니다\.' : `\$\{index\}번째 추가답변입니다\.`/);
assert.match(userPanel, /아직 등록된 답변이 없습니다\./);
const userAnswerSectionStart = userPanel.indexOf('<div className="space-y-3">\n          <h4 className="text-sm font-bold text-slate-900">답변 ');
const userAnswerSectionEnd = userPanel.indexOf('<div className="-mx-1 divide-y divide-slate-100 border-y border-slate-200 bg-white sm:mx-0 sm:hidden">', userAnswerSectionStart);
assert.ok(userAnswerSectionStart >= 0 && userAnswerSectionEnd > userAnswerSectionStart, 'user inquiry answer section must exist');
const userAnswerSection = userPanel.slice(userAnswerSectionStart, userAnswerSectionEnd);
assert.doesNotMatch(userAnswerSection, /관리자/, 'user inquiry answer presentation must not use administrator wording');
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
assert.match(userPanel, /const startGuestCreateFromList = async \(\) =>/);
assert.match(userPanel, /onClick=\{startGuestCreateFromList\}>문의하기<\/Button>/);
assert.match(userPanel, /인증 종료<\/Button>[\s\S]*문의하기<\/Button>/);
assert.match(userPanel, /space-y-3 sm:hidden[\s\S]*전체 문의 \{totalCount\}건[\s\S]*PaginationControls/, 'mobile inquiry list navigation must separate summary/actions from pagination');
assert.match(userPanel, /InquiryStatusBadge status=\{item\.status\}[\s\S]*\{item\.title\}[\s\S]*\{item\.categoryName \|\| '-'\}[\s\S]*formatDateTime\(item\.createdAt\)/, 'mobile inquiry row must show status + title before category + created time');

assert.match(userPanel, /const InquiryStatusBadge = \(\{ status \}\) => \([\s\S]*inline-flex h-5 items-center whitespace-nowrap rounded-full border px-2\.5 text-\[10px\] font-bold leading-none/, 'inquiry status badge must keep compact vertical padding and single-line alignment');
assert.match(userPanel, /flex min-w-0 items-baseline gap-1\.5[\s\S]*relative -top-px shrink-0 self-baseline[\s\S]*InquiryStatusBadge status=\{item\.status\}[\s\S]*\{item\.title\}/, 'mobile inquiry status badge must keep the shared baseline with a one-pixel optical lift');
assert.match(userPanel, /grid grid-cols-\[52px_minmax\(0,1fr\)\] items-center gap-2 px-1\.5 py-3[\s\S]*text-center text-\[11px\] text-slate-500/, 'mobile inquiry previous\/next labels must align to the detail content inset');

assert.match(userPanel, /const cancelGuestCreate = \(\) =>/);
assert.match(userPanel, /onClick=\{cancelGuestCreate\}>취소<\/Button>[\s\S]*onClick=\{createGuest\}>\{saving \? '등록 중' : '문의 등록'\}<\/Button>/, 'guest inquiry compose must provide cancel next to submit');
const guestCancelStart = userPanel.indexOf('const cancelGuestCreate = () =>');
const guestCancelEnd = userPanel.indexOf('const startGuestCreateFromList = async () =>', guestCancelStart);
const guestCancelBlock = userPanel.slice(guestCancelStart, guestCancelEnd);
assert.match(guestCancelBlock, /backUserCommunityHistoryState\(\{ tab: 'inquiry', view: 'compose'/, 'guest compose cancel must return through inquiry internal history');
assert.match(guestCancelBlock, /guestAccess\?\.token[\s\S]*view: 'list'/, 'authenticated guest compose cancel must fall back to the verified inquiry list');
assert.doesNotMatch(guestCancelBlock, /writeGuestAccess\(null\)|setGuestAccess\(null\)|clearGuestSession\(/, 'guest compose cancel must preserve guest authentication');

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
assert.match(userPanel, /Promise\.all\(\[[\s\S]*loadSummaryConfig\(\)[\s\S]*loadList\(\{ targetPage: 1, search: '', targetPageSize: PAGE_SIZE_FALLBACK \}\)/);
assert.match(userPanel, /문의내역 검색/);
assert.match(userPanel, /placeholder="문의 제목 또는 본문 검색"/);
assert.match(userPanel, /md:grid-cols-\[minmax\(0,4fr\)_minmax\(150px,1fr\)\]/, 'inquiry list search and page-size controls must use a 4:1 desktop grid');
assert.match(userPanel, /PAGE_SIZE_OPTIONS = Object\.freeze\(\[10, 30, 50\]\)/);
assert.match(userPanel, /PAGE_SIZE_OPTIONS\.map\(\(size\) => <option key=\{size\} value=\{size\}>\{size\}개씩 보기<\/option>\)/);
assert.match(userPanel, /aria-label="문의 목록 표시 건수"/);
assert.match(userPanel, /inquiryApi\.listGuest\(\{ token: access\.token, page: targetPage, search, pageSize: requestedPageSize \}\)/, 'guest inquiry list must support scoped search and page-size selection');
assert.match(userPanel, /\['이전글', detail\.navigation\?\.previous\]/);
assert.match(userPanel, /\['다음글', detail\.navigation\?\.next\]/);
assert.match(userPanel, /\{label\}이 없습니다\./, 'missing inquiry neighbor must render only the missing-title message');
assert.doesNotMatch(userPanel, /\{item \? item\.authorName \|\| '-' : '-'\}/, 'missing inquiry neighbor metadata must not render dash placeholders');
assert.match(userPanel, /text-sm font-normal text-slate-800 hover:text-orange-600/, 'inquiry previous/next titles must use normal font weight');
assert.doesNotMatch(userPanel, /min-h-\[220px\]/, 'short inquiry body must not reserve a fixed minimum height');
const inquiryNavigationIndex = userPanel.indexOf("['이전글', detail.navigation?.previous]");
const inquiryDetailListButtonIndex = userPanel.indexOf('>\n            목록으로\n          </Button>', inquiryNavigationIndex);
assert.ok(inquiryNavigationIndex >= 0 && inquiryDetailListButtonIndex > inquiryNavigationIndex, 'inquiry detail action buttons must render below previous/next navigation');
assert.doesNotMatch(userPanel, /ArrowLeft/, 'inquiry detail list button must not show a left-arrow icon');
const inquiryNavigationBlock = userPanel.slice(inquiryNavigationIndex, inquiryDetailListButtonIndex);
assert.doesNotMatch(inquiryNavigationBlock, /<thead[^>]*>/, 'inquiry previous/next navigation must not render a gray title header');
assert.match(userPanel, /includeGuestTerms: true, includeCategories: true/);
assert.match(userPanel, /guestMode === 'create' && guestTermsLoading/);
assert.match(api, /includeGuestTerms: includeGuestTerms \? '1' : ''/);
assert.match(api, /includeCategories: includeCategories \? '' : '0'/);
assert.match(api, /async listMember\(\{ search = '', page = 1, pageSize \} = \{\}\)/);
assert.match(api, /queryString\(\{ search, page, pageSize \}\)/);
assert.match(api, /async listGuest\(\{ token, search = '', page = 1, pageSize \} = \{\}\)/);
assert.match(api, /queryString\(\{ search, page, pageSize \}\)/);
assert.match(api, /async prepareGuestCreate\(input\)/);

// Inquiry uses the same public-board hero/header shell as notices.
assert.match(userPanel, /bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 px-4 py-8 text-white sm:px-6 sm:py-10/);
assert.match(userPanel, /relative mx-auto max-w-3xl text-center/);

assert.match(userPanel, /md:grid-cols-\[minmax\(0,1fr\)_minmax\(0,4fr\)\]/, 'desktop inquiry compose must place inquiry type and title in a 1:4 row');
assert.match(userPanel, /mb-1\.5 text-xs font-semibold text-slate-600/, 'inquiry type and title labels must match the rich-text body label size');
assert.match(userPanel, /이용 중 궁금하신 점을 작성해주세요\. 담당자 확인 후 답변드리겠습니다\./, 'member inquiry compose guidance copy must match the requested wording');
assert.doesNotMatch(userPanel, /categoryId: current\.categoryId \|\| next\.categories\?\.\[0\]\?\.id/, 'loading inquiry config must not auto-select the first inquiry type');
assert.doesNotMatch(userPanel, /categoryId: categories\[0\]\?\.id \|\| ''/, 'new inquiry forms must default inquiry type to the explicit 선택 option');
assert.ok(!userPanel.includes('문의 카테고리'), 'user inquiry UI must use 문의 구분 terminology');
assert.ok(!adminPanel.includes('문의 카테고리'), 'admin inquiry UI must use 문의 구분 terminology');
assert.match(userPanel, /flex min-h-0 flex-1 flex-col gap-4 sm:gap-5/, 'short inquiry detail must flex-fill the available viewport body area');
assert.match(userPanel, /-mx-1 flex min-h-0 flex-1 flex-col bg-white sm:mx-0 sm:overflow-hidden sm:rounded-2xl sm:border sm:border-slate-200/, 'inquiry detail must flatten the nested mobile body card while retaining the desktop article shell');
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
assert.ok(adminPanel.includes("<Field label=\"상태\"><Select value={status}") && adminPanel.includes("style={{ fontSize: '0.75rem', lineHeight: '1rem' }}"), 'admin inquiry status filter must match the compact search input text metrics');
assert.match(adminPanel, /import ModalPortal from ['"]\.\.\/components\/ModalPortal\.jsx['"];/, 'admin inquiry modals must render through the shared document-body portal');
assert.match(adminPanel, /<ModalPortal[\s\S]{0,320}fixed inset-0 z-\[120\][\s\S]{0,180}backdrop-blur-sm/, 'admin inquiry modal backdrop must cover and blur the full viewport');
assert.match(adminPanel, /const ADMIN_LIST_PAGE_SIZE = 10;/, 'admin inquiry list must use a fixed compact page size instead of the user-facing inquiry setting');
assert.doesNotMatch(adminPanel, /페이지당 목록 표시 수/, 'inquiry settings modal must not expose a redundant page-size setting now that users choose 10\/30\/50 per page');
assert.match(adminPanel, /maxWidth = 'max-w-\[820px\]'/, 'inquiry modal default width must be slightly narrower than the former max-w-4xl layout');
assert.ok((adminPanel.match(/className=\"flex items-center gap-2 text-xs\"/g) || []).length >= 1, 'signup-term checkbox rows must vertically center checkbox and text');
assert.match(adminPanel, /flex flex-wrap items-center justify-between gap-3 rounded-lg bg-slate-50 p-3/, 'inquiry-term rows must center the term controls against compact edit\/delete buttons');
assert.match(adminPanel, /flex min-w-0 flex-1 items-center gap-2 text-xs/, 'inquiry-term checkbox and label content must share the row center line');
assert.doesNotMatch(adminPanel, /\{term\.required \? '\[필수\]' : '\[선택\]'\}/, 'inquiry settings terms must use badges instead of bracketed required/optional text');
assert.ok((adminPanel.match(/rounded-full border px-2 py-0\.5 text-\[10px\] font-bold/g) || []).length >= 2, 'signup and inquiry terms must both use the existing required/optional badge style');
assert.match(adminPanel, /className="!px-3 !py-2 !text-xs"[\s\S]{0,120}>\s*문의 전용 약관 등록\s*<\/Button>/, 'inquiry-only term registration button must use smaller text without a leading plus icon');
assert.doesNotMatch(adminPanel, /<Plus[^>]*>[\s\S]{0,80}문의 전용 약관 등록|<Plus[^>]*\/>[\s\S]{0,80}문의 전용 약관 등록/, 'inquiry-only term registration button must not show a plus icon');
assert.match(adminPanel, /variant="outline" className="!rounded-lg !px-2\.5 !py-1\.5 !text-\[11px\]"[\s\S]{0,180}>수정<\/Button>/, 'inquiry term edit action must use the compact button size');
assert.match(adminPanel, /variant="dangerOutline" className="!rounded-lg !px-2\.5 !py-1\.5 !text-\[11px\]"[\s\S]{0,180}>삭제<\/Button>/, 'inquiry term delete action must use the compact button size');
assert.match(adminPanel, /<th[^>]*>제목<\/th>/);
assert.doesNotMatch(adminPanel, /<th[^>]*>이메일<\/th>/);
assert.doesNotMatch(adminPanel, /<th[^>]*>연락처<\/th>/);
assert.match(adminPanel, /<span className="text-slate-400">이메일<\/span>/);
assert.match(adminPanel, /<span className="text-slate-400">연락처<\/span>/);
assert.match(adminPanel, /회원 UID/);
assert.doesNotMatch(adminPanel, /min-w-\[1180px\]/, 'admin inquiry list must not force horizontal scrolling');
assert.doesNotMatch(adminPanel, /<th[^>]*>관리<\/th>/, 'admin inquiry list must not include redundant management column');
assert.doesNotMatch(adminPanel, />상세<\/Button>/, 'admin inquiry list title click is the only detail entry action');
assert.match(adminPanel, /<table className="w-full table-fixed border-collapse text-left">/);

assert.doesNotMatch(
  paginationControls,
  /현재 디자인은 유지하고, 원하는 페이지 번호를 직접 입력해 바로 이동할 수 있도록 개선했습니다\./,
  'shared user/admin pagination must not expose implementation or change-log guidance copy',
);
assert.ok(adminPanel.includes('w-[88px] border-b border-slate-200 px-2 py-3 text-center">상태</th>'), 'admin inquiry status column must keep enough width for a single-line status badge');
assert.ok(adminPanel.includes('w-[56px] border-b border-slate-200 px-2 py-3 text-center">답변수</th>'), 'admin inquiry answer-count column must use the compact width');
assert.ok((adminPanel.match(/w-\[132px\]/g) || []).length >= 2, 'created and latest-answer datetime columns must use the same compact width');
assert.ok(adminPanel.includes('w-[132px] border-b border-slate-200 px-1 py-3 text-center">최근 답변일시</th>'), 'latest-answer datetime header must use the compact equal datetime width');
assert.match(adminPanel, /inline-flex whitespace-nowrap rounded-full border px-2\.5 py-1 text-\[10px\] font-bold/, 'admin inquiry status badge must never wrap onto two lines');
assert.ok(userPanel.includes('w-[200px] whitespace-nowrap border-b border-slate-200 px-4 py-3 text-center\">작성일시</th>'), 'member inquiry created-at column must reserve enough width for one-line Korean datetime');
assert.match(userPanel, /whitespace-nowrap px-4 py-3 text-center text-xs text-slate-500\">\{formatDateTime\(item\.createdAt\)\}<\/td>/, 'member inquiry created-at cells must remain on one line');
assert.match(adminPanel, /<AdminInquiryCategoryDialog/);
assert.match(adminInquiryCategoryDialog, /문의 구분 관리/);
assert.match(adminInquiryCategoryDialog, /문의 구분을 등록, 수정, 삭제합니다\./);
for (const sharedCategoryDialogStyle of [
  'fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/55 p-4',
  'w-full max-w-xl overflow-hidden rounded-2xl bg-white shadow-2xl',
  'text-base font-black text-slate-900',
  'mt-1 text-[11px] leading-5 text-slate-500',
  'min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs outline-none mk-form-border-focus',
  'max-h-[52vh] space-y-2 overflow-y-auto pr-1',
  'rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-xs text-slate-700',
  'rounded-lg px-1 py-1 hover:bg-blue-50 hover:text-blue-600',
  'rounded-lg px-1 py-1 hover:bg-rose-50 hover:text-rose-600',
  'flex justify-end border-t border-slate-100 pt-4',
]) {
  assert.ok(adminFaqCategoryDialog.includes(sharedCategoryDialogStyle), `FAQ category dialog reference style missing: ${sharedCategoryDialogStyle}`);
  assert.ok(adminInquiryCategoryDialog.includes(sharedCategoryDialogStyle), `Inquiry category dialog must match FAQ category dialog style: ${sharedCategoryDialogStyle}`);
}
assert.match(adminInquiryCategoryDialog, /placeholder="새 문의 구분명"/);
assert.match(adminInquiryCategoryDialog, /<Save size=\{13\} \/>\s*적용/);
assert.match(adminInquiryCategoryDialog, /문의 \{Number\(category\.inquiryCount \|\| 0\)\}건/);
assert.doesNotMatch(adminPanel, /maxWidth="max-w-2xl"/, 'inquiry category management must not use the oversized legacy modal width');
const adminInquiryArticleEndIndex = adminPanel.indexOf('</article>', adminPanel.indexOf('{detail ?'));
const adminInquiryActionsIndex = adminPanel.indexOf('>목록으로</Button>', adminInquiryArticleEndIndex);
const adminInquiryAnswersIndex = adminPanel.indexOf('관리자 답변 이력', adminInquiryActionsIndex);
assert.ok(adminInquiryArticleEndIndex >= 0 && adminInquiryActionsIndex > adminInquiryArticleEndIndex && adminInquiryAnswersIndex > adminInquiryActionsIndex, 'admin inquiry detail actions must render below inquiry body and above admin answers');

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
