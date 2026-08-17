import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';

import {
  createInquiryService,
  hashGuestInquiryPassword,
  verifyGuestInquiryPassword,
} from '../../server/src/inquiries/inquiry-service.mjs';

const clone = (value) => JSON.parse(JSON.stringify(value));
const statusFromCount = (count) => count >= 2 ? 'additional' : count === 1 ? 'answered' : 'waiting';

const state = {
  allowGuest: true,
  postsPerPage: 10,
  guestTermBindings: [{ source: 'inquiry', id: 'privacy' }],
  sessions: new Map(),
  inquiries: [],
  answers: new Map(),
  terms: [{ id: 'privacy', title: '개인정보 수집 동의', contentHtml: '<p>필수</p>', contentText: '필수', required: true, revision: 1, contentHash: 'privacy-hash', enabled: true }],
};

const configReadStats = { signupTerms: 0, inquiryTerms: 0, categories: 0 };

const memberByClerk = {
  clerkA: { memberUid: 'member-A', status: 'active', name: '회원A', email: 'a@example.com', team: 'A팀', phone: '010-1111-1111' },
  clerkB: { memberUid: 'member-B', status: 'active', name: '회원B', email: 'b@example.com', team: 'B팀', phone: '010-2222-2222' },
};

const toSummary = (row) => ({
  publicId: row.publicId,
  authorType: row.authorType,
  memberUid: row.memberUid || '',
  categoryId: row.categoryId,
  categoryName: '대여 문의',
  title: row.title,
  authorName: row.authorName,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
  answerCount: (state.answers.get(row.publicId) || []).filter((a) => !a.deleted).length,
  latestAnswerAt: null,
  status: statusFromCount((state.answers.get(row.publicId) || []).filter((a) => !a.deleted).length),
});
const toDetail = (row) => ({ ...toSummary(row), bodyHtml: row.bodyHtml, bodyText: row.bodyText, authorEmail: row.authorEmail, authorTeam: row.authorTeam, authorPhone: row.authorPhone, answers: (state.answers.get(row.publicId) || []).filter((a) => !a.deleted).map((a) => ({ ...a })), guestConsents: row.consents || [] });

const repository = {
  async getSettings() { return { allowGuest: state.allowGuest, postsPerPage: state.postsPerPage, guestTermBindings: clone(state.guestTermBindings) }; },
  async listCategories() { configReadStats.categories += 1; return [{ id: 'rental', name: '대여 문의', inquiryCount: state.inquiries.filter((i) => !i.deleted).length }]; },
  async getSignupTermsContext() { configReadStats.signupTerms += 1; return { policy: { activeTerms: [] }, terms: [] }; },
  async listInquiryTerms() { configReadStats.inquiryTerms += 1; return clone(state.terms); },
  async resolveMemberByClerkUserId(id) { return memberByClerk[id] || null; },
  async createMemberInquiry(input) {
    const row = { publicId: input.publicId, authorType: 'member', memberUid: input.member.memberUid, categoryId: input.categoryId, title: input.title, bodyHtml: input.bodyHtml, bodyText: input.bodyText, authorName: input.member.name, authorEmail: input.member.email, authorTeam: input.member.team, authorPhone: input.member.phone, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), deleted: false };
    state.inquiries.push(row); return toDetail(row);
  },
  async listMemberInquiries({ memberUid, search = '' }) { const query = String(search || '').trim().toLowerCase(); const items = state.inquiries.filter((i) => !i.deleted && i.authorType === 'member' && i.memberUid === memberUid && (!query || String(i.title || '').toLowerCase().includes(query) || String(i.bodyText || '').toLowerCase().includes(query))).map(toSummary); return { items, totalCount: items.length, page: 1, pageSize: 10 }; },
  async getMemberInquiry({ memberUid, publicId }) { const row = state.inquiries.find((i) => !i.deleted && i.authorType === 'member' && i.memberUid === memberUid && i.publicId === publicId); return row ? toDetail(row) : null; },
  async updateOwnedInquiry({ ownerType, memberUid, publicId, categoryId, title, bodyHtml, bodyText }) {
    const row = state.inquiries.find((i) => !i.deleted && i.authorType === ownerType && i.publicId === publicId && (ownerType !== 'member' || i.memberUid === memberUid));
    if (!row) { const e = new Error('not found'); e.name='InquiryRepositoryError'; e.code='inquiry_not_found'; e.status=404; throw e; }
    if ((state.answers.get(publicId) || []).some((a) => !a.deleted)) { const e = new Error('answered'); e.name='InquiryRepositoryError'; e.code='inquiry_answered_mutation_forbidden'; e.status=409; throw e; }
    Object.assign(row,{categoryId,title,bodyHtml,bodyText}); return toDetail(row);
  },
  async deleteOwnedInquiry({ ownerType, memberUid, publicId }) {
    const row = state.inquiries.find((i) => !i.deleted && i.authorType === ownerType && i.publicId === publicId && (ownerType !== 'member' || i.memberUid === memberUid));
    if (!row) { const e = new Error('not found'); e.name='InquiryRepositoryError'; e.code='inquiry_not_found'; e.status=404; throw e; }
    if ((state.answers.get(publicId) || []).some((a) => !a.deleted)) { const e = new Error('answered'); e.name='InquiryRepositoryError'; e.code='inquiry_answered_mutation_forbidden'; e.status=409; throw e; }
    row.deleted = true; return { publicId, deleted: true };
  },
  async createGuestInquiry(input) {
    const row = { publicId: input.publicId, authorType: 'guest', memberUid: null, categoryId: input.categoryId, title: input.title, bodyHtml: input.bodyHtml, bodyText: input.bodyText, authorName: input.author.name, authorEmail: input.author.email, authorTeam: input.author.team, authorPhone: input.author.phone, passwordHash: input.passwordHash, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), deleted: false, consents: input.consents };
    state.inquiries.push(row); return toDetail(row);
  },
  async findGuestCandidates({ name, method, identifier }) { return state.inquiries.filter((i) => !i.deleted && i.authorType === 'guest' && i.authorName.toLowerCase() === String(name).toLowerCase() && (method === 'email' ? i.authorEmail.toLowerCase() === String(identifier).toLowerCase() : i.authorPhone === identifier)).map((i) => ({ publicId: i.publicId, passwordHash: i.passwordHash })); },
  async createGuestSession({ tokenHash, publicIds, expiresAt }) { state.sessions.set(tokenHash, { publicIds: clone(publicIds), expiresAt }); return { expiresAt }; },
  async getGuestSession(tokenHash) { return state.sessions.get(tokenHash) || null; },
  async revokeGuestSession(tokenHash) { state.sessions.delete(tokenHash); },
  async listGuestInquiries({ publicIds }) { const items = state.inquiries.filter((i) => !i.deleted && i.authorType === 'guest' && publicIds.includes(i.publicId)).map(toSummary); return { items, totalCount: items.length, page: 1, pageSize: 10 }; },
  async getGuestInquiry({ publicIds, publicId }) { const row = state.inquiries.find((i) => !i.deleted && i.authorType === 'guest' && i.publicId === publicId && publicIds.includes(i.publicId)); return row ? toDetail(row) : null; },
  async listAdminInquiries() { const items = state.inquiries.filter((i) => !i.deleted).map(toSummary); return { items, totalCount: items.length, page: 1, pageSize: 10 }; },
  async getAdminInquiry(publicId) { const row = state.inquiries.find((i) => !i.deleted && i.publicId === publicId); return row ? toDetail(row) : null; },
  async addAnswer({ publicId, answerId, bodyHtml, bodyText, adminIdentityId, adminDisplayName }) { const list = state.answers.get(publicId) || []; list.push({ id: answerId, bodyHtml, bodyText, adminIdentityId, adminDisplayName, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), deleted: false }); state.answers.set(publicId,list); return this.getAdminInquiry(publicId); },
  async updateAnswer({ publicId, answerId, bodyHtml, bodyText }) { const answer=(state.answers.get(publicId)||[]).find((a)=>a.id===answerId&&!a.deleted); Object.assign(answer,{bodyHtml,bodyText,updatedAt:new Date().toISOString()}); return this.getAdminInquiry(publicId); },
  async deleteAnswer({ publicId, answerId }) { const answer=(state.answers.get(publicId)||[]).find((a)=>a.id===answerId&&!a.deleted); answer.deleted=true; return this.getAdminInquiry(publicId); },
  async deleteAdminInquiry({ publicId }) { const row=state.inquiries.find((i)=>i.publicId===publicId&&!i.deleted); row.deleted=true; return {publicId,deleted:true}; },
  async saveSettings({ allowGuest, postsPerPage, guestTermBindings }) { state.allowGuest=allowGuest;state.postsPerPage=postsPerPage;state.guestTermBindings=clone(guestTermBindings);return this.getSettings(); },
  async saveCategory() { return { id:'x', name:'x' }; }, async deleteCategory(){ return {deleted:true}; },
  async getInquiryTerm(id) { return state.terms.find((t)=>t.id===id)||null; }, async saveInquiryTerm(input){ return input; }, async deleteInquiryTerm(){ return {deleted:true}; },
};

const service = createInquiryService({ repository });
const admin = { status: 'active', firebaseUid: 'admin-1', userName: '관리자' };

const accessOnlyConfig = await service.getPublicConfig({ includeCategories: false });
assert.equal(accessOnlyConfig.allowGuest, true);
assert.equal(accessOnlyConfig.categories.length, 0);
assert.equal(accessOnlyConfig.guestTermsLoaded, false);
assert.equal(accessOnlyConfig.guestTerms.length, 0);
assert.equal(configReadStats.categories, 0);
assert.equal(configReadStats.signupTerms, 0);
assert.equal(configReadStats.inquiryTerms, 0);

const summaryConfig = await service.getPublicConfig();
assert.equal(summaryConfig.allowGuest, true);
assert.equal(summaryConfig.categories.length, 1);
assert.equal(summaryConfig.guestTermsLoaded, false);
assert.equal(summaryConfig.guestTerms.length, 0);
assert.equal(configReadStats.categories, 1);
assert.equal(configReadStats.signupTerms, 0);
assert.equal(configReadStats.inquiryTerms, 0);

const fullGuestConfig = await service.getPublicConfig({ includeGuestTerms: true, includeCategories: true });
assert.equal(fullGuestConfig.guestTermsLoaded, true);
assert.equal(fullGuestConfig.guestTerms.length, 1);
assert.equal(configReadStats.signupTerms, 1);
assert.equal(configReadStats.inquiryTerms, 1);

const passwordHash = await hashGuestInquiryPassword('StrongPass!23');
assert.notEqual(passwordHash, 'StrongPass!23');
assert.equal(await verifyGuestInquiryPassword('StrongPass!23', passwordHash), true);
assert.equal(await verifyGuestInquiryPassword('wrong-password', passwordHash), false);

const memberA = await service.createMember({ clerkUserId:'clerkA', input:{ categoryId:'rental', title:'A 문의', bodyText:'A 내용' } });
const memberB = await service.createMember({ clerkUserId:'clerkB', input:{ categoryId:'rental', title:'B 문의', bodyText:'B 내용' } });
assert.equal((await service.listMember({ clerkUserId:'clerkA' })).items.length, 1);
assert.equal((await service.listMember({ clerkUserId:'clerkB' })).items.length, 1);
assert.equal((await service.listMember({ clerkUserId:'clerkA', search:'A 문의' })).items.length, 1);
assert.equal((await service.listMember({ clerkUserId:'clerkA', search:'검색 결과 없음' })).items.length, 0);
await assert.rejects(() => service.getMember({ clerkUserId:'clerkA', publicId:memberB.publicId }), (error) => error.code === 'inquiry_not_found' && error.status === 404);

await assert.rejects(() => service.createGuest({ input:{ name:'홍길동', team:'총무팀', email:'hong@example.com', phone:'01012345678', password:'StrongPass!23', passwordConfirm:'StrongPass!23', categoryId:'rental', title:'필수 약관 미동의', bodyText:'내용', termDecisions:[] } }), (error) => error.code === 'guest_inquiry_required_terms_missing');

const guestA = await service.createGuest({ input:{ name:'홍길동', team:'총무팀', email:'hong@example.com', phone:'01012345678', password:'StrongPass!23', passwordConfirm:'StrongPass!23', categoryId:'rental', title:'비회원 A', bodyText:'내용', termDecisions:[{source:'inquiry',id:'privacy',accepted:true}] } });
const guestB = await service.createGuest({ input:{ name:'김철수', team:'인사팀', email:'kim@example.com', phone:'01099998888', password:'Different!23', passwordConfirm:'Different!23', categoryId:'rental', title:'비회원 B', bodyText:'내용', termDecisions:[{source:'inquiry',id:'privacy',accepted:true}] } });

const guestEmailAccess = await service.verifyGuestAccess({ input:{ name:'홍길동', method:'email', identifier:'hong@example.com', password:'StrongPass!23' } });
assert.equal((await service.listGuest({ token:guestEmailAccess.token })).items.length, 1);
assert.equal((await service.getGuest({ token:guestEmailAccess.token, publicId:guestA.publicId })).publicId, guestA.publicId);
await assert.rejects(() => service.getGuest({ token:guestEmailAccess.token, publicId:guestB.publicId }), (error) => error.code === 'inquiry_not_found');

const guestPhoneAccess = await service.verifyGuestAccess({ input:{ name:'홍길동', method:'phone', identifier:'01012345678', password:'StrongPass!23' } });
assert.ok(guestPhoneAccess.token);
for (const input of [
  { name:'틀린이름', method:'email', identifier:'hong@example.com', password:'StrongPass!23' },
  { name:'홍길동', method:'email', identifier:'wrong@example.com', password:'StrongPass!23' },
  { name:'홍길동', method:'phone', identifier:'01000000000', password:'StrongPass!23' },
  { name:'홍길동', method:'email', identifier:'hong@example.com', password:'WrongPass!23' },
]) {
  await assert.rejects(() => service.verifyGuestAccess({ input }), (error) => error.code === 'guest_inquiry_verification_failed' && error.status === 404);
}

state.allowGuest = false;
await assert.rejects(() => service.createGuest({ input:{ name:'홍길동', team:'총무팀', email:'hong@example.com', phone:'01012345678', password:'StrongPass!23', passwordConfirm:'StrongPass!23', categoryId:'rental', title:'OFF', bodyText:'내용', termDecisions:[{source:'inquiry',id:'privacy',accepted:true}] } }), (error) => error.code === 'guest_inquiry_disabled' && error.status === 403);
state.allowGuest = true;

const firstAnswer = await service.addAnswer({ admin, publicId:memberA.publicId, input:{ bodyHtml:'<p>답변1</p>', bodyText:'답변1' } });
assert.equal(firstAnswer.status, 'answered');
assert.equal(firstAnswer.answerCount, 1);
await assert.rejects(() => service.deleteMember({ clerkUserId:'clerkA', publicId:memberA.publicId }), (error) => error.code === 'inquiry_answered_mutation_forbidden');
await assert.rejects(() => service.updateMember({ clerkUserId:'clerkA', publicId:memberA.publicId, input:{categoryId:'rental',title:'수정',bodyText:'수정'} }), (error) => error.code === 'inquiry_answered_mutation_forbidden');
const secondAnswer = await service.addAnswer({ admin, publicId:memberA.publicId, input:{ bodyHtml:'<p>답변2</p>', bodyText:'답변2' } });
assert.equal(secondAnswer.status, 'additional');
const afterOneDelete = await service.deleteAnswer({ admin, publicId:memberA.publicId, answerId:secondAnswer.answers[1].id });
assert.equal(afterOneDelete.status, 'answered');
const afterAllDelete = await service.deleteAnswer({ admin, publicId:memberA.publicId, answerId:afterOneDelete.answers[0].id });
assert.equal(afterAllDelete.status, 'waiting');
assert.equal(afterAllDelete.answerCount, 0);
assert.equal((await service.deleteMember({ clerkUserId:'clerkA', publicId:memberA.publicId })).deleted, true);

const adminDeleteTarget = await service.createMember({ clerkUserId:'clerkA', input:{ categoryId:'rental', title:'관리자 삭제', bodyText:'내용' } });
await service.addAnswer({ admin, publicId:adminDeleteTarget.publicId, input:{ bodyText:'답변' } });
assert.equal((await service.deleteAdmin({ admin, publicId:adminDeleteTarget.publicId })).deleted, true);

const repositorySource = readFileSync('server/src/inquiries/inquiry-repository.mjs','utf8');
const serviceSource = readFileSync('server/src/inquiries/inquiry-service.mjs','utf8');
const migrationSource = readFileSync('server/migrations/034_phase34_private_inquiry_board.sql','utf8');
assert.match(repositorySource, /i\.public_id=\$1\s+AND\s+i\.member_uid=\$2\s+AND\s+i\.author_type='member'/);
assert.match(repositorySource, /LOWER\(i\.title\) LIKE \$2 OR LOWER\(i\.body_text\) LIKE \$2/);
assert.match(serviceSource, /listMemberInquiries\(\{ memberUid: member\.memberUid, search, page, pageSize \}\)/);
assert.match(repositorySource, /ans\.deleted_at IS NULL/);
assert.match(repositorySource, /SET deleted_at=NOW\(\),deleted_by=/);
assert.doesNotMatch(serviceSource, /from\s+['"][^'"]*(?:firebase|firestore)|\b(?:getDocs|collection|onSnapshot)\s*\(/i);
assert.doesNotMatch(migrationSource, /retention_until|retentionUntil/i);
assert.match(migrationSource, /guest_password_hash TEXT/);
assert.doesNotMatch(migrationSource, /\bguest_password\s+TEXT\b/i);

console.log('[phase34-private-inquiry-backend-smoke] PASS');
