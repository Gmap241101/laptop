import { useEffect, useRef, useState } from 'react';

import { statusStyle } from '../constants/appConstants.js';
import {
  formatDate,
  formatDateWithKoreanWeekday,
} from '../utils/appUtils.js';


export function AdminPageHeader({ title, description, actions = null, badge = null }) {
  return (
    <div className="relative -mx-6 -mt-6 overflow-hidden bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 px-6 py-6 text-white shadow-sm">
      <div className="pointer-events-none absolute -right-12 -top-16 h-40 w-40 rounded-full bg-white/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-20 left-16 h-44 w-44 rounded-full bg-orange-400/10 blur-3xl" />

      <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-xl font-black tracking-tight text-white">{title}</h2>
          {description ? (
            <p className="mt-1.5 max-w-4xl text-xs leading-5 text-slate-300">
              {description}
            </p>
          ) : null}
        </div>

        {actions || badge ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {badge}
            {actions}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function Card({ children, className = '' }) {
  return (
    <div className={`rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden ${className}`}>
      {children}
    </div>
  );
}

export function CardContent({ children, className = '' }) {
  return <div className={`p-6 ${className}`}>{children}</div>;
}

export function Badge({ children }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold shadow-sm ${statusStyle[children] || 'bg-slate-100 text-slate-700 border-slate-200'}`}>
      {children}
    </span>
  );
}

export function StatCard({ icon: Icon, label, value, tone = 'slate' }) {
  const toneMap = {
    slate: 'bg-slate-50 text-slate-700 border-slate-200',
    green: 'bg-emerald-50 text-emerald-700 border-emerald-100',
    amber: 'bg-amber-50 text-amber-700 border-amber-100',
    sky: 'bg-sky-50 text-sky-700 border-sky-100',
    blue: 'bg-blue-50 text-blue-700 border-blue-100',
    rose: 'bg-rose-50 text-rose-700 border-rose-100',
  };
  return (
    <Card>
      <CardContent className="px-2 py-[7px] sm:hidden">
        <div className="flex min-h-[30px] items-center justify-center gap-1">
          <div className={`shrink-0 rounded-xl border p-1.5 ${toneMap[tone].split(' ')[0]} ${toneMap[tone].split(' ')[2]}`}>
            <Icon className={`${toneMap[tone].split(' ')[1]} h-3.5 w-3.5`} />
          </div>
          <div className="max-w-[4.75rem] whitespace-normal break-keep text-left text-[10px] font-medium leading-tight text-slate-500">
            {label}
          </div>
        </div>
        <div className="mt-1 text-center text-lg font-bold leading-none text-slate-900">
          {value}
        </div>
      </CardContent>

      <CardContent className="hidden items-center gap-4 p-5 text-left sm:flex">
        <div className={`rounded-2xl border p-3 ${toneMap[tone].split(' ')[0]} ${toneMap[tone].split(' ')[2]}`}>
          <Icon className={`${toneMap[tone].split(' ')[1]} h-[22px] w-[22px]`} />
        </div>
        <div>
          <div className="text-xs font-medium uppercase tracking-wider text-slate-500">{label}</div>
          <div className="mt-0.5 text-2xl font-bold text-slate-900">{value}</div>
        </div>
      </CardContent>
    </Card>
  );
}

export function Button({ children, className = '', onClick, variant = 'primary', ...props }) {
  const baseStyle = "inline-flex items-center justify-center gap-2 font-medium rounded-xl text-sm transition-all duration-150 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none px-4 py-2.5";
  const variants = {
    primary: "mk-btn-primary",
    secondary: "bg-slate-100 text-slate-700 hover:bg-slate-200",
    outline: "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
    ghost: "bg-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-950",
    danger: "bg-rose-600 text-white hover:bg-rose-700 shadow-sm",
    dangerOutline: "border border-rose-200 bg-white text-rose-600 hover:bg-rose-50"
  };
  return (
    <button onClick={onClick} className={`${baseStyle} ${variants[variant]} ${className}`} {...props}>
      {children}
    </button>
  );
}

export function Input({ label, value, onChange, type = 'text', placeholder = '', ...props }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold text-slate-600 tracking-wide">{label}</span>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm outline-none transition mk-form-focus"
        {...props}
      />
    </label>
  );
}

export function DateInputWithWeekday({ label, value, onChange, onDateBlur, onInvalidDate, min, max, ...props }) {
  const yearRef = useRef(null);
  const monthRef = useRef(null);
  const dayRef = useRef(null);
  const calendarInputRef = useRef(null);
  const skipNextEditorBlurRef = useRef(false);
  const pendingSegmentFocusRef = useRef(null);
  const [isFocused, setIsFocused] = useState(false);

  const splitDateToParts = (dateStr) => {
    const [year = '', month = '', day = ''] = String(dateStr || '').split('-');

    return {
      year: year.slice(0, 4),
      month: month.slice(0, 2),
      day: day.slice(0, 2),
    };
  };

  const [dateParts, setDateParts] = useState(() => splitDateToParts(value));

    useEffect(() => {
      if (!isFocused) {
        setDateParts(splitDateToParts(value));
      }
    }, [value, isFocused]);

    useEffect(() => {
    if (!isFocused || !pendingSegmentFocusRef.current) {
      return;
    }

    const targetSegment = pendingSegmentFocusRef.current;
    pendingSegmentFocusRef.current = null;

    if (targetSegment === 'year') {
      focusInput(yearRef);
    }

    if (targetSegment === 'month') {
      focusInput(monthRef);
    }

    if (targetSegment === 'day') {
      focusInput(dayRef);
    }
  }, [isFocused]);

  const getDateFromParts = (parts) => {
    if (
      parts.year.length !== 4 ||
      parts.month.length !== 2 ||
      parts.day.length !== 2
    ) {
      return '';
    }

    return `${parts.year}-${parts.month}-${parts.day}`;
  };

  const isValidDateValue = (dateStr) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateStr || ''))) {
      return false;
    }

    const parsedDate = new Date(`${dateStr}T00:00:00Z`);

    if (Number.isNaN(parsedDate.getTime())) {
      return false;
    }

    return formatDate(parsedDate) === dateStr;
  };

  const focusInput = (ref) => {
    requestAnimationFrame(() => {
      ref.current?.focus();
      ref.current?.select();
    });
  };

  const selectSegmentInput = (e) => {
    const target = e.currentTarget;

    requestAnimationFrame(() => {
      target.select();
    });
  };

  const blurSegmentInputs = () => {
    skipNextEditorBlurRef.current = true;

    yearRef.current?.blur();
    monthRef.current?.blur();
    dayRef.current?.blur();

    requestAnimationFrame(() => {
      skipNextEditorBlurRef.current = false;
    });
  };

  const commitDateValue = (nextValue, shouldUseBlurHandler = false) => {
    if (!nextValue) {
      return '';
    }

    const committedValue =
      shouldUseBlurHandler && onDateBlur
        ? onDateBlur(nextValue)
        : onChange(nextValue);

    const finalValue = typeof committedValue === 'string' ? committedValue : nextValue;

    setDateParts(splitDateToParts(finalValue));

    return finalValue;
  };

  const finishWithCandidateDate = (candidateDate) => {
    const finalValue = commitDateValue(candidateDate);
    setDateParts(splitDateToParts(finalValue));
    setIsFocused(false);
    blurSegmentInputs();

    return finalValue;
  };

  const checkPartialRangeAndResetIfNeeded = (nextParts, level) => {
    const minParts = splitDateToParts(min);
    const maxParts = splitDateToParts(max);

    if (level === 'year' && nextParts.year.length === 4) {
      if (minParts.year && nextParts.year < minParts.year) {
        finishWithCandidateDate(`${nextParts.year}-01-01`);
        return true;
      }

      if (maxParts.year && nextParts.year > maxParts.year) {
        finishWithCandidateDate(`${nextParts.year}-12-31`);
        return true;
      }
    }

    if (
      level === 'month' &&
      nextParts.year.length === 4 &&
      nextParts.month.length === 2
    ) {
      const monthNumber = Number(nextParts.month);

      if (monthNumber < 1 || monthNumber > 12) {
        onInvalidDate?.();
        setDateParts(splitDateToParts(value));
        setIsFocused(false);
        blurSegmentInputs();
        return true;
      }

      const typedYearMonth = `${nextParts.year}-${nextParts.month}`;
      const minYearMonth = minParts.year && minParts.month ? `${minParts.year}-${minParts.month}` : '';
      const maxYearMonth = maxParts.year && maxParts.month ? `${maxParts.year}-${maxParts.month}` : '';

      if (minYearMonth && typedYearMonth < minYearMonth) {
        finishWithCandidateDate(`${nextParts.year}-${nextParts.month}-01`);
        return true;
      }

      if (maxYearMonth && typedYearMonth > maxYearMonth) {
        finishWithCandidateDate(`${nextParts.year}-${nextParts.month}-01`);
        return true;
      }
    }

    return false;
  };

  const handleYearChange = (rawValue) => {
    const nextYear = String(rawValue || '').replace(/\D/g, '').slice(0, 4);
    const nextParts = {
      ...dateParts,
      year: nextYear,
    };

    setDateParts(nextParts);

    if (nextYear.length === 4) {
      if (checkPartialRangeAndResetIfNeeded(nextParts, 'year')) {
        return;
      }

      focusInput(monthRef);
    }
  };

  const handleMonthChange = (rawValue) => {
    let nextMonth = String(rawValue || '').replace(/\D/g, '').slice(0, 2);

    if (nextMonth.length === 1 && Number(nextMonth) > 1) {
      nextMonth = `0${nextMonth}`;
    }

    const nextParts = {
      ...dateParts,
      month: nextMonth,
    };

    setDateParts(nextParts);

    if (nextMonth.length === 2) {
      if (checkPartialRangeAndResetIfNeeded(nextParts, 'month')) {
        return;
      }

      focusInput(dayRef);
    }
  };

  const handleDayChange = (rawValue) => {
    let nextDay = String(rawValue || '').replace(/\D/g, '').slice(0, 2);

    if (nextDay.length === 1 && Number(nextDay) > 3) {
      nextDay = `0${nextDay}`;
    }

    const nextParts = {
      ...dateParts,
      day: nextDay,
    };

    setDateParts(nextParts);

    const nextDate = getDateFromParts(nextParts);

    if (!nextDate) {
      return;
    }

    if (!isValidDateValue(nextDate)) {
      onInvalidDate?.();
      setDateParts(splitDateToParts(value));
      setIsFocused(false);
      blurSegmentInputs();
      return;
    }

const finalValue = commitDateValue(nextDate);

    setDateParts(splitDateToParts(finalValue));
    setIsFocused(false);
    blurSegmentInputs();
  };

  const handleEditorBlur = (e) => {
    if (skipNextEditorBlurRef.current) {
      return;
    }

    if (e.currentTarget.contains(e.relatedTarget)) {
      return;
    }

    const nextDate = getDateFromParts(dateParts);

    if (isValidDateValue(nextDate)) {
      commitDateValue(nextDate, true);
    } else {
      onInvalidDate?.();
      setDateParts(splitDateToParts(value));
    }

    setIsFocused(false);
  };

  const openDatePicker = () => {
    const input = calendarInputRef.current;
    if (!input) return;

    input.focus();

    if (typeof input.showPicker === 'function') {
      try {
        input.showPicker();
      } catch {
        // 일부 브라우저에서는 showPicker가 제한될 수 있으므로 focus 처리만 유지합니다.
      }
    }
  };

  const openSegmentEditor = () => {
    pendingSegmentFocusRef.current = 'year';
    setDateParts(splitDateToParts(value));
    setIsFocused(true);
  };

  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold text-slate-600 tracking-wide">{label}</span>
      <div className="relative">
        {isFocused ? (
          <div
            onBlur={handleEditorBlur}
            className="flex h-[42px] w-full items-center gap-0 rounded-xl border border-slate-200 bg-white px-2.5 pr-11 text-sm outline-none transition focus-within:border-[var(--mk-orange)] focus-within:shadow-[0_0_0_4px_var(--mk-orange-ring)]"
          >
            <input
              ref={yearRef}
              type="text"
              inputMode="numeric"
              value={dateParts.year}
              onFocus={selectSegmentInput}
              onClick={selectSegmentInput}
              onChange={(e) => handleYearChange(e.target.value)}
              placeholder="YYYY"
              maxLength={4}
              className="w-[4ch] bg-transparent text-center text-sm outline-none"
            />
            <span className="shrink-0 px-0.5 text-slate-400">-</span>
            <input
              ref={monthRef}
              type="text"
              inputMode="numeric"
              value={dateParts.month}
              onFocus={selectSegmentInput}
              onClick={selectSegmentInput}
              onChange={(e) => handleMonthChange(e.target.value)}
              placeholder="MM"
              maxLength={2}
              className="w-[2ch] bg-transparent text-center text-sm outline-none"
            />
            <span className="shrink-0 px-0.5 text-slate-400">-</span>
            <input
              ref={dayRef}
              type="text"
              inputMode="numeric"
              value={dateParts.day}
              onFocus={selectSegmentInput}
              onClick={selectSegmentInput}
              onChange={(e) => handleDayChange(e.target.value)}
              placeholder="DD"
              maxLength={2}
              className="w-[2ch] bg-transparent text-center text-sm outline-none"
            />
          </div>
        ) : (
          <button
            type="button"
            onFocus={openSegmentEditor}
            onClick={openSegmentEditor}
            className="flex h-[42px] w-full items-center rounded-xl border border-slate-200 bg-white px-3.5 pr-10 text-left text-sm text-slate-900 outline-none transition mk-form-focus"
            {...props}
          >
            {formatDateWithKoreanWeekday(value) || (
              <span className="text-slate-400">날짜 선택</span>
            )}
          </button>
        )}

        <input
          ref={calendarInputRef}
          type="date"
          value={value || ''}
          min={min}
          max={max}
          tabIndex={-1}
          onChange={(e) => {
            const nextValue = e.target.value;

            if (!nextValue) return;

            const finalValue = commitDateValue(nextValue);

            setDateParts(splitDateToParts(finalValue));
            setIsFocused(false);
            blurSegmentInputs();
          }}
          className="pointer-events-none absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 opacity-0"
        />

          <button
            type="button"
            tabIndex={-1}
            aria-label={`${label} 달력 열기`}
            onMouseDown={(e) => e.preventDefault()}
            onClick={openDatePicker}
            className="absolute right-0 top-0 z-10 flex h-full w-11 items-center justify-center rounded-r-xl bg-transparent text-slate-500 hover:text-[var(--mk-orange)]"
          >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-4 w-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
          </svg>
        </button>
      </div>
    </label>
  );
}

export function Select({ label, value, onChange, children }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold text-slate-600 tracking-wide">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm outline-none transition mk-form-focus appearance-none bg-[url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22292.4%22%20height%3D%22292.4%22%3E%3Cpath%20fill%3D%22%2364748B%22%20d%3D%22M287%2069.4a17.6%2017.6%200%200%200-13-5.4H18.4c-5%200-9.3%201.8-12.9%205.4A17.6%2017.6%200%200%200%200%2082.2c0%205%201.8%209.3%205.4%2012.9l128%20127.9c3.6%203.6%207.8%205.4%2012.8%205.4s9.2-1.8%2012.8-5.4L287%2095c3.5-3.5%205.4-7.8%205.4-12.8%200-5-1.9-9.2-5.5-12.8z%22%2F%3E%3C%2Fsvg%3E')] bg-[length:0.7em_auto] bg-[right_1rem_center] bg-no-repeat"
      >
        {children}
      </select>
    </label>
  );
}

export function LockIcon({ size }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
      <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
    </svg>
  );
}
