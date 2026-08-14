import { useEffect, useRef, useState } from 'react';
import { clerkStagingClient } from '../clerk/clerkStagingClient.js';

const CODE_LENGTH = 6;

const normalizeVerificationCode = (value) =>
  String(value || '').replace(/\D/g, '').slice(0, CODE_LENGTH);

const getErrorCode = (error) =>
  error?.errors?.[0]?.code || error?.code || error?.message || 'client_trust_resend_failed';

export default function DeviceTrustVerificationPanel({
  code = '',
  email = '',
  onChange,
  onSubmit,
  surface = 'user',
  disabled = false,
}) {
  const inputRefs = useRef([]);
  const [resending, setResending] = useState(false);
  const [resendStatus, setResendStatus] = useState(null);
  const normalizedCode = normalizeVerificationCode(code);
  const digits = Array.from({ length: CODE_LENGTH }, (_, index) => normalizedCode[index] || '');
  const destination = String(email || '').trim() || '로그인 이메일';

  useEffect(() => {
    setResendStatus(null);
  }, [destination, surface]);

  const commitCode = (nextCode, focusIndex = null) => {
    onChange?.(normalizeVerificationCode(nextCode));
    if (Number.isInteger(focusIndex)) {
      window.requestAnimationFrame(() => inputRefs.current[focusIndex]?.focus());
    }
  };

  const handleDigitChange = (index, rawValue) => {
    const incoming = normalizeVerificationCode(rawValue);
    if (!incoming) {
      const nextDigits = [...digits];
      nextDigits[index] = '';
      commitCode(nextDigits.join(''));
      return;
    }

    const nextDigits = [...digits];
    incoming.split('').forEach((digit, offset) => {
      const targetIndex = index + offset;
      if (targetIndex < CODE_LENGTH) nextDigits[targetIndex] = digit;
    });
    const nextFocusIndex = Math.min(index + incoming.length, CODE_LENGTH - 1);
    commitCode(nextDigits.join(''), nextFocusIndex);
  };

  const handlePaste = (event) => {
    const pasted = normalizeVerificationCode(event.clipboardData?.getData('text'));
    if (!pasted) return;
    event.preventDefault();
    commitCode(pasted, Math.min(pasted.length, CODE_LENGTH) - 1);
  };

  const handleKeyDown = (event, index) => {
    if (event.key === 'Backspace' && !digits[index] && index > 0) {
      event.preventDefault();
      const nextDigits = [...digits];
      nextDigits[index - 1] = '';
      commitCode(nextDigits.join(''), index - 1);
      return;
    }

    if (event.key === 'ArrowLeft' && index > 0) {
      event.preventDefault();
      inputRefs.current[index - 1]?.focus();
      return;
    }

    if (event.key === 'ArrowRight' && index < CODE_LENGTH - 1) {
      event.preventDefault();
      inputRefs.current[index + 1]?.focus();
      return;
    }

    if (event.key === 'Enter' && normalizedCode.length === CODE_LENGTH) {
      event.preventDefault();
      onSubmit?.();
    }
  };

  const resendCode = async () => {
    if (resending || disabled) return;
    setResending(true);
    setResendStatus(null);
    try {
      if (surface === 'admin') {
        await clerkStagingClient.resendAdminClientTrust();
      } else {
        await clerkStagingClient.resendUserClientTrust();
      }
      setResendStatus({
        type: 'success',
        message: `${destination}로 인증코드를 다시 보냈습니다.`,
      });
    } catch (error) {
      setResendStatus({
        type: 'error',
        message: `인증코드 재발송에 실패했습니다. 오류 코드: ${getErrorCode(error)}`,
      });
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-sky-200 bg-sky-50 px-5 py-4 text-sm leading-6 text-sky-900">
        새로운 기기에서 로그인하셨습니다. <span className="font-bold">{destination}</span>로 보낸 인증코드를 입력해주세요.
      </div>

      <fieldset disabled={disabled} className="space-y-2">
        <legend className="text-xs font-semibold tracking-wide text-slate-600">6자리 인증코드</legend>
        <div className="flex justify-center gap-2 sm:gap-2.5" onPaste={handlePaste}>
          {digits.map((digit, index) => (
            <input
              key={index}
              ref={(node) => {
                inputRefs.current[index] = node;
              }}
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={1}
              value={digit}
              onChange={(event) => handleDigitChange(index, event.target.value)}
              onKeyDown={(event) => handleKeyDown(event, index)}
              onFocus={(event) => event.currentTarget.select()}
              autoComplete={index === 0 ? 'one-time-code' : 'off'}
              aria-label={`인증코드 ${index + 1}번째 자리`}
              autoFocus={index === 0}
              className="h-12 w-11 rounded-xl border border-slate-300 bg-white text-center text-xl font-black tabular-nums text-slate-900 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200 disabled:cursor-not-allowed disabled:bg-slate-100 sm:h-14 sm:w-12"
            />
          ))}
        </div>
      </fieldset>

      <label className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs leading-5 text-slate-600">
        <input
          type="checkbox"
          checked
          readOnly
          disabled
          className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 accent-slate-900"
        />
        <span>
          <span className="block font-bold text-slate-800">인증 완료 후 이 브라우저를 신뢰된 기기로 인식</span>
          Clerk Device Trust가 자동 적용되며 로그인별로 체크를 해제하는 옵션은 제공되지 않습니다. 브라우저 인증 cookie가 유지되는 동안에는 같은 브라우저에서 새 기기 인증을 다시 요구하지 않을 수 있습니다.
        </span>
      </label>

      <div className="space-y-2 text-center">
        <button
          type="button"
          onClick={resendCode}
          disabled={disabled || resending}
          className="text-xs font-bold text-slate-700 underline underline-offset-4 hover:text-slate-950 disabled:cursor-not-allowed disabled:text-slate-400"
        >
          {resending ? '인증코드 다시 보내는 중...' : '인증코드 다시 보내기'}
        </button>
        {resendStatus ? (
          <p className={`text-xs font-semibold ${resendStatus.type === 'error' ? 'text-rose-600' : 'text-emerald-700'}`}>
            {resendStatus.message}
          </p>
        ) : null}
      </div>
    </div>
  );
}
