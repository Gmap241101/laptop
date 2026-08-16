import { useState } from 'react';
import AdminHomeBannerPanel from './AdminHomeBannerPanel.jsx';
import AdminSettingsPanel from './AdminSettingsPanel.jsx';

const HOME_MANAGEMENT_TAB_KEY = 'mk_home_management_tab';

const HOME_TABS = [
  ['basic', '홈 화면 기본 설정'],
  ['hero', '메인 비주얼'],
  ['promotion', '프로모션 배너'],
  ['quickLink', '바로가기 배너'],
];

const getInitialTab = () => {
  if (typeof window === 'undefined') return 'basic';
  const saved = window.sessionStorage.getItem(HOME_MANAGEMENT_TAB_KEY);
  return HOME_TABS.some(([key]) => key === saved) ? saved : 'basic';
};

export default function AdminHomeManagementPanel({ ctx }) {
  const { AdminPageHeader } = ctx;
  const [activeTab, setActiveTab] = useState(getInitialTab);
  const activeBannerPlacement = ['hero', 'promotion', 'quickLink'].includes(activeTab)
    ? activeTab
    : '';

  const changeTab = (nextTab) => {
    if (nextTab === activeTab) return;

    if (
      typeof window !== 'undefined' &&
      window.__mkHomeBannerUnsaved &&
      !window.confirm('저장하지 않은 배너 또는 표시 설정 변경사항이 있습니다. 저장하지 않고 이동하시겠습니까?')
    ) {
      return;
    }

    if (
      typeof window !== 'undefined' &&
      window.__mkSystemSettingsUnsaved &&
      !window.confirm(
        window.__mkSystemSettingsUnsavedMessage ||
        '저장하지 않은 홈 화면 기본 설정 변경사항이 있습니다. 저장하지 않고 이동하시겠습니까?'
      )
    ) {
      return;
    }

    if (typeof window !== 'undefined') {
      window.__mkHomeBannerUnsaved = false;
      window.__mkSystemSettingsUnsaved = false;
      window.__mkSystemSettingsUnsavedMessage = '';
      window.sessionStorage.setItem(HOME_MANAGEMENT_TAB_KEY, nextTab);
    }
    setActiveTab(nextTab);
  };

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="홈 화면 관리"
        description="사용자 홈 화면의 기본 콘텐츠와 메인 비주얼, 프로모션 및 바로가기 배너를 관리합니다."
      />

      <div className="flex flex-wrap gap-2">
        {HOME_TABS.map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => changeTab(key)}
            className={`rounded-xl border px-4 py-2.5 text-xs font-semibold transition ${
              activeTab === key
                ? 'border-orange-500 bg-orange-500 text-white shadow-sm'
                : 'border-slate-200 bg-white text-slate-600 hover:border-orange-300 hover:text-orange-600'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {activeTab === 'basic' && <AdminSettingsPanel ctx={ctx} mode="home" embedded />}
      {activeBannerPlacement && (
        <AdminHomeBannerPanel ctx={ctx} placement={activeBannerPlacement} embedded />
      )}
    </div>
  );
}
