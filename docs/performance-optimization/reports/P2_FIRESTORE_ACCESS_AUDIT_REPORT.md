# P2 Firestore 접근 자동 감사 및 회귀 방지 적용 보고서

## 1. 작업 목적

이번 작업은 Firestore 읽기 최적화 이후 동일한 문제가 다시 유입되는 것을 방지하기 위한 정적 감사 체계를 추가한 것이다.

감사 대상 호출은 다음 네 종류다.

- `onSnapshot()`
- `getDocs()`
- `getDoc()`
- `getCountFromServer()`

다음 패턴을 위험 항목으로 분류한다.

- 증가 가능성이 큰 컬렉션의 전체 실시간 구독
- `where()` 조건은 있지만 결과 개수 `limit()`이 없는 실시간 쿼리
- 증가 가능성이 큰 컬렉션의 전체 일회성 조회
- 일반 컬렉션 전체 일회성 조회
- 자동 분석이 데이터 원본과 제한 조건을 판정하지 못한 리스너

## 2. 변경 파일

### 기존 파일 수정

```text
.gitignore
package.json
```

### 신규 파일

```text
tools/audit-firestore-access.mjs
tools/firestore-audit-policy.json
tools/README_FIRESTORE_AUDIT.md
```

애플리케이션 업무 소스, Firestore Rules, 인덱스, Firebase 설정은 변경하지 않았다.

## 3. 실행 명령

일반 감사:

```powershell
npm run audit:firestore
```

엄격 감사:

```powershell
npm run audit:firestore:strict
```

성능 관련 기본 검증:

```powershell
npm run verify:performance
```

## 4. 프로덕션 빌드 연동

`package.json`에 다음 스크립트를 추가했다.

```json
{
  "scripts": {
    "prebuild": "npm run audit:firestore:strict",
    "audit:firestore": "node tools/audit-firestore-access.mjs",
    "audit:firestore:strict": "node tools/audit-firestore-access.mjs --strict",
    "verify:performance": "npm run audit:firestore:strict && npm run analyze:source"
  }
}
```

이제 다음 명령을 실행하면 Vite 빌드 전에 Firestore 감사가 자동 실행된다.

```text
npm run build
→ npm run prebuild
→ npm run audit:firestore:strict
→ vite build
```

`deploy.ps1`도 내부에서 `npm run build`를 실행하므로 승인되지 않은 위험 호출이 추가되면 웹 배포 전에 중단된다.

## 5. 감사 결과 저장 위치

감사 결과는 다음 경로에 생성된다.

```text
.performance-reports/firestore-access-audit.json
.performance-reports/firestore-access-audit.txt
```

이 폴더는 `.gitignore`에 추가했다.

```gitignore
# Local performance and Firestore audit outputs
.performance-reports/
```

동적으로 생성되는 `generatedAt` 값 때문에 빌드 전후 추적 파일이 바뀌면 `deploy.ps1`이 배포를 중단할 수 있으므로, 감사 결과는 Git 추적 대상에서 제외해야 한다.

## 6. 정적 분석 방식

감사 도구는 외부 npm 패키지를 사용하지 않고 Node.js 기본 모듈만 사용한다.

주요 처리 단계:

1. `src` 아래 `.js`, `.jsx`, `.mjs` 파일 탐색
2. 문자열과 주석을 제외한 코드 영역 분석
3. 대상 Firestore 호출과 인수 범위 추출
4. 지역 변수 및 프로젝트 상수의 데이터 원본 추적
5. `where`, `orderBy`, `limit`, `startAfter` 적용 여부 판정
6. 문서 단건, 제한 쿼리, 전체 조회, 무제한 리스너로 분류
7. 정책 파일의 승인 ID와 비교
8. JSON·텍스트 보고서 생성
9. 미승인 위험 항목이 있으면 종료 코드 `1` 반환

## 7. 현재 코드 감사 결과

최종 감사 기준:

| 항목 | 수량 |
|---|---:|
| 검사한 `src` 파일 | 64개 |
| Firestore 접근 호출 전체 | 124개 |
| `onSnapshot()` | 34개 |
| `getDocs()` | 47개 |
| `getDoc()` | 23개 |
| `getCountFromServer()` | 20개 |
| 승인된 기존 위험 항목 | 51개 |
| 미승인 경고 | 0개 |
| 미승인 오류 | 0개 |
| 최종 결과 | PASS |

51개 승인 항목은 위험하지 않다는 의미가 아니다. 현재 업무 흐름상 전체 조회 또는 결과 개수 제한 없는 조회가 필요한 이유를 정책 파일에 명시한 예외다.

주요 승인 유형:

- 관리자 자산·예약·대여자·관리자 계정 편집 화면의 조건부 실시간 구독
- 사용자의 진행 중 신청만 대상으로 하는 상태 제한 실시간 구독
- 대시보드 정확한 전체 통계 재생성
- 공개 카탈로그 스키마 전환 및 복구
- 최고 관리자 백업·복원·초기화·무결성 검사
- 회원 명부 전체 재색인 및 감사
- 특정 사용자의 연체 제한 정책 재계산
- 관리자 팝업·푸터·배너 편집 화면의 소규모 콘텐츠 구독

## 8. 정책 파일

정책 파일:

```text
tools/firestore-audit-policy.json
```

정책에는 다음 내용이 포함된다.

```json
{
  "schemaVersion": 1,
  "highGrowthCollections": [],
  "approvedFindings": [
    {
      "id": "...",
      "reason": "실행 화면, 실행 조건, 전체 조회가 필요한 이유",
      "reviewWhen": "재검토 조건"
    }
  ]
}
```

승인 ID는 다음 요소를 조합해 만든다.

- 파일 경로
- 호출 종류
- 위험 규칙
- 정규화한 데이터 원본 표현식
- 같은 파일에서 동일 표현식이 나타난 순서

따라서 단순 줄 번호 변경으로 승인이 무효화되는 문제를 줄이면서, 같은 파일에 동일한 위험 호출이 추가되는 경우에는 별도 ID로 검출한다.

## 9. 엄격 모드 종료 기준

일반 모드:

```text
미승인 error가 있으면 실패
미승인 warning은 보고만 수행
```

엄격 모드:

```text
미승인 error가 있으면 실패
미승인 warning이 있어도 실패
```

프로덕션 빌드는 엄격 모드를 사용한다.

## 10. 회귀 차단 검증

다음 테스트용 코드를 임시 추가했다.

```js
onSnapshot(
  collection(db, 'rentalRequests'),
  () => {}
);
```

검증 결과:

```text
npm run audit:firestore:strict
종료 코드: 1
결과: 배포 차단
```

테스트 파일을 제거한 후:

```text
종료 코드: 0
결과: PASS
```

## 11. 승인 ID 안정성 검증

`src/App.jsx` 최상단에 빈 줄을 추가해 모든 줄 번호를 이동시킨 상태로 엄격 감사를 실행했다.

결과:

```text
종료 코드: 0
기존 승인 51개 유지
```

즉, 단순 코드 줄 이동은 기존 승인 상태를 깨뜨리지 않는다.

## 12. 신규 경고 처리 절차

1. `.performance-reports/firestore-access-audit.txt`에서 파일과 위치를 확인한다.
2. 먼저 `where()`, `limit()`, 커서 페이지네이션 또는 화면 조건으로 조회 범위를 줄인다.
3. 전체 조회가 반드시 필요한 관리자 유지보수 작업일 때만 정책 예외를 추가한다.
4. 승인 사유에는 실행 화면, 실행 조건, 예상 데이터 범위, 전체 조회가 필요한 이유를 기록한다.
5. `npm run audit:firestore:strict`를 다시 실행한다.

단순히 다음과 같은 사유로 예외를 추가해서는 안 된다.

```text
기존 코드라서 유지
필요한 것 같음
문제가 없을 것 같음
```

## 13. 코드 및 모듈 검증

| 검증 항목 | 결과 |
|---|---:|
| JavaScript·JSX·MJS 구문 변환 | 71개 통과 |
| 구문 오류 | 0건 |
| 상대 import 누락 | 0건 |
| `npm run audit:firestore:strict` | PASS |
| `npm run prebuild` | PASS |
| 신규 무제한 리스너 회귀 테스트 | 차단 성공 |
| 줄 이동 승인 안정성 테스트 | 통과 |
| Rules 변경 | 없음 |
| 인덱스 변경 | 없음 |
| npm 의존성 추가 | 없음 |

## 14. Vite 빌드 결과

`npm run build` 실행 시 `prebuild` 감사는 통과했다.

그 이후 작업 환경에 Vite 실행 파일이 없어 다음 단계에서 종료됐다.

```text
sh: 1: vite: not found
```

따라서 이번 환경에서는 프로덕션 번들 생성까지 완료하지 못했다. 실제 프로젝트 PC에는 기존 npm 의존성이 있으므로 `deploy.ps1` 실행 시 다음 순서로 검증된다.

```text
Firestore 엄격 감사
→ Vite 프로덕션 빌드
→ GitHub Pages 발행
```

## 15. 자동 감사의 한계

이 도구는 정적 분석기이므로 다음 항목은 직접 측정하지 않는다.

- 한 화면에서 동시에 활성화되는 실제 리스너 수
- Firestore Rules의 `get()`·`exists()` 종속 읽기
- 인덱스 항목 스캔량
- 네트워크 재연결에 따른 실제 재조회량
- 브라우저 탭 이동과 재마운트에 따른 읽기량
- 동적 컬렉션 이름의 실제 데이터 규모

따라서 Firebase 콘솔 사용량과 실제 화면별 계측은 계속 병행해야 한다.

## 16. 배포 방법

Firestore Rules와 인덱스는 변경하지 않았으므로 웹 배포만 실행한다.

```powershell
Set-Location "E:\project\rental-system\test_new"

.\deploy.ps1
```

배포 중 신규 위험 호출이 발견되면 `prebuild` 단계에서 자동으로 중단된다.
