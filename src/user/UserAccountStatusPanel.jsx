const STATUS_CONTENT = {
  signupPendingComplete: {
    tone: 'emerald',
    title: '가입 신청이 완료되었습니다.',
    description: '관리자 승인 후 서비스를 이용할 수 있습니다. 승인이 완료된 후 로그인해 주세요.',
    primaryLabel: '로그인하기',
    primaryAction: 'login',
    secondaryLabel: '홈으로',
  },
  signupAutoApprovedComplete: {
    tone: 'emerald',
    title: '회원가입이 완료되었습니다.',
    description: '가입 정보가 확인되어 지금부터 서비스를 이용할 수 있습니다.',
    primaryLabel: '서비스 이용하기',
    primaryAction: 'service',
    secondaryLabel: '홈으로',
  },
  loginPending: {
    tone: 'amber',
    title: '가입 승인 대기 상태입니다.',
    description: '관리자 승인 후 서비스를 이용할 수 있습니다. 승인이 완료된 후 다시 로그인해 주세요.',
    primaryLabel: '로그인 화면으로',
    primaryAction: 'login',
    secondaryLabel: '홈으로',
  },
  loginBlocked: {
    tone: 'rose',
    title: '이용 중지 상태입니다.',
    description: '현재 계정으로 서비스를 이용할 수 없습니다. 자세한 사항은 관리자에게 문의해 주세요.',
    primaryLabel: '로그인 화면으로',
    primaryAction: 'login',
    secondaryLabel: '홈으로',
  },
  loginRetired: {
    tone: 'slate',
    title: '이용이 종료된 계정입니다.',
    description: '현재 계정으로 로그인할 수 없습니다. 계정 이용이 필요한 경우 관리자에게 문의해 주세요.',
    primaryLabel: '로그인 화면으로',
    primaryAction: 'login',
    secondaryLabel: '홈으로',
  },
  passwordResetSent: {
    tone: 'emerald',
    title: '비밀번호 재설정 안내를 전송했습니다.',
    description: '입력한 이메일로 가입된 계정이 있다면 비밀번호 재설정 메일이 발송됩니다. 받은편지함과 스팸함을 확인해 주세요.',
    primaryLabel: '로그인하기',
    primaryAction: 'login',
    secondaryLabel: '홈으로',
  },
  withdrawalComplete: {
    tone: 'slate',
    title: '회원 탈퇴가 완료되었습니다.',
    description: '계정의 개인정보가 처리되었으며 더 이상 로그인할 수 없습니다.',
    primaryLabel: '홈으로',
    primaryAction: 'home',
    secondaryLabel: '',
  },
};

const TONE_CLASS = {
  emerald: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  amber: 'border-amber-200 bg-amber-50 text-amber-900',
  rose: 'border-rose-200 bg-rose-50 text-rose-900',
  slate: 'border-slate-200 bg-slate-50 text-slate-900',
};

export default function UserAccountStatusPanel({ ctx }) {
  const {
    Button,
    Card,
    CardContent,
    CheckCircle2,
    Clock,
    AlertCircle,
    UserCircle,
    goToProtectedUserTab,
    goToUserHome,
    goToUserLogin,
    userAccountStatusView,
  } = ctx;

  const content = STATUS_CONTENT[userAccountStatusView?.type] || STATUS_CONTENT.loginRetired;
  const Icon = content.tone === 'emerald'
    ? CheckCircle2
    : content.tone === 'amber'
      ? Clock
      : content.tone === 'rose'
        ? AlertCircle
        : UserCircle;

  const runAction = (action) => {
    if (action === 'service') {
      goToProtectedUserTab('rental');
      return;
    }

    if (action === 'login') {
      goToUserLogin();
      return;
    }

    goToUserHome();
  };

  return (
    <Card className="mx-auto max-w-2xl overflow-hidden border-slate-200 bg-white shadow-sm">
      <div className="relative overflow-hidden bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 px-6 py-9 text-white">
        <div className="absolute -right-12 -top-12 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
        <div className="absolute -bottom-16 left-10 h-44 w-44 rounded-full bg-orange-400/20 blur-3xl" />
        <div className="relative flex items-center gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/15">
            <Icon size={27} />
          </div>
          <div>
            <h2 className="text-xl font-black tracking-tight">{content.title}</h2>
            <p className="mt-2 text-xs leading-5 text-slate-300">계정 처리 결과를 확인해 주세요.</p>
          </div>
        </div>
      </div>

      <CardContent className="p-6">
        <div className={`rounded-2xl border px-5 py-5 text-sm leading-7 ${TONE_CLASS[content.tone]}`}>
          {content.description}
        </div>

        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          {content.secondaryLabel ? (
            <Button type="button" variant="outline" onClick={goToUserHome}>
              {content.secondaryLabel}
            </Button>
          ) : null}
          <Button type="button" variant="primary" onClick={() => runAction(content.primaryAction)}>
            {content.primaryLabel}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
