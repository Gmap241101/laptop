import {
  DOMESTIC_PHONE_PREFIXES,
  normalizePhoneDigits,
  normalizePhoneMiddleDigits,
} from '../utils/memberPolicy.js';

export default function DomesticPhoneInput({
  label = '연락처',
  prefix,
  middle,
  last,
  onChange,
  disabled = false,
}) {
  const update = (next) => {
    onChange({
      prefix,
      middle,
      last,
      ...next,
    });
  };

  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold tracking-wide text-slate-600">
        {label}
      </span>

      <div className="grid grid-cols-[minmax(5rem,0.8fr)_auto_minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
        <select
          value={prefix}
          onChange={(event) => update({ prefix: event.target.value })}
          disabled={disabled}
          aria-label={`${label} 앞자리`}
          className="min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition mk-form-focus disabled:bg-slate-100"
        >
          {DOMESTIC_PHONE_PREFIXES.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>

        <span className="text-sm text-slate-400">-</span>

        <input
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={4}
          value={middle}
          onChange={(event) =>
            update({ middle: normalizePhoneMiddleDigits(event.target.value) })
          }
          disabled={disabled}
          aria-label={`${label} 가운데 자리`}
          placeholder="1234"
          className="min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-center text-sm outline-none transition mk-form-focus disabled:bg-slate-100"
        />

        <span className="text-sm text-slate-400">-</span>

        <input
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={4}
          value={last}
          onChange={(event) =>
            update({ last: normalizePhoneDigits(event.target.value, 4) })
          }
          disabled={disabled}
          aria-label={`${label} 끝자리`}
          placeholder="5678"
          className="min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-center text-sm outline-none transition mk-form-focus disabled:bg-slate-100"
        />
      </div>

      <span className="mt-1.5 block text-[11px] leading-4 text-slate-400">
        국내 이동전화, 인터넷전화, 대표번호 또는 지역번호를 선택하고 숫자만 입력해 주세요.
      </span>
    </label>
  );
}
