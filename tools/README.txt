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

Firebase Authentication 백업·복원 참고
- 시스템 관리 JSON 백업과 복원은 Firestore 문서용입니다.
- Firebase Authentication 계정과 비밀번호까지 보존하려면 초기화 전에 별도로 내보내야 합니다.

  firebase auth:export auth-users.json --format=json

- 필요한 경우 프로젝트의 비밀번호 해시 설정을 확인한 뒤 가져옵니다.

  firebase auth:import auth-users.json

- Firestore userAccounts 문서만 복원하고 Authentication 계정이 없으면 해당 사용자는 로그인할 수 없습니다.
- Auth 내보내기 파일과 서비스 계정 키는 웹 프로젝트, GitHub, Hosting, Firestore에 저장하지 마십시오.
