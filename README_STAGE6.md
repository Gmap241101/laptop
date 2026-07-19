# 6단계 전체 반영본

## 목적

이 패키지는 기존 단일 `App.jsx`를 기능별 파일로 분리한 6단계 전체 반영본입니다.

이번 단계에서는 다음을 변경하지 않았습니다.

- Firestore 컬렉션명과 문서 구조
- 대여 신청·승인·보류·불허·반납·상태 복구 로직
- 관리자 신청정보 수정과 예약 충돌 검사
- 사용자 회원가입·승인·차단 로직
- 공지사항과 FAQ 저장 구조
- 기존 화면 문구와 className
- GitHub Pages 배포 방식

## 주요 파일 구조

```text
src/
├─ App.jsx
├─ firebase.js
├─ constants/appConstants.js
├─ utils/appUtils.js
├─ components/CommonUI.jsx
├─ dialogs/AppDialogs.jsx
├─ user/
│  ├─ UserWorkspace.jsx
│  ├─ UserRentalPanel.jsx
│  ├─ UserMyPagePanel.jsx
│  ├─ UserAuthPanel.jsx
│  ├─ UserRequestHistoryPanel.jsx
│  └─ UserBoardPanel.jsx
└─ admin/
   ├─ AdminWorkspace.jsx
   ├─ AdminDashboardPanel.jsx
   ├─ AdminRequestsPanel.jsx
   ├─ AdminAssetsPanel.jsx
   ├─ AdminAssetCategoriesPanel.jsx
   ├─ AdminOrganizationPanel.jsx
   ├─ AdminNoticePanel.jsx
   ├─ AdminFaqPanel.jsx
   ├─ AdminMemberAccountsPanel.jsx
   ├─ AdminAccountsPanel.jsx
   └─ AdminSettingsPanel.jsx
```

`App.jsx`에는 전역 상태, Firestore 실시간 구독, 인증, 트랜잭션과 저장 함수가 유지됩니다. 분리된 화면 컴포넌트는 필요한 상태와 함수를 `ctx`로 전달받습니다.

## 적용 순서

1. 현재 Git 저장소와 Firebase Console의 Firestore Rules를 별도로 백업합니다.
2. 운영 중단 상태에서 기존 프로젝트의 `src` 폴더를 이 패키지의 `src` 폴더로 교체합니다.
3. 이 패키지의 `package.json`, `package-lock.json`, `vite.config.js`, `index.html`, `deploy.ps1`을 프로젝트 루트에 적용합니다.
4. 기존 `public` 폴더는 삭제하지 않습니다. 특히 `public/files/sample.xlsx`와 사용 중인 정적 파일을 유지합니다.
5. 프로젝트 루트에서 다음 명령을 실행합니다.

```powershell
npm ci
npm run build
```

6. 빌드 성공 후 로컬에서 주요 기능을 확인합니다.

```powershell
npm run dev
```

7. 애플리케이션 배포는 기존 방식대로 실행합니다.

```powershell
.\deploy.ps1
```

## 필수 확인 항목

- 사용자 로그인·회원가입·승인 대기
- 관리자 로그인
- 기기 선택과 대여 신청
- 관리자 신청 관리 4개 탭
- 신청정보 수정
- 상태 변경과 모든 탭의 상태 복구
- 예약 충돌 차단
- 사용자 변경·취소·연장 요청
- 공지사항 등록·수정·삭제·조회수
- FAQ 카테고리와 FAQ 등록·수정·삭제
- 일반회원 승인·차단·이용 종료
- 관리자 계정 관리
- 자산·부서·대여자·휴일·설정 관리

## Firestore Rules

`rules/firestore.rules`는 최신 `App.jsx`가 사용하는 컬렉션과 1~5단계 요구사항을 기준으로 정리한 통합 규칙 파일입니다.

중요 사항:

- 6단계는 파일 구조 분리이므로 원칙적으로 Firestore 권한 변경이 필요하지 않습니다.
- 현재 운영 중인 실제 Rules 원본이 업로드되지 않았기 때문에, 이 파일은 Firebase 프로젝트에서 직접 내려받은 운영 Rules 복사본이 아닙니다.
- 운영 Rules를 덮어쓰기 전에 Firebase Console의 현재 Rules와 반드시 비교해야 합니다.
- Rules 적용은 앱 빌드 및 테스트와 별도로 진행합니다.

Rules 배포 명령:

```powershell
npx firebase-tools login
npx firebase-tools deploy --only firestore:rules --project laptop-system-mk
```

`firebase.json`은 `rules/firestore.rules`를 참조하도록 포함되어 있습니다.

## 검증 결과

- 전체 JavaScript/JSX 모듈 구문 검사: 통과
- Vite 프로덕션 빌드: 통과
- 변환 모듈: 1,787개
- 생성 JS: 약 1,005.72 kB, gzip 약 267.84 kB
- Vite의 500 kB 초과 청크 경고가 있으나 빌드 실패는 아닙니다.

Firestore Rules는 현재 실행 환경에서 Firebase 로그인 정보가 없고 Firestore Emulator JAR 다운로드가 차단되어 공식 컴파일 검증을 완료하지 못했습니다. 운영 Rules와 비교한 뒤 Firebase Console 또는 로그인된 Firebase CLI 환경에서 배포 전 검증해야 합니다.

## 롤백

`backup/App.before-stage6.jsx`에는 이번 분리 작업 전 최신 단일 `App.jsx`가 들어 있습니다.

문제가 생기면 다음 순서로 롤백합니다.

1. 배포 전 Git 커밋으로 되돌립니다.
2. `backup/App.before-stage6.jsx`를 기존 위치의 `App.jsx`로 복원합니다.
3. Firebase Console에서 백업해 둔 Rules를 다시 게시합니다.
4. `npm run build` 후 재배포합니다.
