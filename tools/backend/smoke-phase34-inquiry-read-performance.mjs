import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createInquiryService } from '../../server/src/inquiries/inquiry-service.mjs';

const read = (relative) => fs.readFileSync(new URL(`../../${relative}`, import.meta.url), 'utf8');
const repositorySource = read('server/src/inquiries/inquiry-repository.mjs');
const serviceSource = read('server/src/inquiries/inquiry-service.mjs');
const frontendApi = read('src/features/inquiries/inquiryApi.js');
const frontendPanel = read('src/user/UserInquiryPanel.jsx');

assert.match(repositorySource, /const INQUIRY_SUMMARY_SELECT = `[\s\S]*i\.title,[\s\S]*i\.author_name,[\s\S]*answer_count/,
  'user inquiry lists must use a dedicated summary projection');
const summarySelect = repositorySource.match(/const INQUIRY_SUMMARY_SELECT = `([\s\S]*?)`;/)?.[1] || '';
assert.doesNotMatch(summarySelect, /i\.\*|body_html|guest_password_hash|author_email|author_phone/,
  'summary projection must not pull rich bodies, password hashes, or private contact fields');

const guestSessionRead = repositorySource.match(/async getGuestSession\(tokenHash\) \{([\s\S]*?)\n    \},\n\n    async revokeGuestSession/)?.[1] || '';
assert.ok(guestSessionRead, 'guest session read implementation must be present');
assert.doesNotMatch(guestSessionRead, /DELETE FROM app_inquiry_guest_sessions/,
  'guest list/detail reads must not run expired-session DELETE statements');

assert.match(repositorySource, /async listGuestInquiriesBySession\(/,
  'guest list must support one-query session scope + list reads');
assert.match(repositorySource, /WITH session AS \([\s\S]*scope AS \([\s\S]*filtered AS \([\s\S]*session_valid/,
  'guest scoped list must validate the session and page data in one SQL request');
assert.match(repositorySource, /async getGuestInquiryBySession\(/,
  'guest detail must combine session scope and target lookup');
assert.match(repositorySource, /async listMemberInquiriesByClerkUserId\(/,
  'member list must combine Clerk member-scope resolution with list SQL');
assert.match(repositorySource, /async getMemberInquiryByClerkUserId\(/,
  'member detail must combine Clerk member-scope resolution with target lookup');

const activeAnswers = repositorySource.match(/const listActiveAnswers = async \(client, inquiryId\) => \{([\s\S]*?)\n  \};/)?.[1] || '';
assert.match(activeAnswers, /FROM app_secure_attachments att/,
  'answer attachment metadata must be loaded in the same answer query');
assert.doesNotMatch(activeAnswers, /attachmentRepository\.listForOwners/,
  'answer detail reads must not add a sequential attachment query');

assert.match(serviceSource, /repository\.listMemberInquiriesByClerkUserId/,
  'member read service must use the optimized member list repository path');
assert.match(serviceSource, /repository\.getMemberInquiryByClerkUserId/,
  'member read service must use the optimized member detail repository path');
assert.match(serviceSource, /repository\.listGuestInquiriesBySession/,
  'guest read service must use the optimized session-scoped list path');
assert.match(serviceSource, /repository\.getGuestInquiryBySession/,
  'guest read service must use the optimized session-scoped detail path');
assert.match(serviceSource, /initialList/,
  'guest verification must return the already-scoped first list to avoid a second HTTP read');

assert.match(frontendApi, /INQUIRY_DETAIL_CACHE_TTL_MS = 8_000/,
  'short completed-detail cache must remain bounded');
assert.match(frontendApi, /peekGuestList/,
  'guest list route must synchronously consume a completed verification/list read');
assert.match(frontendApi, /peekMemberDetail/,
  'member detail must be able to consume a recently completed authoritative read');
assert.match(frontendApi, /peekGuestDetail/,
  'guest detail must be able to consume a recently completed authoritative read');
assert.match(frontendPanel, /!hasFirebaseAuthSession && \(configLoading \|\| !config\)/,
  'authenticated list/detail paint must not be blocked on compose-only category/config reads');
assert.doesNotMatch(frontendPanel, /listLoading \|\| detailLoading \? <div[^>]*>문의 내역을 불러오는 중입니다/,
  'detail fetch must not masquerade as a full list reload');
assert.match(frontendPanel, /문의 본문을 불러오는 중입니다/,
  'detail route must show detail-specific progress while the list cache stays intact');

const calls = [];
const memberSummary = Object.freeze({ publicId: 'member-1', title: 'member', answerCount: 0 });
const guestSummary = Object.freeze({ publicId: 'guest-1', title: 'guest', answerCount: 0 });
const repository = {
  async listMemberInquiriesByClerkUserId(input) {
    calls.push(['fast-member-list', input]);
    return { member: { memberUid: 'member-uid', status: 'active' }, list: { items: [memberSummary], totalCount: 1, page: 1, pageSize: 10 } };
  },
  async getMemberInquiryByClerkUserId(input) {
    calls.push(['fast-member-detail', input]);
    return { member: { memberUid: 'member-uid', status: 'active' }, inquiry: memberSummary };
  },
  async listGuestInquiriesBySession(input) {
    calls.push(['fast-guest-list', input]);
    return { sessionValid: true, list: { items: [guestSummary], totalCount: 1, page: 1, pageSize: 10 } };
  },
  async getGuestInquiryBySession(input) {
    calls.push(['fast-guest-detail', input]);
    return { sessionValid: true, inquiry: guestSummary };
  },
  async resolveMemberByClerkUserId() { throw new Error('slow member resolver should not run on optimized reads'); },
  async listMemberInquiries() { throw new Error('legacy member list should not run on optimized reads'); },
  async getMemberInquiry() { throw new Error('legacy member detail should not run on optimized reads'); },
  async getGuestSession() { throw new Error('legacy guest session read should not run on optimized reads'); },
  async listGuestInquiries() { throw new Error('legacy guest list should not run on optimized reads'); },
  async getGuestInquiry() { throw new Error('legacy guest detail should not run on optimized reads'); },
};
const service = createInquiryService({ repository });
assert.equal((await service.listMember({ clerkUserId: 'clerk-1', page: 1, pageSize: 10 })).items[0].publicId, 'member-1');
assert.equal((await service.getMember({ clerkUserId: 'clerk-1', publicId: 'member-1' })).publicId, 'member-1');
assert.equal((await service.listGuest({ token: 'guest-token', page: 1, pageSize: 10 })).items[0].publicId, 'guest-1');
assert.equal((await service.getGuest({ token: 'guest-token', publicId: 'guest-1' })).publicId, 'guest-1');
assert.deepEqual(calls.map(([name]) => name), ['fast-member-list', 'fast-member-detail', 'fast-guest-list', 'fast-guest-detail']);

console.log('[phase34-inquiry-read-performance-backend-smoke] PASS');
