/**
 * Firebase Authentication 일반회원 일괄 삭제 도구
 *
 * 설치:
 *   npm install firebase-admin
 *
 * 실행:
 *   node delete-non-admin-auth-users.mjs ./service-account.json ./non-admin-auth-users-to-delete.json
 *
 * 서비스 계정 키를 GitHub, 웹 프로젝트 또는 Firestore에 업로드하지 마십시오.
 */
import fs from 'node:fs/promises';
import process from 'node:process';
import { cert, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

const [, , serviceAccountPath, uidFilePath] = process.argv;

if (!serviceAccountPath || !uidFilePath) {
  console.error('사용법: node delete-non-admin-auth-users.mjs <service-account.json> <uid-list.json>');
  process.exit(1);
}

const serviceAccount = JSON.parse(await fs.readFile(serviceAccountPath, 'utf8'));
const uidPayload = JSON.parse(await fs.readFile(uidFilePath, 'utf8'));
const uids = Array.isArray(uidPayload) ? uidPayload : uidPayload.uids;

if (!Array.isArray(uids)) {
  throw new Error('UID 파일에 uids 배열이 없습니다.');
}

const uniqueUids = [...new Set(uids.map((value) => String(value || '').trim()).filter(Boolean))];
if (uniqueUids.length === 0) {
  console.log('삭제할 일반회원 UID가 없습니다.');
  process.exit(0);
}

initializeApp({ credential: cert(serviceAccount) });
const auth = getAuth();
let successCount = 0;
let failedCount = 0;

for (let index = 0; index < uniqueUids.length; index += 1000) {
  const chunk = uniqueUids.slice(index, index + 1000);
  const result = await auth.deleteUsers(chunk);
  successCount += result.successCount;
  failedCount += result.failureCount;
  for (const error of result.errors) {
    console.error(`삭제 실패 [${chunk[error.index]}]:`, error.error?.message || error.error);
  }
  console.log(`처리 ${Math.min(index + chunk.length, uniqueUids.length)} / ${uniqueUids.length}`);
}

console.log(`완료: 성공 ${successCount}건, 실패 ${failedCount}건`);
if (failedCount > 0) process.exitCode = 2;
