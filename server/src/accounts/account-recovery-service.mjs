import { createHash } from 'node:crypto';

const trim = (value) => String(value ?? '').normalize('NFKC').trim();
const lower = (value) => trim(value).toLocaleLowerCase('ko-KR');
const sha256 = (value) => createHash('sha256').update(String(value || '')).digest('hex');
const recoverySource = ({ team, name, phone }) => [
  lower(team).replace(/\s+/g, ' '),
  lower(name).replace(/\s+/g, ''),
  String(phone || '').replace(/\D/g, ''),
].join('\u001f');
const recoveryKey = (input) => sha256(recoverySource(input));
const validName = (value) => /^[가-힣A-Za-z]{2,30}$/u.test(trim(value).replace(/\s+/g, ''));
const validPhone = (value) => /^(02|0\d{2})-\d{3,4}-\d{4}$/.test(trim(value));
const validEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trim(value));

const normalizeIdentity = (input = {}, { requireEmail = false } = {}) => {
  const name = trim(input.name).replace(/\s+/g, '');
  const team = trim(input.team).replace(/\s+/g, ' ');
  const phone = trim(input.phone);
  const email = trim(input.email).toLowerCase();

  if (!validName(name) || !team || !validPhone(phone) || (requireEmail && !validEmail(email))) {
    return null;
  }
  return Object.freeze({ name, team, phone, email });
};

export const createAccountRecoveryService = ({ repository }) => {
  if (!repository || typeof repository.findActiveByRecoveryKey !== 'function') {
    throw new TypeError('Account recovery repository is required.');
  }

  const resolve = async (input, options) => {
    const identity = normalizeIdentity(input, options);
    if (!identity) return null;
    const key = recoveryKey(identity);
    const account = await repository.findActiveByRecoveryKey(key);
    if (!account) return null;
    return { identity, account };
  };

  return Object.freeze({
    async findEmail(input) {
      const result = await resolve(input, { requireEmail: false });
      return Object.freeze({
        source: 'postgresql',
        found: Boolean(result?.account?.maskedEmail),
        maskedEmail: result?.account?.maskedEmail || '',
      });
    },

    async verifyPasswordReset(input) {
      const result = await resolve(input, { requireEmail: true });
      const verified = Boolean(
        result?.account?.email &&
        result.account.email.toLowerCase() === result.identity.email,
      );
      return Object.freeze({ source: 'postgresql', verified });
    },
  });
};
