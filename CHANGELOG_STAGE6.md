# 6단계 변경 내역

## 분리 완료

- Firebase 초기화와 컬렉션 참조: `src/firebase.js`
- 공통 상태 상수: `src/constants/appConstants.js`
- 순수 날짜·상태 유틸리티: `src/utils/appUtils.js`
- 공통 UI: `src/components/CommonUI.jsx`
- 전역 모달: `src/dialogs/AppDialogs.jsx`
- 사용자 화면: `src/user/*`
- 관리자 화면: `src/admin/*`

## App.jsx에 유지

- Firebase Authentication 상태
- Firestore 실시간 리스너
- 대여 신청·수정·상태 변경·상태 복구 트랜잭션
- 회원·관리자 계정 처리
- 공지사항·FAQ 저장 함수
- 전역 화면 상태와 계산값

## 의도적으로 변경하지 않은 사항

- 컬렉션·문서 경로
- 데이터 필드명
- localStorage 키
- 상태값
- 화면 문구
- className
- 배포 스크립트 동작
