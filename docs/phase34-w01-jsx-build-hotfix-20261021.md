# Phase 34 W01 JSX 빌드 오류 긴급 수정 · 2026-10-21

## 원인

사용자 Windows `deploy.ps1 v13.5` 빌드 중 `src/admin/AdminAccountSecurityPanel.jsx:389:6`에 `Expected ";" but found "catch"` 발생. 백엔드 감사로 이전하면서 남은 구 브라우저 감사의 중복 `catch` 및 성공 Toast 분기 때문.

## 조치

- `saveDeviceTrustSetting()`에서 더 이상 실행되지 않아야 하는 `auditWriteError` 관련 중복 브라우저 감사 블록을 제거.
- **백엔드의 서버 기록, PostgreSQL 감사, 권한 검증, 재인증, Device Trust 정책 및 복구 로직은 수정하지 않음.**
- `tools/frontend/smoke-phase34-runtime-regressions.mjs`에 제거된 브라우저 감사 블록 재유입 방지 계약 검사 2개 추가.
- 기존 ZIP 및 원본 Production 승인 커밋은 수정하지 않고 새 이름의 전체 소스 ZIP과 SHA를 발급.

## 사용자 적용 지침

1. 실패한 W01 ZIP은 사용하지 말 것. 기존 Windows 프로젝트의 실패 상태에 이미 W01 소스가 적용되었지만 빌드 전에 중단되어 GitHub/Heroku 배포 단계에 도달하지 않았음.
2. 새 Full ZIP의 SHA-256을 검사하고 같은 `deploy.ps1 v13.5`에서 메뉴 **2**를 눌러 새 ZIP을 직접 지정. Firebase `0`, Production 발행 `N`.
3. `npm run build` 성공 및 Staging `gh-pages-3` 푸시 성공을 확인하기 전 **Staging Backend 배포 금지**.
4. Staging Backend Migration 042, `/health`, Clerk 시험 계정 E2E는 앞선 W01 운영자 인수인계서와 동일하게 시행.
5. Production 별도 승격 승인 전 배포 금지. 전체 데이터 초기화는 계속 서버에서 차단.

## 검증 구분

- 사용자 제공 원본 Windows 로그: 패키지 SHA/메타 검증 PASS, Hook/Flow/Runtime 감사 PASS, Vite 빌드 FAIL, 원격 푸시 없음.
- 신규 수정본은 JSX 정적 구문 검사 및 Phase34 기존 Smoke를 재검증한다.
- 개발 환경의 npm 패키지 등록 서버 연결 불가(EAI_AGAIN) 때문에 실제 Vite `npm run build`를 이곳에서 재현할 수 없는 경우 그 결과를 미실행으로 표기. Windows에서 반드시 통과 필요.
