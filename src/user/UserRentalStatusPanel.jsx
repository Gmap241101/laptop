import React, { useEffect, useMemo, useState } from 'react';
import {
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Filter,
  Laptop,
  RotateCcw,
  Search,
  X,
} from 'lucide-react';

import { Button, Card, CardContent } from '../components/CommonUI.jsx';
import RentalStatusBoard from '../components/RentalStatusBoard.jsx';
import ModalPortal from '../components/ModalPortal.jsx';
import { getHolidayDisplayName, normalizeHolidayList } from '../domain/rentalPolicy.js';
import {
  getCachedMemberRentalStatusMonth,
  loadMemberRentalStatusMonth,
} from '../features/requests/memberRentalStatusReadService.js';
import { today } from '../utils/appUtils.js';

const SELECTED_ASSET_STORAGE_KEY = 'mk-rental-status-selected-assets-v1';
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
const EVENT_PRIORITY = {
  연체중: 70,
  대여중: 60,
  예약중: 50,
  '신청 검토중': 40,
  연체반납: 30,
  반납완료: 20,
};
const STATUS_TONE = {
  '신청 검토중': 'border-amber-200 bg-amber-50 text-amber-800',
  예약중: 'border-sky-200 bg-sky-50 text-sky-800',
  대여중: 'border-blue-200 bg-blue-50 text-blue-800',
  연체중: 'border-rose-200 bg-rose-50 text-rose-800',
  반납완료: 'border-slate-200 bg-slate-100 text-slate-700',
  연체반납: 'border-orange-200 bg-orange-50 text-orange-800',
  대여불가: 'border-rose-200 bg-rose-50 text-rose-700',
  대여가능: 'border-emerald-200 bg-emerald-50 text-emerald-700',
};
const EVENT_BAR_TONE = {
  '신청 검토중': 'border-amber-300 bg-amber-100 text-amber-950 hover:bg-amber-200',
  예약중: 'border-sky-300 bg-sky-100 text-sky-950 hover:bg-sky-200',
  대여중: 'border-blue-300 bg-blue-100 text-blue-950 hover:bg-blue-200',
  연체중: 'border-rose-300 bg-rose-100 text-rose-950 hover:bg-rose-200',
  반납완료: 'border-slate-300 bg-slate-100 text-slate-700 hover:bg-slate-200',
  연체반납: 'border-orange-300 bg-orange-100 text-orange-950 hover:bg-orange-200',
};

const pad2 = (value) => String(value).padStart(2, '0');
const formatMonthKey = (year, monthIndex) => `${year}-${pad2(monthIndex + 1)}`;
const parseMonthKey = (value) => {
  const [year, month] = String(value || '').split('-').map(Number);
  return { year, monthIndex: month - 1 };
};
const currentMonthKey = () => today().slice(0, 7);
const shiftMonth = (monthKey, delta) => {
  const { year, monthIndex } = parseMonthKey(monthKey);
  const date = new Date(Date.UTC(year, monthIndex + delta, 1));
  return formatMonthKey(date.getUTCFullYear(), date.getUTCMonth());
};
const dateText = (date) => date.toISOString().slice(0, 10);
const addDays = (dateValue, delta) => {
  const date = new Date(`${dateValue}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + delta);
  return dateText(date);
};
const formatShortDate = (value) => {
  const [, month, day] = String(value || '').split('-');
  return month && day ? `${Number(month)}. ${Number(day)}.` : value;
};
const formatFullDate = (value) => {
  const [year, month, day] = String(value || '').split('-');
  if (!year || !month || !day) return value;
  const date = new Date(`${value}T00:00:00Z`);
  const weekday = Number.isNaN(date.getTime()) ? '' : ` (${WEEKDAYS[date.getUTCDay()]})`;
  return `${year}. ${Number(month)}. ${Number(day)}.${weekday}`;
};
const buildMonthWeeks = (monthKey) => {
  const { year, monthIndex } = parseMonthKey(monthKey);
  const first = new Date(Date.UTC(year, monthIndex, 1));
  const last = new Date(Date.UTC(year, monthIndex + 1, 0));
  const gridStart = new Date(first);
  gridStart.setUTCDate(first.getUTCDate() - first.getUTCDay());
  const gridEnd = new Date(last);
  gridEnd.setUTCDate(last.getUTCDate() + (6 - last.getUTCDay()));
  const days = [];
  for (let cursor = new Date(gridStart); cursor <= gridEnd; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    const value = dateText(cursor);
    days.push({
      value,
      day: cursor.getUTCDate(),
      weekday: cursor.getUTCDay(),
      inMonth: cursor.getUTCMonth() === monthIndex,
    });
  }
  const weeks = [];
  for (let index = 0; index < days.length; index += 7) weeks.push(days.slice(index, index + 7));
  return weeks;
};
const eventIncludesDate = (event, date) =>
  String(event?.visibleStartDate || event?.startDate || '') <= date &&
  String(event?.visibleEndDate || event?.endDate || '') >= date;
const eventSort = (left, right) =>
  (EVENT_PRIORITY[right.status] || 0) - (EVENT_PRIORITY[left.status] || 0) ||
  String(left.assetNo || '').localeCompare(String(right.assetNo || ''), 'ko');
const getAssetStatusOnDate = (asset, events, date, referenceDate) => {
  const candidates = events.filter((event) => event.assetId === asset.id && eventIncludesDate(event, date)).sort(eventSort);
  if (candidates.length > 0) return { status: candidates[0].status, event: candidates[0] };
  if (asset.baseStatus === '대여불가' && date >= referenceDate) return { status: '대여불가', event: null };
  return { status: '대여가능', event: null };
};
const statusClass = (status) => STATUS_TONE[status] || STATUS_TONE.대여가능;
const safeReadSelectedAssets = () => {
  if (typeof window === 'undefined') return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(SELECTED_ASSET_STORAGE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : [];
  } catch {
    return [];
  }
};
const persistSelectedAssets = (ids) => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(SELECTED_ASSET_STORAGE_KEY, JSON.stringify(ids));
  } catch {
    // Browser storage is an optional convenience only.
  }
};

const ModalFrame = ({ title, description = '', onClose, children, maxWidth = 'max-w-4xl' }) => (
  <ModalPortal className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm">
    <div className={`flex max-h-[92vh] w-full ${maxWidth} flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl`}>
      <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4 sm:px-6">
        <div>
          <h3 className="text-base font-black text-slate-950 sm:text-lg">{title}</h3>
          {description ? <p className="mt-1 text-xs leading-5 text-slate-500">{description}</p> : null}
        </div>
        <button type="button" onClick={onClose} className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-slate-500 transition hover:bg-slate-100" aria-label="닫기">
          <X size={18} />
        </button>
      </div>
      {children}
    </div>
  </ModalPortal>
);


function UserRentalStatusPanel({ ctx }) {
  const {
    data,
    goToProtectedUserTab,
    siteSettings,
  } = ctx;
  const enabled = siteSettings?.memberRentalStatusEnabled !== false;
  const [month, setMonth] = useState(currentMonthKey);
  const [mode, setMode] = useState('all');
  const [category, setCategory] = useState('all');
  const [payload, setPayload] = useState(() => getCachedMemberRentalStatusMonth(currentMonthKey()));
  const [loading, setLoading] = useState(!payload);
  const [errorMessage, setErrorMessage] = useState('');
  const [selectedAssetIds, setSelectedAssetIds] = useState(safeReadSelectedAssets);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerCategory, setPickerCategory] = useState('all');
  const [pickerQuery, setPickerQuery] = useState('');
  const [draftSelectedAssetIds, setDraftSelectedAssetIds] = useState(selectedAssetIds);
  const [selectedDate, setSelectedDate] = useState('');
  const [dateStatusFilter, setDateStatusFilter] = useState('all');
  const [dateQuery, setDateQuery] = useState('');
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [overflowEvents, setOverflowEvents] = useState([]);

  useEffect(() => {
    if (!enabled) return undefined;
    let cancelled = false;
    const cached = getCachedMemberRentalStatusMonth(month);
    if (cached) {
      setPayload(cached);
      setLoading(false);
    } else {
      setLoading(true);
    }
    setErrorMessage('');
    loadMemberRentalStatusMonth(month)
      .then((value) => {
        if (cancelled) return;
        setPayload(value);
        setLoading(false);
      })
      .catch((error) => {
        if (cancelled) return;
        setLoading(false);
        setErrorMessage(
          error?.code === 'member_rental_status_disabled'
            ? '현재 회원용 대여현황이 공개되지 않습니다.'
            : '대여현황을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.'
        );
      });
    return () => { cancelled = true; };
  }, [enabled, month]);

  useEffect(() => {
    if (!enabled) return undefined;
    const handleFocus = () => {
      const cached = getCachedMemberRentalStatusMonth(month);
      if (cached && Date.now() - Number(cached.loadedAt || 0) < 30000) return;
      loadMemberRentalStatusMonth(month, { force: true })
        .then((value) => setPayload(value))
        .catch(() => {});
    };
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [enabled, month]);

  const assets = Array.isArray(payload?.assets) ? payload.assets : [];
  const events = Array.isArray(payload?.events) ? payload.events : [];
  const categories = Array.isArray(payload?.categories) ? payload.categories : [];
  const referenceDate = String(payload?.referenceDate || today());
  const weeks = useMemo(() => buildMonthWeeks(month), [month]);
  const holidayMap = useMemo(() => new Map(
    normalizeHolidayList(data?.settings?.holidays || [])
      .filter((holiday) => holiday.enabled !== false)
      .map((holiday) => [holiday.date, getHolidayDisplayName(holiday)])
  ), [data?.settings?.holidays]);

  useEffect(() => {
    const availableIds = new Set(assets.map((asset) => asset.id));
    const next = selectedAssetIds.filter((id) => availableIds.has(id));
    if (next.length !== selectedAssetIds.length) {
      setSelectedAssetIds(next);
      persistSelectedAssets(next);
    }
  }, [assets]);

  const allModeAssets = useMemo(
    () => category === 'all' ? assets : assets.filter((asset) => asset.category === category),
    [assets, category]
  );
  const selectedAssets = useMemo(() => {
    const idSet = new Set(selectedAssetIds);
    return assets.filter((asset) => idSet.has(asset.id));
  }, [assets, selectedAssetIds]);
  const selectedEventAssetIds = useMemo(() => new Set(selectedAssetIds), [selectedAssetIds]);
  const selectedEvents = useMemo(
    () => events.filter((event) => selectedEventAssetIds.has(event.assetId)),
    [events, selectedEventAssetIds]
  );


  const openPicker = () => {
    setDraftSelectedAssetIds(selectedAssetIds);
    setPickerCategory('all');
    setPickerQuery('');
    setPickerOpen(true);
  };
  const toggleDraftAsset = (assetId) => {
    setDraftSelectedAssetIds((current) => current.includes(assetId)
      ? current.filter((id) => id !== assetId)
      : [...current, assetId]);
  };
  const pickerAssets = useMemo(() => {
    const query = pickerQuery.trim().toLowerCase();
    return assets.filter((asset) =>
      (pickerCategory === 'all' || asset.category === pickerCategory) &&
      (!query || `${asset.assetNo} ${asset.model} ${asset.category}`.toLowerCase().includes(query))
    );
  }, [assets, pickerCategory, pickerQuery]);
  const pickerSelectedAssets = useMemo(() => {
    const idSet = new Set(draftSelectedAssetIds);
    return assets.filter((asset) => idSet.has(asset.id));
  }, [assets, draftSelectedAssetIds]);
  const selectCurrentPickerList = () => {
    setDraftSelectedAssetIds((current) => [...new Set([...current, ...pickerAssets.map((asset) => asset.id)])]);
  };
  const applyPicker = () => {
    setSelectedAssetIds(draftSelectedAssetIds);
    persistSelectedAssets(draftSelectedAssetIds);
    setPickerOpen(false);
  };

  const dateAssets = useMemo(() => {
    if (!selectedDate) return [];
    const query = dateQuery.trim().toLowerCase();
    return allModeAssets.map((asset) => ({
      asset,
      ...getAssetStatusOnDate(asset, events, selectedDate, referenceDate),
    })).filter((item) =>
      (dateStatusFilter === 'all' || item.status === dateStatusFilter) &&
      (!query || `${item.asset.assetNo} ${item.asset.model} ${item.asset.category}`.toLowerCase().includes(query))
    );
  }, [allModeAssets, dateQuery, dateStatusFilter, events, referenceDate, selectedDate]);

  const setDateModal = (date) => {
    setSelectedDate(date);
    setDateStatusFilter('all');
    setDateQuery('');
  };

  const renderAllCalendar = () => (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50">
        {WEEKDAYS.map((label, index) => (
          <div key={label} className={`px-1 py-2.5 text-center text-xs font-black ${index === 0 ? 'text-rose-500' : index === 6 ? 'text-sky-600' : 'text-slate-700'}`}>{label}</div>
        ))}
      </div>
      {weeks.map((week) => (
        <div key={week[0].value} className="grid grid-cols-7 border-b border-slate-200 last:border-b-0">
          {week.map((day) => {
            const holiday = holidayMap.get(day.value) || '';
            const statuses = allModeAssets.reduce((map, asset) => {
              const result = getAssetStatusOnDate(asset, events, day.value, referenceDate);
              map[result.status] = (map[result.status] || 0) + 1;
              return map;
            }, {});
            const available = Number(statuses.대여가능 || 0);
            const occupied = Object.entries(statuses)
              .filter(([status, count]) => status !== '대여가능' && count > 0)
              .sort(([left], [right]) => (EVENT_PRIORITY[right] || 0) - (EVENT_PRIORITY[left] || 0));
            return (
              <button
                key={day.value}
                type="button"
                onClick={() => day.inMonth && setDateModal(day.value)}
                disabled={!day.inMonth}
                className={`min-h-[118px] border-r border-slate-200 p-1.5 text-left align-top transition last:border-r-0 sm:min-h-[145px] sm:p-2 ${day.inMonth ? 'bg-white hover:bg-slate-50' : 'bg-slate-50/70 text-slate-300'}`}
              >
                <div className="flex items-start justify-between gap-1">
                  <span className={`text-xs font-black sm:text-sm ${!day.inMonth ? 'text-slate-300' : day.weekday === 0 ? 'text-rose-500' : day.weekday === 6 ? 'text-sky-600' : 'text-slate-800'}`}>{day.day}</span>
                  {holiday && day.inMonth ? <span className="max-w-[70%] truncate text-[9px] font-bold text-rose-500 sm:text-[10px]" title={holiday}>{holiday}</span> : null}
                </div>
                {day.inMonth ? (
                  <div className="mt-2 space-y-1">
                    <div className="text-[10px] font-bold text-slate-600 sm:text-xs">가용 {available} / {allModeAssets.length}</div>
                    {occupied.slice(0, 3).map(([status, count]) => (
                      <div key={status} className={`flex items-center justify-between rounded-lg border px-1.5 py-0.5 text-[9px] font-bold sm:px-2 sm:text-[10px] ${statusClass(status)}`}>
                        <span className="truncate">{status}</span><span>{count}</span>
                      </div>
                    ))}
                    {occupied.length > 3 ? <div className="text-[9px] font-bold text-slate-500">+ {occupied.length - 3}개 상태</div> : null}
                  </div>
                ) : null}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );

  const renderSelectedCalendar = () => (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50">
        {WEEKDAYS.map((label, index) => (
          <div key={label} className={`px-1 py-2.5 text-center text-xs font-black ${index === 0 ? 'text-rose-500' : index === 6 ? 'text-sky-600' : 'text-slate-700'}`}>{label}</div>
        ))}
      </div>
      {weeks.map((week) => {
        const weekStart = week[0].value;
        const weekEnd = week[6].value;
        const candidates = selectedEvents.filter((event) => event.visibleStartDate <= weekEnd && event.visibleEndDate >= weekStart);
        const placed = [];
        const laneEnds = [];
        candidates
          .slice()
          .sort((left, right) => left.visibleStartDate.localeCompare(right.visibleStartDate) || right.visibleEndDate.localeCompare(left.visibleEndDate) || String(left.assetNo).localeCompare(String(right.assetNo), 'ko'))
          .forEach((event) => {
            const startDate = event.visibleStartDate < weekStart ? weekStart : event.visibleStartDate;
            const endDate = event.visibleEndDate > weekEnd ? weekEnd : event.visibleEndDate;
            let lane = laneEnds.findIndex((laneEnd) => laneEnd < startDate);
            if (lane < 0) lane = laneEnds.length;
            laneEnds[lane] = endDate;
            placed.push({ event, lane, startCol: new Date(`${startDate}T00:00:00Z`).getUTCDay(), endCol: new Date(`${endDate}T00:00:00Z`).getUTCDay() });
          });
        const visible = placed.filter((item) => item.lane < 4);
        const hidden = placed.filter((item) => item.lane >= 4).map((item) => item.event);
        return (
          <div key={weekStart} className="relative min-h-[150px] border-b border-slate-200 last:border-b-0 sm:min-h-[166px]">
            <div className="absolute inset-0 grid grid-cols-7">
              {week.map((day) => {
                const holiday = holidayMap.get(day.value) || '';
                return (
                  <div key={day.value} className={`border-r border-slate-200 p-1.5 last:border-r-0 sm:p-2 ${day.inMonth ? 'bg-white' : 'bg-slate-50/70'}`}>
                    <div className="flex items-start justify-between gap-1">
                      <span className={`text-xs font-black sm:text-sm ${!day.inMonth ? 'text-slate-300' : day.weekday === 0 ? 'text-rose-500' : day.weekday === 6 ? 'text-sky-600' : 'text-slate-800'}`}>{day.day}</span>
                      {holiday && day.inMonth ? <span className="max-w-[65%] truncate text-[8px] font-bold text-rose-500 sm:text-[9px]" title={holiday}>{holiday}</span> : null}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="pointer-events-none absolute inset-x-0 top-8 grid grid-cols-7 auto-rows-[25px] gap-y-1 px-[2px] sm:top-9">
              {visible.map(({ event, lane, startCol, endCol }, index) => (
                <button
                  key={`${event.assetId}-${event.status}-${event.startDate}-${index}`}
                  type="button"
                  onClick={() => setSelectedEvent(event)}
                  className={`pointer-events-auto mx-[1px] flex min-w-0 items-center gap-1 overflow-hidden rounded-md border px-1.5 text-left text-[9px] font-black shadow-sm transition sm:text-[10px] ${EVENT_BAR_TONE[event.status] || EVENT_BAR_TONE.반납완료} ${event.isMine ? 'ring-2 ring-orange-400/70 ring-offset-1' : ''}`}
                  style={{ gridColumn: `${startCol + 1} / ${endCol + 2}`, gridRow: lane + 1 }}
                  title={`${event.assetNo} · ${event.status} · ${event.startDate} ~ ${event.endDate}`}
                >
                  <span className="truncate">{event.assetNo} · {event.status}{event.isMine ? ' · 내 신청' : ''}</span>
                </button>
              ))}
            </div>
            {hidden.length > 0 ? (
              <button type="button" onClick={() => setOverflowEvents(hidden)} className="absolute bottom-2 right-2 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[10px] font-black text-slate-600 shadow-sm hover:bg-slate-50">
                + {hidden.length}건 더보기
              </button>
            ) : null}
          </div>
        );
      })}
    </div>
  );

  if (!enabled) {
    return (
      <Card>
        <CardContent className="py-14 text-center">
          <CalendarDays className="mx-auto h-10 w-10 text-slate-300" />
          <h2 className="mt-4 text-lg font-black text-slate-900">대여현황을 이용할 수 없습니다.</h2>
          <p className="mt-2 text-sm text-slate-500">현재 회원용 대여현황이 공개되지 않습니다.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="w-full space-y-6">
      <Card className="overflow-hidden border-slate-200 bg-white shadow-sm">
        <div className="relative overflow-hidden bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 px-6 py-9 text-white sm:px-8 sm:py-10">
          <div className="pointer-events-none absolute -right-12 -top-16 h-40 w-40 rounded-full bg-white/10 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-20 left-16 h-44 w-44 rounded-full bg-orange-400/10 blur-3xl" />
          <div className="relative mx-auto max-w-3xl text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-white/15 bg-white/10"><CalendarDays size={24} /></div>
            <h2 className="mt-4 text-2xl font-black tracking-tight sm:text-3xl">기기 대여현황</h2>
            <p className="mt-2 text-sm leading-6 text-slate-300">월별 기기 이용 일정과 과거 대여 이력을 확인할 수 있습니다.</p>
          </div>
        </div>
      </Card>

      <RentalStatusBoard
        stats={payload?.currentSummary || {}}
        loading={loading && !payload}
        title="오늘 기준 대여현황"
        referenceLabel={formatFullDate(referenceDate)}
        desktopGridClassName="xl:grid-cols-6"
      />

      <Card>
        <CardContent className="space-y-5 p-4 sm:p-6">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="inline-flex w-fit rounded-xl border border-slate-200 bg-slate-50 p-1">
              {[['all', '전체 자산'], ['selected', '선택 자산']].map(([value, label]) => (
                <button key={value} type="button" onClick={() => setMode(value)} className={`rounded-lg px-4 py-2 text-sm font-black transition ${mode === value ? 'bg-white mk-brand-text shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>{label}</button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {mode === 'all' ? (
                <label className="flex items-center gap-2 text-xs font-bold text-slate-600">
                  <Filter size={14} />
                  <select value={category} onChange={(event) => setCategory(event.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 outline-none mk-form-focus">
                    <option value="all">전체 카테고리</option>
                    {categories.map((item) => <option key={item} value={item}>{item}</option>)}
                  </select>
                </label>
              ) : (
                <Button type="button" variant="outline" onClick={openPicker} className="px-3 py-2 text-xs"><Laptop size={14} />조회 기기 선택</Button>
              )}
            </div>
          </div>

          {mode === 'selected' ? (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              {selectedAssets.length === 0 ? (
                <div className="text-xs text-slate-500">조회할 기기를 선택해 주세요.</div>
              ) : selectedAssets.length <= 6 ? (
                <div className="flex flex-wrap gap-2">
                  {selectedAssets.map((asset) => <span key={asset.id} className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-bold text-slate-700">{asset.assetNo}</span>)}
                </div>
              ) : (
                <div className="text-xs font-bold text-slate-700">선택한 기기 {selectedAssets.length}대 · {selectedAssets.slice(0, 4).map((asset) => asset.assetNo).join(' · ')} 외 {selectedAssets.length - 4}대</div>
              )}
            </div>
          ) : null}

          <div className="flex items-center justify-between gap-3 border-t border-slate-100 pt-4">
            <div className="flex items-center gap-1">
              <Button type="button" variant="outline" onClick={() => setMonth((current) => shiftMonth(current, -1))} className="h-9 w-9 p-0" aria-label="이전 달"><ChevronLeft size={17} /></Button>
              <Button type="button" variant="outline" onClick={() => setMonth(currentMonthKey())} className="px-3 py-2 text-xs">오늘</Button>
            </div>
            <div className="text-center text-lg font-black text-slate-950 sm:text-xl">{parseMonthKey(month).year}년 {parseMonthKey(month).monthIndex + 1}월</div>
            <Button type="button" variant="outline" onClick={() => setMonth((current) => shiftMonth(current, 1))} className="h-9 w-9 p-0" aria-label="다음 달"><ChevronRight size={17} /></Button>
          </div>

          <div className="flex flex-wrap gap-1.5 text-[10px] font-bold sm:text-xs">
            {['신청 검토중', '예약중', '대여중', '연체중', '반납완료', '연체반납'].map((status) => <span key={status} className={`rounded-full border px-2.5 py-1 ${statusClass(status)}`}>{status}</span>)}
            <span className="rounded-full border-2 border-orange-300 bg-white px-2.5 py-1 text-slate-700">내 신청</span>
          </div>

          {loading && !payload ? (
            <div className="grid grid-cols-7 gap-px overflow-hidden rounded-2xl border border-slate-200 bg-slate-200" aria-label="대여현황 불러오는 중">
              {Array.from({ length: 35 }).map((_, index) => <div key={index} className="h-28 animate-pulse bg-slate-50" />)}
            </div>
          ) : errorMessage ? (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-5 py-8 text-center">
              <div className="text-sm font-black text-rose-900">{errorMessage}</div>
              <Button type="button" variant="outline" onClick={() => { setLoading(true); loadMemberRentalStatusMonth(month, { force: true }).then((value) => { setPayload(value); setErrorMessage(''); setLoading(false); }).catch(() => setLoading(false)); }} className="mt-4"><RotateCcw size={14} />다시 조회</Button>
            </div>
          ) : mode === 'all' ? renderAllCalendar() : selectedAssets.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-6 py-14 text-center">
              <Laptop className="mx-auto h-9 w-9 text-slate-300" />
              <div className="mt-3 text-sm font-black text-slate-800">조회할 기기를 선택해 주세요.</div>
              <Button type="button" variant="outline" onClick={openPicker} className="mt-4"><Laptop size={14} />기기 선택</Button>
            </div>
          ) : renderSelectedCalendar()}
        </CardContent>
      </Card>

      {pickerOpen ? (
        <ModalFrame title="조회 기기 선택" description="카테고리와 검색을 이용해 여러 기기를 동시에 선택할 수 있습니다." onClose={() => setPickerOpen(false)} maxWidth="max-w-5xl">
          <div className="grid min-h-0 flex-1 gap-0 overflow-hidden md:grid-cols-[1.35fr_0.9fr]">
            <div className="min-h-0 border-b border-slate-200 p-5 md:border-b-0 md:border-r sm:p-6">
              <div className="grid gap-3 sm:grid-cols-[180px_1fr]">
                <select value={pickerCategory} onChange={(event) => setPickerCategory(event.target.value)} className="rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-semibold text-slate-700 outline-none mk-form-focus">
                  <option value="all">전체 카테고리</option>
                  {categories.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
                <label className="relative block">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
                  <input value={pickerQuery} onChange={(event) => setPickerQuery(event.target.value)} placeholder="자산관리번호, 모델 검색" className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm outline-none mk-form-focus" />
                </label>
              </div>
              <div className="mt-3 flex justify-between gap-2">
                <div className="text-xs font-bold text-slate-500">선택 가능한 기기 {pickerAssets.length}대</div>
                <button type="button" onClick={selectCurrentPickerList} className="text-xs font-black mk-brand-text hover:underline">현재 목록 전체 선택</button>
              </div>
              <div className="mt-3 max-h-[46vh] space-y-2 overflow-y-auto pr-1">
                {pickerAssets.map((asset) => {
                  const checked = draftSelectedAssetIds.includes(asset.id);
                  return (
                    <button key={asset.id} type="button" onClick={() => toggleDraftAsset(asset.id)} className={`flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition ${checked ? 'border-orange-300 bg-orange-50' : 'border-slate-200 bg-white hover:bg-slate-50'}`}>
                      <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border ${checked ? 'border-orange-500 mk-brand-bg text-white' : 'border-slate-300 bg-white'}`}>{checked ? <Check size={13} /> : null}</span>
                      <span className="min-w-0 flex-1"><span className="block truncate text-sm font-black text-slate-900">{asset.assetNo}</span><span className="mt-0.5 block truncate text-xs text-slate-500">{asset.category}{asset.model ? ` · ${asset.model}` : ''}</span></span>
                      {asset.baseStatus === '대여불가' ? <span className="rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[10px] font-bold text-rose-700">현재 대여불가</span> : null}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="min-h-0 bg-slate-50 p-5 sm:p-6">
              <div className="flex items-center justify-between gap-2"><div className="text-sm font-black text-slate-900">현재 선택한 기기</div><button type="button" onClick={() => setDraftSelectedAssetIds([])} className="text-xs font-black text-slate-500 hover:text-slate-900">전체 해제</button></div>
              <div className="mt-3 max-h-[46vh] space-y-2 overflow-y-auto pr-1">
                {pickerSelectedAssets.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-center text-xs text-slate-500">선택된 기기가 없습니다.</div> : pickerSelectedAssets.map((asset) => (
                  <div key={asset.id} className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5"><div className="min-w-0"><div className="truncate text-xs font-black text-slate-800">{asset.assetNo}</div><div className="truncate text-[10px] text-slate-500">{asset.category}</div></div><button type="button" onClick={() => toggleDraftAsset(asset.id)} className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label={`${asset.assetNo} 선택 해제`}><X size={14} /></button></div>
                ))}
              </div>
            </div>
          </div>
          <div className="flex items-center justify-between gap-3 border-t border-slate-200 px-5 py-4 sm:px-6"><div className="text-xs font-bold text-slate-500">{draftSelectedAssetIds.length}대 선택</div><div className="flex gap-2"><Button type="button" variant="outline" onClick={() => setPickerOpen(false)}>취소</Button><Button type="button" onClick={applyPicker}>선택 적용</Button></div></div>
        </ModalFrame>
      ) : null}

      {selectedDate ? (
        <ModalFrame title={`${formatFullDate(selectedDate)} 기기 현황`} description="선택한 날짜의 기기별 상태를 확인합니다." onClose={() => setSelectedDate('')}>
          <div className="grid gap-3 border-b border-slate-200 p-5 sm:grid-cols-[180px_1fr] sm:p-6">
            <select value={dateStatusFilter} onChange={(event) => setDateStatusFilter(event.target.value)} className="rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-semibold text-slate-700 outline-none mk-form-focus">
              <option value="all">전체 상태</option>
              {['대여가능', '신청 검토중', '예약중', '대여중', '연체중', '반납완료', '연체반납', '대여불가'].map((status) => <option key={status} value={status}>{status}</option>)}
            </select>
            <label className="relative block"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} /><input value={dateQuery} onChange={(event) => setDateQuery(event.target.value)} placeholder="자산관리번호, 모델 검색" className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm outline-none mk-form-focus" /></label>
          </div>
          <div className="min-h-0 overflow-y-auto p-5 sm:p-6">
            <div className="space-y-2">
              {dateAssets.map(({ asset, status, event }) => (
                <button key={asset.id} type="button" onClick={() => event && setSelectedEvent(event)} disabled={!event} className={`flex w-full items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-3 text-left ${event ? 'transition hover:bg-slate-50' : ''}`}>
                  <div className="min-w-0"><div className="truncate text-sm font-black text-slate-900">{asset.assetNo}</div><div className="mt-0.5 truncate text-xs text-slate-500">{asset.category}{asset.model ? ` · ${asset.model}` : ''}</div>{event ? <div className="mt-1 text-[10px] text-slate-500">{formatShortDate(event.startDate)} ~ {formatShortDate(event.endDate)}</div> : null}</div>
                  <div className="flex shrink-0 items-center gap-2">{event?.isMine ? <span className="rounded-full border-2 border-orange-300 bg-white px-2 py-0.5 text-[10px] font-black text-slate-700">내 신청</span> : null}<span className={`rounded-full border px-2.5 py-1 text-[10px] font-black ${statusClass(status)}`}>{status}</span></div>
                </button>
              ))}
              {dateAssets.length === 0 ? <div className="py-12 text-center text-sm text-slate-500">조건에 맞는 기기가 없습니다.</div> : null}
            </div>
          </div>
        </ModalFrame>
      ) : null}

      {selectedEvent ? (
        <ModalFrame title={selectedEvent.assetNo || '기기 대여 일정'} onClose={() => setSelectedEvent(null)} maxWidth="max-w-md">
          <div className="space-y-4 p-5 sm:p-6">
            <div className="flex flex-wrap items-center gap-2"><span className={`rounded-full border px-2.5 py-1 text-xs font-black ${statusClass(selectedEvent.status)}`}>{selectedEvent.status}</span>{selectedEvent.isMine ? <span className="rounded-full border-2 border-orange-300 bg-white px-2.5 py-1 text-xs font-black text-slate-700">내 신청</span> : null}</div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700"><div className="font-black text-slate-900">{selectedEvent.category}{selectedEvent.model ? ` · ${selectedEvent.model}` : ''}</div><div className="mt-2 text-xs leading-5 text-slate-600">{formatFullDate(selectedEvent.startDate)} ~ {formatFullDate(selectedEvent.endDate)}</div></div>
            <p className="text-xs leading-5 text-slate-500">해당 기간에 기기 대여 일정이 등록되어 있습니다.</p>
            <div className="flex justify-end gap-2">{selectedEvent.isMine ? <Button type="button" variant="outline" onClick={() => { setSelectedEvent(null); goToProtectedUserTab?.('history'); }}>신청내역 보기</Button> : null}<Button type="button" onClick={() => setSelectedEvent(null)}>닫기</Button></div>
          </div>
        </ModalFrame>
      ) : null}

      {overflowEvents.length > 0 ? (
        <ModalFrame title="추가 대여 일정" description="같은 주에 겹쳐 표시되지 않은 일정을 확인합니다." onClose={() => setOverflowEvents([])} maxWidth="max-w-xl">
          <div className="max-h-[65vh] space-y-2 overflow-y-auto p-5 sm:p-6">
            {overflowEvents.map((event, index) => <button key={`${event.assetId}-${event.status}-${index}`} type="button" onClick={() => { setOverflowEvents([]); setSelectedEvent(event); }} className="flex w-full items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-3 text-left hover:bg-slate-50"><div className="min-w-0"><div className="truncate text-sm font-black text-slate-900">{event.assetNo}</div><div className="mt-1 text-[10px] text-slate-500">{formatShortDate(event.startDate)} ~ {formatShortDate(event.endDate)}</div></div><span className={`rounded-full border px-2.5 py-1 text-[10px] font-black ${statusClass(event.status)}`}>{event.status}</span></button>)}
          </div>
        </ModalFrame>
      ) : null}
    </div>
  );
}

export default React.memo(UserRentalStatusPanel);
