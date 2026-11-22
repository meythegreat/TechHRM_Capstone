import { useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { Camera, Maximize2, X } from 'lucide-react';
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
    hour12: true,
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
    return (
      <p className="rounded-xl border border-dashed border-slate-200 bg-white/70 px-3.5 py-2.5 text-xs font-medium text-slate-500">
        No photos submitted.
      </p>
    );
  }

  const compact = layout === 'compact';

  return (
    <>
      <div className={compact ? 'mt-3 grid max-w-[260px] grid-cols-2 gap-2.5' : 'grid grid-cols-1 gap-4 sm:grid-cols-2'}>
        {phases.map((phase) => (
          <button
            key={phase.label}
            type="button"
            onClick={() => setOpen(phase)}
            className={`group overflow-hidden border border-slate-200/90 bg-white text-left transition hover:border-blue-300 hover:shadow-md ${
              compact ? 'rounded-xl p-1.5 shadow-2xs' : 'rounded-2xl p-3 shadow-xs'
            }`}
          >
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-slate-600">
                <Camera className="h-3 w-3 text-blue-500" />
                {phase.label}
              </span>
              {!compact && (
                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-600 transition group-hover:text-blue-700">
                  <Maximize2 className="h-3.5 w-3.5" /> Full size
                </span>
              )}
            </div>
            <div className="overflow-hidden rounded-xl border border-slate-100 bg-slate-100">
              <SecureImage
                filePath={phase.path || ''}
                altText={`${studentName} ${phase.label.toLowerCase()} cleaning`}
                className={
                  compact
                    ? 'h-16 w-full object-cover transition duration-300 group-hover:scale-105'
                    : 'h-64 w-full object-contain transition duration-300 group-hover:scale-[1.02]'
                }
              />
            </div>
            <p className={`mt-2 font-mono font-bold text-slate-700 ${compact ? 'text-[10px] leading-tight' : 'text-xs'}`}>
              {formatPhotoTimestamp(phase.capturedAt)}
            </p>
          </button>
        ))}
      </div>
      {open?.path && createPortal(
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="fixed inset-0 z-[95] flex items-center justify-center bg-slate-950/85 p-4 backdrop-blur-md"
          onClick={() => setOpen(null)}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="flex max-h-[94vh] w-full max-w-5xl flex-col overflow-hidden rounded-[2rem] border border-slate-800 bg-slate-950 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className="flex items-center justify-between gap-4 border-b border-white/10 px-6 py-4 text-white">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-500/20 text-blue-300 ring-1 ring-blue-400/30">
                  <Camera className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-[10px] font-extrabold uppercase tracking-widest text-blue-300">
                    {open.label} Photo · {studentName}
                  </p>
                  <p className="mt-0.5 font-mono text-sm font-black text-white">
                    {formatPhotoTimestamp(open.capturedAt)}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setOpen(null)}
                className="rounded-xl border border-white/10 bg-white/5 p-2 text-slate-300 transition hover:bg-white/15 hover:text-white"
                aria-label="Close photo"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex min-h-0 flex-1 items-center justify-center bg-black/50 p-4">
              <SecureImage
                filePath={open.path}
                altText={`${studentName} ${open.label.toLowerCase()} cleaning, full size`}
                className="max-h-[78vh] w-full rounded-xl object-contain"
              />
            </div>
          </motion.div>
        </motion.div>,
        document.body,
      )}
    </>
  );
}
