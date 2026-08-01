# P2 초기 데이터·구형 데이터 호환성 서비스 분리 보고서

## 1. 기준본

- 입력 기준본: `rental-system-rental-derived-selectors-split-20260801_2120_deployment_package.zip`
- 작업 범위: 앱 초기 데이터, 기존 저장 데이터 정규화, 구형 설정 필드 호환, 공개 자산 카탈로그 write-through 전환 확인
- 기능 정책 변경: 없음
- Firestore Rules·인덱스 변경: 없음

## 2. 변경 파일

### 수정

- `src/App.jsx`
- `docs/performance-optimization/measurements/SOURCE_GRAPH_ANALYSIS_REPORT.json`

### 신규

- `src/services/appDataCompatibilityService.js`
- `src/features/assets/usePublicAssetCatalogCompatibilityController.js`
- 본 작업의 diff·보고서·검증 보고서·소스 그래프 비교 파일

### 삭제

- 신규 삭제 파일 없음
- 기존 `package-meta/REMOVED_FILES.txt` 누적 목록을 그대로 승계

## 3. 초기 데이터 서비스

`App.jsx`의 초기 데이터와 저장 데이터 병합 로직을 `appDataCompatibilityService.js`로 이동했다.

서비스가 제공하는 API는 다음과 같다.

```js
seedLaptops();
initialData;
normalizeBorrowers();
stripAdminAccountsFromData();
mergePersistedData();
```

`App.jsx`에서는 기존 이름을 그대로 import해 상태 초기화와 대여 데이터 구독 컨트롤러에 전달한다.

```jsx
import {
  initialData,
  mergePersistedData,
} from './services/appDataCompatibilityService.js';

const [data, setData] = useState(initialData);
```

## 4. 구형 데이터 호환 규칙

다음 기존 호환 규칙을 변경 없이 서비스로 이동했다.

- 빈 자산 카테고리는 기본값 `노트북`으로 복구
- 구형 `adjustStartDateAfterWorkEnd`를 `adjustStartDateToNextBusinessDay`로 승계
- 구형 `excludeWeekendsForStartDate`를 토요일·일요일 제외 설정으로 승계
- 토요일·일요일 개별 설정으로 구형 주말 제외 값을 다시 계산
- 회원 명부 가입 정책과 자동 승인 조건 정규화
- 회원 명부 버전과 identity claim 준비 상태 정규화
- 회원가입 약관 정책 필드 정규화
- 휴일 중복과 사유 구조 정규화
- 구형 문자열 대여자 데이터를 객체 구조로 변환
- 대여자 순서와 기본 부서 보정
- 자산 카테고리 기본값과 예약 배열 정규화
- 앱 데이터에 포함된 구형 `adminAccounts` 필드 제거

## 5. 공개 자산 카탈로그 호환 컨트롤러

관리자 로그인 직후 실행하던 공개 자산 카탈로그 write-through 확인 effect를 `usePublicAssetCatalogCompatibilityController()`로 이동했다.

```jsx
usePublicAssetCatalogCompatibilityController({
  authenticatedAdminId,
  currentAuthAdminAccountId: currentAuthAdminAccount?.id || '',
  isAdminAuthenticated,
  triggerToast,
});
```

보존된 동작은 다음과 같다.

- 관리자 인증이 확정된 뒤에만 실행
- Firebase Auth UID, 로컬 관리자 ID, 관리자 문서 ID 순으로 UID 결정
- 동일 관리자 UID에서는 한 번만 전환 확인
- 로그아웃 시 실행 기록 초기화
- 전환 실패 시 재시도할 수 있도록 UID 기록 초기화
- 기존 오류 로그와 사용자 토스트 문구 유지
- 실제 전환 작업은 기존 동적 서비스 로더를 계속 사용

토스트 콜백은 ref로 보관해 콜백 참조 변경만으로 호환성 점검 effect가 재실행되지 않도록 했다.

## 6. App.jsx 변화

| 항목 | 수정 전 | 수정 후 | 변화 |
|---|---:|---:|---:|
| 줄 수 | 4,390 | 4,155 | -235 |
| 크기 | 129,405 bytes | 121,371 bytes | -8,034 bytes |
| `useState()` | 21 | 21 | 0 |
| `useEffect()` | 7 | 6 | -1 |
| `useRef()` | 5 | 4 | -1 |
| `useMemo()` | 19 | 19 | 0 |

신규 모듈 규모:

| 파일 | 줄 수 | 크기 |
|---|---:|---:|
| `appDataCompatibilityService.js` | 210 | 7,285 bytes |
| `usePublicAssetCatalogCompatibilityController.js` | 85 | 2,241 bytes |

## 7. 초기 소스 그래프

| 항목 | 수정 전 | 수정 후 | 변화 |
|---|---:|---:|---:|
| 초기 정적 모듈 | 72 | 74 | +2 |
| 초기 정적 소스 | 869,773 bytes | 871,265 bytes | +1,492 bytes |

앱 초기 데이터 병합과 관리자 로그인 후 호환성 확인은 앱 셸에서 즉시 필요하므로 두 모듈을 정적 import로 유지했다. 이번 단계의 목적은 번들 지연 로딩이 아니라 초기화·호환성 책임의 분리다.

## 8. Firestore 영향

전체 감사 대상 호출은 129개로 동일하다.

- `onSnapshot`: 35
- `getDocs`: 48
- `getDoc`: 28
- `getCountFromServer`: 18

신규 초기 데이터 서비스는 Firestore를 호출하지 않는다. 공개 카탈로그 컨트롤러도 기존 서비스 로더를 호출할 뿐 Firestore 접근 위치와 횟수를 추가하지 않는다.

다음 파일은 변경하지 않았다.

- `rules/firestore.rules`
- `firestore.indexes.json`
- `firebase.json`
- `.firebaserc`
- `package.json`
- `package-lock.json`
- `tools/firestore-audit-policy.json`

## 9. 검증 및 빌드 판정

- 입력 패키지 SHA-256 검증 통과: 408/408
- React Hook import 감사 통과
- Firestore strict 감사 통과
- JS·JSX·MJS 변환 구문 검사 통과
- 상대 import 누락 0건
- 기준본 대비 신규 비외부 프로젝트 의미 오류 0건
- 초기 데이터·구형 설정·대여자·자산 정규화 runtime 모의시험 통과
- 한국어 문자열 집합과 발생 횟수 보존

검증 환경의 내부 npm 저장소에서 `yargs-parser-21.1.1.tgz`를 찾지 못해 `npm ci`가 E404로 중단됐다. 실제 Vite 프로덕션 빌드는 로컬 `deploy.ps1`에서 확인해야 한다.
