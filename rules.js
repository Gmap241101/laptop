rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {

    // --- [공통 검증 헬퍼 함수] ---

    function signedIn() {
      return request.auth != null;
    }

    // 관리자 존재 여부 확인 (adminAccounts 컬렉션에 해당 UID 문서가 존재하면 관리자)
    function isAdmin() {
      return signedIn()
        && exists(/databases/$(database)/documents/adminAccounts/$(request.auth.uid));
    }

    // 일반 활성 사용자 여부 확인 (userAccounts 컬렉션에 존재하고 status가 active인 경우)
    function isActiveUser() {
      return signedIn()
        && exists(/databases/$(database)/documents/userAccounts/$(request.auth.uid))
        && get(/databases/$(database)/documents/userAccounts/$(request.auth.uid)).data.status == 'active';
    }

    function isBlockingRentalStatus(status) {
      return status == '신청중'
        || status == '대여중'
        || status == '보류';
    }

    // 대여 기록 요약 맵의 데이터 규격 검증
    function validReservationSummary(summary) {
      return summary is map
        && summary.keys().hasAll([
          'id',
          'laptopId',
          'assetCategory',
          'assetNo',
          'startDate',
          'dueDate',
          'status'
        ])
        && summary.keys().hasOnly([
          'id',
          'laptopId',
          'assetCategory',
          'assetNo',
          'startDate',
          'dueDate',
          'status',
          'updatedAt'
        ])
        && summary.id is string
        && summary.laptopId is string
        && summary.assetCategory is string
        && summary.assetNo is string
        && summary.startDate is string
        && summary.dueDate is string
        && summary.status is string
        && isBlockingRentalStatus(summary.status);
    }

    // 일반회원이 기기 대여 신청 시 자산(rentalAssets)의 reservations 배열 변경 검증
    function validUserAssetReservationAppend(assetId) {
      // .get()을 사용하여 reservations 필드가 기존 문서에 없을 때도 에러 없이 빈 리스트([])로 안전 처리
      let reservationsBefore = resource.data.get('reservations', []);
      let reservationsAfter = request.resource.data.get('reservations', []);
      
      let appendedReservation = reservationsAfter[reservationsAfter.size() - 1];

      return isActiveUser()
        && resource.data.status != '대여불가'
        && request.resource.data.diff(resource.data).affectedKeys().hasOnly([
          'reservations',
          'updatedAt'
        ])
        && request.resource.data.updatedAt == request.time
        && reservationsBefore is list
        && reservationsAfter is list
        && reservationsAfter.size() == reservationsBefore.size() + 1
        && reservationsAfter
        == reservationsBefore.concat([
            appendedReservation
        ])
        && validReservationSummary(appendedReservation)
        && appendedReservation.status == '신청중'
        && appendedReservation.laptopId == assetId
        && appendedReservation.assetCategory == resource.data.category
        && appendedReservation.assetNo == resource.data.assetNo;
    }

    // 기기 간편 예약 현황 문서 생성 검증
    function validUserAvailabilityCreate(requestId) {
      return isActiveUser()
        && request.resource.data.id == requestId
        && request.resource.data.status == '신청중'
        && request.resource.data.updatedAt == request.time
        && request.resource.data.keys().hasAll([
          'id',
          'laptopId',
          'assetCategory',
          'assetNo',
          'startDate',
          'dueDate',
          'status',
          'updatedAt'
        ])
        && request.resource.data.keys().hasOnly([
          'id',
          'laptopId',
          'assetCategory',
          'assetNo',
          'startDate',
          'dueDate',
          'status',
          'updatedAt'
        ])
        && validReservationSummary(request.resource.data);
    }

    // 원본 대여 신청서(rentalRequests) 등록 검증
    function validUserRentalRequestCreate(requestId) {
      return isActiveUser()
        && request.resource.data.id == requestId
        && request.resource.data.requesterUid == request.auth.uid
        && request.resource.data.requesterEmail
          == request.auth.token.email
        && request.resource.data.status == '신청중'
        && request.resource.data.adminMemo == ''
        && request.resource.data.id is string
        && request.resource.data.requesterUid is string
        && request.resource.data.requesterEmail is string
        && request.resource.data.requesterName is string
        && request.resource.data.requesterTeam is string
        && request.resource.data.laptopId is string
        && request.resource.data.assetCategory is string
        && request.resource.data.assetNo is string
        && request.resource.data.team is string
        && request.resource.data.borrower is string
        && request.resource.data.startDate is string
        && request.resource.data.dueDate is string
        && request.resource.data.purpose is string
        && request.resource.data.status is string
        && request.resource.data.adminMemo is string
        && request.resource.data.requestedAt is string
        && request.resource.data.createdAt == request.time
        && request.resource.data.updatedAt == request.time
        && request.resource.data.keys().hasAll([
          'id',
          'requesterUid',
          'requesterEmail',
          'requesterName',
          'requesterTeam',
          'laptopId',
          'assetCategory',
          'assetNo',
          'team',
          'borrower',
          'startDate',
          'dueDate',
          'purpose',
          'status',
          'adminMemo',
          'requestedAt',
          'createdAt',
          'updatedAt'
        ])
        && request.resource.data.keys().hasOnly([
          'id',
          'requesterUid',
          'requesterEmail',
          'requesterName',
          'requesterTeam',
          'laptopId',
          'assetCategory',
          'assetNo',
          'team',
          'borrower',
          'startDate',
          'dueDate',
          'purpose',
          'status',
          'adminMemo',
          'requestedAt',
          'createdAt',
          'updatedAt'
        ]);
    }

    // --- [컬렉션 매칭 규칙 세부 선언] ---

    function validUserActionRequestUpdate(requestId) {
      let action =
        request.resource.data.userActionRequest;

      return isActiveUser()
        && resource.data.id == requestId
        && resource.data.requesterUid
          == request.auth.uid
        && request.resource.data.id
          == requestId
        && request.resource.data.requesterUid
          == resource.data.requesterUid
        && request.resource.data
          .diff(resource.data)
          .affectedKeys()
          .hasOnly([
            'userActionRequest',
            'updatedAt'
          ])
        && request.resource.data.updatedAt
          == request.time
        && (
          !resource.data.keys().hasAny([
            'userActionRequest'
          ])
          || resource.data.userActionRequest.status
            != 'pending'
        )
        && action is map
        && action.keys().hasAll([
          'type',
          'status',
          'reason',
          'team',
          'borrower',
          'startDate',
          'dueDate',
          'purpose',
          'requestedAt',
          'reviewedAt',
          'reviewedByUid',
          'reviewedByName',
          'reviewMemo'
        ])
        && action.keys().hasOnly([
          'type',
          'status',
          'reason',
          'team',
          'borrower',
          'startDate',
          'dueDate',
          'purpose',
          'requestedAt',
          'reviewedAt',
          'reviewedByUid',
          'reviewedByName',
          'reviewMemo'
        ])
        && (
          action.type == 'change'
          || action.type == 'cancel'
          || action.type == 'extend'
          || action.type == 'return'
        )
        && action.status == 'pending'
        && action.reason is string
        && action.team is string
        && action.borrower is string
        && action.startDate is string
        && action.dueDate is string
        && action.purpose is string
        && action.requestedAt
          == request.time
        && action.reviewedAt == null
        && action.reviewedByUid == ''
        && action.reviewedByName == ''
        && action.reviewMemo == ''
        && (
          (
            (
              action.type == 'change'
              || action.type == 'cancel'
            )
            && (
              resource.data.status == '신청중'
              || resource.data.status == '보류'
            )
          )
          ||
          (
            (
              action.type == 'extend'
              || action.type == 'return'
            )
            && resource.data.status == '대여중'
          )
        )
        && (
          action.type != 'extend'
          || action.dueDate
            > resource.data.dueDate
        );
    }

    // 공개 시스템 설정 (자산 카테고리, 부서 목록, 대여 환경설정 등)
    match /rentalSystem/publicConfig {
      allow read: if true;
      allow create, update: if isAdmin();
      allow delete: if false;
    }

    // 대여 기기 개별 자산 정보
    match /rentalAssets/{assetId} {
      allow read: if true;
      allow create: if isAdmin();
      allow update: if isAdmin() || validUserAssetReservationAppend(assetId);
      allow delete: if isAdmin();
    }

    // 자산 고유 관리번호 중복 등록 방지 레지스트리 인덱스
    match /rentalAssetNumbers/{registryId} {
      allow read, create, update, delete: if isAdmin();
    }

    // 공개 예약 가능 현황 리스트 (개인정보가 제외된 요약 데이터만 포함)
    match /rentalAvailability/{requestId} {
      allow read: if true;
      allow create: if isAdmin() || validUserAvailabilityCreate(requestId);
      allow update, delete: if isAdmin();
    }

    // 사내 임직원/대여자 매칭 풀
    match /rentalBorrowers/{borrowerId} {
      allow get, list: if isAdmin() || isActiveUser();
      allow create, update, delete: if isAdmin();
    }

    // 최고 및 중간 관리자 계정 정보
    match /adminAccounts/{adminId} {
      allow get: if signedIn() && (request.auth.uid == adminId || isAdmin());
      allow list: if isAdmin();
      allow create, update: if isAdmin() && request.resource.data.authUid == adminId;
      allow delete: if isAdmin() && request.auth.uid != adminId;
    }

    // 가입 사원 프로필 정보
    match /userAccounts/{userId} {
      allow get: if signedIn() && (request.auth.uid == userId || isAdmin());
      allow list: if isAdmin();
      allow create: if signedIn()
        && request.auth.uid == userId
        && request.resource.data.uid == userId
        && request.resource.data.email
          == request.auth.token.email
        && request.resource.data.email is string
        && request.resource.data.status == 'pending'
        && request.resource.data.createdAt == request.time
        && request.resource.data.updatedAt == request.time;
      allow update: if isAdmin()
        || (
          signedIn()
          && request.auth.uid == userId
          && request.resource.data.updatedAt == request.time
          && request.resource.data.diff(resource.data).affectedKeys().hasOnly([
            'name',
            'team',
            'phone',
            'updatedAt'
          ])
        );
      allow delete: if isAdmin();
    }

    // 원본 대여 신청서 관리 대장
    match /rentalRequests/{requestId} {
      allow create:
        if isAdmin()
        || validUserRentalRequestCreate(requestId);

      allow get, list:
        if signedIn()
        && (
          isAdmin()
          || resource.data.requesterUid
            == request.auth.uid
        );

      allow update:
        if isAdmin()
        || validUserActionRequestUpdate(
          requestId
        );

      allow delete:
        if isAdmin();
    }

        match /faqBoard/config {
      allow read:
        if true;

      allow create, update:
        if isAdmin()
        && request.resource.data.postsPerPage is int
        && request.resource.data.postsPerPage >= 5
        && request.resource.data.postsPerPage <= 50
        && request.resource.data.updatedAt
          == request.time
        && request.resource.data.keys().hasAll([
          'postsPerPage',
          'updatedAt'
        ])
        && request.resource.data.keys().hasOnly([
          'postsPerPage',
          'updatedAt'
        ]);

      allow delete:
        if false;
    }

    match /faqCategories/{categoryId} {
      allow read:
        if true;

      allow create:
        if isAdmin()
        && request.resource.data.id == categoryId
        && request.resource.data.name is string
        && request.resource.data.name.size() > 0
        && request.resource.data.order is int
        && request.resource.data.order >= 0
        && request.resource.data.createdAt
          == request.time
        && request.resource.data.updatedAt
          == request.time
        && request.resource.data.keys().hasAll([
          'id',
          'name',
          'order',
          'createdAt',
          'updatedAt'
        ])
        && request.resource.data.keys().hasOnly([
          'id',
          'name',
          'order',
          'createdAt',
          'updatedAt'
        ]);

      allow update:
        if isAdmin()
        && request.resource.data.id == categoryId
        && request.resource.data.id
          == resource.data.id
        && request.resource.data.name is string
        && request.resource.data.name.size() > 0
        && request.resource.data.order is int
        && request.resource.data.order >= 0
        && request.resource.data.createdAt
          == resource.data.createdAt
        && request.resource.data.updatedAt
          == request.time
        && request.resource.data
          .diff(resource.data)
          .affectedKeys()
          .hasOnly([
            'name',
            'order',
            'updatedAt'
          ])
        && request.resource.data.keys().hasAll([
          'id',
          'name',
          'order',
          'createdAt',
          'updatedAt'
        ])
        && request.resource.data.keys().hasOnly([
          'id',
          'name',
          'order',
          'createdAt',
          'updatedAt'
        ]);

      allow delete:
        if isAdmin();
    }

    match /faqPosts/{postId} {
      allow read:
        if true;

      allow create:
        if isAdmin()
        && request.resource.data.id == postId
        && request.resource.data.categoryId is string
        && request.resource.data.categoryId.size() > 0
        && request.resource.data.title is string
        && request.resource.data.title.size() > 0
        && request.resource.data.content is string
        && request.resource.data.content.size() > 0
        && request.resource.data.isPinned is bool
        && request.resource.data.authorUid
          == request.auth.uid
        && request.resource.data.authorName is string
        && request.resource.data.authorName.size() > 0
        && request.resource.data.createdAt
          == request.time
        && request.resource.data.updatedAt
          == request.time
        && request.resource.data.keys().hasAll([
          'id',
          'categoryId',
          'title',
          'content',
          'isPinned',
          'authorUid',
          'authorName',
          'createdAt',
          'updatedAt'
        ])
        && request.resource.data.keys().hasOnly([
          'id',
          'categoryId',
          'title',
          'content',
          'isPinned',
          'authorUid',
          'authorName',
          'createdAt',
          'updatedAt'
        ]);

      allow update:
        if isAdmin()
        && request.resource.data.id == postId
        && request.resource.data.id
          == resource.data.id
        && request.resource.data.categoryId is string
        && request.resource.data.categoryId.size() > 0
        && request.resource.data.title is string
        && request.resource.data.title.size() > 0
        && request.resource.data.content is string
        && request.resource.data.content.size() > 0
        && request.resource.data.isPinned is bool
        && request.resource.data.authorUid
          == resource.data.authorUid
        && request.resource.data.authorName
          == resource.data.authorName
        && request.resource.data.createdAt
          == resource.data.createdAt
        && request.resource.data.updatedAt
          == request.time
        && request.resource.data
          .diff(resource.data)
          .affectedKeys()
          .hasOnly([
            'categoryId',
            'title',
            'content',
            'isPinned',
            'updatedAt'
          ])
        && request.resource.data.keys().hasAll([
          'id',
          'categoryId',
          'title',
          'content',
          'isPinned',
          'authorUid',
          'authorName',
          'createdAt',
          'updatedAt'
        ])
        && request.resource.data.keys().hasOnly([
          'id',
          'categoryId',
          'title',
          'content',
          'isPinned',
          'authorUid',
          'authorName',
          'createdAt',
          'updatedAt'
        ]);

      allow delete:
        if isAdmin();
    }

        match /noticeBoard/config {
      allow read:
        if true;

      allow create, update:
        if isAdmin()
        && request.resource.data.postsPerPage is int
        && request.resource.data.postsPerPage >= 5
        && request.resource.data.postsPerPage <= 50
        && request.resource.data.updatedAt
          == request.time
        && request.resource.data.keys().hasAll([
          'postsPerPage',
          'updatedAt'
        ])
        && request.resource.data.keys().hasOnly([
          'postsPerPage',
          'updatedAt'
        ]);

      allow delete:
        if false;
    }

    match /noticePosts/{postId} {
      allow read:
        if true;

      allow create:
        if isAdmin()
        && request.resource.data.id == postId
        && request.resource.data.title is string
        && request.resource.data.title.size() > 0
        && request.resource.data.content is string
        && request.resource.data.content.size() > 0
        && request.resource.data.isPinned is bool
        && request.resource.data.authorUid
          == request.auth.uid
        && request.resource.data.authorName is string
        && request.resource.data.authorName.size() > 0
        && request.resource.data.viewCount == 0
        && request.resource.data.createdAt
          == request.time
        && request.resource.data.updatedAt
          == request.time
        && request.resource.data.keys().hasAll([
          'id',
          'title',
          'content',
          'isPinned',
          'authorUid',
          'authorName',
          'viewCount',
          'createdAt',
          'updatedAt'
        ])
        && request.resource.data.keys().hasOnly([
          'id',
          'title',
          'content',
          'isPinned',
          'authorUid',
          'authorName',
          'viewCount',
          'createdAt',
          'updatedAt'
        ]);

      allow update:
        if (
          isAdmin()
          && request.resource.data.id == postId
          && request.resource.data.id
            == resource.data.id
          && request.resource.data.title is string
          && request.resource.data.title.size() > 0
          && request.resource.data.content is string
          && request.resource.data.content.size() > 0
          && request.resource.data.isPinned is bool
          && request.resource.data.authorUid
            == resource.data.authorUid
          && request.resource.data.authorName
            == resource.data.authorName
          && request.resource.data.viewCount
            == resource.data.viewCount
          && request.resource.data.createdAt
            == resource.data.createdAt
          && request.resource.data.updatedAt
            == request.time
          && request.resource.data
            .diff(resource.data)
            .affectedKeys()
            .hasOnly([
              'title',
              'content',
              'isPinned',
              'updatedAt'
            ])
          && request.resource.data.keys().hasAll([
            'id',
            'title',
            'content',
            'isPinned',
            'authorUid',
            'authorName',
            'viewCount',
            'createdAt',
            'updatedAt'
          ])
          && request.resource.data.keys().hasOnly([
            'id',
            'title',
            'content',
            'isPinned',
            'authorUid',
            'authorName',
            'viewCount',
            'createdAt',
            'updatedAt'
          ])
        )
        ||
        (
          resource.data.viewCount is int
          && request.resource.data.viewCount is int
          && request.resource.data.viewCount
            == resource.data.viewCount + 1
          && request.resource.data
            .diff(resource.data)
            .affectedKeys()
            .hasOnly([
              'viewCount'
            ])
        );

      allow delete:
        if isAdmin();
    }

    match /rentalRequestLogs/{logId} {
        allow read:
            if isAdmin();

        allow create:
            if isAdmin()
            && request.resource.data.id == logId
            && request.resource.data.requestId is string
            && (
            request.resource.data.action == 'status-changed'
            || request.resource.data.action == 'memo-changed'
            || request.resource.data.action == 'user-action-reviewed'
            )
            && request.resource.data.previousStatus is string
            && request.resource.data.nextStatus is string
            && request.resource.data.previousMemo is string
            && request.resource.data.nextMemo is string
            && request.resource.data.actorUid == request.auth.uid
            && request.resource.data.actorAdminId is string
            && request.resource.data.actorName is string
            && request.resource.data.get(
              'detail',
              ''
            ) is string
            && request.resource.data.createdAt == request.time
            && request.resource.data.keys().hasAll([
            'id',
            'requestId',
            'action',
            'previousStatus',
            'nextStatus',
            'previousMemo',
            'nextMemo',
            'actorUid',
            'actorAdminId',
            'actorName',
            'createdAt'
            ])
            && request.resource.data.keys().hasOnly([
            'id',
            'requestId',
            'action',
            'previousStatus',
            'nextStatus',
            'previousMemo',
            'nextMemo',
            'actorUid',
            'actorAdminId',
            'actorName',
            'detail',
            'createdAt'
            ]);

        allow update, delete:
            if false;
        }

    // 구 통합 대시보드 문서 (과거 데이터 확인 및 백업 열람 전용)
    match /laptopRentalDashboard/main {
      allow read: if isAdmin();
      allow write: if false; // 쓰기 연산은 원천 봉쇄
    }

    // 나머지 모든 컬렉션에 대한 쓰기/읽기 기본 차단
    match /{document=**} {
      allow read, write: if false;
    }
  }
}