import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { Download, FileText, ShieldCheck, X, AlertCircle } from 'lucide-react';
import { bindPopup } from '../utils/popupDismiss';
import { fetchSecureFile, type SecureFilePayload } from '../utils/secureFile';

type SecureFileViewerModalProps = {
  filePath: string | null;
  title?: string;
  onClose: () => void;
};

export default function SecureFileViewerModal({
  filePath,
  title = 'Document',
  onClose,
}: SecureFileViewerModalProps) {
  const [payload, setPayload] = useState<SecureFilePayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!filePath) {
      setPayload(null);
      setError('');
      setLoading(false);
      return;
    }

    let cancelled = false;
    let objectUrl: string | null = null;

    const load = async () => {
      setLoading(true);
      setError('');
      setPayload(null);
      try {
        const next = await fetchSecureFile(filePath);
        if (cancelled) {
          URL.revokeObjectURL(next.url);
          return;
        }
        objectUrl = next.url;
        setPayload(next);
      } catch (err: any) {
        if (!cancelled) {
          setError(err?.response?.data?.message || err?.message || 'Could not open this document.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [filePath]);

  if (!filePath) return null;

  const downloadName = payload
    ? (/\.[a-z0-9]{2,5}$/i.test(title)
        ? title
        : payload.kind === 'pdf'
            ? `${title}.pdf`
            : payload.kind === 'image' && payload.mime === 'image/png'
                ? `${title}.png`
                : payload.kind === 'image'
                    ? `${title}.jpg`
                    : title)
    : title;

  return createPortal(
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm"
      {...bindPopup(onClose)}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
        className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="relative flex items-center justify-between gap-3 overflow-hidden bg-slate-950 px-6 py-4 text-white">
          <div
            className="pointer-events-none absolute inset-0 opacity-20"
            style={{
              backgroundImage: 'radial-gradient(rgba(148,163,184,0.4) 1px, transparent 1px)',
              backgroundSize: '18px 18px',
            }}
            aria-hidden="true"
          />
          <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-blue-600/25 blur-2xl" aria-hidden="true" />
          <div className="relative z-10 flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-500/20 text-blue-300 ring-1 ring-blue-400/30">
              <FileText className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="flex items-center gap-1 text-[10px] font-extrabold uppercase tracking-widest text-blue-300">
                <ShieldCheck className="h-3 w-3" /> Secure Document
              </p>
              <h3 className="truncate text-base font-black tracking-tight text-white">{title}</h3>
            </div>
          </div>
          <div className="relative z-10 flex shrink-0 items-center gap-2">
            {payload && (
              <a
                href={payload.url}
                download={downloadName}
                className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-3.5 py-2 text-xs font-extrabold uppercase tracking-wider text-white shadow-sm shadow-blue-600/30 transition hover:bg-blue-500"
              >
                <Download className="h-3.5 w-3.5" /> Download
              </a>
            )}
            <button
              type="button"
              onClick={onClose}
              className="shrink-0 rounded-xl border border-white/10 bg-white/5 p-2 text-slate-300 transition hover:bg-white/15 hover:text-white"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto bg-slate-50/80 p-4 sm:p-6">
          {loading && (
            <div className="flex flex-col items-center justify-center gap-3 py-24">
              <div className="h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-blue-600" />
              <p className="text-xs font-extrabold uppercase tracking-widest text-slate-400">Loading document…</p>
            </div>
          )}

          {!loading && error && (
            <div className="flex items-center justify-center gap-2.5 rounded-2xl border border-rose-200 bg-rose-50 px-5 py-6 text-center">
              <AlertCircle className="h-5 w-5 shrink-0 text-rose-600" />
              <p className="text-sm font-bold text-rose-800">{error}</p>
            </div>
          )}

          {!loading && !error && payload?.kind === 'image' && (
            <div className="flex justify-center">
              <img
                src={payload.url}
                alt={title}
                className="h-auto max-w-full rounded-2xl border border-slate-200 bg-white shadow-md"
              />
            </div>
          )}

          {!loading && !error && payload?.kind === 'pdf' && (
            <iframe
              title={title}
              src={payload.url}
              className="h-[min(70vh,720px)] w-full rounded-2xl border border-slate-200 bg-white shadow-sm"
            />
          )}

          {!loading && !error && payload?.kind === 'other' && (
            <div className="space-y-4 rounded-2xl border border-slate-200 bg-white px-6 py-12 text-center shadow-2xs">
              <p className="text-sm font-semibold text-slate-600">
                This file type can’t be previewed here.
              </p>
              <a
                href={payload.url}
                download={downloadName}
                className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-extrabold uppercase tracking-wider text-white transition hover:bg-blue-600"
              >
                <Download className="h-3.5 w-3.5" /> Download file
              </a>
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>,
    document.body,
  );
}
