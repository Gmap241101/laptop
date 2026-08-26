import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (relative) => fs.readFileSync(new URL(`../../${relative}`, import.meta.url), 'utf8');

const homePanel = read('src/user/UserHomePanel.jsx');
const userShell = read('src/user/UserShell.jsx');
const popupLayer = read('src/user/UserPopupLayer.jsx');
const boardPanel = read('src/user/UserBoardPanel.jsx');
const inquiryPanel = read('src/user/UserInquiryPanel.jsx');

assert.ok(
  homePanel.includes('grid min-h-0 grid-cols-2 gap-2 sm:gap-3 lg:h-full lg:min-h-[300px]'),
  'promotion grid must not force a 300px minimum height on mobile',
);
assert.equal(
  homePanel.includes('grid h-full min-h-[300px] grid-cols-2 gap-2 sm:gap-3'),
  false,
  'legacy mobile promotion min-height gap must not return',
);

assert.equal(fs.existsSync(new URL('../../src/user/UserHomeBootstrapScreen.jsx', import.meta.url)), false, 'obsolete home bootstrap screen must stay retired');

for (const [name, source] of [
  ['user shell', userShell],
]) {
  assert.ok(source.includes('aria-label="메뉴 열기"'), `${name} must expose a mobile menu button`);
  assert.ok(source.includes('lg:hidden'), `${name} mobile navigation must replace the wide navigation below desktop breakpoint`);
  assert.ok(source.includes('translate-x-full'), `${name} mobile menu must enter from the right`);
  assert.ok(source.includes('translate-x-0'), `${name} mobile menu must slide into view`);
  assert.ok(source.includes('회원가입'), `${name} mobile menu must retain signup access`);
  assert.ok(source.includes('로그인'), `${name} mobile menu must retain login access`);
  assert.ok(source.includes('대여신청'), `${name} mobile menu must retain rental access`);
  assert.ok(source.includes('나의 신청내역'), `${name} mobile menu must retain the renamed personal history access`);
  assert.ok(source.includes('대여현황'), `${name} mobile menu must contain the rental-status parent group`);
  assert.ok(source.includes('전체 대여현황'), `${name} mobile menu must expose the all-assets monthly calendar when enabled`);
  assert.ok(source.includes('커뮤니티'), `${name} mobile menu must contain the community group`);
  assert.ok(source.includes('공지사항'), `${name} mobile menu must contain notices`);
  assert.ok(source.includes('FAQ'), `${name} mobile menu must contain FAQ`);
  assert.ok(source.includes('문의하기'), `${name} mobile menu must contain inquiry access`);
}

assert.ok(
  popupLayer.includes('space-y-2 sm:hidden'),
  'popup controls must use a dedicated stacked mobile footer',
);
assert.ok(
  popupLayer.includes('className="hidden items-center gap-3 sm:flex"'),
  'popup desktop footer must remain a separate single-row layout',
);
assert.ok(
  popupLayer.includes('모두 닫기'),
  'mobile popup footer must show the full close-all label',
);
assert.equal(
  popupLayer.includes('<span className="sm:hidden">모두</span>'),
  false,
  'mobile popup footer must not abbreviate the close-all label',
);
assert.ok(
  popupLayer.includes('min-w-0 flex-1 rounded-lg'),
  'mobile popup dismiss-duration select must receive flexible readable width',
);
assert.match(
  popupLayer,
  /space-y-2 sm:hidden[\s\S]*flex min-w-0 items-center gap-2[\s\S]*이전 팝업[\s\S]*다시 보지 않기[\s\S]*팝업 다시 보지 않기 기간/,
  'mobile popup first footer row must keep navigation, do-not-show checkbox, and duration select together',
);
assert.match(
  popupLayer,
  /flex items-center justify-end gap-2[\s\S]*모두 닫기[\s\S]*>\s*닫기\s*</,
  'mobile popup second footer row must contain only close-all and close actions',
);



assert.ok(
  boardPanel.includes('grid grid-cols-[36px_minmax(0,1fr)] border-b border-slate-200 bg-slate-50'),
  'notice mobile list must use a compact number/title grid instead of a horizontally scrolling desktop table',
);
assert.ok(
  boardPanel.includes('hidden overflow-x-auto rounded-2xl border border-slate-200 sm:block'),
  'notice desktop table must remain isolated behind the sm breakpoint',
);
assert.ok(
  boardPanel.includes('-mx-1 divide-y divide-slate-100 border-y border-slate-200 bg-white sm:mx-0 sm:hidden'),
  'notice previous/next navigation must use a non-scrolling mobile layout',
);
assert.ok(
  boardPanel.includes('px-3 py-4 sm:p-6'),
  'community board content must reduce nested mobile side padding while preserving desktop spacing',
);
assert.ok(
  boardPanel.includes('-mx-1 flex min-h-0 flex-1 flex-col bg-white sm:mx-0 sm:overflow-hidden sm:rounded-2xl sm:border sm:border-slate-200'),
  'notice detail must avoid an extra bordered article shell on mobile and restore it on desktop',
);
assert.ok(
  inquiryPanel.includes('grid grid-cols-[36px_minmax(0,1fr)] border-b border-slate-200 bg-slate-50'),
  'inquiry mobile list must use a compact number/title layout',
);
assert.match(
  inquiryPanel,
  /flex min-w-0 items-baseline gap-1\.5[\s\S]*InquiryStatusBadge status=\{item\.status\}[\s\S]*item\.title[\s\S]*mt-1\.5 flex flex-wrap items-center gap-x-1\.5[\s\S]*item\.categoryName[\s\S]*formatDateTime\(item\.createdAt\)/,
  'inquiry mobile rows must place status and title on the first line, then category and created time on the second line',
);
assert.ok(
  inquiryPanel.includes('space-y-3 sm:hidden'),
  'inquiry mobile footer must use a dedicated stacked layout instead of the desktop three-column grid',
);
assert.match(
  inquiryPanel,
  /space-y-3 sm:hidden[\s\S]*justify-between gap-2[\s\S]*전체 문의 \{totalCount\}건[\s\S]*문의 작성[\s\S]*PaginationControls/,
  'inquiry mobile footer must keep summary/actions together and move pagination to its own centered row',
);
assert.ok(
  inquiryPanel.includes('hidden grid-cols-[1fr_auto_1fr] items-center gap-3 sm:grid'),
  'inquiry desktop footer must preserve the existing three-column navigation layout',
);
assert.ok(
  inquiryPanel.includes('hidden overflow-x-auto rounded-2xl border border-slate-200 bg-white sm:block'),
  'inquiry desktop table must remain isolated behind the sm breakpoint',
);
assert.ok(
  inquiryPanel.includes('-mx-1 divide-y divide-slate-100 border-y border-slate-200 bg-white sm:mx-0 sm:hidden'),
  'inquiry previous/next navigation must avoid horizontal scrolling on mobile',
);
assert.ok(
  inquiryPanel.includes('grid grid-cols-2 gap-x-4 gap-y-3 border-t border-slate-100 pt-4'),
  'inquiry detail metadata must flatten the nested mobile card into a compact two-column block',
);
assert.ok(
  inquiryPanel.includes('px-3 py-4 sm:p-6'),
  'inquiry shell content must reduce nested mobile side padding while preserving desktop spacing',
);
assert.ok(
  boardPanel.includes('-mx-1 border-y border-slate-200 bg-white sm:hidden'),
  'notice mobile list must remove the nested rounded card while retaining row separators',
);
assert.ok(
  inquiryPanel.includes('-mx-1 border-y border-slate-200 bg-white sm:hidden'),
  'inquiry mobile list must remove the nested rounded card while retaining row separators',
);
assert.ok(
  inquiryPanel.includes('flex min-w-0 items-baseline gap-1.5') &&
    inquiryPanel.includes('InquiryStatusBadge status={item.status}') &&
    inquiryPanel.includes('min-w-0 flex-1 break-words text-left text-sm font-semibold') &&
    inquiryPanel.includes('gap-x-1.5 gap-y-1 text-[10px] font-normal leading-4 text-slate-500'),
  'inquiry mobile list must place status + title on the first line and category + created time below',
);
assert.ok(
  inquiryPanel.includes('-mx-1 overflow-hidden border-y border-slate-200 bg-white sm:mx-0 sm:rounded-2xl sm:border'),
  'inquiry answer cards must flatten on mobile while retaining desktop card styling',
);

assert.ok(
  boardPanel.includes('inline-flex h-[18px] shrink-0 items-center rounded-full border border-orange-200 bg-orange-50 px-2 text-[9px] font-bold leading-none text-orange-700'),
  'notice mobile badge must use compact fixed-height vertical spacing aligned with the title line',
);
assert.ok(
  boardPanel.includes('flex h-5 items-center justify-center text-xs leading-5 text-slate-500'),
  'notice pin/number cell must share the first title-line height instead of using ad-hoc top padding',
);
assert.ok(
  boardPanel.includes('border-b border-slate-200 bg-white px-1.5 pb-4') &&
    boardPanel.includes('flex-1 px-1.5 py-4'),
  'notice mobile detail must use the slightly increased shared horizontal content inset',
);
assert.ok(
  boardPanel.includes('grid grid-cols-[52px_minmax(0,1fr)] items-center gap-2 px-1.5 py-3') &&
    boardPanel.includes('text-center text-[11px] text-slate-500">{label}</span>'),
  'notice mobile previous/next labels must align inside the same content inset and centered label column',
);
assert.ok(
  inquiryPanel.includes('inline-flex h-5 items-center whitespace-nowrap rounded-full border px-2.5 text-[10px] font-bold leading-none'),
  'inquiry status badges must use compact fixed-height vertical spacing',
);
assert.ok(
  inquiryPanel.includes('border-b border-slate-200 bg-white px-1.5 pb-4') &&
    inquiryPanel.includes('flex-1 space-y-5 px-1.5 py-4'),
  'inquiry mobile detail must use the slightly increased shared horizontal content inset',
);
assert.ok(
  inquiryPanel.includes('grid grid-cols-[52px_minmax(0,1fr)] items-center gap-2 px-1.5 py-3') &&
    inquiryPanel.includes('text-center text-[11px] text-slate-500">{label}</span>'),
  'inquiry mobile previous/next labels must align inside the same content inset and centered label column',
);

console.log('[phase34-user-mobile-ux-frontend-smoke] PASS');
