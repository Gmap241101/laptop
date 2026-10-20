import { useEffect, useRef } from 'react';
import {
  VERIFICATION_CODE_LENGTH,
  isCompleteVerificationCode,
  normalizeVerificationCode,
  splitVerificationCode,
  updateVerificationCodeDigit,
} from './verificationCodeInputModel.js';

/**
 * Same six separate boxes as the login verification UI. Pasting all six
 * digits into any box fills the entire code; no digit is submitted early.
 */
export default function SixDigitVerificationCodeInput({
  value = '',
  onChange,
  onSubmit,
  disabled = false,
  label = '이메일 확인 코드',
  id = 'backup-reverify-code',
}) {
  const inputRefs = useRef([]);
  const normalized = normalizeVerificationCode(value);
  const digits = splitVerificationCode(normalized);

  useEffect(() => {
    inputRefs.current[0]?.focus();
  }, []);

  const focusBox = (index) => {
    if (!Number.isInteger(index)) return;
    requestAnimationFrame(() => inputRefs.current[index]?.focus());
  };

  const commit = (code, focusIndex = null) => {
    onChange?.(normalizeVerificationCode(code));
    focusBox(focusIndex);
  };

  const changeDigit = (index, raw) => {
    const result = updateVerificationCodeDigit(normalized, index, raw);
    commit(result.code, result.focusIndex);
  };

  const pasteCode = (event) => {
    const pasted = normalizeVerificationCode(event.clipboardData?.getData('text'));
    if (!pasted) return;
    event.preventDefault();
    // A six-digit copied email code always replaces the entire field.
    commit(pasted, Math.min(pasted.length, VERIFICATION_CODE_LENGTH) - 1);
  };

  const handleKeyDown = (event, index) => {
    if (event.key === 'Backspace' && !digits[index] && index > 0) {
      event.preventDefault();
      const copy = [...digits];
      copy[index - 1] = '';
      commit(copy.join(''), index - 1);
      return;
    }
    if (event.key === 'ArrowLeft' && index > 0) {
      event.preventDefault();
      inputRefs.current[index - 1]?.focus();
    } else if (event.key === 'ArrowRight' && index < VERIFICATION_CODE_LENGTH - 1) {
      event.preventDefault();
      inputRefs.current[index + 1]?.focus();
    } else if (event.key === 'Enter' && isCompleteVerificationCode(normalized) && !disabled) {
      event.preventDefault();
      onSubmit?.();
    }
  };

  return (
    <fieldset disabled={disabled} className="min-w-0">
      <legend id={`${id}-legend`} className="mb-2 text-sm font-semibold text-slate-800">{label}</legend>
      <div className="flex items-center gap-1.5 sm:gap-2" onPaste={pasteCode} role="group" aria-labelledby={`${id}-legend`}>
        {digits.map((digit, index) => (
          <input
            key={index}
            id={index === 0 ? id : `${id}-${index + 1}`}
            ref={(node) => { inputRefs.current[index] = node; }}
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={1}
            autoComplete={index === 0 ? 'one-time-code' : 'off'}
            value={digit}
            aria-label={`${label} ${index + 1}번째 자리`}
            onChange={(event) => changeDigit(index, event.currentTarget.value)}
            onKeyDown={(event) => handleKeyDown(event, index)}
            onFocus={(event) => event.currentTarget.select()}
            className="h-11 w-9 rounded-xl border border-slate-300 bg-white text-center text-lg font-bold tabular-nums text-slate-900 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200 disabled:cursor-not-allowed disabled:bg-slate-100 sm:h-12 sm:w-11"
          />
        ))}
      </div>
    </fieldset>
  );
}
