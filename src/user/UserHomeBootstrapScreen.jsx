import { useEffect, useMemo, useState } from 'react';

import {
  getCachedUserHomeBootstrap,
  preloadUserHomeBootstrap,
} from './userHomeBootstrapService.js';

const DEFAULT_SITE_NAME = '기기 대여 시스템';

const getMillis = (value) => {
  if (!value) return 0;
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  if (Number.isFinite(Number(value?.millis))) return Number(value.millis);
  if (Number.isFinite(Number(value))) return Number(value);
  return 0;
};

const getHomePresentation = (bootstrap) => {
  const siteDocument = bootstrap?.siteSettings?.documents?.find((item) => item.key === 'siteSettings/config');
  const siteSettings = siteDocument?.payload || {};
  const now = Date.now();
  const hero = (bootstrap?.home?.documents || [])
    .filter((item) => item.key?.startsWith('homeBanners/'))
    .map((item) => ({ ...item.payload, sortOrder: item.sortOrder ?? item.payload?.sortOrder, visibility: item.publicVisibility }))
    .filter((item) => item.enabled !== false && item.placement === 'hero' && item.visibility?.active !== false)
    .sort((left, right) => (Number(left.sortOrder) || 0) - (Number(right.sortOrder) || 0) || getMillis(left.createdAt) - getMillis(right.createdAt))[0] || null;
  return { siteSettings, hero, now };
};

export default function UserHomeBootstrapScreen() {
  const [bootstrap, setBootstrap] = useState(() => getCachedUserHomeBootstrap());

  useEffect(() => {
    let active = true;
    if (bootstrap) return () => { active = false; };
    void preloadUserHomeBootstrap()
      .then((value) => {
        if (active) setBootstrap(value);
      })
      .catch(() => {});
    return () => { active = false; };
  }, [bootstrap]);

  const { siteSettings, hero } = useMemo(() => getHomePresentation(bootstrap), [bootstrap]);
  const siteName = String(siteSettings.siteName || DEFAULT_SITE_NAME).trim() || DEFAULT_SITE_NAME;
  const logoUrl = siteSettings.logoMode === 'image' ? String(siteSettings.logoImageUrl || '').trim() : '';
  const mobileLogoUrl = siteSettings.logoMode === 'image' ? String(siteSettings.mobileLogoImageUrl || '').trim() : '';
  const heroImageUrl = String(hero?.imageUrl || '').trim();
  const heroMobileImageUrl = String(hero?.mobileImageUrl || '').trim();
  const showSystemBanner = Boolean(bootstrap && siteSettings.systemBannerEnabled && siteSettings.systemBannerMessage);
  const heroTitle = String(hero?.title || siteSettings.defaultHeroTitle || siteName).trim();
  const heroSubtitle = String(hero?.subtitle || siteSettings.defaultHeroDescription || '').trim();

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 font-sans text-slate-900 antialiased">
      {showSystemBanner ? (
        <div
          className={`border-b px-4 py-2 text-center text-sm font-bold leading-5 ${
            siteSettings.systemBannerLevel === 'critical'
              ? 'border-rose-300 bg-rose-600 text-white'
              : siteSettings.systemBannerLevel === 'warning'
                ? 'border-amber-300 bg-amber-100 text-amber-900'
                : 'border-sky-300 bg-sky-100 text-sky-900'
          }`}
        >
          {siteSettings.systemBannerUrl ? (
            <a href={siteSettings.systemBannerUrl} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
              {siteSettings.systemBannerMessage}
            </a>
          ) : siteSettings.systemBannerMessage}
        </div>
      ) : null}
      <header className="border-b border-slate-200/80 bg-white/95">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-3 px-4 py-3 sm:px-6 sm:py-4 lg:flex-row lg:items-center lg:justify-between">
          <a href="/" className="flex min-w-0 items-center gap-3.5 text-left sm:gap-4">
            {logoUrl ? (
              <picture className="shrink-0">
                {mobileLogoUrl ? <source media="(max-width: 639px)" srcSet={mobileLogoUrl} /> : null}
                <img src={logoUrl} alt={siteSettings.logoAltText || siteName} className="h-11 max-w-[150px] object-contain sm:h-12" loading="eager" decoding="async" fetchPriority="high" />
              </picture>
            ) : null}
            <div className="min-w-0">
              <h1 className="break-keep text-[16px] font-bold leading-snug tracking-tight text-slate-900 sm:text-lg lg:text-[21px]">{siteName}</h1>
            </div>
          </a>
          <nav className="flex flex-wrap items-center justify-end gap-4 text-sm font-semibold text-slate-700 sm:gap-6">
            <a href="/rental" className="rounded-lg px-2.5 py-2 hover:bg-slate-100">대여신청</a>
            <a href="/history" className="rounded-lg px-2.5 py-2 hover:bg-slate-100">신청내역</a>
            <a href="/board/notice" className="rounded-lg px-2.5 py-2 hover:bg-slate-100">커뮤니티</a>
            <a href="/signup" className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs">회원가입</a>
            <a href="/login" className="rounded-lg bg-slate-950 px-3 py-2 text-xs text-white">로그인</a>
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-8">
        <section className="relative overflow-hidden rounded-2xl bg-slate-900 shadow-sm">
          {!bootstrap ? (
            <div className="aspect-[4/3] bg-slate-900 sm:aspect-[16/7] lg:aspect-[3/1]" aria-busy="true" aria-label="메인 비주얼 준비 중" />
          ) : heroImageUrl ? (
            <div className="relative aspect-[4/3] sm:aspect-[16/7] lg:aspect-[3/1]">
              <picture>
                {heroMobileImageUrl ? <source media="(max-width: 639px)" srcSet={heroMobileImageUrl} /> : null}
                <img src={heroImageUrl} alt={hero?.altText || heroTitle} className="absolute inset-0 h-full w-full object-cover" loading="eager" decoding="async" fetchPriority="high" />
              </picture>
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/35 to-transparent px-6 pb-12 pt-24 text-center text-white sm:pb-14">
                {heroTitle ? <h2 className="text-2xl font-black tracking-tight sm:text-3xl lg:text-[40px]">{heroTitle}</h2> : null}
                {heroSubtitle ? <p className="mx-auto mt-3 max-w-3xl text-sm font-semibold leading-6 text-white/95 sm:text-base">{heroSubtitle}</p> : null}
              </div>
            </div>
          ) : (
            <div className="relative aspect-[4/3] overflow-hidden bg-gradient-to-br from-slate-950 via-slate-800 to-orange-700 sm:aspect-[16/7] lg:aspect-[3/1]">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_75%_20%,rgba(255,255,255,0.18),transparent_34%)]" />
              <div className="absolute inset-x-0 bottom-0 px-6 pb-10 pt-24 text-center text-white">
                <h2 className="text-2xl font-black tracking-tight sm:text-3xl lg:text-4xl">{heroTitle}</h2>
                {heroSubtitle ? <p className="mx-auto mt-3 max-w-3xl text-sm font-semibold leading-6 text-white/90 sm:text-base">{heroSubtitle}</p> : null}
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
