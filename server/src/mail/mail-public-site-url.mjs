// Public-only site links, independent of provider credentials and request origin.
const safeUrl=value=>typeof value==='string'&&/^https:\/\/[a-z0-9.-]+(?::443)?(?:\/[a-z0-9_/?#=&%.-]*)?$/i.test(value)?value:'';
export const getMailPublicSiteUrl=(env=process.env)=>safeUrl(env.MAIL_PUBLIC_SITE_URL)||
  ((env.APP_ENV||'').toLowerCase()==='staging'?'https://mkrental.vercel.app/':'https://notebook.recruit.kro.kr/');
