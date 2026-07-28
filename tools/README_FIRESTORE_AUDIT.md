# Firestore 접근 자동 감사

## 목적

`src` 아래 JavaScript·JSX·MJS 파일에서 다음 Firestore 호출을 자동으로 조사합니다.

- `onSnapshot()`
- `getDocs()`
- `getDoc()`
- `getCountFromServer()`

특히 다음 패턴을 위험 항목으로 분류합니다.

- 증가 가능성이 큰 컬렉션의 전체 실시간 구독
- `where()`는 있지만 `limit()`이 없는 실시간 쿼리
- 증가 가능성이 큰 컬렉션의 전체 일회성 조회
- 화면·유지보수 목적상 의도됐지만 결과 개수 제한이 없는 조회
- 데이터 원본이나 제한 조건을 자동으로 판정하지 못한 리스너

## 실행 명령

일반 보고서 생성:

```powershell
npm run audit:firestore
```

엄격 검사:

```powershell
npm run audit:firestore:strict
```

엄격 검사는 정책 파일에 승인되지 않은 `warning` 또는 `error`가 하나라도 있으면 종료 코드 `1`을 반환합니다.

프로덕션 빌드에는 다음 순서가 자동 적용됩니다.

```text
npm run build
→ prebuild
→ npm run audit:firestore:strict
→ vite build
```

따라서 신규 무제한 리스너나 전체 컬렉션 조회가 검토 없이 추가되면 `deploy.ps1`의 빌드 단계에서 배포가 중단됩니다.

## 결과 파일

감사 결과는 Git에 포함되지 않는 다음 폴더에 생성됩니다.

```text
.performance-reports/firestore-access-audit.json
.performance-reports/firestore-access-audit.txt
```

`deploy.ps1`이 빌드 전후 Git 추적 파일의 변경 여부를 검사하므로, 동적으로 생성되는 보고서는 반드시 `.performance-reports`에 유지해야 합니다.

## 정책 파일

```text
tools/firestore-audit-policy.json
```

정책 파일에는 다음 정보가 있습니다.

- 증가 가능성이 큰 컬렉션 목록
- 현재 의도적으로 허용한 위험 호출 ID
- 각 예외의 승인 사유
- 재검토 조건

승인 ID는 파일 경로, 호출 종류, 위험 규칙, 정규화된 데이터 원본, 동일 표현의 발생 순서를 조합해 생성합니다. 단순 줄 번호 변경으로 승인 상태가 깨지는 것을 줄이면서, 같은 파일에 동일한 위험 호출이 추가되는 경우는 별도 항목으로 검출합니다.

## 신규 경고가 발생했을 때

1. `.performance-reports/firestore-access-audit.txt`에서 파일과 호출 위치를 확인합니다.
2. 가능하면 `where()`, `limit()`, 커서 페이지네이션 또는 화면 조건을 추가해 위험을 제거합니다.
3. 전체 조회가 백업·복원·무결성 검사 등 업무상 반드시 필요한 경우에만 정책 파일에 해당 ID와 구체적인 사유를 추가합니다.
4. 다음 명령으로 다시 검증합니다.

```powershell
npm run audit:firestore:strict
```

다음과 같은 포괄적 사유는 승인 근거로 사용하지 않습니다.

```text
필요해서 사용
기존 코드라서 유지
문제가 없을 것 같음
```

승인 사유에는 실행 화면, 실행 조건, 예상 데이터 범위, 전체 조회가 필요한 이유가 포함돼야 합니다.

## 자동 감사의 한계

이 도구는 Node.js 기본 모듈만 사용하는 정적 분석기입니다. 코드 실행 경로를 실제 브라우저에서 추적하지 않으므로 다음 사항은 별도 확인이 필요합니다.

- 한 화면에서 동시에 활성화되는 실제 리스너 수
- Firestore Security Rules의 `get()`·`exists()` 종속 읽기
- 쿼리 인덱스 항목 스캔량
- 브라우저 재연결과 탭 전환에 따른 실제 읽기량
- 동적으로 생성되는 컬렉션 이름의 의미

정적 감사는 재발 방지 장치이며 Firebase 콘솔 사용량과 실제 화면 프로파일링을 대체하지 않습니다.
