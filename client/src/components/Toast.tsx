import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle, CheckCircle2, X } from 'lucide-react';

export type ToastType = 'success' | 'error';

interface ToastProps {
    message: string | null;
    type?: ToastType;
    onClose: () => void;
    duration?: number;
}

export default function Toast({ message, type = 'success', onClose, duration = 4000 }: ToastProps) {
    const onCloseRef = useRef(onClose);
    onCloseRef.current = onClose;

    useEffect(() => {
        if (!message) return;
        const timeout = window.setTimeout(() => onCloseRef.current(), duration);
        return () => window.clearTimeout(timeout);
    }, [message, type, duration]);

    if (!message) return null;

    const success = type === 'success';

    return createPortal(
        <div
            role="status"
            className={`corner-popup fixed right-4 top-20 z-[120] flex w-[min(23rem,calc(100vw-2rem))] items-start gap-3 overflow-hidden rounded-2xl border bg-white p-4 shadow-2xl shadow-slate-900/15 ${
                success ? 'border-emerald-200/90' : 'border-rose-200/90'
            }`}
        >
            <span
                aria-hidden="true"
                className={`absolute inset-y-2.5 left-0 w-1 rounded-r-full ${
                    success ? 'bg-emerald-500' : 'bg-rose-500'
                }`}
            />
            <span
                className={`ml-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ring-1 ${
                    success
                        ? 'bg-emerald-50 text-emerald-600 ring-emerald-200/70'
                        : 'bg-rose-50 text-rose-600 ring-rose-200/70'
                }`}
            >
                {success ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
            </span>
            <div className="min-w-0 flex-1 pt-0.5">
                <p
                    className={`text-[10px] font-extrabold uppercase tracking-widest ${
                        success ? 'text-emerald-600' : 'text-rose-600'
                    }`}
                >
                    {success ? 'Success' : 'Notice'}
                </p>
                <p className="mt-0.5 text-sm font-bold leading-snug text-slate-900">
                    {message}
                </p>
            </div>
            <button
                type="button"
                aria-label="Dismiss message"
                onClick={() => onCloseRef.current()}
                className="shrink-0 rounded-xl p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
            >
                <X className="h-4 w-4" />
            </button>
        </div>,
        document.body,
    );
}
