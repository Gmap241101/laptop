import {
  Boxes,
  CalendarClock,
  ClipboardCheck,
  PackageCheck,
  PackageOpen,
  XCircle,
} from 'lucide-react';

import { StatCard } from './CommonUI.jsx';

const RENTAL_STATUS_ITEMS = [
  {
    key: 'total',
    icon: Boxes,
    label: '보유 자산',
    tone: 'slate',
  },
  {
    key: 'available',
    icon: PackageCheck,
    label: '대여 가능',
    tone: 'green',
  },
  {
    key: 'requested',
    icon: ClipboardCheck,
    label: '승인 대기중',
    tone: 'amber',
  },
  {
    key: 'reserved',
    icon: CalendarClock,
    label: '예약중',
    tone: 'sky',
  },
  {
    key: 'approved',
    icon: PackageOpen,
    label: '대여중',
    tone: 'blue',
  },
  {
    key: 'overdue',
    icon: XCircle,
    label: '반납 지연중',
    tone: 'rose',
  },
];

export default function RentalStatusBoard({
  stats = {},
  loading = false,
  title = '',
  referenceLabel = '',
  className = '',
}) {
  return (
    <section
      className={className}
      aria-label={title || '대여 현황'}
      aria-busy={loading}
    >
      {title ? (
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <h2 className="text-base font-black text-slate-900 sm:text-lg">
            {title}
          </h2>
          {referenceLabel ? (
            <p className="text-xs font-semibold text-slate-500">
              {referenceLabel}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="grid grid-cols-3 gap-2 sm:gap-4 md:grid-cols-3 xl:grid-cols-6">
        {RENTAL_STATUS_ITEMS.map(({ key, icon, label, tone }) => (
          <StatCard
            key={key}
            icon={icon}
            label={label}
            value={loading ? '—' : Number(stats?.[key] || 0)}
            tone={tone}
          />
        ))}
      </div>
    </section>
  );
}
