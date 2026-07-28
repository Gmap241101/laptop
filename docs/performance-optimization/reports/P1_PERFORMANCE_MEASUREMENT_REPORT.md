# P1 React 렌더링·Vite 번들 계측 강화 보고서

## 1. 작업 목적

이 작업은 이전 단계에서 분리한 사용자·관리자 컨텍스트가 실제 렌더링과 번들에 미치는 영향을 반복 측정할 수 있도록 계측 기능을 강화하는 작업이다.

기존 기능은 다음 한계가 있었다.

- React Profiler 결과를 브라우저 콘솔에 한 건씩 출력했다.
- 사용자·관리자 작업공간 전체만 측정해 어느 패널이 다시 렌더링됐는지 구분하기 어려웠다.
- 측정 결과가 누적·요약·저장되지 않았다.
- Vite 번들 분석은 `dist/assets` 파일 전체 크기만 계산했다.
- 초기 청크와 지연 청크를 구분하지 못했다.
- 이전 결과와 자동 비교할 수 없었다.

이번 수정으로 다음 기능을 추가했다.

1. 사용자 패널·관리자 패널·공통 UI별 React Profiler 범위
2. 렌더링 커밋 누적 및 범위별 요약
3. 개발 전용 실시간 측정 패널
4. JSON 측정 결과 다운로드
5. Vite manifest 기반 초기·지연 청크 분류
6. 번들 크기 기준선 저장과 후속 비교
7. 초기 JavaScript·전체 초기 자원·단일 청크 예산 경고

## 2. 변경 파일

### 기존 파일 수정

- `package.json`
- `vite.config.js`
- `src/App.jsx`
- `src/admin/AdminWorkspace.jsx`
- `src/user/UserWorkspace.jsx`
- `src/performance/DevRenderProfiler.jsx`
- `tools/analyze-bundle.mjs`

### 신규 파일

- `src/performance/DevPerformancePanel.jsx`

Firestore Rules, Firestore 인덱스, Firebase 데이터 구조, 화면 업무 기능은 변경하지 않았다.

## 3. React Profiler 저장소

`src/performance/DevRenderProfiler.jsx`는 렌더링 결과를 브라우저 메모리에 누적한다.

저장 항목은 다음과 같다.

- 측정 범위 ID
- mount, update, nested-update 구분
- 현재 렌더링 실제 소요시간
- 전체 하위 트리 기준 예상 소요시간
- 렌더 시작·커밋 시각
- 현재 URL 경로
- 범위별 커밋 횟수
- mount·update 횟수
- 평균·최대·누적 실제 렌더링 시간
- 마지막 렌더링 정보

이벤트는 최대 5,000건까지 보관하고 오래된 이벤트부터 제거한다. 범위별 누적 요약은 유지한다.

브라우저 전역에는 다음 개발용 API가 제공된다.

```js
window.__mkRenderProfiler.snapshot();
window.__mkRenderProfiler.download();
window.__mkRenderProfiler.clear();
```

## 4. 측정 범위 세분화

### 사용자 화면

- `UserWorkspace`
- `UserPanel:home`
- `UserPanel:rental`
- `UserPanel:mypage`
- `UserPanel:login`
- `UserPanel:signup`
- `UserPanel:findEmail`
- `UserPanel:resetPassword`
- `UserPanel:accountStatus`
- `UserPanel:history`
- `UserPanel:footerPage`
- `UserPanel:board-notice`
- `UserPanel:board-faq`

### 관리자 화면

- `AdminWorkspace`
- `AdminPanel:dashboard`
- `AdminPanel:requests`
- `AdminPanel:laptops`
- `AdminPanel:holidaySettings`
- `AdminPanel:categories`
- `AdminPanel:people`
- `AdminPanel:signupPolicy`
- `AdminPanel:noticePosts`
- `AdminPanel:siteSettings`
- `AdminPanel:homeManagement`
- `AdminPanel:popupPosts`
- `AdminPanel:faqPosts`
- `AdminPanel:footerManagement`
- `AdminPanel:memberAccounts`
- `AdminPanel:adminAccounts`
- `AdminPanel:serviceOperations`
- `AdminPanel:accountSecurity`
- `AdminPanel:dataManagement`
- `AdminPanel:systemInfo`
- `AdminPanel:extensionSettings`

### 공통 UI

- `Shared:RentalStatusBoard`
- `Shared:UserFooter`
- `Shared:AppDialogs`
- `Shared:UserPopupLayer`

## 5. 개발용 실시간 측정 패널

개발 서버 실행:

```powershell
npm run dev
```

측정 패널 활성 주소:

```text
http://localhost:5173/?profile=1&profilePanel=1
```

패널에는 실제 렌더링 누적시간이 큰 범위부터 다음 값이 표시된다.

- 커밋 횟수
- 평균 actualDuration
- 최대 actualDuration

패널 기능:

- `JSON`: 전체 측정 결과 저장
- `초기화`: 현재 측정값 삭제
- `열기/접기`: 상세 목록 표시 전환

커밋마다 콘솔 출력도 필요한 경우 다음 주소를 사용한다.

```text
http://localhost:5173/?profile=1&profilePanel=1&profileLog=1
```

일반 개발 사용에서는 `profileLog=1`을 사용하지 않는 것이 적절하다. 콘솔 출력 자체가 측정 환경에 추가 부담을 줄 수 있기 때문이다.

## 6. 프로덕션 영향 제한

React 계측은 `import.meta.env.DEV` 조건에서만 활성화된다.

- 프로덕션 화면에는 측정 패널이 표시되지 않는다.
- 일반 개발 주소에서도 `profile=1`이 없으면 Profiler가 자식 컴포넌트를 그대로 반환한다.
- 측정 패널은 동적 import로 분리했다.
- Firestore 읽기·쓰기 호출은 추가하지 않았다.

## 7. Vite manifest 생성

`vite.config.js`에 다음 설정을 추가했다.

```js
build: {
  manifest: true,
}
```

프로덕션 빌드 후 생성되는 파일:

```text
dist/.vite/manifest.json
```

번들 분석기는 manifest의 다음 정보를 사용한다.

- `isEntry`
- `imports`
- `dynamicImports`
- `file`
- `css`

이를 통해 단순 파일 합계가 아니라 다음 범위를 구분한다.

- 초기 진입 청크
- 동적 import 청크
- 기타 미분류 산출물

## 8. 번들 분석 보고서

기본 명령:

```powershell
npm run analyze:bundle
```

생성 파일:

- `BUNDLE_ANALYSIS_REPORT.json`
- `BUNDLE_ANALYSIS_REPORT.txt`

보고 항목:

- 전체 raw·gzip 크기
- 초기 raw·gzip 크기
- 초기 JavaScript raw·gzip 크기
- 초기 CSS raw·gzip 크기
- 비동기 청크 raw·gzip 크기
- 파일별 초기·비동기 분류
- 동적 진입점별 청크 크기
- 기준 초과 경고

## 9. 기준선 저장과 비교

현재 상태를 기준선으로 저장:

```powershell
npm run analyze:bundle:baseline
```

생성 파일:

```text
BUNDLE_ANALYSIS_BASELINE.json
```

향후 수정본과 비교:

```powershell
npm run analyze:bundle:compare
```

비교 항목:

- 전체 raw 증감
- 전체 gzip 증감
- 초기 raw 증감
- 초기 gzip 증감
- 초기 JavaScript gzip 증감
- 비동기 청크 gzip 증감

## 10. 현재 경고 기준

```text
초기 JavaScript gzip: 350KB
초기 전체 gzip: 400KB
단일 JavaScript raw: 500KB
```

기준을 넘더라도 빌드를 강제로 실패시키지는 않고 보고서에 경고를 기록한다. 실제 배포 차단 기준은 여러 번의 실측 후 별도로 결정하는 것이 안전하다.

## 11. 소스 그래프 변화

| 항목 | 수정 전 | 수정 후 | 변화 |
|---|---:|---:|---:|
| 초기 정적 모듈 | 32개 | 32개 | 0 |
| 초기 정적 소스 | 878,721 bytes | 885,031 bytes | +6,310 bytes |
| 동적 진입점 | 9개 | 10개 | +1개 |

증가분은 렌더링 수집기 기능 확장이다. 신규 시각화 패널은 개발 전용 동적 진입점으로 분리돼 초기 정적 모듈 수에는 포함되지 않는다.

이 수치는 Vite 빌드 결과가 아니라 소스 import 그래프 기준이다.

## 12. 검증

- JavaScript·JSX·MJS 66개 파일 구문 변환 검사 통과
- 상대 import 경로 누락 0건
- Profiler 모의 실행 통과
- mount·nested-update 누적 검사 통과
- 순번 증가 검사 통과
- 범위별 평균·최대·누적 시간 계산 통과
- Vite manifest 합성 데이터 분석 통과
- 초기·비동기 청크 분류 통과
- 기준선 저장·비교 통과
- Firestore `onSnapshot()` 호출 수 변경 없음
- Firestore Rules 변경 없음
- Firestore 인덱스 변경 없음
- `package-lock.json` 변경 없음

## 13. 실제 Vite 빌드 제한

작업 환경의 npm 프록시에서 Vite 패키지 조회 시 다음 오류가 발생했다.

```text
503 Service Temporarily Unavailable
```

의존성 설치가 완료되지 않아 로컬 `vite` 실행 파일이 없으므로 이 환경에서는 실제 프로덕션 번들 수치를 생성하지 못했다.

실제 프로젝트 PC에서는 다음 명령으로 측정한다.

```powershell
Set-Location "E:\project\rental-system\test_new"

npm ci
npm run analyze:bundle:baseline
```

이후 최적화 변경 전후를 비교할 때:

```powershell
npm run analyze:bundle:compare
```

## 14. 배포

이번 작업은 개발 측정 기능과 빌드 분석 설정만 변경했다. Firestore Rules와 인덱스 배포는 필요 없다.

```powershell
Set-Location "E:\project\rental-system\test_new"

.\deploy.ps1
```
