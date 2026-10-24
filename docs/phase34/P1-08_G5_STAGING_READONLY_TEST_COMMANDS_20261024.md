# G5 실제 Staging 시험에 사용할 명령

사용자 PC에서 실행. PowerShell 5.1 기준. APP_ENV 및 허용 오리진의 비밀 아닌 설정값만 확인한다.

```powershell
$app = "notebook-rental-api-staging-01"
$api = "https://notebook-rental-api-staging-01-8302cb90b98c.herokuapp.com"
heroku config:get APP_ENV -a $app
heroku config:get CLERK_AUTHORIZED_PARTIES -a $app
heroku config:get CLERK_REJECT_PENDING_SESSION -a $app
heroku config:get CLERK_CLOCK_SKEW_SECONDS -a $app
heroku releases -a $app
heroku pg:backups -a $app
```

아래 HTTP 상태 조회는 **토큰 없이 실행**한다. OFF 404, ON GET 403 / POST 405.

```powershell
$uri = "$api/api/admin/mail-delivery/g5-owner-check"
foreach ($method in @('GET','POST')) {
    try {
        $r = Invoke-WebRequest -Uri $uri -Method $method -UseBasicParsing -ErrorAction Stop
        "$method HTTP $($r.StatusCode)"
    } catch {
        $status = [int]$_.Exception.Response.StatusCode
        "$method HTTP $status"
    }
}
```

최고관리자 성공 시험은 서버에서 플래그를 켠 뒤 UI의 **이메일 알림 > 최고관리자 본인 확인**에서 수행. 브라우저 개발자도구 네트워크 탭에서 G5 GET의 HTTP status만 읽는다. Authorization/Bearer/JWT, 인증코드·세션 쿠키·개인정보를 붙여넣지 않는다.

```powershell
# 검증 종료 후 기능 OFF 복귀(설정 변경에 따른 web dyno 재시작 발생)
heroku config:unset P108_G5_OWNER_READONLY_ENABLED -a notebook-rental-api-staging-01
```
