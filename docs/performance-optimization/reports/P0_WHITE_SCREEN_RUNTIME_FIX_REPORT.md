# P0 흰 화면 런타임 오류 수정 보고서

## 1. 장애 현상

최신 배포 패키지를 게시한 뒤 브라우저에서 React 화면이 렌더링되지 않고 전체 페이지가 흰 화면으로 표시됐다.

## 2. 직접 원인

`src/App.jsx`에 조직 패널 지연 로딩 브리지를 추가하면서 `useCallback()`을 사용했으나 React named import에 `useCallback`이 포함되지 않았다.

### 수정 전

```jsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
```

아래 코드는 앱 최상위 컴포넌트의 첫 렌더에서 즉시 실행된다.

```jsx
const handleMemberDirectoryDeferredStateChange = useCallback(
  (nextState) => {
    // ...
  },
  []
);
```

브라우저에서는 이 시점에 다음 런타임 오류가 발생한다.

```text
ReferenceError: useCallback is not defined
```

`App` 컴포넌트가 반환되기 전에 예외가 발생하므로 `#root`에 화면이 만들어지지 않고 흰 화면만 남는다.

### 수정 후

```jsx
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
```

## 3. 추가 발견 오류

`src/components/RichTextEditor.jsx`는 다음 상수를 사용하고 있었지만 직접 선언하거나 import하지 않았다.

```text
MIN_FONT_SIZE_PX
MAX_FONT_SIZE_PX
MIN_LINE_HEIGHT
MAX_LINE_HEIGHT
```

해당 상수는 `src/utils/richTextCore.js` 내부에 존재했지만 export되지 않았다. 이 문제는 일반 첫 화면이 아니라 공지사항·FAQ 등의 리치 텍스트 편집기를 열 때 별도의 런타임 오류를 만들 수 있었다.

### 수정 내용

`richTextCore.js`에서 공통 제한값을 export했다.

```js
export const MIN_FONT_SIZE_PX = 8;
export const MAX_FONT_SIZE_PX = 72;
export const MIN_LINE_HEIGHT = 0.8;
export const MAX_LINE_HEIGHT = 3;
```

`RichTextEditor.jsx`에서 이를 정식 import했다.

```jsx
import {
  FONT_SIZE_PRESETS,
  LINE_HEIGHT_PRESETS,
  MAX_FONT_SIZE_PX,
  MAX_LINE_HEIGHT,
  MIN_FONT_SIZE_PX,
  MIN_LINE_HEIGHT,
  RICH_TEXT_BLOCK_SELECTOR,
  // ...
} from '../utils/richTextCore.js';
```

## 4. 흰 화면 재발 방지

### React Hook import 감사

신규 파일:

```text
tools/audit-react-hooks.mjs
```

`src` 전체에서 React 기본 훅을 bare identifier로 호출하면서 named import하지 않은 경우 종료 코드 1로 실패한다.

감사 대상에는 다음 훅이 포함된다.

```text
useState, useEffect, useMemo, useCallback, useRef, useReducer,
useContext, useLayoutEffect, useTransition, useDeferredValue 등
```

`package.json`의 빌드 전 단계는 다음 순서로 변경했다.

```json
{
  "prebuild": "npm run audit:react-hooks && npm run audit:firestore:strict",
  "audit:react-hooks": "node tools/audit-react-hooks.mjs"
}
```

따라서 같은 누락이 다시 들어가면 Vite 빌드 전에 배포가 차단된다.

### 루트 Error Boundary

`src/main.jsx`에서 `App`을 `RootErrorBoundary`로 감쌌다.

향후 렌더 단계의 치명적 예외가 발생하면 빈 화면 대신 다음 안내를 표시한다.

```text
화면을 불러오는 중 오류가 발생했습니다.
새로고침
```

오류 상세는 브라우저 콘솔에도 기록한다.

## 5. 기존 검증에서 누락된 이유

기존 검증은 다음 항목을 중심으로 수행했다.

- JSX/JavaScript 구문 변환
- 상대 import 파일 존재 여부
- Firestore 접근 감사
- 컨텍스트 키 일치

`useCallback`은 문법적으로 올바른 JavaScript 식별자이므로 transpile과 Vite 번들 단계에서 반드시 오류가 되지 않는다. 실제 브라우저가 `App()`을 실행할 때만 미정의 식별자 오류가 발생한다.

따라서 이번에 별도 React Hook import 감사를 추가했다.

## 6. 변경 파일

```text
package.json
src/App.jsx
src/main.jsx
src/components/RichTextEditor.jsx
src/utils/richTextCore.js
tools/audit-react-hooks.mjs
```

문서·검증 파일은 `docs/performance-optimization` 하위에만 저장했다.

## 7. 영향 범위

변경하지 않은 항목:

```text
Firestore Rules
Firestore 인덱스
Firebase 데이터 구조
대여 신청·승인·반납 로직
관리자 조직 패널 업무 동작
화면 className과 정상 화면 디자인
```

## 8. 소스 그래프 변화

| 항목 | 수정 전 | 수정 후 | 변화 |
|---|---:|---:|---:|
| 초기 정적 모듈 | 38개 | 38개 | 동일 |
| 초기 정적 소스 | 810,629 bytes | 812,800 bytes | +2,171 bytes |
| `App.jsx` | 543,123 bytes | 543,136 bytes | +13 bytes |
| `main.jsx` | 기존 단순 마운트 | Error Boundary 포함 | +안전 처리 |

증가분은 루트 오류 안내 UI와 검증 보강을 위한 것이다.

## 9. 배포

Rules와 인덱스 변경은 없으므로 웹만 배포한다.

```powershell
Set-Location "E:\project\rental-system\test_new"
.\deploy.ps1
```
