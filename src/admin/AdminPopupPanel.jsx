import { useMemo, useState } from 'react';
import {
  Edit3,
  Monitor,
  Plus,
  Search,
  Smartphone,
  Trash2,
} from 'lucide-react';

const PAGE_SIZE = 10;

const STATUS_OPTIONS = [
  ['all', '전체 상태'],
  ['active', '노출중'],
  ['scheduled', '노출예정'],
  ['ended', '노출종료'],
  ['disabled', '사용안함'],
];

const PAGE_OPTIONS = [
  ['all', '전체 페이지'],
  ['home', '초기화면'],
  ['rental', '대여 신청'],
];

const statusClassName = {
  active: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  scheduled: 'border-sky-200 bg-sky-50 text-sky-700',
  ended: 'border-slate-200 bg-slate-100 text-slate-600',
  disabled: 'border-rose-200 bg-rose-50 text-rose-700',
};

export default function AdminPopupPanel({ ctx }) {
  const {
    AdminPageHeader,
    Button,
    confirmDeletePopupPost,
    formatPopupDateTime,
    getPopupDisplayStatus,
    openPopupPostDialog,
    popupPostDeletingId,
    popupPostToggleSavingId,
    popupPosts,
    popupPostsLoadErrorMessage,
    popupPostsReady,
    popupNowMs,
    togglePopupPostEnabled,
  } = ctx;

  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [pageFilter, setPageFilter] = useState('all');
  const [page, setPage] = useState(1);

  const filteredPosts = useMemo(() => {
    const normalizedQuery = String(query || '').trim().toLowerCase();

    return (popupPosts || []).filter((post) => {
      const status = getPopupDisplayStatus(post, popupNowMs).key;
      if (statusFilter !== 'all' && status !== statusFilter) return false;
      if (
        pageFilter !== 'all' &&
        !(Array.isArray(post.targetPages) ? post.targetPages : []).includes(pageFilter)
      ) {
        return false;
      }

      if (!normalizedQuery) return true;

      return [post.title, post.subtitle, post.contentText, post.content]
        .some((value) => String(value || '').toLowerCase().includes(normalizedQuery));
    });
  }, [getPopupDisplayStatus, pageFilter, popupNowMs, popupPosts, query, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredPosts.length / PAGE_SIZE));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const paginatedPosts = filteredPosts.slice(
    (safePage - 1) * PAGE_SIZE,
    safePage * PAGE_SIZE
  );

  const resetPage = () => setPage(1);

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="팝업 관리"
        description="사용자 초기화면과 대여 신청 페이지에 표시할 팝업을 등록하고 노출 일정을 관리합니다."
        actions={
          <Button
            type="button"
            variant="primary"
            className="shrink-0 px-4 py-2 text-xs"
            onClick={() => openPopupPostDialog()}
          >
            <Plus size={14} />
            팝업 등록
          </Button>
        }
      />

      <div className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 lg:grid-cols-[minmax(0,1fr)_180px_180px]">
        <div>
          <label className="block text-[11px] font-semibold text-slate-600">팝업 검색</label>
          <div className="relative mt-2">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              size={16}
            />
            <input
              type="search"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                resetPage();
              }}
              placeholder="제목, 부제목 또는 본문 검색"
              className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-xs outline-none transition mk-form-focus"
            />
          </div>
        </div>

        <label className="block text-[11px] font-semibold text-slate-600">
          현재 상태
          <select
            value={statusFilter}
            onChange={(event) => {
              setStatusFilter(event.target.value);
              resetPage();
            }}
            className="mt-2 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 outline-none mk-form-focus"
          >
            {STATUS_OPTIONS.map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </label>

        <label className="block text-[11px] font-semibold text-slate-600">
          노출 페이지
          <select
            value={pageFilter}
            onChange={(event) => {
              setPageFilter(event.target.value);
              resetPage();
            }}
            className="mt-2 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 outline-none mk-form-focus"
          >
            {PAGE_OPTIONS.map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </label>
      </div>

      {!popupPostsReady ? (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 py-12 text-center text-xs text-slate-400">
          팝업을 불러오는 중입니다.
        </div>
      ) : popupPostsLoadErrorMessage ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 text-xs leading-5 text-rose-800">
          {popupPostsLoadErrorMessage}
        </div>
      ) : popupPosts.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 py-12 text-center text-xs text-slate-400">
          등록된 팝업이 없습니다.
        </div>
      ) : filteredPosts.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 py-12 text-center text-xs text-slate-400">
          검색 또는 필터 조건에 맞는 팝업이 없습니다.
        </div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full min-w-[820px] table-fixed border-collapse text-left">
              <thead className="bg-slate-50 text-[11px] font-semibold text-slate-600">
                <tr>
                  <th className="w-[52px] border-b border-slate-200 px-1.5 py-3 text-center">번호</th>
                  <th className="w-16 border-b border-slate-200 px-2 py-3 text-center">사용</th>
                  <th className="border-b border-slate-200 px-3 py-3">제목·부제목</th>
                  <th className="w-[90px] border-b border-slate-200 px-1 py-3 text-center">노출 페이지</th>
                  <th className="w-[120px] border-b border-slate-200 px-1 py-3 text-center">노출 기간</th>
                  <th className="w-20 border-b border-slate-200 px-2 py-3 text-center">현재 상태</th>
                  <th className="w-24 border-b border-slate-200 px-2 py-3 text-center">등록일</th>
                  <th className="w-20 border-b border-slate-200 px-2 py-3 text-center">관리</th>
                </tr>
              </thead>

              <tbody>
                {paginatedPosts.map((post, index) => {
                  const status = getPopupDisplayStatus(post, popupNowMs);
                  const rowNumber = filteredPosts.length - ((safePage - 1) * PAGE_SIZE + index);
                  const targetPages = Array.isArray(post.targetPages) ? post.targetPages : [];
                  const title = String(post.title || '').trim();
                  const subtitle = String(post.subtitle || '').trim();

                  return (
                    <tr key={post.id} className="border-b border-slate-100 align-middle last:border-b-0 hover:bg-slate-50">
                      <td className="px-1.5 py-3 text-center text-xs text-slate-500">{rowNumber}</td>
                      <td className="px-2 py-3 text-center">
                        <button
                          type="button"
                          role="switch"
                          aria-checked={Boolean(post.enabled)}
                          disabled={popupPostToggleSavingId === post.id}
                          onClick={() => togglePopupPostEnabled(post)}
                          className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${
                            post.enabled ? 'bg-emerald-500' : 'bg-slate-300'
                          } disabled:cursor-wait disabled:opacity-60`}
                          title={post.enabled ? '사용함' : '사용안함'}
                        >
                          <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition ${post.enabled ? 'translate-x-6' : 'translate-x-1'}`} />
                        </button>
                      </td>
                      <td className="min-w-0 px-3 py-3">
                        <div className="truncate text-sm font-bold text-slate-800">
                          {title || subtitle || '제목 없음 · 본문/미디어 팝업'}
                        </div>
                        {title && subtitle && (
                          <div className="mt-1 truncate text-[11px] text-slate-500">{subtitle}</div>
                        )}
                      </td>
                      <td className="px-1 py-3 text-center">
                        <div className="flex flex-col items-center justify-center gap-1">
                          {targetPages.includes('home') && (
                            <span className="inline-flex items-center gap-1 rounded-full border border-sky-200 bg-sky-50 px-1.5 py-0.5 text-[10px] font-bold text-sky-700">
                              <Monitor size={10} /> 초기화면
                            </span>
                          )}
                          {targetPages.includes('rental') && (
                            <span className="inline-flex items-center gap-1 rounded-full border border-orange-200 bg-orange-50 px-1.5 py-0.5 text-[10px] font-bold text-orange-700">
                              <Smartphone size={10} /> 대여 신청
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-1 py-3 text-center text-[10px] leading-[1.25] text-slate-600">
                        <div className="whitespace-nowrap">{formatPopupDateTime(post.startAt)}</div>
                        <div className="whitespace-nowrap text-slate-500">~ {post.isIndefinite ? '무기한' : formatPopupDateTime(post.endAt)}</div>
                      </td>
                      <td className="px-2 py-3 text-center">
                        <span className={`inline-flex rounded-full border px-1.5 py-0.5 text-[10px] font-bold ${statusClassName[status.key] || statusClassName.ended}`}>
                          {status.label}
                        </span>
                      </td>
                      <td className="px-2 py-3 text-center text-[11px] text-slate-500">{formatPopupDateTime(post.createdAt, true)}</td>
                      <td className="px-1 py-3">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            type="button"
                            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 transition hover:bg-slate-50 active:scale-[0.98]"
                            title="수정"
                            aria-label="팝업 수정"
                            onClick={() => openPopupPostDialog(post)}
                          >
                            <Edit3 size={14} aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-rose-200 bg-white text-rose-600 transition hover:bg-rose-50 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50"
                            title={popupPostDeletingId === post.id ? '삭제 중' : '삭제'}
                            aria-label={popupPostDeletingId === post.id ? '팝업 삭제 중' : '팝업 삭제'}
                            disabled={popupPostDeletingId === post.id}
                            onClick={() => confirmDeletePopupPost(post)}
                          >
                            <Trash2 size={14} aria-hidden="true" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-center gap-2">
            <Button type="button" variant="outline" className="px-3 py-2 text-xs" disabled={safePage <= 1} onClick={() => setPage((prev) => Math.max(1, prev - 1))}>이전</Button>
            <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600">{safePage} / {totalPages}</div>
            <Button type="button" variant="outline" className="px-3 py-2 text-xs" disabled={safePage >= totalPages} onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}>다음</Button>
          </div>
        </>
      )}
    </div>
  );
}
