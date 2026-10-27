import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
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

  return (
    <div
      className="fixed inset-0 z-[80] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4"
      {...bindPopup(onClose)}
    >
      <div
        className="bg-white rounded-3xl shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="p-6 border-b border-slate-100 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Secure document</p>
            <h3 className="text-xl font-semibold text-slate-900 truncate">{title}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-700 shrink-0"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-auto bg-slate-50 p-4 sm:p-6">
          {loading && (
            <div className="flex flex-col items-center justify-center gap-3 py-24">
              <div className="w-10 h-10 border-4 border-slate-200 border-t-slate-700 rounded-full animate-spin" />
              <p className="text-sm font-medium text-slate-500">Loading document…</p>
            </div>
          )}

          {!loading && error && (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-6 text-center">
              <p className="text-sm font-semibold text-rose-800">{error}</p>
            </div>
          )}

          {!loading && !error && payload?.kind === 'image' && (
            <div className="flex justify-center">
              <img
                src={payload.url}
                alt={title}
                className="max-w-full h-auto rounded-2xl border border-slate-200 bg-white shadow-sm"
              />
            </div>
          )}

          {!loading && !error && payload?.kind === 'pdf' && (
            <iframe
              title={title}
              src={payload.url}
              className="w-full h-[min(70vh,720px)] rounded-2xl border border-slate-200 bg-white"
            />
          )}

          {!loading && !error && payload?.kind === 'other' && (
            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-10 text-center space-y-3">
              <p className="text-sm font-medium text-slate-600">
                This file type can’t be previewed here.
              </p>
              <a
                href={payload.url}
                download
                className="inline-flex px-4 py-2 rounded-xl bg-slate-900 text-white text-sm font-bold"
              >
                Download file
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
