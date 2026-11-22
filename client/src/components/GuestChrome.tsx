import type { ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react';
import ThemeToggle from './ThemeToggle';
import { CAMPUS_LETTERHEAD } from '../constants/campusDocuments';

interface GuestHeaderProps {
    onBack?: () => void;
    backLabel?: string;
    extra?: ReactNode;
    primary?: ReactNode;
}

export function GuestBackdrop() {
    return (
        <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
            <div className="absolute inset-x-0 top-0 h-80 bg-gradient-to-b from-indigo-100/90 to-transparent" />
            <div className="absolute -left-20 top-16 h-64 w-64 rounded-full bg-indigo-300/30 blur-3xl" />
            <div className="absolute -right-10 top-0 h-72 w-72 rounded-full bg-blue-300/25 blur-3xl" />
            <div className="absolute inset-0 bg-[radial-gradient(circle,#c7d2fe_1px,transparent_1px)] [background-size:22px_22px] opacity-50" />
            <img
                src={CAMPUS_LETTERHEAD.sealSrc}
                alt=""
                className="absolute -bottom-16 -right-10 h-80 w-80 rounded-full object-cover opacity-[0.08]"
            />
        </div>
    );
}

export function GuestHeader({ onBack, backLabel = 'Back', extra, primary }: GuestHeaderProps) {
    return (
        <header className="relative z-20">
            <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-5 sm:px-8">
                <div className="flex min-w-0 items-center gap-3">
                    <img src="/logo.jpg" alt="" className="h-10 w-10 shrink-0 rounded-full object-cover shadow-sm" />
                    <div className="min-w-0">
                        <p className="text-base font-semibold tracking-tight text-slate-900">WoSPIS</p>
                        <p className="truncate text-xs text-slate-500">{CAMPUS_LETTERHEAD.universityNamePlain}</p>
                    </div>
                </div>
                <div className="flex shrink-0 items-center gap-1 sm:gap-2">
                    {extra}
                    <ThemeToggle />
                    {onBack && (
                        <button
                            type="button"
                            onClick={onBack}
                            className="inline-flex items-center gap-2 rounded-full px-3 py-2 text-sm font-semibold text-slate-600 transition-colors hover:bg-white hover:text-slate-900"
                        >
                            <ArrowLeft className="h-4 w-4" />
                            {backLabel}
                        </button>
                    )}
                    {primary}
                </div>
            </div>
        </header>
    );
}

export function GuestFooter() {
    return (
        <footer className="relative z-10 mt-auto border-t border-slate-200/80">
            <div className="mx-auto flex max-w-6xl flex-col gap-1 px-5 py-6 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between sm:px-8">
                <p>© {new Date().getFullYear()} {CAMPUS_LETTERHEAD.universityNamePlain}</p>
                <p>{CAMPUS_LETTERHEAD.phoneWeb}</p>
            </div>
        </footer>
    );
}

interface WorkStudyGraphicProps {
    caption?: string;
    className?: string;
}

export function WorkStudyGraphic({ caption, className = '' }: WorkStudyGraphicProps) {
    return (
        <figure className={className}>
            <div className="relative overflow-hidden rounded-[28px] border border-slate-200/80 bg-white p-4 shadow-[0_18px_50px_rgba(15,23,42,0.06)] sm:p-5">
                <div className="pointer-events-none absolute -right-8 -top-10 h-32 w-32 rounded-full bg-indigo-200/80 blur-2xl" />
                <div className="pointer-events-none absolute -bottom-12 -left-8 h-28 w-28 rounded-full bg-blue-200/80 blur-2xl" />
                <svg viewBox="0 0 360 248" className="relative h-auto w-full" role="img" aria-label="Duty clock, schedule, and rendered hours">
                    <rect x="16" y="18" width="148" height="168" rx="24" fill="#4f46e5" />
                    <circle cx="90" cy="102" r="42" fill="none" stroke="#ffffff" strokeWidth="6" opacity="0.95" />
                    <path d="M90 78v26l18 12" fill="none" stroke="#ffffff" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
                    <circle cx="90" cy="102" r="4" fill="#ffffff" />
                    <text x="90" y="162" textAnchor="middle" fill="#e0e7ff" fontSize="13" fontFamily="ui-sans-serif, system-ui, sans-serif" fontWeight="700">DUTY</text>

                    <rect x="148" y="28" width="190" height="118" rx="22" fill="#ffffff" stroke="#e2e8f0" strokeWidth="2" />
                    <rect x="148" y="28" width="190" height="32" rx="22" fill="#eef2ff" />
                    <rect x="148" y="48" width="190" height="12" fill="#eef2ff" />
                    <text x="168" y="50" fill="#4338ca" fontSize="12" fontFamily="ui-sans-serif, system-ui, sans-serif" fontWeight="700">SCHEDULE</text>
                    {[0, 1, 2, 3, 4].map((column) =>
                        [0, 1].map((row) => (
                            <rect
                                key={`${column}-${row}`}
                                x={168 + column * 30}
                                y={78 + row * 28}
                                width="20"
                                height="16"
                                rx="4"
                                fill={column === 1 && row === 0 ? '#4f46e5' : column === 3 && row === 1 ? '#2563eb' : '#e0e7ff'}
                            />
                        )),
                    )}

                    <rect x="132" y="168" width="206" height="64" rx="18" fill="#ffffff" stroke="#e2e8f0" strokeWidth="2" />
                    <text x="150" y="196" fill="#4338ca" fontSize="12" fontFamily="ui-sans-serif, system-ui, sans-serif" fontWeight="700">HOURS</text>
                    <rect x="214" y="196" width="26" height="20" rx="6" fill="#c7d2fe" />
                    <rect x="248" y="186" width="26" height="30" rx="6" fill="#818cf8" />
                    <rect x="282" y="174" width="26" height="42" rx="6" fill="#4f46e5" />
                </svg>
            </div>
            {caption ? <figcaption className="mt-3 text-sm leading-relaxed text-slate-500">{caption}</figcaption> : null}
        </figure>
    );
}
