# Firestore Rules 적용 주의

이 패키지는 비밀번호 재설정 전에 가입 이메일·성명·부서/팀·연락처가 모두 일치하는지 확인하기 위해 `accountRecoveryKeys` 문서에 `emailVerifier` 필드를 추가합니다.

따라서 웹 소스만 배포하면 안 되며, 다음 순서로 Firestore Rules도 함께 적용해야 합니다.

1. Firebase Console에서 현재 운영 Rules를 별도 파일로 백업
2. 현재 운영 Rules와 이 파일을 비교
3. 로그인된 Firebase CLI 또는 Firebase Console에서 구문 검증
4. `firebase deploy --only firestore:rules` 실행
5. 신규 계정 생성, 이메일 찾기, 비밀번호 재설정, 회원정보 수정 기능 점검

기존 회원의 `accountRecoveryKeys` 문서에는 `emailVerifier`가 없을 수 있습니다. 배포 후 관리자 모드에서 다음 작업 중 하나를 한 번 실행하면 기존 회원의 복구 인덱스가 다시 생성됩니다.

- 사용자·권한 → 회원가입 정책 → 기존 회원 명부 검사
- 사용자·권한 → 부서·사용자 관리 → 기존 명부를 다시 저장

신규 가입 계정과 배포 후 마이페이지 기본 정보를 저장한 계정은 별도 갱신 없이 새 검증값이 기록됩니다.
