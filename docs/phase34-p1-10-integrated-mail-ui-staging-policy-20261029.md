# Phase 34 P1-10 개정 v2 통합 개발 기준선 (2026-10-29)

## 기준과 승인
- 기준 소스: P1-09 v14.7 Production 커밋 `9b39430c81ce`의 전체 소스 ZIP.
- 최종 사용자 선택: 상태 카운터 클릭 시 기존 검색어 유지(B), 같은 카운터 재클릭 시 상태 필터 전체 복귀(A); 두 경우 첫 페이지부터 조회한다. 검색어는 유지한다.
- Production의 Brevo 실발송은 이미 사용 중이므로 어떤 외부 발송·설정 변경·Production 승격도 본 오프라인 개발에서 수행하지 않는다.

## 공통 디자인
- 헤더·본문·푸터·외부 영역의 색상, 여백, 정렬, 글자 크기, 콘텐츠 폭을 관리자 속성 패널에서 수정한다.
- 색상 변경에는 별도 확정 버튼을 둔다. 본문 삽입은 필수·삭제 불가이며, 선택 안내 상자·HTTPS 링크 버튼·버튼과 안내 상자의 순서 변경·푸터 구분선을 제공한다.
- DB `mail-notification-settings` 페이로드에 `designDraft` 초안, `design` 발송 적용본, `designVersions` 한정 보관 이력을 저장한다. 신규 DB/테이블/Worker는 없다.
- `/api/admin/mail-design/draft` (PATCH)는 초안만, `/publish` (POST)는 명시적 운영 적용, `/restore` (POST)는 이력 버전을 새 적용본으로 복원한다. 기존 `/api/admin/mail-design` 경로는 구버전 호환을 위해 보존한다. 모두 최고관리자 API 권한검사를 적용한다.
- 공통 메일 HTML은 승인된 색상·숫자·정렬 값으로만 서버가 생성하고, 스크립트/임의 CSS/원격 이미지는 삽입하지 않는다. 메일 스냅샷은 Outbox에 기록된 시점의 디자인으로 유지한다.

## 미리보기·날짜·도메인
- 서버의 동일한 `renderDesignedMail` 함수가 실제 Outbox 및 미리보기를 처리한다.
- UTC 타임스탬프는 Asia/Seoul 사용자 표기로 변환하고, 날짜만 있는 값은 날짜 이동 없이 표기한다.
- Production의 미설정 기본 URL은 `https://notebook.recruit.kro.kr/`, Staging 예시는 `https://mkrental.vercel.app/`로 유지한다. `MAIL_PUBLIC_SITE_URL`로 검증된 HTTPS URL을 별도로 설정한 경우 우선한다.
- 미리보기는 가상 이름/값만 사용하며 Outbox나 Brevo 호출이 없어야 한다.

## 반납 예정·연체·OFF
- 기존 web dyno에서 5분 간격으로 한국시간 09:00 이후 후보를 확인한다. 첫 점검은 서버 상태에 따라 09:00~09:05 전후이며, 지연 시 당일 이후 재점검한다.
- `rental_overdue`는 동일 대여·유효 반납일에 대해 기존 Outbox 이력까지 확인해 1회만 등록한다. 재연체 반복 알림은 자동 활성화하지 않는다.
- 상태·반납일 변경 시 기존 Outbox 취소 처리와 발송 직전 재검사/DB 발송 승인 게이트를 유지한다. 이미 Brevo에 전달된 요청은 회수할 수 없다.
- Staging에서는 Production 실메일 루프가 실행되지 않아야 한다. 실제 운영 예약 데이터를 임의로 변경해 시험하지 않는다.

## UI
- 실제 발송 여부와 무관하게 출력하던 '실제 이메일 발송은 아직 시작되지 않았습니다' 등 고정 오표시는 제거한다.
- 최고관리자 뱃지는 계정 보안 설정과 이메일 알림 관리 양쪽에서 `OwnerSettingsBadge` 공통 컴포넌트를 사용한다. 서비스 운영·데이터 관리 등 일부 기능만 제한된 메뉴의 권한 범위는 변경하지 않는다.
- 발송 내역 7개 상태 캡슐의 배경·모양을 유지하고, 숫자는 흰 배경 소형 뱃지로 표시한다. 상태 버튼은 기존 서버 페이징/필터 및 드롭다운과 동기화하고 검색어는 보존한다.

## 배포 및 검증 게이트
1. 전체 ZIP SHA-256과 1,122개 파일 manifest 검사.
2. npm 의존성이 준비된 사용자 Windows PC에서 `npm run build:staging` 성공 확인. 로컬 개발 환경의 Vite 번들 빌드는 미실행이므로 이 검사를 생략하지 않는다.
3. 기존 `deploy.ps1`의 ZIP 선택 2, Heroku Staging 1, Production 승격 N. 새 Staging SHA와 웹/API Health 일치 및 UI 현장검증 확인.
4. 관리자 전체 발송 OFF와 기존 대기메일 상태 재검토 후 Production 별도 승인, `gh-pages-4` 필수 백업 및 Y인 경우 날짜별 신규 백업.
5. Production 배포 후 10개 업무영역 회귀, 19개 알림 미리보기, 초안·운영 적용·복원, OFF 차단, 통제된 수신 확인을 검증한다.

## 변경 금지
`deploy.ps1` 원본 흐름, `gh-pages-2` Firebase 보존 브랜치, 기존 Heroku Essential-0 DB, web dyno, Brevo Free, Resend 보존 코드를 변경하지 않는다. 새로운 DB/Worker/요금제/스토리지를 추가하지 않는다.
