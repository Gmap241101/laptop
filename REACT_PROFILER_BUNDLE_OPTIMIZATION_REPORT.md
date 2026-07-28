# React Profiler 및 번들 최적화 보고서

## 1. 작업 기준

- 기준 패키지: `rental-system-admin-status-summary-fix-deployment-package.zip`
- 작업 목표: 우선순위 10 `React Profiler·번들 분석 및 세부 최적화`
- 기능, 화면 문구, Firestore Rules, 인덱스 및 데이터 구조는 변경하지 않음

## 2. 분석 결과

### 2.1 초기 정적 소스 그래프

| 항목 | 수정 전 | 수정 후 | 변화 |
|---|---:|---:|---:|
| 초기 정적 모듈 | 34개 | 28개 | 6개 감소 |
| 초기 정적 소스 크기 | 1,065,887 bytes | 849,728 bytes | 216,159 bytes 감소 |
| 초기 경로 감소율 | - | - | 20.3% |
| 동적 진입점 | 1개 | 9개 | 8개 추가 |

위 수치는 최종 압축 번들 용량이 아니라 `src/main.jsx`에서 정적 import로 도달하는 원본 소스 파일 크기의 합계다. 실제 최종 번들 크기는 로컬에서 `npm run analyze:bundle`로 확인해야 한다.

### 2.2 확인된 초기 로딩 원인

1. `UserWorkspace.jsx`가 홈 이외의 사용자 패널 7개를 모두 정적 import함.
2. 사용자 표시 컴포넌트가 `RichTextEditor.jsx`에서 `RichTextContent`를 import하여 편집기 전체가 초기 그래프에 포함됨.
3. `AppDialogs.jsx`가 `RichTextEditor`를 정적 import하여 팝업·FAQ·공지 편집기를 사용하지 않아도 편집기 코드가 포함됨.
4. 렌더링 시간을 반복 측정할 수 있는 프로젝트 내 도구가 없음.
5. 빌드 산출물의 raw/gzip 크기를 재현 가능하게 기록하는 명령이 없음.

## 3. 수정 사항

### 3.1 사용자 페이지별 지연 로딩

`UserHomePanel`은 첫 화면이므로 정적 import를 유지했다. 다음 7개 패널은 `React.lazy()`와 `Suspense`로 전환했다.

- `UserAuthPanel`
- `UserAccountStatusPanel`
- `UserBoardPanel`
- `UserMyPagePanel`
- `UserRentalPanel`
- `UserRequestHistoryPanel`
- `UserFooterPagePanel`

지연 로딩으로 이동한 사용자 패널 원본 소스 크기 합계는 133,450 bytes다.

### 3.2 리치 텍스트 표시와 편집기 분리

기존 `RichTextEditor.jsx`에 함께 있던 기능을 다음처럼 분리했다.

- `src/utils/richTextCore.js`
  - HTML 정제
  - 일반 텍스트 변환
  - 비어 있는 본문 판정
  - 안전한 링크·이미지·동영상 URL 처리
  - YouTube 임베드 파싱
- `src/components/RichTextContent.jsx`
  - 사용자·관리자 읽기 화면의 정제된 본문 표시
  - YouTube 및 HTML5 자동재생 보조 처리
- `src/components/RichTextEditor.jsx`
  - 실제 편집기 UI 및 편집 동작만 유지

`RichTextEditor.jsx`는 109,826 bytes에서 83,424 bytes로 감소했으며, 편집기 코드는 필요한 관리자 편집 화면에서만 로드된다.

### 3.3 다이얼로그 편집기 지연 로딩

`AppDialogs.jsx`는 더 이상 `RichTextEditor`를 정적 import하지 않는다. 팝업, FAQ 또는 공지 작성 다이얼로그에 편집기가 실제로 렌더링될 때만 편집기 모듈을 가져온다.

### 3.4 개발용 React Profiler

`src/performance/DevRenderProfiler.jsx`를 추가하고 사용자·관리자 작업공간을 감쌌다.

활성화 방법:

```powershell
npm run dev
```

브라우저 주소에 다음 쿼리를 추가한다.

```text
?profile=1
```

예:

```text
http://localhost:5173/?profile=1
```

개발자 도구 콘솔에 다음 형식으로 출력된다.

```text
[render-profile] {
  id,
  phase,
  actualDuration,
  baseDuration,
  startTime,
  commitTime
}
```

프로덕션 빌드에서는 `import.meta.env.DEV`가 false이므로 측정 로깅이 비활성화된다.

### 3.5 소스 그래프 분석 명령

`tools/analyze-source-graph.mjs`와 다음 npm 명령을 추가했다.

```powershell
npm run analyze:source
```

생성 파일:

```text
SOURCE_GRAPH_ANALYSIS_REPORT.json
```

기록 내용:

- 초기 정적 모듈 수
- 초기 정적 소스 크기
- 초기 그래프의 파일별 크기
- 동적 import 진입점

### 3.6 실제 번들 분석 명령

`tools/analyze-bundle.mjs`와 다음 npm 명령을 추가했다.

```powershell
npm run analyze:bundle
```

이 명령은 먼저 Vite 프로덕션 빌드를 실행한 후 다음 파일을 생성한다.

```text
BUNDLE_ANALYSIS_REPORT.json
BUNDLE_ANALYSIS_REPORT.txt
```

기록 내용:

- JS·CSS 파일별 raw 크기
- JS·CSS 파일별 gzip 크기
- 전체 raw 및 gzip 크기
- 500KB를 넘는 JavaScript 청크 경고

추가 외부 분석 패키지를 설치하지 않고 Node.js 기본 모듈만 사용한다.

## 4. 변경 파일

### 기존 파일 수정

```text
package.json
src/App.jsx
src/admin/AdminFaqPanel.jsx
src/components/RichTextEditor.jsx
src/dialogs/AppDialogs.jsx
src/user/UserBoardPanel.jsx
src/user/UserFooter.jsx
src/user/UserFooterPagePanel.jsx
src/user/UserPopupLayer.jsx
src/user/UserWorkspace.jsx
```

### 신규 파일

```text
src/components/RichTextContent.jsx
src/performance/DevRenderProfiler.jsx
src/utils/richTextCore.js
tools/analyze-bundle.mjs
tools/analyze-source-graph.mjs
```

## 5. 변경하지 않은 영역

```text
rules/firestore.rules
firestore.indexes.json
firebase.json
.firebaserc
deploy.ps1
Firestore 컬렉션 및 문서 구조
대여·승인·반납 업무 로직
사용자 및 관리자 화면의 기존 한국어 문구
```

## 6. 검증 결과

- TypeScript parser를 이용한 JavaScript·JSX·MJS 59개 파일 구문 검사 통과
- TypeScript JSX transpile 검사 56개 파일 통과
- JavaScript·MJS `node --check` 통과
- 상대 import 경로 검사 통과
- 로컬 named export/import 검사 통과
- 리치 텍스트 핵심 함수 런타임 검사 통과
- 기존 한국어 문자열 삭제 0건
- 기존 한국어 문자열 추가 0건
- 초기 소스 그래프 분석 도구 자체 검사 통과
- 결과 ZIP 재추출 후 동일 검사 수행

## 7. 빌드 제한

작업 환경의 npm 프록시가 `503 Service Temporarily Unavailable`을 반환하여 `npm ci`와 Vite 프로덕션 빌드를 완료하지 못했다. 따라서 최종 Vite 청크 raw/gzip 수치는 이 환경에서 측정하지 못했다.

실제 PC에서는 다음 명령으로 최종 빌드와 번들 보고서를 동시에 생성할 수 있다.

```powershell
Set-Location "E:\project\rental-system\test_new"
npm run analyze:bundle
```

기존 `deploy.ps1`도 배포 전에 `npm run build`를 실행하므로 빌드 오류가 있으면 발행 전에 중단된다.

## 8. 배포

Firestore Rules와 인덱스는 변경하지 않았으므로 Firebase CLI 배포는 필요하지 않다.

```powershell
Set-Location "E:\project\rental-system\test_new"
.\deploy.ps1
```

## 9. 잔여 병목

`src/App.jsx`는 여전히 약 612KB로 초기 그래프에서 가장 큰 파일이다. 이번 작업은 안전한 화면·편집기 코드 분할에 한정했으며, `App.jsx`의 관리자 액션·인증·게시판 로직을 추가 훅으로 분리하는 작업은 별도 구조 개선 단계로 남는다.
