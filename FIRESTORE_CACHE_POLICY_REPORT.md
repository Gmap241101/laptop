# Firestore 캐시 정책 검토 및 적용 보고서

## 1. 작업 목적

우선순위 9인 Firestore 영구 캐시 적용 타당성을 검토하고, 이 프로젝트의 실제 운영 환경에 맞는 캐시 정책을 코드로 고정했다.

## 2. 결론

IndexedDB 기반 Firestore 영구 캐시는 활성화하지 않는다.

이 시스템은 회원 계정, 대여 신청, 대여 이력, 관리자 정보 등 조직 내부 데이터를 처리하며 공용 또는 부서 공용 PC에서 사용할 가능성이 있다. 웹 영구 캐시는 브라우저를 종료하거나 로그아웃한 뒤에도 캐시 문서를 디스크에 유지할 수 있으므로 이 프로젝트에는 적합하지 않다.

대신 다음 정책을 명시적으로 적용한다.

- 캐시 위치: 브라우저 메모리만 사용
- 세션 간 지속: 사용하지 않음
- 비활성 문서 처리: eager garbage collection
- 탭 또는 페이지 종료 후: Firestore 문서 캐시가 디스크에 남지 않음
- IndexedDB 영구 캐시: 사용하지 않음

## 3. 변경 파일

### 수정

- `src/firebase.js`

### 신규

- `src/config/firestoreCachePolicy.js`

## 4. 주요 코드

### 캐시 정책 모듈

```js
import {
  memoryEagerGarbageCollector,
  memoryLocalCache,
} from 'firebase/firestore';

export const FIRESTORE_CACHE_POLICY = Object.freeze({
  mode: 'memory-only',
  persistentAcrossSessions: false,
  garbageCollection: 'eager',
});

export const createFirestoreLocalCache = () =>
  memoryLocalCache({
    garbageCollector: memoryEagerGarbageCollector(),
  });
```

### Firestore 초기화

```js
export const db = existingDefaultFirebaseApp
  ? getFirestore(firebaseApp)
  : initializeFirestore(firebaseApp, {
      localCache: createFirestoreLocalCache(),
    });
```

기존 앱 인스턴스가 남아 있을 수 있는 Vite 개발 모드의 HMR 상황에서는 기존 Firestore 인스턴스를 재사용한다. 최초 실행에서는 메모리 전용 캐시 정책으로 Firestore를 초기화한다.

## 5. 읽기 비용에 대한 영향

이 변경은 디스크 영구 캐시를 이용해 다음 브라우저 세션의 서버 읽기를 줄이는 방식이 아니다. 따라서 새 탭·새 브라우저 세션에서 발생하는 Firestore 읽기를 영구 캐시로 회피하지 않는다.

현재까지 적용한 다음 구조가 실제 읽기 절감의 주 수단이다.

- 화면별 조건부 조회
- 전체 컬렉션 상시 구독 제거
- 관리자 서버 페이지네이션
- `publicCatalog/main` 단일 문서
- `laptopRentalDashboard/main` 요약 문서
- 대시보드 자동 2분 폴링 제거

메모리 캐시는 같은 페이지가 열려 있는 동안 SDK 내부 동작과 응답 지연에 도움을 줄 수 있지만, 서버 동기화가 발생하는 쿼리의 과금 읽기를 제거한다고 보장하지 않는다.

## 6. 보안상 선택 이유

Firestore 웹 영구 캐시는 자동으로 세션 종료 시 삭제되지 않는다. 로그아웃은 Firebase Auth 인증 상태를 해제하지만 IndexedDB에 저장된 Firestore 캐시를 자동으로 안전 삭제하는 절차와 동일하지 않다.

이 프로젝트는 오프라인에서 대여 승인·회원 관리 작업을 수행해야 하는 요구가 없으며, 온라인 연결을 전제로 운영된다. 따라서 오프라인 편의성보다 로그아웃 후 데이터 잔존 방지가 우선이다.

## 7. 변경하지 않은 사항

- 사용자·관리자 화면 문구
- 인증 및 로그아웃 로직
- Firestore Rules
- Firestore 인덱스
- Firebase 프로젝트 연결
- 컬렉션 및 문서 경로
- 기존 읽기 최적화 로직
- 배포 스크립트

## 8. 배포

Rules와 인덱스 변경이 없으므로 Firebase CLI 배포는 필요하지 않다.

```powershell
Set-Location "E:\project\rental-system\test_new"
.\deploy.ps1
```
