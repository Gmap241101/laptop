# 프로젝트 패키지 문서 정리 및 자동 교체 구성 보고서

## 적용 내용

프로젝트 루트에 누적되어 있던 성능 최적화 보고서, 검증 결과, diff 및 측정 JSON을 `docs/performance-optimization/` 아래로 이동했습니다.

```text
docs/performance-optimization/
├─ README.md
├─ reports/
├─ validation/
├─ diffs/
└─ measurements/
```

## 자동 생성 경로 변경

- `npm run analyze:source` 결과는 `docs/performance-optimization/measurements/SOURCE_GRAPH_ANALYSIS_REPORT.json`에 생성됩니다.
- 번들 분석 결과와 기준선도 `docs/performance-optimization/measurements/`에 생성됩니다.
- Firestore 감사 임시 결과는 기존대로 `.performance-reports/`에 생성되며 Git 추적에서 제외됩니다.

## PowerShell 패키지 교체

`tools/deployment/replace-project-from-zip.ps1`을 추가했습니다. 이 스크립트는 다음 순서로 동작합니다.

1. ZIP 압축 해제
2. 패키지 내부 SHA-256 검증
3. 교체 대상 기존 파일 백업
4. `package-meta/REMOVED_FILES.txt`의 삭제 대상 제거
5. 새 패키지 파일 덮어쓰기
6. 교체 결과 SHA-256 재검증

`.git`, `node_modules`, `.env` 계열 및 패키지 목록에 없는 로컬 파일은 삭제하지 않습니다.
