# GitHub Education 전환 Phase 2 - Node/PostgreSQL Backend 기반

## 기준선

- 이전 기준본: `rental-system-github-education-phase1-deployment-guard-20260807_deployment_package.zip`
- 운영 브랜치/도메인: `gh-pages` / `https://notebook.recruit.kro.kr`
- 테스트 소스 브랜치: `gh-pages-3`
- 기존 Firebase Production: 유지

## Phase 2 목적

기존 React/Firebase 기능을 변경하지 않고, GitHub Education의 Heroku 혜택을 사용할 수 있도록 별도 Node.js API와 PostgreSQL migration 기반을 추가한다.

이번 단계에서는 업무 API, Clerk 인증, Firebase 데이터 이전을 시작하지 않는다. 새 서버의 외부 API는 health/readiness만 제공한다.

## 추가된 Backend 구조

```text
server/
├─ package.json
├─ package-lock.json
├─ README.md
├─ migrations/
│  └─ 001_phase2_platform_baseline.sql
├─ scripts/
│  ├─ check-config.mjs
│  └─ migrate.mjs
└─ src/
   ├─ app.mjs
   ├─ index.mjs
   ├─ config/
   │  └─ env.mjs
   └─ db/
      └─ pool.mjs
```

루트에는 Heroku 프로세스 정의용 `Procfile`과 Backend 검증 도구가 추가되었다.

## 런타임 및 패키지

- Node.js: `22.x`
- npm: `10.x`
- 신규 서버 전용 외부 패키지: `pg@8.22.0`
- Express 등 웹 프레임워크는 추가하지 않았다.
- HTTP 서버/라우팅은 Node.js built-in `node:http`를 사용한다.

Heroku는 루트 `package.json`을 Node app으로 인식하므로 루트에 Node engine을 명시했다. 서버 dependency는 `server/package-lock.json`으로 별도 고정하여 기존 Frontend dependency tree와 분리했다.

## Heroku Build 동작

루트 package에 다음 스크립트를 추가했다.

- `server:prepare`
- `server:check`
- `server:smoke`
- `server:config:check`
- `db:migrate`
- `heroku-build`
- `heroku-postbuild`

Heroku classic buildpack과 Cloud Native Buildpack의 build hook 차이를 모두 수용하기 위해 `heroku-build`와 `heroku-postbuild`가 같은 idempotent 준비 스크립트를 호출한다.

준비 스크립트는 `server/node_modules/pg` 버전을 먼저 확인하고, 없거나 버전이 다를 때만 `npm --prefix server ci --omit=dev`를 실행한다.

## Procfile

```text
release: npm --prefix server run db:migrate
web: npm --prefix server start
```

Release Phase에서 migration이 실패하면 web release가 시작되지 않도록 구성했다.

## PostgreSQL 연결

서버는 `DATABASE_URL`을 필수로 요구한다.

- `DATABASE_SSL_MODE=auto`: localhost는 non-SSL, 원격 DB는 SSL
- Heroku에서는 `DATABASE_SSL_MODE=require` 권장
- SSL 연결 시 `rejectUnauthorized: false`를 사용하여 Heroku Postgres Node 연결 방식과 맞춘다.
- 기본 pool size: 5
- pool size 허용 범위: 1~10
- connection timeout 기본: 5초
- idle timeout 기본: 10초

DB URL 자체나 password는 log/API 응답에 출력하지 않는다.

## Migration runner

`server/scripts/migrate.mjs`는 다음을 보장한다.

1. migration 파일명 정렬
2. SHA-256 checksum 계산
3. PostgreSQL advisory transaction lock 획득
4. `schema_migrations` 이력 테이블 생성
5. 이미 적용된 migration은 skip
6. 적용된 migration 내용이 변경되면 checksum mismatch로 즉시 실패
7. 전체 migration을 transaction 안에서 실행
8. 실패 시 `ROLLBACK`

적용된 migration 파일은 수정하지 않고 반드시 다음 번호 migration을 추가해야 한다.

## Phase 2 DB Schema

업무 데이터를 아직 설계하지 않는다.

현재 생성하는 것은 migration 관리용 `schema_migrations`와 플랫폼 메타데이터용 `app_runtime_metadata`뿐이다.

Firebase collection을 바로 SQL table로 복사하지 않은 이유는 Phase 3/4에서 인증 identity와 업무 관계를 먼저 확정한 뒤 PK/FK/UNIQUE constraint를 설계하기 위해서다.

## Health API

### `GET /health/live`

프로세스 liveness만 검사한다. DB query를 수행하지 않는다.

### `GET /health`

PostgreSQL에 실제 `SELECT`를 수행한다.

정상:

```json
{
  "service": "rental-api",
  "environment": "staging",
  "version": "phase2",
  "status": "ok",
  "database": {
    "status": "ok",
    "latencyMs": 12
  }
}
```

DB 연결 실패 시 HTTP 503과 `database.status=unavailable`을 반환하며 내부 DB 주소나 오류 상세는 응답에 노출하지 않는다.

`GET /health/ready`는 `/health` alias이다.

## CORS

`CORS_ALLOWED_ORIGINS`는 쉼표로 구분한 exact origin allow-list다.

예:

```text
https://<VERCEL_STAGING_DOMAIN>,https://notebook.recruit.kro.kr
```

staging/production 환경에서는 값이 없으면 서버가 시작하지 않는다. wildcard origin은 기본 허용하지 않는다.

## 환경 변수

배포 패키지에는 `.env`, `.env.*`, `.env.example` 등 `.env*` 파일을 포함하지 않는다. 설정 예시는 `docs/github-education/HEROKU_CONFIG_VARS_TEMPLATE.txt`로 관리한다.

Frontend 공개 변수:

- `VITE_API_URL` (Phase 2에서는 아직 미사용)

Backend 비공개/운영 변수:

- `DATABASE_URL`
- `APP_ENV`
- `DATABASE_SSL_MODE`
- `DB_POOL_MAX`
- `DB_CONNECTION_TIMEOUT_MS`
- `DB_IDLE_TIMEOUT_MS`
- `CORS_ALLOWED_ORIGINS`

`DATABASE_URL`은 Vite `VITE_*` 변수로 절대 노출하지 않는다.

## Heroku Staging 생성 절차

실제 Heroku 계정 로그인/Student benefit redeem 및 리소스 생성은 외부 계정 권한이 필요하므로 이 패키지에서는 코드/배포 구성을 준비한다.

Heroku CLI에서 사용할 순서는 다음과 같다.

```text
heroku login
heroku create <HEROKU_STAGING_APP>
heroku addons:create heroku-postgresql:essential-0 -a <HEROKU_STAGING_APP>
heroku pg:wait -a <HEROKU_STAGING_APP>
heroku config:set APP_ENV=staging DATABASE_SSL_MODE=require DB_POOL_MAX=5 SERVICE_VERSION=phase2 CORS_ALLOWED_ORIGINS="https://<VERCEL_STAGING_DOMAIN>" -a <HEROKU_STAGING_APP>
git push heroku gh-pages-3:main
```

`DATABASE_URL`은 Postgres add-on 연결 시 Heroku가 자동 관리하므로 수동 복사해 소스에 저장하지 않는다.

배포 후 확인:

```text
https://<HEROKU_STAGING_APP>.herokuapp.com/health/live
https://<HEROKU_STAGING_APP>.herokuapp.com/health
```

둘 다 정상이어야 Phase 3 Clerk 인증 작업으로 넘어간다.

## Phase 2 비변경 영역

- `src/App.jsx`
- Firebase Auth
- Firestore query/write/transaction/realtime 코드
- Firestore Rules/indexes
- 사용자/관리자 UI
- Vercel rewrites
- `public/CNAME`
- `gh-pages` production 배포 흐름
- 기존 Production DB 데이터

## 다음 단계

Phase 3에서 Clerk를 Backend에 먼저 연결하고 server-side JWT verification 기반을 만든다. 기존 Firebase Auth를 바로 삭제하지 않고, `gh-pages-3`에서 인증 경계를 병행 검증한 뒤 사용자 로그인 흐름을 순차 전환한다.
