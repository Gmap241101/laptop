import React from 'react';

function UserRentalStatusSectionNav({
  activeTab,
  goToProtectedUserTab,
  memberRentalStatusEnabled = true,
}) {
  const items = [
    ['history', '나의 신청내역'],
    ...(memberRentalStatusEnabled ? [['rentalStatus', '전체 대여현황']] : []),
  ];

  return (
    <div
      className={`grid overflow-hidden rounded-xl border border-slate-200 bg-white text-center text-[11px] font-bold ${items.length === 2 ? 'grid-cols-2' : 'grid-cols-1'}`}
      aria-label="대여현황 세부메뉴"
    >
      {items.map(([tab, label]) => (
        <button
          key={tab}
          type="button"
          onClick={() => goToProtectedUserTab?.(tab)}
          className={`px-3 py-2.5 transition ${activeTab === tab ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'}`}
          aria-current={activeTab === tab ? 'page' : undefined}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

export default React.memo(UserRentalStatusSectionNav);
