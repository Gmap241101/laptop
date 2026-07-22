import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Edit3,
  Image as ImageIcon,
  Link2,
  Monitor,
  Plus,
  Save,
  Trash2,
  X,
} from 'lucide-react';
import {
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';

import {
  HOME_BANNERS_COLLECTION_REF,
  HOME_PAGE_CONFIG_DOC_REF,
  db,
} from '../firebase.js';

const PLACEMENT_CONFIG = {
  hero: {
    title: '메인 비주얼 관리',
    description: '사용자 초기화면 상단의 대형 롤링 배너, 문구, 링크와 노출 기간을 관리합니다.',
    itemLabel: '메인 비주얼',
    emptyLabel: '등록된 메인 비주얼이 없습니다.',
    recommendation: 'PC 1,920×640px 또는 1,440×480px(3:1), 모바일 1,080×810px(4:3)를 권장합니다.',
  },
  promotion: {
    title: '프로모션 배너 관리',
    description: '초기화면 공지사항 오른쪽의 프로모션 배너와 표시 배열을 관리합니다.',
    itemLabel: '프로모션 배너',
    emptyLabel: '등록된 프로모션 배너가 없습니다.',
    recommendation: '',
  },
  quickLink: {
    title: '바로가기 배너 관리',
    description: '초기화면 하단에서 한 방향으로 흐르는 외부 사이트 바로가기 배너를 관리합니다.',
    itemLabel: '바로가기 배너',
    emptyLabel: '등록된 바로가기 배너가 없습니다.',
    recommendation: '240×80px 또는 300×100px(약 3:1), 투명 배경 PNG·WebP·SVG를 권장합니다.',
  },
};

const INTERNAL_LINK_OPTIONS = [
  ['/', '초기화면'],
  ['/rental', '대여신청'],
  ['/history', '신청내역'],
  ['/board/notice', '공지사항'],
  ['/board/faq', 'FAQ'],
  ['/login', '로그인'],
  ['/signup', '회원가입'],
  ['/mypage', '마이페이지'],
];

const PROMOTION_LAYOUTS = {
  '2x1': { rows: 1, slots: 2, label: '2열 × 1행', ratio: '1:1', size: '800×800px 또는 600×600px' },
  '2x2': { rows: 2, slots: 4, label: '2열 × 2행', ratio: '약 2:1', size: '1,000×500px 또는 800×400px' },
  '2x3': { rows: 3, slots: 6, label: '2열 × 3행', ratio: '약 3:1', size: '1,200×400px 또는 900×300px' },
};

const IMAGE_POSITION_OPTIONS = [
  ['center', '가운데'],
  ['top', '위'],
  ['bottom', '아래'],
  ['left', '왼쪽'],
  ['right', '오른쪽'],
];

const getMillis = (value) => {
  if (!value) return 0;
  if (typeof value?.toMillis === 'function') return value.toMillis();
  if (typeof value?.toDate === 'function') return value.toDate().getTime();
  if (value instanceof Date) return value.getTime();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
};

const toDateTimeLocal = (value) => {
  const millis = getMillis(value);
  if (!millis) return '';
  const date = new Date(millis);
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return localDate.toISOString().slice(0, 16);
};

const formatDateTime = (value) => {
  const millis = getMillis(value);
  if (!millis) return '-';
  return new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(millis));
};

const getDisplayStatus = (banner, now = Date.now()) => {
  if (!banner?.enabled) return { key: 'disabled', label: '사용안함' };
  const start = getMillis(banner.startAt);
  const end = banner.isIndefinite ? 0 : getMillis(banner.endAt);
  if (!start || now < start) return { key: 'scheduled', label: '노출예정' };
  if (!banner.isIndefinite && (!end || now > end)) return { key: 'ended', label: '노출종료' };
  return { key: 'active', label: '노출중' };
};

const isSafeHttpUrl = (value = '') => {
  try {
    const parsed = new URL(String(value || '').trim());
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
};

const createForm = (placement, banner = null, defaultSortOrder = 1) => ({
  id: banner?.id || '',
  enabled: banner ? Boolean(banner.enabled) : true,
  sortOrder: Number(banner?.sortOrder) || defaultSortOrder,
  title: banner?.title || '',
  subtitle: banner?.subtitle || '',
  altText: banner?.altText || '',
  imageUrl: banner?.imageUrl || '',
  mobileImageUrl: banner?.mobileImageUrl || '',
  imagePosition: banner?.imagePosition || 'center',
  linkType: placement === 'quickLink' ? 'external' : banner?.linkType || 'none',
  linkValue: banner?.linkValue || '',
  startAt: toDateTimeLocal(banner?.startAt) || toDateTimeLocal(new Date()),
  endAt: toDateTimeLocal(banner?.endAt),
  isIndefinite: banner ? Boolean(banner.isIndefinite) : true,
});

const statusClassName = {
  disabled: 'border-slate-200 bg-slate-100 text-slate-600',
  scheduled: 'border-sky-200 bg-sky-50 text-sky-700',
  active: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  ended: 'border-rose-200 bg-rose-50 text-rose-700',
};

function LayoutPreview({ layout, banners = [], admin = false }) {
  const layoutConfig = PROMOTION_LAYOUTS[layout] || PROMOTION_LAYOUTS['2x1'];
  const aspectClass = layout === '2x1' ? 'aspect-square' : layout === '2x2' ? 'aspect-[2/1]' : 'aspect-[3/1]';
  const slots = Array.from({ length: layoutConfig.slots }, (_, index) => banners[index] || null);

  return (
    <div className="grid grid-cols-2 gap-2 rounded-xl border border-slate-200 bg-white p-3">
      {slots.map((banner, index) => (
        <div
          key={banner?.id || `empty-${index}`}
          className={`${aspectClass} overflow-hidden rounded-lg ${
            banner
              ? 'border border-slate-200 bg-slate-100'
              : admin
                ? 'flex items-center justify-center border border-dashed border-slate-300 bg-slate-50 text-[10px] font-semibold text-slate-400'
                : ''
          }`}
        >
          {banner ? (
            <img
              src={banner.imageUrl}
              alt=""
              className="h-full w-full object-cover"
              style={{ objectPosition: banner.imagePosition || 'center' }}
            />
          ) : admin ? '빈 슬롯' : null}
        </div>
      ))}
    </div>
  );
}

export default function AdminHomeBannerPanel({ ctx, placement }) {
  const panelConfig = PLACEMENT_CONFIG[placement] || PLACEMENT_CONFIG.hero;
  const {
    AdminPageHeader,
    Button,
    authenticatedAdminAccount,
    authenticatedAdminId,
    isAdminAuthenticated,
    triggerConfirm,
    triggerToast,
  } = ctx;

  const [allBanners, setAllBanners] = useState([]);
  const [bannersReady, setBannersReady] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [configReady, setConfigReady] = useState(false);
  const [configSaving, setConfigSaving] = useState(false);
  const [configDraft, setConfigDraft] = useState({
    heroIntervalSeconds: 7,
    promotionLayout: '2x1',
  });
  const configBaselineRef = useRef('');
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(() => createForm(placement));
  const formBaselineRef = useRef('');
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState('');
  const [toggleSavingId, setToggleSavingId] = useState('');
  const [previewFailed, setPreviewFailed] = useState(false);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const unsubscribe = onSnapshot(
      HOME_BANNERS_COLLECTION_REF,
      (snapshot) => {
        setAllBanners(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
        setBannersReady(true);
        setLoadError('');
      },
      (error) => {
        console.error('Home banners load error:', error);
        setBannersReady(true);
        setLoadError('초기화면 배너를 불러오지 못했습니다. Firestore Rules를 확인해 주세요.');
      }
    );
    return unsubscribe;
  }, []);

  useEffect(() => {
    const unsubscribe = onSnapshot(
      HOME_PAGE_CONFIG_DOC_REF,
      (snapshot) => {
        const data = snapshot.exists() ? snapshot.data() : {};
        const next = {
          heroIntervalSeconds: [5, 7, 10].includes(Number(data.heroIntervalSeconds))
            ? Number(data.heroIntervalSeconds)
            : 7,
          promotionLayout: PROMOTION_LAYOUTS[data.promotionLayout]
            ? data.promotionLayout
            : '2x1',
        };
        setConfigDraft(next);
        configBaselineRef.current = JSON.stringify(next);
        setConfigReady(true);
      },
      (error) => {
        console.error('Home page config load error:', error);
        setConfigReady(true);
      }
    );
    return unsubscribe;
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const banners = useMemo(
    () => allBanners
      .filter((banner) => banner.placement === placement)
      .sort((a, b) => {
        const orderDiff = (Number(a.sortOrder) || 0) - (Number(b.sortOrder) || 0);
        if (orderDiff) return orderDiff;
        return getMillis(a.createdAt) - getMillis(b.createdAt) || String(a.id).localeCompare(String(b.id));
      }),
    [allBanners, placement]
  );

  const activePromotionBanners = useMemo(
    () => allBanners
      .filter((banner) => banner.placement === 'promotion' && getDisplayStatus(banner, now).key === 'active')
      .sort((a, b) => (Number(a.sortOrder) || 0) - (Number(b.sortOrder) || 0)),
    [allBanners, now]
  );

  const formDirty = editing && JSON.stringify(form) !== formBaselineRef.current;
  const configDirty = configReady && JSON.stringify(configDraft) !== configBaselineRef.current;
  const hasUnsavedChanges = formDirty || configDirty;

  useEffect(() => {
    window.__mkHomeBannerUnsaved = hasUnsavedChanges;
    const beforeUnload = (event) => {
      if (!hasUnsavedChanges) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => {
      window.removeEventListener('beforeunload', beforeUnload);
      if (window.__mkHomeBannerUnsaved === hasUnsavedChanges) {
        window.__mkHomeBannerUnsaved = false;
      }
    };
  }, [hasUnsavedChanges]);

  useEffect(() => {
    setPreviewFailed(false);
  }, [form.imageUrl]);

  const openCreate = () => {
    const next = createForm(placement, null, banners.length + 1);
    setForm(next);
    formBaselineRef.current = JSON.stringify(next);
    setEditing(true);
  };

  const openEdit = (banner) => {
    const next = createForm(placement, banner, banners.length + 1);
    setForm(next);
    formBaselineRef.current = JSON.stringify(next);
    setEditing(true);
  };

  const closeEditor = () => {
    if (formDirty && !window.confirm('저장하지 않은 배너 변경사항을 취소하시겠습니까?')) return;
    setEditing(false);
    const next = createForm(placement, null, banners.length + 1);
    setForm(next);
    formBaselineRef.current = JSON.stringify(next);
  };

  const saveConfig = async () => {
    if (!isAdminAuthenticated) {
      triggerToast('관리자 인증 후 초기화면 설정을 저장할 수 있습니다.', 'error');
      return;
    }
    setConfigSaving(true);
    try {
      await setDoc(HOME_PAGE_CONFIG_DOC_REF, {
        heroIntervalSeconds: Number(configDraft.heroIntervalSeconds) || 7,
        promotionLayout: PROMOTION_LAYOUTS[configDraft.promotionLayout]
          ? configDraft.promotionLayout
          : '2x1',
        updatedAt: serverTimestamp(),
        updatedByUid: authenticatedAdminId || '',
        updatedByName: authenticatedAdminAccount?.userName || authenticatedAdminAccount?.adminLoginId || '관리자',
      }, { merge: true });
      configBaselineRef.current = JSON.stringify(configDraft);
      triggerToast('초기화면 표시 설정을 저장했습니다.', 'success');
    } catch (error) {
      console.error('Home page config save error:', error);
      triggerToast(`초기화면 설정 저장에 실패했습니다. 오류 코드: ${error?.code || error?.message || 'unknown-error'}`, 'error');
    } finally {
      setConfigSaving(false);
    }
  };

  const saveBanner = async () => {
    if (!isAdminAuthenticated) {
      triggerToast('관리자 인증 후 배너를 저장할 수 있습니다.', 'error');
      return;
    }

    const imageUrl = String(form.imageUrl || '').trim();
    const mobileImageUrl = String(form.mobileImageUrl || '').trim();
    const title = String(form.title || '').trim();
    const subtitle = String(form.subtitle || '').trim();
    const altText = String(form.altText || '').trim();
    const linkType = placement === 'quickLink' ? 'external' : form.linkType;
    const linkValue = String(form.linkValue || '').trim();
    const startAt = form.startAt ? new Date(form.startAt) : null;
    const endAt = !form.isIndefinite && form.endAt ? new Date(form.endAt) : null;

    if (!isSafeHttpUrl(imageUrl)) {
      triggerToast('PC·기본 이미지 URL은 http:// 또는 https://로 시작해야 합니다.', 'error');
      return;
    }
    if (mobileImageUrl && !isSafeHttpUrl(mobileImageUrl)) {
      triggerToast('모바일 이미지 URL은 http:// 또는 https://로 시작해야 합니다.', 'error');
      return;
    }
    if (!altText) {
      triggerToast('이미지 대체 텍스트를 입력해 주세요.', 'error');
      return;
    }
    if (placement !== 'hero' && !title) {
      triggerToast('관리용 제목을 입력해 주세요.', 'error');
      return;
    }
    if (!startAt || Number.isNaN(startAt.getTime())) {
      triggerToast('노출 시작일시를 입력해 주세요.', 'error');
      return;
    }
    if (!form.isIndefinite && (!endAt || Number.isNaN(endAt.getTime()))) {
      triggerToast('무기한이 아닌 배너는 노출 종료일시를 입력해 주세요.', 'error');
      return;
    }
    if (!form.isIndefinite && endAt.getTime() < startAt.getTime()) {
      triggerToast('노출 종료일시는 시작일시보다 빠를 수 없습니다.', 'error');
      return;
    }
    if (linkType === 'internal' && !INTERNAL_LINK_OPTIONS.some(([value]) => value === linkValue)) {
      triggerToast('연결할 사이트 내부 메뉴를 선택해 주세요.', 'error');
      return;
    }
    if (linkType === 'external' && !isSafeHttpUrl(linkValue)) {
      triggerToast('외부 링크는 http:// 또는 https://로 시작해야 합니다.', 'error');
      return;
    }

    setSaving(true);
    try {
      const targetRef = form.id
        ? doc(HOME_BANNERS_COLLECTION_REF, form.id)
        : doc(HOME_BANNERS_COLLECTION_REF);
      const existing = form.id ? banners.find((banner) => banner.id === form.id) : null;
      await setDoc(targetRef, {
        id: targetRef.id,
        placement,
        enabled: Boolean(form.enabled),
        sortOrder: Math.max(1, Math.trunc(Number(form.sortOrder) || banners.length + 1)),
        title,
        subtitle: placement === 'hero' ? subtitle : '',
        altText,
        imageUrl,
        mobileImageUrl: placement === 'quickLink' ? '' : mobileImageUrl,
        imagePosition: form.imagePosition || 'center',
        linkType,
        linkValue: linkType === 'none' ? '' : linkValue,
        openInNewTab: linkType === 'external',
        startAt,
        endAt: form.isIndefinite ? null : endAt,
        isIndefinite: Boolean(form.isIndefinite),
        authorUid: existing?.authorUid || authenticatedAdminId || '',
        authorName: existing?.authorName || authenticatedAdminAccount?.userName || authenticatedAdminAccount?.adminLoginId || '관리자',
        createdAt: existing?.createdAt || serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      triggerToast(`${panelConfig.itemLabel}를 ${form.id ? '수정' : '등록'}했습니다.`, 'success');
      setEditing(false);
      const next = createForm(placement, null, banners.length + 2);
      setForm(next);
      formBaselineRef.current = JSON.stringify(next);
    } catch (error) {
      console.error('Home banner save error:', error);
      triggerToast(`${panelConfig.itemLabel} 저장에 실패했습니다. 오류 코드: ${error?.code || error?.message || 'unknown-error'}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  const toggleEnabled = async (banner) => {
    if (!banner?.id) return;
    setToggleSavingId(banner.id);
    try {
      await updateDoc(doc(HOME_BANNERS_COLLECTION_REF, banner.id), {
        enabled: !Boolean(banner.enabled),
        updatedAt: serverTimestamp(),
      });
      triggerToast(`${panelConfig.itemLabel}를 ${banner.enabled ? '사용안함' : '사용함'}으로 변경했습니다.`, 'success');
    } catch (error) {
      console.error('Home banner toggle error:', error);
      triggerToast('사용 여부 변경에 실패했습니다.', 'error');
    } finally {
      setToggleSavingId('');
    }
  };

  const moveBanner = async (bannerId, direction) => {
    const currentIndex = banners.findIndex((banner) => banner.id === bannerId);
    const nextIndex = currentIndex + direction;
    if (currentIndex < 0 || nextIndex < 0 || nextIndex >= banners.length) return;
    const current = banners[currentIndex];
    const adjacent = banners[nextIndex];
    const currentOrder = Number(current.sortOrder) || currentIndex + 1;
    const adjacentOrder = Number(adjacent.sortOrder) || nextIndex + 1;
    try {
      const batch = writeBatch(db);
      batch.update(doc(HOME_BANNERS_COLLECTION_REF, current.id), {
        sortOrder: adjacentOrder,
        updatedAt: serverTimestamp(),
      });
      batch.update(doc(HOME_BANNERS_COLLECTION_REF, adjacent.id), {
        sortOrder: currentOrder,
        updatedAt: serverTimestamp(),
      });
      await batch.commit();
    } catch (error) {
      console.error('Home banner order error:', error);
      triggerToast('배너 순서 변경에 실패했습니다.', 'error');
    }
  };

  const confirmDelete = (banner) => {
    triggerConfirm(
      `${panelConfig.itemLabel} 삭제`,
      `[${banner.title || banner.altText || '제목 없음'}] 항목을 삭제하시겠습니까? 삭제 후 복구할 수 없습니다.`,
      async () => {
        setDeletingId(banner.id);
        try {
          await deleteDoc(doc(HOME_BANNERS_COLLECTION_REF, banner.id));
          if (form.id === banner.id) setEditing(false);
          triggerToast(`${panelConfig.itemLabel}를 삭제했습니다.`, 'success');
        } catch (error) {
          console.error('Home banner delete error:', error);
          triggerToast(`${panelConfig.itemLabel} 삭제에 실패했습니다.`, 'error');
        } finally {
          setDeletingId('');
        }
      }
    );
  };

  const promotionLayout = PROMOTION_LAYOUTS[configDraft.promotionLayout] || PROMOTION_LAYOUTS['2x1'];
  const activeCount = activePromotionBanners.length;
  const visibleCount = Math.min(activeCount, promotionLayout.slots);
  const emptyCount = Math.max(0, promotionLayout.slots - activeCount);
  const overflowCount = Math.max(0, activeCount - promotionLayout.slots);
  const recommendation = placement === 'promotion'
    ? `현재 배열 ${promotionLayout.label}: 권장 비율 ${promotionLayout.ratio}, 권장 원본 ${promotionLayout.size}.`
    : panelConfig.recommendation;

  return (
    <div className="space-y-8">
      <AdminPageHeader title={panelConfig.title} description={panelConfig.description} />

      {(placement === 'hero' || placement === 'promotion') && (
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="border-b border-slate-200 bg-slate-50 px-5 py-4">
            <h3 className="text-sm font-bold text-slate-900">초기화면 표시 설정</h3>
            <p className="mt-1 text-[11px] leading-5 text-slate-500">
              {placement === 'hero'
                ? '모든 메인 비주얼에 공통 적용할 자동 전환 간격을 설정합니다.'
                : '공지사항 오른쪽 프로모션 영역의 열·행 배열과 최대 표시 개수를 설정합니다.'}
            </p>
          </div>

          <div className="space-y-5 p-5">
            {!configReady ? (
              <div className="py-8 text-center text-xs text-slate-400">초기화면 설정을 불러오는 중입니다.</div>
            ) : placement === 'hero' ? (
              <div>
                <div className="text-xs font-bold text-slate-800">배너 전환 간격</div>
                <div className="mt-3 grid grid-cols-3 gap-3 sm:max-w-md">
                  {[5, 7, 10].map((seconds) => (
                    <button
                      key={seconds}
                      type="button"
                      onClick={() => setConfigDraft((prev) => ({ ...prev, heroIntervalSeconds: seconds }))}
                      className={`rounded-xl border px-4 py-3 text-sm font-bold transition ${
                        Number(configDraft.heroIntervalSeconds) === seconds
                          ? 'border-orange-500 bg-orange-50 text-orange-700'
                          : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      {seconds}초
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <>
                <div>
                  <div className="text-xs font-bold text-slate-800">프로모션 배너 표시 배열</div>
                  <div className="mt-3 grid gap-3 md:grid-cols-3">
                    {Object.entries(PROMOTION_LAYOUTS).map(([value, option]) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setConfigDraft((prev) => ({ ...prev, promotionLayout: value }))}
                        className={`rounded-2xl border p-4 text-left transition ${
                          configDraft.promotionLayout === value
                            ? 'border-orange-500 bg-orange-50'
                            : 'border-slate-200 bg-white hover:bg-slate-50'
                        }`}
                      >
                        <div className="font-bold text-slate-900">{option.label}</div>
                        <div className="mt-1 text-[11px] text-slate-500">최대 {option.slots}개 · {option.ratio}</div>
                        <div className="mt-3 grid grid-cols-2 gap-1.5">
                          {Array.from({ length: option.slots }, (_, index) => (
                            <span key={index} className="h-4 rounded border border-slate-300 bg-white" />
                          ))}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {[
                      ['표시 슬롯', promotionLayout.slots],
                      ['노출 가능', activeCount],
                      ['빈 슬롯', emptyCount],
                      ['초과 배너', overflowCount],
                    ].map(([label, value]) => (
                      <div key={label} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-center">
                        <div className="text-[11px] font-semibold text-slate-500">{label}</div>
                        <div className="mt-1 text-xl font-black text-slate-900">{value}</div>
                      </div>
                    ))}
                  </div>
                  <LayoutPreview
                    layout={configDraft.promotionLayout}
                    banners={activePromotionBanners.slice(0, visibleCount)}
                    admin
                  />
                </div>

                {overflowCount > 0 && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-800">
                    현재 배열에는 정렬 순서가 빠른 {promotionLayout.slots}개만 표시됩니다. 나머지 {overflowCount}개는 삭제되지 않으며 배열을 확대하면 다시 표시됩니다.
                  </div>
                )}
              </>
            )}

            <div className="flex justify-end">
              <Button type="button" variant="primary" onClick={saveConfig} disabled={configSaving || !configDirty}>
                <Save size={14} />
                {configSaving ? '저장 중...' : '표시 설정 저장'}
              </Button>
            </div>
          </div>
        </section>
      )}

      {editing && (
        <section className="overflow-hidden rounded-2xl border border-orange-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-orange-100 bg-orange-50 px-5 py-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900">{form.id ? `${panelConfig.itemLabel} 수정` : `${panelConfig.itemLabel} 등록`}</h3>
              <p className="mt-1 text-[11px] text-slate-500">{recommendation} 권장 규격이 아니어도 등록할 수 있습니다.</p>
            </div>
            <button type="button" onClick={closeEditor} className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50" aria-label="편집 닫기">
              <X size={16} />
            </button>
          </div>

          <div className="space-y-5 p-5">
            <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
              <div>
                <div className="text-xs font-bold text-slate-800">사용 여부</div>
                <div className="mt-1 text-[11px] text-slate-500">사용함과 노출 기간을 모두 충족해야 사용자 초기화면에 표시됩니다.</div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={Boolean(form.enabled)}
                onClick={() => setForm((prev) => ({ ...prev, enabled: !prev.enabled }))}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${form.enabled ? 'bg-emerald-500' : 'bg-slate-300'}`}
              >
                <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition ${form.enabled ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-[11px] font-semibold text-slate-600">
                {placement === 'hero' ? '대제목(선택)' : '관리용 제목'}
                <input
                  value={form.title}
                  onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
                  placeholder={placement === 'hero' ? '이미지 위에 표시할 대제목' : '관리자 목록에서 구분할 제목'}
                  className="mt-2 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs outline-none mk-form-focus"
                />
              </label>
              <label className="block text-[11px] font-semibold text-slate-600">
                정렬 순서
                <input
                  type="number"
                  min="1"
                  value={form.sortOrder}
                  onChange={(event) => setForm((prev) => ({ ...prev, sortOrder: event.target.value }))}
                  className="mt-2 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs outline-none mk-form-focus"
                />
              </label>
            </div>

            {placement === 'hero' && (
              <label className="block text-[11px] font-semibold text-slate-600">
                소제목(선택)
                <input
                  value={form.subtitle}
                  onChange={(event) => setForm((prev) => ({ ...prev, subtitle: event.target.value }))}
                  placeholder="대제목 아래에 표시할 설명"
                  className="mt-2 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs outline-none mk-form-focus"
                />
              </label>
            )}

            <label className="block text-[11px] font-semibold text-slate-600">
              이미지 대체 텍스트
              <input
                value={form.altText}
                onChange={(event) => setForm((prev) => ({ ...prev, altText: event.target.value }))}
                placeholder="이미지가 보이지 않을 때 표시하고 화면 판독기가 읽을 설명"
                className="mt-2 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs outline-none mk-form-focus"
              />
            </label>

            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
              <div className="space-y-4">
                <label className="block text-[11px] font-semibold text-slate-600">
                  {placement === 'quickLink' ? '이미지 URL' : 'PC·기본 이미지 URL'}
                  <input
                    value={form.imageUrl}
                    onChange={(event) => setForm((prev) => ({ ...prev, imageUrl: event.target.value }))}
                    placeholder="https://example.com/banner.png"
                    className="mt-2 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs outline-none mk-form-focus"
                  />
                </label>
                {placement !== 'quickLink' && (
                  <label className="block text-[11px] font-semibold text-slate-600">
                    모바일 이미지 URL(선택)
                    <input
                      value={form.mobileImageUrl}
                      onChange={(event) => setForm((prev) => ({ ...prev, mobileImageUrl: event.target.value }))}
                      placeholder="미입력 시 PC 이미지를 자동 크롭"
                      className="mt-2 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs outline-none mk-form-focus"
                    />
                  </label>
                )}
                <label className="block text-[11px] font-semibold text-slate-600">
                  이미지 초점 위치
                  <select
                    value={form.imagePosition}
                    onChange={(event) => setForm((prev) => ({ ...prev, imagePosition: event.target.value }))}
                    className="mt-2 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs outline-none mk-form-focus"
                  >
                    {IMAGE_POSITION_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </label>
              </div>

              <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                {form.imageUrl && !previewFailed ? (
                  <img
                    src={form.imageUrl}
                    alt="배너 미리보기"
                    onError={() => setPreviewFailed(true)}
                    className={`w-full object-cover ${placement === 'hero' ? 'aspect-[3/1]' : placement === 'quickLink' ? 'aspect-[3/1]' : 'aspect-video'}`}
                    style={{ objectPosition: form.imagePosition || 'center' }}
                  />
                ) : (
                  <div className="flex aspect-video items-center justify-center px-4 text-center text-xs text-slate-400">
                    <div><ImageIcon size={24} className="mx-auto mb-2" />{previewFailed ? '이미지를 불러올 수 없습니다.' : '이미지 URL을 입력하면 미리보기가 표시됩니다.'}</div>
                  </div>
                )}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-[11px] font-semibold text-slate-600">
                링크 방식
                <select
                  value={placement === 'quickLink' ? 'external' : form.linkType}
                  disabled={placement === 'quickLink'}
                  onChange={(event) => setForm((prev) => ({ ...prev, linkType: event.target.value, linkValue: '' }))}
                  className="mt-2 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs outline-none disabled:bg-slate-100 mk-form-focus"
                >
                  {placement !== 'quickLink' && <option value="none">링크 없음</option>}
                  {placement !== 'quickLink' && <option value="internal">사이트 내부 메뉴</option>}
                  <option value="external">외부 주소</option>
                </select>
              </label>

              {(placement === 'quickLink' || form.linkType === 'external') && (
                <label className="block text-[11px] font-semibold text-slate-600">
                  외부 링크 주소
                  <input
                    value={form.linkValue}
                    onChange={(event) => setForm((prev) => ({ ...prev, linkValue: event.target.value }))}
                    placeholder="https://example.com"
                    className="mt-2 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs outline-none mk-form-focus"
                  />
                  <span className="mt-1 block text-[10px] text-slate-400">외부 주소는 새 탭에서 열립니다.</span>
                </label>
              )}

              {placement !== 'quickLink' && form.linkType === 'internal' && (
                <label className="block text-[11px] font-semibold text-slate-600">
                  사이트 내부 메뉴
                  <select
                    value={form.linkValue}
                    onChange={(event) => setForm((prev) => ({ ...prev, linkValue: event.target.value }))}
                    className="mt-2 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs outline-none mk-form-focus"
                  >
                    <option value="">메뉴 선택</option>
                    {INTERNAL_LINK_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </label>
              )}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-[11px] font-semibold text-slate-600">
                노출 시작일시
                <input
                  type="datetime-local"
                  value={form.startAt}
                  onChange={(event) => setForm((prev) => ({ ...prev, startAt: event.target.value }))}
                  className="mt-2 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs outline-none mk-form-focus"
                />
              </label>
              <label className="block text-[11px] font-semibold text-slate-600">
                노출 종료일시
                <input
                  type="datetime-local"
                  value={form.endAt}
                  disabled={form.isIndefinite}
                  onChange={(event) => setForm((prev) => ({ ...prev, endAt: event.target.value }))}
                  className="mt-2 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs outline-none disabled:bg-slate-100 mk-form-focus"
                />
              </label>
            </div>

            <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700">
              <input
                type="checkbox"
                checked={form.isIndefinite}
                onChange={(event) => setForm((prev) => ({ ...prev, isIndefinite: event.target.checked }))}
                className="h-4 w-4 rounded border-slate-300 text-orange-600"
              />
              종료일 없이 무기한 노출
            </label>

            <div className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-5 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" onClick={closeEditor} disabled={saving}>취소</Button>
              <Button type="button" variant="primary" onClick={saveBanner} disabled={saving}>
                <Save size={14} />{saving ? '저장 중...' : form.id ? '수정 저장' : '등록'}
              </Button>
            </div>
          </div>
        </section>
      )}

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="flex flex-col gap-3 border-b border-slate-200 bg-slate-50 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-900">등록 목록</h3>
            <p className="mt-1 text-[11px] leading-5 text-slate-500">{recommendation}</p>
          </div>
          <Button type="button" variant="primary" onClick={openCreate} disabled={editing} className="shrink-0 px-4 py-2 text-xs">
            <Plus size={14} />{panelConfig.itemLabel} 등록
          </Button>
        </div>

        <div className="p-5">
          {!bannersReady ? (
            <div className="py-12 text-center text-xs text-slate-400">배너를 불러오는 중입니다.</div>
          ) : loadError ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-800">{loadError}</div>
          ) : banners.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 py-12 text-center text-xs text-slate-400">{panelConfig.emptyLabel}</div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full min-w-[760px] table-fixed border-collapse text-left lg:min-w-0">
                <thead className="bg-slate-50 text-[11px] font-semibold text-slate-600">
                  <tr>
                    <th className="w-24 border-b border-slate-200 px-3 py-3 text-center">순서</th>
                    <th className="w-20 border-b border-slate-200 px-3 py-3 text-center">사용</th>
                    <th className="w-36 border-b border-slate-200 px-3 py-3">미리보기</th>
                    <th className="border-b border-slate-200 px-4 py-3">제목·연결</th>
                    <th className="w-[132px] border-b border-slate-200 px-2 py-3 text-center">노출 기간</th>
                    <th className="w-[72px] border-b border-slate-200 px-2 py-3 text-center">상태</th>
                    <th className="w-24 border-b border-slate-200 px-3 py-3 text-center">관리</th>
                  </tr>
                </thead>
                <tbody>
                  {banners.map((banner, index) => {
                    const status = getDisplayStatus(banner, now);
                    return (
                      <tr key={banner.id} className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50">
                        <td className="px-3 py-3">
                          <div className="flex justify-center gap-1">
                            <button type="button" disabled={index === 0} onClick={() => moveBanner(banner.id, -1)} className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 disabled:opacity-30"><ArrowUp size={14} /></button>
                            <button type="button" disabled={index === banners.length - 1} onClick={() => moveBanner(banner.id, 1)} className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 disabled:opacity-30"><ArrowDown size={14} /></button>
                          </div>
                        </td>
                        <td className="px-3 py-3 text-center">
                          <button
                            type="button"
                            role="switch"
                            aria-checked={Boolean(banner.enabled)}
                            disabled={toggleSavingId === banner.id}
                            onClick={() => toggleEnabled(banner)}
                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${banner.enabled ? 'bg-emerald-500' : 'bg-slate-300'} disabled:opacity-60`}
                          >
                            <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition ${banner.enabled ? 'translate-x-6' : 'translate-x-1'}`} />
                          </button>
                        </td>
                        <td className="px-3 py-3">
                          <img src={banner.imageUrl} alt="" className="h-14 w-28 rounded-lg border border-slate-200 bg-slate-100 object-cover" style={{ objectPosition: banner.imagePosition || 'center' }} />
                        </td>
                        <td className="min-w-0 px-4 py-3">
                          <div className="truncate text-sm font-bold text-slate-800">{banner.title || banner.altText || '제목 없음'}</div>
                          {banner.subtitle && <div className="mt-1 truncate text-[11px] text-slate-500">{banner.subtitle}</div>}
                          <div className="mt-1 flex min-w-0 items-start gap-1 text-[10px] leading-4 text-slate-400">
                            {banner.linkType === 'none' ? (
                              <><Monitor size={11} className="mt-0.5 shrink-0" /><span>링크 없음</span></>
                            ) : (
                              <>
                                <Link2 size={11} className="mt-0.5 shrink-0" />
                                <span
                                  title={banner.linkValue || ''}
                                  className={placement === 'quickLink' ? 'min-w-0 break-all' : 'min-w-0 truncate'}
                                  style={placement === 'quickLink' ? {
                                    display: '-webkit-box',
                                    WebkitBoxOrient: 'vertical',
                                    WebkitLineClamp: 2,
                                    overflow: 'hidden',
                                  } : undefined}
                                >
                                  {banner.linkValue}
                                </span>
                              </>
                            )}
                          </div>
                        </td>
                        <td className="px-2 py-3 text-center text-[10px] leading-5 text-slate-500">
                          <div className="whitespace-nowrap">{formatDateTime(banner.startAt)}</div>
                          <div className="whitespace-nowrap">~ {banner.isIndefinite ? '무기한' : formatDateTime(banner.endAt)}</div>
                        </td>
                        <td className="px-2 py-3 text-center"><span className={`inline-flex whitespace-nowrap rounded-full border px-2 py-1 text-[10px] font-bold ${statusClassName[status.key]}`}>{status.label}</span></td>
                        <td className="px-3 py-3">
                          <div className="flex justify-center gap-1">
                            <button type="button" onClick={() => openEdit(banner)} className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50" aria-label="수정"><Edit3 size={14} /></button>
                            <button type="button" disabled={deletingId === banner.id} onClick={() => confirmDelete(banner)} className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-rose-200 bg-white text-rose-600 hover:bg-rose-50 disabled:opacity-50" aria-label="삭제"><Trash2 size={14} /></button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
