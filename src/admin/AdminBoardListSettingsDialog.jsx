import { Save, SlidersHorizontal, X } from 'lucide-react';

import ModalPortal from '../components/ModalPortal.jsx';

export default function AdminBoardListSettingsDialog({
  open,
  title,
  description,
  selectLabel,
  value,
  options = [],
  ready,
  saving,
  errorMessage,
  Button,
  onChange,
  onDiscard,
  onSave,
  onClose,
}) {
  if (!open) return null;

  const closeDialog = () => {
    if (saving) return;
    onDiscard?.();
    onClose?.();
  };

  const saveSettings = async () => {
    const saved = await onSave?.();
    if (saved) onClose?.();
  };

  return (
    <ModalPortal className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/55 p-4">
      <div className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <SlidersHorizontal size={17} className="shrink-0 text-orange-500" />
              <h3 className="text-base font-black text-slate-900">{title}</h3>
            </div>
            <p className="mt-1 text-[11px] leading-5 text-slate-500">{description}</p>
          </div>
          <button
            type="button"
            onClick={closeDialog}
            disabled={saving}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-600 disabled:opacity-50"
            aria-label="닫기"
          >
            <X size={16} />
          </button>
        </div>

        <div className="space-y-4 p-5">
          <label className="block">
            <span className="mb-1.5 block text-xs font-bold text-slate-700">{selectLabel}</span>
            <select
              value={String(value)}
              onChange={(event) => onChange?.(Number(event.target.value))}
              disabled={!ready || saving}
              className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs outline-none mk-form-border-focus disabled:bg-slate-100 disabled:text-slate-400"
            >
              {options.map((option) => (
                <option key={option} value={option}>{option}개</option>
              ))}
            </select>
          </label>

          {errorMessage ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-5 text-amber-800">
              {errorMessage}
            </div>
          ) : null}

          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
            <Button type="button" variant="outline" onClick={closeDialog} disabled={saving}>취소</Button>
            <Button
              type="button"
              variant="primary"
              onClick={() => void saveSettings()}
              disabled={!ready || saving}
            >
              <Save size={14} />
              {saving ? '저장 중' : '설정 저장'}
            </Button>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
