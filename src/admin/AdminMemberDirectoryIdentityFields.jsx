import { useMemo } from 'react';

const normalize = (value) => String(value || '').normalize('NFKC').trim();

export const isMemberDirectoryIdentityMatch = ({ team, name } = {}, borrowers = []) => {
  const normalizedTeam = normalize(team);
  const normalizedName = normalize(name).replace(/\s+/g, '');
  return (borrowers || []).some((borrower) => (
    normalize(borrower?.team) === normalizedTeam &&
    normalize(borrower?.name).replace(/\s+/g, '') === normalizedName
  ));
};

export default function AdminMemberDirectoryIdentityFields({
  form,
  setForm,
  teams = [],
  borrowers = [],
  policyEnabled = false,
}) {
  const managed = Boolean(policyEnabled) && form.useManagedDirectory !== false;
  const teamOptions = useMemo(
    () => Array.from(new Set((teams || []).map(normalize).filter(Boolean))),
    [teams]
  );
  const memberOptions = useMemo(
    () => (borrowers || []).filter((borrower) => normalize(borrower?.team) === normalize(form.team)),
    [borrowers, form.team]
  );

  const changeManaged = (checked) => {
    if (!checked) {
      setForm((current) => ({ ...current, useManagedDirectory: false }));
      return;
    }
    setForm((current) => {
      const nextTeam = teamOptions.includes(normalize(current.team))
        ? normalize(current.team)
        : (teamOptions[0] || '');
      const matchingMembers = (borrowers || []).filter((borrower) => normalize(borrower?.team) === nextTeam);
      const currentName = normalize(current.name).replace(/\s+/g, '');
      const nextName = matchingMembers.some((borrower) => normalize(borrower?.name).replace(/\s+/g, '') === currentName)
        ? normalize(current.name)
        : '';
      return {
        ...current,
        useManagedDirectory: true,
        team: nextTeam,
        name: nextName,
      };
    });
  };

  return (
    <div className="space-y-3 sm:col-span-2">
      {policyEnabled ? (
        <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
          <input
            type="checkbox"
            checked={managed}
            onChange={(event) => changeManaged(event.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-slate-300 text-orange-500 focus:ring-orange-300"
          />
          <span>
            <span className="block text-xs font-bold text-slate-800">지정된 부서·사용자 명부 사용</span>
            <span className="mt-1 block text-[11px] leading-5 text-slate-500">
              회원 가입 정책에서 명부 사용이 활성화되어 있습니다. 기본적으로 등록된 부서명과 성명을 선택하며, 체크를 해제하면 이 회원에 한해 관리자가 직접 입력할 수 있습니다.
            </span>
          </span>
        </label>
      ) : null}

      {managed ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-xs font-bold text-slate-700">부서 / 팀</span>
            <select
              value={form.team}
              onChange={(event) => setForm((current) => ({ ...current, team: event.target.value, name: '' }))}
              className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs outline-none mk-form-border-focus"
            >
              <option value="">부서 선택</option>
              {teamOptions.map((team) => <option key={team} value={team}>{team}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-bold text-slate-700">성명</span>
            <select
              value={form.name}
              disabled={!form.team}
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs outline-none disabled:bg-slate-100 disabled:text-slate-400 mk-form-border-focus"
            >
              <option value="">{form.team ? '성명 선택' : '부서를 먼저 선택해 주세요'}</option>
              {memberOptions.map((borrower, index) => (
                <option key={`${borrower.team}-${borrower.name}-${index}`} value={normalize(borrower.name)}>{normalize(borrower.name)}</option>
              ))}
            </select>
          </label>
          {teamOptions.length === 0 ? (
            <div className="sm:col-span-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[11px] leading-5 text-amber-800">
              등록된 부서·사용자 명부가 없습니다. 부서·사용자 관리에서 명부를 등록하거나 위 체크를 해제해 직접 입력해 주세요.
            </div>
          ) : null}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-xs font-bold text-slate-700">부서 / 팀</span>
            <input
              value={form.team}
              onChange={(event) => setForm((current) => ({ ...current, team: event.target.value }))}
              maxLength={80}
              className="h-10 w-full rounded-xl border border-slate-200 px-3 text-xs outline-none mk-form-border-focus"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-bold text-slate-700">성명</span>
            <input
              value={form.name}
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              maxLength={30}
              className="h-10 w-full rounded-xl border border-slate-200 px-3 text-xs outline-none mk-form-border-focus"
            />
          </label>
        </div>
      )}
    </div>
  );
}
