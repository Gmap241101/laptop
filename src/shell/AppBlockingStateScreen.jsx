import { AlertCircle, Settings } from 'lucide-react';

import { Button } from '../components/CommonUI.jsx';
import { SERVICE_MODE } from '../utils/systemSettings.js';

export const APP_BLOCKING_STATE = Object.freeze({
  REMOTE_DATA_LOAD_ERROR: 'remote-data-load-error',
  MAINTENANCE: 'maintenance',
});

export const getAppBlockingState = ({
  firebaseLoadErrorMessage,
  normalizedSiteSettings,
  view,
}) => {
  if (firebaseLoadErrorMessage) {
    return APP_BLOCKING_STATE.REMOTE_DATA_LOAD_ERROR;
  }

  if (
    view === 'user' &&
    normalizedSiteSettings?.serviceMode === SERVICE_MODE.MAINTENANCE
  ) {
    return APP_BLOCKING_STATE.MAINTENANCE;
  }

  return '';
};

const RemoteDataLoadErrorScreen = ({ firebaseLoadErrorMessage }) => (
  <div className="flex min-h-screen items-center justify-center bg-slate-50 px-6 font-sans text-slate-900">
    <div className="w-full max-w-lg rounded-2xl border border-rose-200 bg-white p-6 shadow-sm">
      <div className="mb-4 flex items-center gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-rose-50 text-rose-600">
          <AlertCircle size={22} />
        </div>
        <div>
          <h1 className="text-base font-bold text-slate-900">
            PostgreSQL 데이터 서버에 연결하지 못했습니다.
          </h1>
          <p className="mt-0.5 text-xs text-slate-500">
            이 화면은 데이터 삭제를 의미하지 않으며, 기존 원격 데이터를 보호하기 위해 저장을 차단했습니다.
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-rose-100 bg-rose-50 p-4 text-xs leading-relaxed text-rose-700">
        {firebaseLoadErrorMessage}
      </div>

      <div className="mt-5 flex justify-end">
        <Button variant="outline" onClick={() => window.location.reload()}>
          다시 불러오기
        </Button>
      </div>
    </div>
  </div>
);

const MaintenanceModeScreen = ({
  navigateToAdminHome,
  normalizedSiteSettings,
}) => (
  <div className="flex min-h-screen items-center justify-center bg-slate-950 px-6 font-sans text-white">
    <div className="w-full max-w-2xl rounded-3xl border border-white/10 bg-white/10 p-7 text-center shadow-2xl backdrop-blur">
      <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl mk-brand-gradient-tr text-white">
        <Settings size={28} />
      </div>
      <h1 className="mt-5 text-2xl font-black">
        {normalizedSiteSettings.maintenanceTitle}
      </h1>
      <p className="mx-auto mt-3 max-w-xl text-sm leading-7 text-slate-300">
        {normalizedSiteSettings.maintenanceMessage}
      </p>
      {normalizedSiteSettings.maintenanceEndAt ? (
        <div className="mt-5 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-xs text-slate-200">
          예상 종료: {normalizedSiteSettings.maintenanceEndAt.replace('T', ' ')}
        </div>
      ) : null}
      {normalizedSiteSettings.supportEnabled ? (
        <div className="mt-5 text-xs leading-6 text-slate-300">
          {normalizedSiteSettings.supportMessage ? (
            <div>{normalizedSiteSettings.supportMessage}</div>
          ) : null}
          {normalizedSiteSettings.supportDepartment ? (
            <div>담당 부서: {normalizedSiteSettings.supportDepartment}</div>
          ) : null}
          {normalizedSiteSettings.supportEmail ? (
            <div>이메일: {normalizedSiteSettings.supportEmail}</div>
          ) : null}
          {normalizedSiteSettings.supportPhone ? (
            <div>전화번호: {normalizedSiteSettings.supportPhone}</div>
          ) : null}
        </div>
      ) : null}
      <div className="mt-6 flex justify-center gap-2">
        <Button variant="outline" onClick={() => window.location.reload()}>
          다시 확인
        </Button>
        <Button onClick={() => navigateToAdminHome({ replace: true })}>
          관리자 모드
        </Button>
      </div>
    </div>
  </div>
);

export default function AppBlockingStateScreen({
  firebaseLoadErrorMessage,
  navigateToAdminHome,
  normalizedSiteSettings,
  state,
}) {
  if (state === APP_BLOCKING_STATE.REMOTE_DATA_LOAD_ERROR) {
    return (
      <RemoteDataLoadErrorScreen
        firebaseLoadErrorMessage={firebaseLoadErrorMessage}
      />
    );
  }

  if (state === APP_BLOCKING_STATE.MAINTENANCE) {
    return (
      <MaintenanceModeScreen
        navigateToAdminHome={navigateToAdminHome}
        normalizedSiteSettings={normalizedSiteSettings}
      />
    );
  }

  return null;
}
