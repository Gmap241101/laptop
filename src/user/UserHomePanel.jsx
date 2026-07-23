import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Boxes,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Laptop,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import { onSnapshot, query, where } from 'firebase/firestore';

import {
  HOME_BANNERS_COLLECTION_REF,
  HOME_PAGE_CONFIG_DOC_REF,
} from '../firebase.js';

const PROMOTION_LAYOUTS = {
  '2x1': { rows: 1, slots: 2, aspectClass: 'aspect-square' },
  '2x2': { rows: 2, slots: 4, aspectClass: 'aspect-[2/1]' },
  '2x3': { rows: 3, slots: 6, aspectClass: 'aspect-[3/1]' },
};

const getMillis = (value) => {
  if (!value) return 0;
  if (typeof value?.toMillis === 'function') return value.toMillis();
  if (typeof value?.toDate === 'function') return value.toDate().getTime();
  if (value instanceof Date) return value.getTime();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
};

const isActiveBanner = (banner, now) => {
  if (!banner?.enabled) return false;
  const start = getMillis(banner.startAt);
  const end = banner.isIndefinite ? 0 : getMillis(banner.endAt);
  if (!start || now < start) return false;
  if (!banner.isIndefinite && (!end || now > end)) return false;
  return true;
};


const isSafeHttpUrl = (value = '') => {
  try {
    const parsed = new URL(String(value || '').trim());
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
};

const sortBanners = (items) => [...items].sort((a, b) => {
  const orderDiff = (Number(a.sortOrder) || 0) - (Number(b.sortOrder) || 0);
  if (orderDiff) return orderDiff;
  return getMillis(a.createdAt) - getMillis(b.createdAt) || String(a.id).localeCompare(String(b.id));
});

const formatKoreaReferenceDate = () => {
  const parts = new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: '2-digit',
    month: 'numeric',
    day: 'numeric',
  }).formatToParts(new Date());
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}.${value.month}.${value.day} 기준`;
};

function ResponsiveBannerImage({ banner, className = '' }) {
  return (
    <picture>
      {banner.mobileImageUrl && (
        <source media="(max-width: 639px)" srcSet={banner.mobileImageUrl} />
      )}
      <img
        src={banner.imageUrl}
        alt={banner.altText || ''}
        className={`h-full w-full object-cover ${className}`}
        style={{ objectPosition: banner.imagePosition || 'center' }}
      />
    </picture>
  );
}

export default function UserHomePanel({ ctx }) {
  const {
    formatFirestoreDate,
    goToProtectedUserTab,
    goToUserFaq,
    goToUserHome,
    goToUserLogin,
    goToUserMypage,
    goToUserNotice,
    goToUserSignup,
    hasFirebaseAuthSession,
    noticePosts,
    noticePostsLoadErrorMessage,
    noticePostsReady,
    openNoticePost,
    stats,
    siteSettings,
  } = ctx;

  const [banners, setBanners] = useState([]);
  const [bannersReady, setBannersReady] = useState(false);
  const [bannerLoadError, setBannerLoadError] = useState('');
  const [homeConfig, setHomeConfig] = useState({
    heroIntervalSeconds: 7,
    promotionLayout: '2x1',
  });
  const [now, setNow] = useState(Date.now());
  const [heroIndex, setHeroIndex] = useState(0);
  const [heroTransitionEnabled, setHeroTransitionEnabled] = useState(true);
  const [heroPaused, setHeroPaused] = useState(false);
  const [documentHidden, setDocumentHidden] = useState(false);
  const touchStartXRef = useRef(null);

  useEffect(() => {
    const enabledQuery = query(
      HOME_BANNERS_COLLECTION_REF,
      where('enabled', '==', true)
    );
    const unsubscribe = onSnapshot(
      enabledQuery,
      (snapshot) => {
        setBanners(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
        setBannersReady(true);
        setBannerLoadError('');
      },
      (error) => {
        console.error('User home banners load error:', error);
        setBannersReady(true);
        setBannerLoadError('초기화면 배너를 불러오지 못했습니다.');
      }
    );
    return unsubscribe;
  }, []);

  useEffect(() => {
    const unsubscribe = onSnapshot(
      HOME_PAGE_CONFIG_DOC_REF,
      (snapshot) => {
        const data = snapshot.exists() ? snapshot.data() : {};
        setHomeConfig({
          heroIntervalSeconds: [5, 7, 10].includes(Number(data.heroIntervalSeconds))
            ? Number(data.heroIntervalSeconds)
            : 7,
          promotionLayout: PROMOTION_LAYOUTS[data.promotionLayout]
            ? data.promotionLayout
            : '2x1',
        });
      },
      (error) => console.error('User home config load error:', error)
    );
    return unsubscribe;
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const syncVisibility = () => setDocumentHidden(document.visibilityState !== 'visible');
    syncVisibility();
    document.addEventListener('visibilitychange', syncVisibility);
    return () => document.removeEventListener('visibilitychange', syncVisibility);
  }, []);

  const activeBanners = useMemo(
    () => sortBanners(banners.filter((banner) => isActiveBanner(banner, now))),
    [banners, now]
  );
  const heroBanners = useMemo(
    () => activeBanners.filter((banner) => banner.placement === 'hero'),
    [activeBanners]
  );
  const promotionBanners = useMemo(
    () => activeBanners.filter((banner) => banner.placement === 'promotion'),
    [activeBanners]
  );
  const quickLinkBanners = useMemo(
    () => activeBanners.filter(
      (banner) =>
        banner.placement === 'quickLink' &&
        banner.linkType === 'external' &&
        isSafeHttpUrl(banner.linkValue)
    ),
    [activeBanners]
  );

  useEffect(() => {
    setHeroIndex(0);
    setHeroTransitionEnabled(true);
  }, [heroBanners.length]);

  useEffect(() => {
    if (heroBanners.length <= 1 || heroPaused || documentHidden) return undefined;
    const timer = window.setTimeout(
      () => setHeroIndex((current) => Math.min(current + 1, heroBanners.length)),
      Math.max(5, Number(homeConfig.heroIntervalSeconds) || 7) * 1000
    );
    return () => window.clearTimeout(timer);
  }, [heroBanners.length, heroIndex, heroPaused, documentHidden, homeConfig.heroIntervalSeconds]);

  const heroSlides = heroBanners.length > 1
    ? [...heroBanners, heroBanners[0]]
    : heroBanners;

  const moveHero = (direction) => {
    if (heroBanners.length <= 1) return;
    setHeroTransitionEnabled(true);
    setHeroIndex((current) => {
      if (direction > 0) return Math.min(current + 1, heroBanners.length);
      if (current <= 0) {
        setHeroTransitionEnabled(false);
        window.requestAnimationFrame(() => {
          setHeroIndex(heroBanners.length);
          window.requestAnimationFrame(() => {
            setHeroTransitionEnabled(true);
            setHeroIndex(heroBanners.length - 1);
          });
        });
        return current;
      }
      return current - 1;
    });
  };

  const onHeroTransitionEnd = () => {
    if (heroIndex !== heroBanners.length || heroBanners.length <= 1) return;
    setHeroTransitionEnabled(false);
    setHeroIndex(0);
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => setHeroTransitionEnabled(true));
    });
  };

  const navigateInternal = (path) => {
    const normalized = String(path || '').trim();
    if (normalized === '/') return goToUserHome();
    if (normalized === '/rental') return goToProtectedUserTab('rental');
    if (normalized === '/history') return goToProtectedUserTab('history');
    if (normalized === '/board/notice') return goToUserNotice();
    if (normalized === '/board/faq') return goToUserFaq();
    if (normalized === '/login') return goToUserLogin();
    if (normalized === '/signup') return goToUserSignup();
    if (normalized === '/mypage') {
      return hasFirebaseAuthSession ? goToUserMypage() : goToUserLogin();
    }
    return undefined;
  };

  const activateBanner = (banner) => {
    if (!banner || banner.linkType === 'none' || !banner.linkValue) return;
    if (banner.linkType === 'internal') {
      navigateInternal(banner.linkValue);
      return;
    }
    if (banner.linkType === 'external' && isSafeHttpUrl(banner.linkValue)) {
      window.open(banner.linkValue, '_blank', 'noopener,noreferrer');
    }
  };

  const renderClickableBanner = (banner, children, className = '') => {
    const hasLink =
      banner.linkType === 'internal'
        ? Boolean(banner.linkValue)
        : banner.linkType === 'external' && isSafeHttpUrl(banner.linkValue);
    if (!hasLink) return <div className={className}>{children}</div>;
    if (banner.linkType === 'external') {
      return (
        <a
          href={banner.linkValue}
          target="_blank"
          rel="noopener noreferrer"
          className={className}
          aria-label={`${banner.altText || banner.title || '배너'} 새 창에서 열기`}
        >
          {children}
        </a>
      );
    }
    return (
      <button
        type="button"
        onClick={() => activateBanner(banner)}
        className={`${className} text-left`}
      >
        {children}
      </button>
    );
  };

  const homeNotices = useMemo(() => {
    const sorted = [...(noticePosts || [])].sort((a, b) => {
      const pinnedDiff = Number(Boolean(b.isPinned)) - Number(Boolean(a.isPinned));
      if (pinnedDiff) return pinnedDiff;
      return getMillis(b.createdAt) - getMillis(a.createdAt);
    });
    return sorted.slice(0, 6);
  }, [noticePosts]);

  const openHomeNotice = (post) => {
    goToUserNotice();
    openNoticePost(post);
  };

  const promotionConfig = PROMOTION_LAYOUTS[homeConfig.promotionLayout] || PROMOTION_LAYOUTS['2x1'];
  const visiblePromotionBanners = promotionBanners.slice(0, promotionConfig.slots);
  const promotionSlots = Array.from(
    { length: promotionConfig.slots },
    (_, index) => visiblePromotionBanners[index] || null
  );

  const summaryItems = [
    [Laptop, '보유 자산', stats?.total || 0, 'text-slate-700 bg-slate-100'],
    [CheckCircle2, '대여 가능', stats?.available || 0, 'text-emerald-700 bg-emerald-50'],
    [Clock, '승인 대기', stats?.requested || 0, 'text-amber-700 bg-amber-50'],
    [ShieldCheck, '예약중', stats?.reserved || 0, 'text-sky-700 bg-sky-50'],
    [Laptop, '대여중', stats?.approved || 0, 'text-blue-700 bg-blue-50'],
    [XCircle, '반납 지연', stats?.overdue || 0, 'text-rose-700 bg-rose-50'],
  ];

  return (
    <div className="space-y-6 sm:space-y-8">
      <section
        className="group relative overflow-hidden rounded-2xl bg-slate-900 shadow-sm"
        onMouseEnter={() => setHeroPaused(true)}
        onMouseLeave={() => setHeroPaused(false)}
        onFocusCapture={() => setHeroPaused(true)}
        onBlurCapture={() => setHeroPaused(false)}
        onTouchStart={(event) => { touchStartXRef.current = event.touches[0]?.clientX ?? null; }}
        onTouchEnd={(event) => {
          const start = touchStartXRef.current;
          const end = event.changedTouches[0]?.clientX;
          touchStartXRef.current = null;
          if (start == null || end == null || Math.abs(start - end) < 45) return;
          moveHero(start > end ? 1 : -1);
        }}
        aria-label="메인 비주얼"
      >
        {heroBanners.length === 0 ? (
          siteSettings?.defaultHeroEnabled === false ? (
            <div className="flex aspect-[4/3] items-center justify-center bg-slate-900 px-6 text-center text-sm font-semibold text-slate-300 sm:aspect-[16/7] lg:aspect-[3/1]">
              {siteSettings?.siteName || '기기 대여 시스템'}
            </div>
          ) : (
            <div className="relative aspect-[4/3] overflow-hidden bg-gradient-to-br from-slate-950 via-slate-800 to-[var(--mk-orange-dark)] sm:aspect-[16/7] lg:aspect-[3/1]">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_75%_20%,rgba(255,255,255,0.18),transparent_34%)]" />
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/25 to-transparent px-6 pb-8 pt-24 text-center text-white sm:pb-10">
                <h2 className="text-2xl font-black tracking-tight drop-shadow-[0_2px_5px_rgba(0,0,0,0.9)] sm:text-3xl lg:text-4xl">
                  {siteSettings?.defaultHeroTitle || siteSettings?.siteName || '기기 대여 시스템'}
                </h2>
                {siteSettings?.defaultHeroDescription ? (
                  <p className="mt-3 text-sm font-semibold leading-6 text-white/95 drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)] sm:text-base">
                    {siteSettings.defaultHeroDescription}
                  </p>
                ) : null}
              </div>
            </div>
          )
        ) : (
          <>
            <div
              className="flex"
              style={{
                transform: `translateX(-${heroIndex * 100}%)`,
                transition: heroTransitionEnabled ? 'transform 600ms cubic-bezier(0.22, 1, 0.36, 1)' : 'none',
              }}
              onTransitionEnd={onHeroTransitionEnd}
            >
              {heroSlides.map((banner, index) => (
                <div key={`${banner.id}-${index}`} className="relative min-w-full">
                  {renderClickableBanner(
                    banner,
                    <>
                      <div className="aspect-[4/3] sm:aspect-[16/7] lg:aspect-[3/1]">
                        <ResponsiveBannerImage banner={banner} />
                      </div>
                      <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/35 to-transparent px-6 pb-12 pt-24 text-center text-white sm:pb-14 lg:pb-14">
                        {banner.title && <h2 className="text-2xl font-black leading-tight tracking-tight drop-shadow-[0_2px_5px_rgba(0,0,0,0.95)] sm:text-3xl lg:text-[40px]">{banner.title}</h2>}
                        {banner.subtitle && <p className="mx-auto mt-2 max-w-3xl text-sm font-semibold leading-6 text-white/95 drop-shadow-[0_2px_4px_rgba(0,0,0,0.95)] sm:mt-3 sm:text-base lg:text-lg">{banner.subtitle}</p>}
                      </div>
                    </>,
                    'relative block w-full cursor-pointer'
                  )}
                </div>
              ))}
            </div>

            {heroBanners.length > 1 && (
              <>
                <button type="button" onClick={() => moveHero(-1)} className="absolute left-3 top-1/2 z-20 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/35 text-white ring-1 ring-white/20 backdrop-blur transition hover:bg-black/55" aria-label="이전 배너"><ChevronLeft size={21} /></button>
                <button type="button" onClick={() => moveHero(1)} className="absolute right-3 top-1/2 z-20 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/35 text-white ring-1 ring-white/20 backdrop-blur transition hover:bg-black/55" aria-label="다음 배너"><ChevronRight size={21} /></button>
                <div className="absolute bottom-3 left-1/2 z-20 flex -translate-x-1/2 items-center gap-2 rounded-full bg-black/30 px-3 py-2 backdrop-blur">
                  {heroBanners.map((banner, index) => (
                    <button
                      key={banner.id}
                      type="button"
                      onClick={() => { setHeroTransitionEnabled(true); setHeroIndex(index); }}
                      className={`h-2 rounded-full transition ${heroIndex % heroBanners.length === index ? 'w-6 bg-white' : 'w-2 bg-white/55 hover:bg-white/80'}`}
                      aria-label={`${index + 1}번 배너 보기`}
                    />
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="grid md:grid-cols-[240px_minmax(0,1fr)]">
          <div className="flex items-center border-b border-slate-200 bg-gradient-to-br from-slate-900 to-slate-700 px-4 py-4 text-white sm:px-5 sm:py-5 md:border-b-0 md:border-r">
            <span className="mr-2.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-orange-500 text-white shadow-sm ring-1 ring-white/20 sm:mr-3 sm:h-10 sm:w-10">
              <Boxes className="h-[18px] w-[18px] sm:h-5 sm:w-5" strokeWidth={2.2} aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <h2 className="whitespace-nowrap text-base font-black leading-tight sm:text-lg">오늘의 대여 현황</h2>
              <p className="mt-1.5 text-xs font-semibold text-slate-300">({formatKoreaReferenceDate()})</p>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-px bg-slate-200 lg:grid-cols-6">
            {summaryItems.map(([Icon, label, value, tone]) => (
              <div key={label} className="flex min-h-[78px] items-center justify-center gap-2 bg-white px-2 py-3 sm:min-h-[84px] sm:px-3">
                <span className={`hidden h-8 w-8 shrink-0 items-center justify-center rounded-xl sm:flex ${tone}`}><Icon size={16} /></span>
                <div className="text-center sm:text-left">
                  <div className="text-[10px] font-semibold text-slate-500 sm:text-[11px]">{label}</div>
                  <div className="mt-0.5 text-lg font-black text-slate-900 sm:text-xl">{value}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className={`grid items-stretch gap-5 ${promotionBanners.length > 0 ? 'lg:grid-cols-2' : 'grid-cols-1'}`}>
        <div className="flex min-h-[300px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
            <h2 className="text-base font-black text-slate-900">공지사항</h2>
            <button type="button" onClick={goToUserNotice} className="text-xs font-bold text-slate-500 transition hover:text-orange-600">+ 더보기</button>
          </div>
          <div className="flex-1 px-5 py-2">
            {!noticePostsReady ? (
              <div className="flex h-full min-h-[220px] items-center justify-center text-xs text-slate-400">공지사항을 불러오는 중입니다.</div>
            ) : noticePostsLoadErrorMessage ? (
              <div className="my-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-700">{noticePostsLoadErrorMessage}</div>
            ) : homeNotices.length === 0 ? (
              <div className="flex h-full min-h-[220px] items-center justify-center text-xs text-slate-400">등록된 공지사항이 없습니다.</div>
            ) : (
              <div className="divide-y divide-slate-100">
                {homeNotices.map((post) => (
                  <button key={post.id} type="button" onClick={() => openHomeNotice(post)} className="flex w-full items-center gap-4 py-3 text-left transition hover:text-orange-600">
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{post.title}</span>
                    <span className="shrink-0 text-[11px] text-slate-400">{formatFirestoreDate(post.createdAt)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {promotionBanners.length > 0 && (
          <div className="grid h-full grid-cols-2 gap-2 sm:gap-3">
            {promotionSlots.map((banner, index) => (
              banner ? (
                <div key={banner.id} className={`${promotionConfig.aspectClass} min-h-0 overflow-hidden rounded-2xl bg-slate-100 shadow-sm`}>
                  {renderClickableBanner(
                    banner,
                    <ResponsiveBannerImage banner={banner} className="transition duration-300 hover:scale-[1.02]" />,
                    'block h-full w-full overflow-hidden rounded-2xl focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2'
                  )}
                </div>
              ) : (
                <div key={`empty-${index}`} aria-hidden="true" className={promotionConfig.aspectClass} />
              )
            ))}
          </div>
        )}
      </section>

      {quickLinkBanners.length > 0 && (
        <section className="home-quick-ticker rounded-2xl border border-slate-200 bg-white shadow-sm" aria-label="바로가기 배너">
          {quickLinkBanners.length === 1 ? (
            <div className="flex h-[56px] w-full items-center justify-center">
              <a
                href={quickLinkBanners[0].linkValue}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-[56px] items-center px-5 py-2 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-orange-500"
                title={quickLinkBanners[0].title || quickLinkBanners[0].altText || '바로가기'}
              >
                <img src={quickLinkBanners[0].imageUrl} alt={quickLinkBanners[0].altText || quickLinkBanners[0].title || ''} className="h-10 w-auto max-w-[240px] object-contain" />
              </a>
            </div>
          ) : (
            <div className="home-quick-ticker-viewport h-[56px]">
              <div className="home-quick-ticker-track home-quick-ticker-animate h-[56px]">
                {[0, 1].map((groupIndex) => (
                  <div
                    key={`quick-group-${groupIndex}`}
                    className="home-quick-ticker-group h-[56px]"
                    aria-hidden={groupIndex === 1 ? 'true' : undefined}
                  >
                    {quickLinkBanners.map((banner) => (
                      <a
                        key={`${banner.id}-${groupIndex}`}
                        href={banner.linkValue}
                        target="_blank"
                        rel="noopener noreferrer"
                        tabIndex={groupIndex === 1 ? -1 : undefined}
                        className="inline-flex h-[56px] shrink-0 items-center px-5 py-2 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-orange-500"
                        title={banner.title || banner.altText || '바로가기'}
                      >
                        <img src={banner.imageUrl} alt={groupIndex === 1 ? '' : banner.altText || banner.title || ''} className="h-10 w-auto max-w-[240px] object-contain" />
                      </a>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      {bannerLoadError && bannersReady && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">{bannerLoadError}</div>
      )}
    </div>
  );
}
