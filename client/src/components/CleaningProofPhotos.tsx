import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Maximize2, X } from 'lucide-react';
import SecureImage from './SecureImage';

type Phase = {
  label: string;
  path?: string | null;
  capturedAt?: string | null;
};

export function formatPhotoTimestamp(value?: string | null): string {
  if (!value) return 'No timestamp';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'No timestamp';
  return date.toLocaleString('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function CleaningProofPhotos({
  beforePath,
  beforeCapturedAt,
  afterPath,
  afterCapturedAt,
  studentName = 'Student',
  layout = 'review',
}: {
  beforePath?: string | null;
  beforeCapturedAt?: string | null;
  afterPath?: string | null;
  afterCapturedAt?: string | null;
  studentName?: string;
  layout?: 'review' | 'compact';
}) {
  const [open, setOpen] = useState<Phase | null>(null);
  const phases: Phase[] = [
    { label: 'Before', path: beforePath, capturedAt: beforeCapturedAt },
    { label: 'After', path: afterPath, capturedAt: afterCapturedAt },
  ].filter((phase) => Boolean(phase.path));

  if (phases.length === 0) {
    return <p className="text-sm text-slate-500">No photos submitted.</p>;
  }

  const compact = layout === 'compact';

  return (
    <>
      <div className={compact ? 'mt-3 grid max-w-[240px] grid-cols-2 gap-2' : 'grid grid-cols-1 gap-4 sm:grid-cols-2'}>
        {phases.map((phase) => (
          <button
            key={phase.label}
            type="button"
            onClick={() => setOpen(phase)}
            className="text-left"
          >
            <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">{phase.label}</p>
            <SecureImage
              filePath={phase.path || ''}
              altText={`${studentName} ${phase.label.toLowerCase()} cleaning`}
              className={
                compact
                  ? 'h-16 w-full rounded-lg border border-slate-200 object-cover'
                  : 'h-72 w-full rounded-xl border border-slate-200 bg-slate-100 object-contain'
              }
            />
            <p className={`mt-1 font-semibold text-slate-800 ${compact ? 'text-[10px] leading-tight' : 'text-sm'}`}>
              {formatPhotoTimestamp(phase.capturedAt)}
            </p>
            {!compact && (
              <span className="mt-1 inline-flex items-center gap-1 text-xs font-bold text-blue-700">
                <Maximize2 className="h-3.5 w-3.5" /> View full size
              </span>
            )}
          </button>
        ))}
      </div>
      {open?.path && createPortal(
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/90 p-4"
          onClick={() => setOpen(null)}
        >
          <div className="flex max-h-[96vh] w-full max-w-5xl flex-col" onClick={(event) => event.stopPropagation()}>
            <div className="mb-3 flex items-start justify-between gap-4 text-white">
              <div>
                <p className="text-sm font-bold uppercase tracking-wider text-slate-300">{open.label} photo</p>
                <p className="mt-1 text-2xl font-semibold">{formatPhotoTimestamp(open.capturedAt)}</p>
              </div>
              <button type="button" onClick={() => setOpen(null)} className="rounded-lg p-2 hover:bg-white/10" aria-label="Close photo">
                <X className="h-6 w-6" />
              </button>
            </div>
            <SecureImage
              filePath={open.path}
              altText={`${studentName} ${open.label.toLowerCase()} cleaning, full size`}
              className="max-h-[82vh] w-full object-contain"
            />
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
