export const DOMESTIC_PHONE_PREFIXES = [
  '010',
  '011',
  '016',
  '017',
  '018',
  '019',
  '070',
  '080',
  '02',
  '031',
  '032',
  '033',
  '041',
  '042',
  '043',
  '044',
  '051',
  '052',
  '053',
  '054',
  '055',
  '061',
  '062',
  '063',
  '064',
];

const KOREAN_PUBLIC_SUFFIXES = new Set([
  'ac.kr',
  'co.kr',
  'go.kr',
  'mil.kr',
  'ne.kr',
  'or.kr',
  'pe.kr',
  're.kr',
]);

const normalizeUnicode = (value) =>
  String(value || '').normalize('NFKC');

export const normalizeMemberName = (value) =>
  normalizeUnicode(value).replace(/\s+/g, '').trim();

export const normalizeMemberTeam = (value) =>
  normalizeUnicode(value).trim().replace(/\s+/g, ' ');

export const normalizeEmailAddress = (value) =>
  normalizeUnicode(value).trim().toLowerCase();

export const isValidMemberName = (value) =>
  /^[가-힣A-Za-z]{2,30}$/u.test(normalizeMemberName(value));

export const isValidEmailAddress = (value) => {
  const email = normalizeEmailAddress(value);

  if (!email || /[^\x00-\x7F]/.test(email) || /\s/.test(email)) {
    return false;
  }

  return /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/.test(
    email
  );
};

export const isValidMemberPassword = (value) =>
  /^(?=\S{8,}$)(?=.*[A-Za-z])(?=.*\d).+$/.test(String(value || ''));

export const normalizePhoneDigits = (value, maxLength) =>
  String(value || '')
    .replace(/\D/g, '')
    .slice(0, maxLength);

export const normalizePhoneMiddleDigits = (value) =>
  normalizePhoneDigits(value, 4).replace(/^0+/, '');

export const buildDomesticPhoneNumber = ({ prefix, middle, last }) => {
  const normalizedPrefix = DOMESTIC_PHONE_PREFIXES.includes(String(prefix || ''))
    ? String(prefix)
    : '';
  const normalizedMiddle = normalizePhoneMiddleDigits(middle);
  const normalizedLast = normalizePhoneDigits(last, 4);

  if (!normalizedPrefix && !normalizedMiddle && !normalizedLast) {
    return '';
  }

  return `${normalizedPrefix}-${normalizedMiddle}-${normalizedLast}`;
};

export const parseDomesticPhoneNumber = (value) => {
  const match = String(value || '')
    .trim()
    .match(/^(02|0\d{2})-(\d{3,4})-(\d{4})$/);

  if (!match || !DOMESTIC_PHONE_PREFIXES.includes(match[1])) {
    return {
      prefix: '010',
      middle: '',
      last: '',
    };
  }

  return {
    prefix: match[1],
    middle: match[2],
    last: match[3],
  };
};

export const isValidDomesticPhoneNumber = ({ prefix, middle, last }) =>
  DOMESTIC_PHONE_PREFIXES.includes(String(prefix || '')) &&
  /^[1-9]\d{2,3}$/.test(String(middle || '')) &&
  /^\d{4}$/.test(String(last || ''));

const maskSegment = (value) => {
  const segment = String(value || '');

  if (segment.length <= 1) return '*';
  if (segment.length === 2) return `${segment[0]}*`;

  return `${segment[0]}${'*'.repeat(segment.length - 2)}${segment.at(-1)}`;
};

export const maskEmailAddress = (value) => {
  const email = normalizeEmailAddress(value);

  if (!isValidEmailAddress(email)) return '';

  const [localPart, domainPart] = email.split('@');
  const domainLabels = domainPart.split('.');
  const lastTwoLabels = domainLabels.slice(-2).join('.');
  const preservedSuffixCount = KOREAN_PUBLIC_SUFFIXES.has(lastTwoLabels)
    ? 2
    : 1;
  const maskedDomainLabels = domainLabels.map((label, index) => {
    const isPreservedSuffix = index >= domainLabels.length - preservedSuffixCount;
    return isPreservedSuffix ? label : maskSegment(label);
  });

  return `${maskSegment(localPart)}@${maskedDomainLabels.join('.')}`;
};

const createSha256Key = async (source) => {
  const bytes = new TextEncoder().encode(String(source || ''));
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);

  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
};

export const getMemberIdentitySource = (team, name) =>
  `${normalizeMemberTeam(team).toLocaleLowerCase('ko-KR')}\u001f${normalizeMemberName(
    name
  ).toLocaleLowerCase('ko-KR')}`;

export const createMemberIdentityKey = async (team, name) =>
  createSha256Key(getMemberIdentitySource(team, name));

export const getAccountRecoverySource = ({ team, name, phone }) =>
  [
    normalizeMemberTeam(team).toLocaleLowerCase('ko-KR'),
    normalizeMemberName(name).toLocaleLowerCase('ko-KR'),
    String(phone || '').replace(/\D/g, ''),
  ].join('\u001f');

export const createAccountRecoveryKey = async ({ team, name, phone }) =>
  createSha256Key(getAccountRecoverySource({ team, name, phone }));
