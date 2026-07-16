# Firestore Rules 적용 주의

6단계의 핵심은 React 파일 분리이며 Firestore 권한 변경이 아닙니다.

이 폴더의 `firestore.rules`는 최신 애플리케이션 코드와 지금까지 반영된 기능 요구사항을 기준으로 재구성한 통합 규칙입니다. 실제 Firebase Console에서 내려받은 운영 규칙 원본은 아니므로 다음 절차를 지켜야 합니다.

1. Firebase Console에서 현재 운영 Rules를 별도 파일로 백업
2. 현재 운영 Rules와 이 파일을 비교
3. 로그인된 Firebase CLI 또는 Firebase Console에서 구문 검증
4. 테스트 프로젝트 또는 운영 중단 시간에 적용
5. 일반 사용자와 관리자 권한을 각각 점검

6단계 코드만 먼저 배포하는 경우 기존 운영 Rules를 그대로 유지할 수 있습니다.
