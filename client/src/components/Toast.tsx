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
            className={`corner-popup fixed top-24 right-4 z-[80] w-[min(22rem,calc(100vw-2rem))] rounded-2xl border bg-white p-4 shadow-2xl flex items-start gap-3 ${
                success ? 'border-emerald-100' : 'border-red-100'
            }`}
        >
            {success
                ? <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                : <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />}
            <div className="min-w-0 flex-1">
                <p className={`text-[10px] font-black uppercase tracking-widest ${success ? 'text-emerald-600' : 'text-red-600'}`}>
                    {success ? 'Success' : 'Notice'}
                </p>
                <p className={`mt-1 text-sm font-bold leading-relaxed ${success ? 'text-emerald-800' : 'text-red-800'}`}>
                    {message}
                </p>
            </div>
            <button
                type="button"
                aria-label="Dismiss message"
                onClick={() => onCloseRef.current()}
                className="shrink-0 rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
            >
                <X className="w-4 h-4" />
            </button>
        </div>,
        document.body,
    );
}
