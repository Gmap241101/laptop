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
  boardPanel.includes('grid grid-cols-[44px_minmax(0,1fr)] border-b border-slate-200 bg-slate-50'),
  'notice mobile list must use a compact number/title grid instead of a horizontally scrolling desktop table',
);
assert.ok(
  boardPanel.includes('hidden overflow-x-auto rounded-2xl border border-slate-200 sm:block'),
  'notice desktop table must remain isolated behind the sm breakpoint',
);
assert.ok(
  boardPanel.includes('divide-y divide-slate-100 border-y border-slate-200 bg-white sm:hidden'),
  'notice previous/next navigation must use a non-scrolling mobile layout',
);
assert.ok(
  boardPanel.includes('p-4 sm:p-6'),
  'community board content must reduce nested mobile side padding while preserving desktop spacing',
);
assert.ok(
  boardPanel.includes('sm:overflow-hidden sm:rounded-2xl sm:border sm:border-slate-200'),
  'notice detail must avoid an extra bordered article shell on mobile and restore it on desktop',
);
assert.ok(
  inquiryPanel.includes('grid grid-cols-[44px_minmax(0,1fr)] border-b border-slate-200 bg-slate-50'),
  'inquiry mobile list must use a compact number/title layout',
);
assert.ok(
  inquiryPanel.includes('hidden overflow-x-auto rounded-2xl border border-slate-200 bg-white sm:block'),
  'inquiry desktop table must remain isolated behind the sm breakpoint',
);
assert.ok(
  inquiryPanel.includes('divide-y divide-slate-100 border-y border-slate-200 bg-white sm:hidden'),
  'inquiry previous/next navigation must avoid horizontal scrolling on mobile',
);
assert.ok(
  inquiryPanel.includes('grid grid-cols-2 gap-x-4 gap-y-3 border-t border-slate-100 pt-4'),
  'inquiry detail metadata must flatten the nested mobile card into a compact two-column block',
);
assert.ok(
  inquiryPanel.includes('p-4 sm:p-6'),
  'inquiry shell content must reduce nested mobile side padding while preserving desktop spacing',
);
console.log('[phase34-user-mobile-ux-frontend-smoke] PASS');
