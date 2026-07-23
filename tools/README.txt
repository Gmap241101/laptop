Firebase Authentication 일반회원 정리 도구

1. 시스템 관리 > 데이터 초기화에서 일반회원 정보가 포함된 초기화를 실행합니다.
2. 브라우저가 내려받은 non-admin-auth-users-to-delete.json 파일을 이 폴더에 둡니다.
3. Firebase Console > 프로젝트 설정 > 서비스 계정에서 새 비공개 키 JSON을 받습니다.
4. 별도 안전한 로컬 폴더에서 npm install firebase-admin을 실행합니다.
5. 다음 명령을 실행합니다.

   node delete-non-admin-auth-users.mjs ./service-account.json ./non-admin-auth-users-to-delete.json

주의
- 서비스 계정 JSON을 GitHub, 웹 프로젝트, Firebase Hosting 또는 Firestore에 올리지 마십시오.
- 이 스크립트는 UID 목록에 포함된 Firebase Authentication 계정만 삭제합니다.
- 관리자 계정은 userAccounts가 아니라 adminAccounts로 관리되므로 초기화 UID 목록에 포함되지 않습니다.
