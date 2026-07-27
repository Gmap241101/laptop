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
  const [activeTab, setActiveTab] = useState(getInitialTab);

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
      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white p-2">
        <div className="flex min-w-max gap-2">
          {HOME_TABS.map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => changeTab(key)}
              className={`rounded-xl px-4 py-2.5 text-xs font-bold transition ${
                activeTab === key
                  ? 'bg-orange-500 text-white shadow-sm'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {activeTab === 'basic' && <AdminSettingsPanel ctx={ctx} mode="home" />}
      {activeTab === 'hero' && <AdminHomeBannerPanel ctx={ctx} placement="hero" />}
      {activeTab === 'promotion' && <AdminHomeBannerPanel ctx={ctx} placement="promotion" />}
      {activeTab === 'quickLink' && <AdminHomeBannerPanel ctx={ctx} placement="quickLink" />}
    </div>
  );
}
