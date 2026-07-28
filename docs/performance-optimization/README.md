# 성능 최적화 작업 문서

프로젝트 루트가 보고서 파일로 혼잡해지지 않도록 성능 최적화 관련 산출물을 이 폴더에서 관리합니다.

## 폴더 구조

- `reports/`: 단계별 작업 및 변경 보고서
- `validation/`: 구문, import, Firestore 감사 및 패키지 검증 결과
- `diffs/`: 단계별 수정 전후 diff
- `measurements/`: 소스 그래프, 번들 분석, 비교 기준선 등 측정 결과

## 자동 생성 경로

다음 명령의 결과도 `measurements/`에 생성됩니다.

```powershell
npm run analyze:source
npm run analyze:bundle
npm run analyze:bundle:baseline
npm run analyze:bundle:compare
```

Firestore 접근 감사의 실행별 임시 결과는 기존과 같이 `.performance-reports/`에 생성되며 Git 추적 대상에서 제외됩니다.
## 최신 긴급 수정

- `reports/P0_WHITE_SCREEN_RUNTIME_FIX_REPORT.md`
- `validation/P0_WHITE_SCREEN_RUNTIME_FIX_VALIDATION_REPORT.txt`
- `diffs/P0_WHITE_SCREEN_RUNTIME_FIX.diff`
- `measurements/P0_WHITE_SCREEN_RUNTIME_FIX_SOURCE_GRAPH_COMPARISON.json`


## 최신 순차 작업

- `reports/P2_ADMIN_REQUEST_STATUS_MUTATION_SERVICE_SPLIT_REPORT.md`
- `validation/P2_ADMIN_REQUEST_STATUS_MUTATION_SERVICE_SPLIT_VALIDATION_REPORT.txt`
- `diffs/P2_ADMIN_REQUEST_STATUS_MUTATION_SERVICE_SPLIT.diff`
- `measurements/P2_ADMIN_REQUEST_STATUS_MUTATION_SERVICE_SOURCE_GRAPH_COMPARISON.json`

## 최신 사용자 기능 긴급 수정

- `reports/P0_USER_REQUEST_AUTH_FLOW_FIX_REPORT.md`
- `validation/P0_USER_REQUEST_AUTH_FLOW_FIX_VALIDATION_REPORT.txt`
- `diffs/P0_USER_REQUEST_AUTH_FLOW_FIX.diff`
- `measurements/P0_USER_REQUEST_AUTH_FLOW_FIX_SOURCE_GRAPH_COMPARISON.json`
