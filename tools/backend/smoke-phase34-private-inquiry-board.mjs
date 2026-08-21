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
    if (input.rotateIdentityPassword) {
      const identityIds = new Set(state.inquiries.filter((inquiry) => inquiry.authorType === 'guest'
        && inquiry.authorName.toLowerCase() === String(input.author.name).toLowerCase()
        && inquiry.authorEmail.toLowerCase() === String(input.author.email).toLowerCase()
        && inquiry.authorPhone === input.author.phone).map((inquiry) => inquiry.publicId));
      for (const [tokenHash, session] of state.sessions.entries()) {
        if ((session.publicIds || []).some((publicId) => identityIds.has(publicId))) state.sessions.delete(tokenHash);
      }
      for (const inquiry of state.inquiries) {
        if (inquiry.authorType === 'guest'
          && inquiry.authorName.toLowerCase() === String(input.author.name).toLowerCase()
          && inquiry.authorEmail.toLowerCase() === String(input.author.email).toLowerCase()
          && inquiry.authorPhone === input.author.phone) {
          inquiry.passwordHash = input.passwordHash;
        }
      }
    }
    const row = { publicId: input.publicId, authorType: 'guest', memberUid: null, categoryId: input.categoryId, title: input.title, bodyHtml: input.bodyHtml, bodyText: input.bodyText, authorName: input.author.name, authorEmail: input.author.email, authorTeam: input.author.team, authorPhone: input.author.phone, passwordHash: input.passwordHash, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), deleted: false, consents: input.consents };
    state.inquiries.push(row);
    return { publicId: row.publicId, bodyHtml: row.bodyHtml, bodyText: row.bodyText };
  },
  async findGuestIdentity({ name, email, phone }) {
    const matches = state.inquiries.filter((i) => !i.deleted && i.authorType === 'guest' && i.authorName.toLowerCase() === String(name).toLowerCase() && i.authorEmail.toLowerCase() === String(email).toLowerCase() && i.authorPhone === phone);
    return {
      exists: matches.length > 0,
      publicIds: matches.map((i) => i.publicId),
      passwordHash: matches[0]?.passwordHash || '',
    };
  },
  async createGuestSession({ tokenHash, publicIds, expiresAt }) { state.sessions.set(tokenHash, { publicIds: clone(publicIds), expiresAt }); return { expiresAt }; },
  async getGuestSession(tokenHash) { return state.sessions.get(tokenHash) || null; },
  async revokeGuestSession(tokenHash) { state.sessions.delete(tokenHash); },
  async listGuestInquiries({ publicIds, search = '', page = 1, pageSize = 10 }) {
    const query = String(search || '').trim().toLowerCase();
    const safePageSize = [10, 30, 50].includes(Number(pageSize)) ? Number(pageSize) : 10;
    const all = state.inquiries
      .filter((i) => !i.deleted && i.authorType === 'guest' && publicIds.includes(i.publicId))
      .filter((i) => !query || String(i.title || '').toLowerCase().includes(query) || String(i.bodyText || '').toLowerCase().includes(query))
      .map(toSummary);
    const safePage = Math.max(1, Number(page) || 1);
    const start = (safePage - 1) * safePageSize;
    return { items: all.slice(start, start + safePageSize), totalCount: all.length, page: safePage, pageSize: safePageSize };
  },
  async getGuestInquiry({ publicIds, publicId }) { const row = state.inquiries.find((i) => !i.deleted && i.authorType === 'guest' && i.publicId === publicId && publicIds.includes(i.publicId)); return row ? toDetail(row) : null; },
  async listAdminInquiries() { const items = state.inquiries.filter((i) => !i.deleted).map(toSummary); return { items, totalCount: items.length, page: 1, pageSize: 10 }; },
  async getAdminInquiry(publicId) { const row = state.inquiries.find((i) => !i.deleted && i.publicId === publicId); return row ? toDetail(row) : null; },
  async addAnswer({ publicId, answerId, bodyHtml, bodyText, adminIdentityId, adminDisplayName }) { const list = state.answers.get(publicId) || []; list.push({ id: answerId, bodyHtml, bodyText, adminIdentityId, adminDisplayName, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), deleted: false }); state.answers.set(publicId,list); return this.getAdminInquiry(publicId); },
  async updateAnswer({ publicId, answerId, bodyHtml, bodyText }) { const answer=(state.answers.get(publicId)||[]).find((a)=>a.id===answerId&&!a.deleted); Object.assign(answer,{bodyHtml,bodyText,updatedAt:new Date().toISOString()}); return this.getAdminInquiry(publicId); },
  async deleteAnswer({ publicId, answerId }) { const answer=(state.answers.get(publicId)||[]).find((a)=>a.id===answerId&&!a.deleted); answer.deleted=true; return this.getAdminInquiry(publicId); },
  async deleteAdminInquiry({ publicId }) { const row=state.inquiries.find((i)=>i.publicId===publicId&&!i.deleted); row.deleted=true; return {publicId,deleted:true}; },
  async saveSettings({ allowGuest, postsPerPage, guestTermBindings }) { state.allowGuest=allowGuest;state.postsPerPage=postsPerPage;state.guestTermBindings=clone(guestTermBindings);return this.getSettings(); },
  async saveCategory() { return { id:'x', name:'x' }; }, async deleteCategory(){ return {deleted:true}; },
  async getInquiryTerm(id) { return state.terms.find((t)=>t.id===id)||null; },
  async saveInquiryTerm(input){
    const next = {
      id: input.id,
      title: input.title,
      contentHtml: input.bodyHtml,
      contentText: input.bodyText,
      required: Boolean(input.required),
      revision: Number(input.revision || 1),
      contentHash: input.contentHash,
      enabled: input.enabled !== false,
    };
    const index = state.terms.findIndex((term) => term.id === next.id);
    if (index >= 0) state.terms[index] = next;
    else state.terms.push(next);
    return clone(next);
  },
  async deleteInquiryTerm(){ return {deleted:true}; },
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

const styledTermHtml = '<p><span style="color: rgb(194, 65, 12); background-color: rgb(255, 247, 237); font-weight: 700; font-size: 18px; line-height: 1.5">필수</span></p><blockquote style="text-align: center; color: #334155">안내</blockquote><table style="width: 100%; border-collapse: collapse"><tbody><tr><td style="background-color: #ffffff; color: #0f172a; border-width: 1px; border-style: solid; border-color: #cbd5e1">표</td></tr></tbody></table>';
const styledTerm = await service.saveInquiryTerm({ admin, input:{ id:'privacy', title:'개인정보 수집 동의', bodyHtml:styledTermHtml, bodyText:'필수 안내 표', required:true, enabled:true } });
assert.equal(styledTerm.contentHtml, styledTermHtml, 'inquiry-term HTML must round-trip without losing safe tags or style attributes');
assert.equal(styledTerm.revision, 2, 'first canonical HTML save must advance the inquiry-term revision from the legacy hash');
const firstStyledHash = styledTerm.contentHash;
const recoloredTermHtml = styledTermHtml.replace('rgb(194, 65, 12)', 'rgb(37, 99, 235)');
const recoloredTerm = await service.saveInquiryTerm({ admin, input:{ id:'privacy', title:'개인정보 수집 동의', bodyHtml:recoloredTermHtml, bodyText:'필수 안내 표', required:true, enabled:true } });
assert.equal(recoloredTerm.contentHtml, recoloredTermHtml, 'formatting-only inquiry-term edits must persist exactly');
assert.equal(recoloredTerm.revision, 3, 'formatting-only inquiry-term edits must advance revision');
assert.notEqual(recoloredTerm.contentHash, firstStyledHash, 'inquiry-term content hash must include HTML formatting, not only plain text');

const styledInquiryHtml = '<p><span style="color: #dc2626; background-color: #fef2f2; font-weight: 700">A 내용</span></p>';
const memberA = await service.createMember({ clerkUserId:'clerkA', input:{ categoryId:'rental', title:'A 문의', bodyHtml:styledInquiryHtml, bodyText:'A 내용' } });
assert.equal(memberA.bodyHtml, styledInquiryHtml, 'member inquiry rich-text HTML must round-trip exactly');
const memberB = await service.createMember({ clerkUserId:'clerkB', input:{ categoryId:'rental', title:'B 문의', bodyText:'B 내용' } });
assert.equal((await service.listMember({ clerkUserId:'clerkA' })).items.length, 1);
assert.equal((await service.listMember({ clerkUserId:'clerkB' })).items.length, 1);
assert.equal((await service.listMember({ clerkUserId:'clerkA', search:'A 문의' })).items.length, 1);
assert.equal((await service.listMember({ clerkUserId:'clerkA', search:'검색 결과 없음' })).items.length, 0);
await assert.rejects(() => service.getMember({ clerkUserId:'clerkA', publicId:memberB.publicId }), (error) => error.code === 'inquiry_not_found' && error.status === 404);

await assert.rejects(() => service.createGuest({ input:{ name:'홍길동', team:'총무팀', email:'hong@example.com', phone:'01012345678', password:'StrongPass!23', passwordConfirm:'StrongPass!23', categoryId:'rental', title:'필수 약관 미동의', bodyText:'내용', termDecisions:[] } }), (error) => error.code === 'guest_inquiry_required_terms_missing');

const styledGuestHtml = '<p><span style="color: #7c3aed; background-color: #f5f3ff; font-weight: 700">비회원 내용</span></p>';
const guestA = await service.createGuest({ input:{ name:'홍길동', team:'총무팀', email:'hong@example.com', phone:'01012345678', password:'StrongPass!23', passwordConfirm:'StrongPass!23', categoryId:'rental', title:'비회원 A', bodyHtml:styledGuestHtml, bodyText:'비회원 내용', termDecisions:[{source:'inquiry',id:'privacy',accepted:true}] } });
assert.equal(guestA.bodyHtml, styledGuestHtml, 'guest inquiry create must return the stored rich-text HTML instead of only publicId');
const guestA2 = await service.createGuest({ input:{ name:'홍길동', team:'총무팀', email:'hong@example.com', phone:'01012345678', password:'StrongPass!23', passwordConfirm:'StrongPass!23', categoryId:'rental', title:'비회원 A2', bodyText:'내용2', termDecisions:[{source:'inquiry',id:'privacy',accepted:true}] } });
const guestB = await service.createGuest({ input:{ name:'김철수', team:'인사팀', email:'kim@example.com', phone:'01099998888', password:'Different!23', passwordConfirm:'Different!23', categoryId:'rental', title:'비회원 B', bodyText:'내용', termDecisions:[{source:'inquiry',id:'privacy',accepted:true}] } });

assert.deepEqual(await service.prepareGuestCreate({ input:{ name:'새사용자', email:'new@example.com', phone:'01011112222', password:'NewPass!23' } }), { allowed:true, identityExists:false });
assert.deepEqual(await service.prepareGuestCreate({ input:{ name:'홍길동', email:'hong@example.com', phone:'01012345678', password:'StrongPass!23' } }), { allowed:true, identityExists:true });
await assert.rejects(() => service.prepareGuestCreate({ input:{ name:'홍길동', email:'hong@example.com', phone:'01012345678', password:'BrandNew!25' } }), (error) => error.code === 'guest_inquiry_identity_password_mismatch' && error.status === 409);
await assert.rejects(() => service.createGuest({ input:{ name:'홍길동', team:'총무팀', email:'hong@example.com', phone:'01012345678', password:'BrandNew!25', passwordConfirm:'BrandNew!25', categoryId:'rental', title:'비밀번호 불일치 차단', bodyText:'내용', termDecisions:[{source:'inquiry',id:'privacy',accepted:true}] } }), (error) => error.code === 'guest_inquiry_identity_password_mismatch' && error.status === 409);

const guestAccess = await service.verifyGuestAccess({ input:{ name:'홍길동', email:'hong@example.com', phone:'01012345678', password:'StrongPass!23' } });
assert.equal((await service.listGuest({ token:guestAccess.token })).items.length, 2);
assert.equal((await service.listGuest({ token:guestAccess.token, search:'비회원 A2', pageSize:30 })).items.length, 1);
assert.equal((await service.listGuest({ token:guestAccess.token, search:'검색 결과 없음', pageSize:50 })).items.length, 0);
assert.equal((await service.listGuest({ token:guestAccess.token, pageSize:30 })).pageSize, 30);
assert.equal((await service.getGuest({ token:guestAccess.token, publicId:guestA.publicId })).publicId, guestA.publicId);
assert.equal((await service.getGuest({ token:guestAccess.token, publicId:guestA2.publicId })).publicId, guestA2.publicId);
await assert.rejects(() => service.getGuest({ token:guestAccess.token, publicId:guestB.publicId }), (error) => error.code === 'inquiry_not_found');

const rotatedGuest = await service.createGuest({ input:{
  name:'홍길동', team:'총무팀', email:'hong@example.com', phone:'01012345678',
  currentPassword:'StrongPass!23', password:'RotatedPass!24', passwordConfirm:'RotatedPass!24',
  categoryId:'rental', title:'비밀번호 변경 후 문의', bodyText:'내용3', termDecisions:[{source:'inquiry',id:'privacy',accepted:true}],
} });
await assert.rejects(() => service.verifyGuestAccess({ input:{ name:'홍길동', email:'hong@example.com', phone:'01012345678', password:'StrongPass!23' } }), (error) => error.code === 'guest_inquiry_verification_failed');
await assert.rejects(() => service.listGuest({ token:guestAccess.token }), (error) => error.code === 'guest_inquiry_session_invalid' && error.status === 401);
const rotatedAccess = await service.verifyGuestAccess({ input:{ name:'홍길동', email:'hong@example.com', phone:'01012345678', password:'RotatedPass!24' } });
assert.equal((await service.listGuest({ token:rotatedAccess.token })).items.length, 3);
assert.equal((await service.getGuest({ token:rotatedAccess.token, publicId:rotatedGuest.publicId })).publicId, rotatedGuest.publicId);
for (const inquiry of state.inquiries.filter((item) => !item.deleted && item.authorType === 'guest' && item.authorEmail === 'hong@example.com')) {
  assert.equal(await verifyGuestInquiryPassword('RotatedPass!24', inquiry.passwordHash), true);
}
for (const input of [
  { name:'틀린이름', email:'hong@example.com', phone:'01012345678', password:'RotatedPass!24' },
  { name:'홍길동', email:'wrong@example.com', phone:'01012345678', password:'RotatedPass!24' },
  { name:'홍길동', email:'hong@example.com', phone:'01000000000', password:'RotatedPass!24' },
  { name:'홍길동', email:'hong@example.com', phone:'01012345678', password:'WrongPass!23' },
]) {
  await assert.rejects(() => service.verifyGuestAccess({ input }), (error) => error.code === 'guest_inquiry_verification_failed' && error.status === 404);
}

state.allowGuest = false;
await assert.rejects(() => service.createGuest({ input:{ name:'홍길동', team:'총무팀', email:'hong@example.com', phone:'01012345678', password:'StrongPass!23', passwordConfirm:'StrongPass!23', categoryId:'rental', title:'OFF', bodyText:'내용', termDecisions:[{source:'inquiry',id:'privacy',accepted:true}] } }), (error) => error.code === 'guest_inquiry_disabled' && error.status === 403);
state.allowGuest = true;

const styledAnswerHtml = '<p><span style="color: #059669; text-decoration: underline">답변1</span></p>';
const firstAnswer = await service.addAnswer({ admin, publicId:memberA.publicId, input:{ bodyHtml:styledAnswerHtml, bodyText:'답변1' } });
assert.equal(firstAnswer.answers[0].bodyHtml, styledAnswerHtml, 'administrator answer rich-text HTML must round-trip exactly');
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
const appSource = readFileSync('server/src/app.mjs','utf8');
const migrationSource = readFileSync('server/migrations/034_phase34_private_inquiry_board.sql','utf8');
assert.match(repositorySource, /i\.public_id=\$1\s+AND\s+i\.member_uid=\$2\s+AND\s+i\.author_type='member'/);
assert.match(repositorySource, /LOWER\(i\.title\) LIKE \$2 OR LOWER\(i\.body_text\) LIKE \$2/);
assert.match(serviceSource, /listMemberInquiries\(\{ memberUid: member\.memberUid, search, page, pageSize \}\)/);
assert.match(repositorySource, /ans\.deleted_at IS NULL/);
assert.match(repositorySource, /const getInquiryNavigation = async/);
assert.match(repositorySource, /LAG\(i\.public_id\) OVER \(ORDER BY i\.created_at DESC,i\.inquiry_id DESC\)/);
assert.match(repositorySource, /LEAD\(i\.public_id\) OVER \(ORDER BY i\.created_at DESC,i\.inquiry_id DESC\)/);
assert.match(repositorySource, /i\.member_uid=\$1 AND i\.author_type='member' AND i\.deleted_at IS NULL/);
assert.match(repositorySource, /i\.public_id=ANY\(\$1::text\[\]\) AND i\.author_type='guest' AND i\.deleted_at IS NULL/);
assert.match(repositorySource, /LOWER\(i\.title\) LIKE \$2 OR LOWER\(i\.body_text\) LIKE \$2/);
assert.match(serviceSource, /listGuestInquiries\(\{ publicIds: session\.publicIds, search, page, pageSize \}\)/);
assert.match(appSource, /search: url\.searchParams\.get\('search'\) \|\| ''/);
assert.match(repositorySource, /LOWER\(author_email\)=LOWER\(\$2\)/);
assert.match(repositorySource, /author_phone=\$3/);
assert.match(serviceSource, /guest_inquiry_identity_password_mismatch/);
assert.match(serviceSource, /const currentPassword = validateGuestPasswordInput\(input\?\.currentPassword \|\| password\)/);
assert.match(serviceSource, /const rotateIdentityPassword = identityCheck\.exists && password !== currentPassword/);
assert.match(repositorySource, /if \(rotateIdentityPassword\) \{/);
assert.match(repositorySource, /DELETE FROM app_inquiry_guest_sessions s/);
assert.match(repositorySource, /s\.scope_public_ids \? i\.public_id/);
assert.match(repositorySource, /SET guest_password_hash=\$1/);
assert.match(repositorySource, /SELECT public_id,body_html,body_text FROM app_inquiries WHERE inquiry_id=\$1 AND deleted_at IS NULL/, 'guest create must re-read the stored body_html inside the transaction');
assert.match(repositorySource, /return Object\.freeze\(\{[\s\S]*publicId: stored\.rows\[0\]\?\.public_id[\s\S]*bodyHtml: stored\.rows\[0\]\?\.body_html/, 'guest create return contract must include the stored bodyHtml used by callers');
assert.match(repositorySource, /assertStoredRichTextHtml\(\{ expectedHtml: bodyHtml, actualHtml: stored\.rows\[0\]\?\.body_html, code: 'inquiry_body_storage_roundtrip_mismatch' \}\);[\s\S]*await client\.query\('COMMIT'\)/, 'inquiry body round-trip verification must run before COMMIT');
assert.doesNotMatch(serviceSource, /assertRichTextRoundTrip/, 'service must not perform post-COMMIT rich-text verification');
assert.match(serviceSource, /const publicIds = identityCheck\.publicIds/);
assert.match(repositorySource, /ARRAY_AGG\(guest_password_hash ORDER BY created_at ASC,inquiry_id ASC\)/);
assert.doesNotMatch(serviceSource, /findGuestCandidates|candidates\.slice|for \(const candidate/);
assert.match(appSource, /url\.pathname === '\/api\/inquiries\/guest\/prepare'/);
assert.match(repositorySource, /navigation: Object\.freeze\(\{/);
assert.match(repositorySource, /SET deleted_at=NOW\(\),deleted_by=/);
assert.doesNotMatch(serviceSource, /from\s+['"][^'"]*(?:firebase|firestore)|\b(?:getDocs|collection|onSnapshot)\s*\(/i);
assert.doesNotMatch(migrationSource, /retention_until|retentionUntil/i);
assert.match(migrationSource, /guest_password_hash TEXT/);
assert.doesNotMatch(migrationSource, /\bguest_password\s+TEXT\b/i);

console.log('[phase34-private-inquiry-backend-smoke] PASS');
