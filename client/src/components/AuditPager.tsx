import { ChevronLeft, ChevronRight } from 'lucide-react';

export const AUDIT_PAGE_SIZE = 10;

export function pageSlice<T>(items: T[], page: number) {
    const totalPages = Math.max(1, Math.ceil(items.length / AUDIT_PAGE_SIZE));
    const safePage = Math.min(Math.max(page, 1), totalPages);
    const start = (safePage - 1) * AUDIT_PAGE_SIZE;
    return {
        page: safePage,
        totalPages,
        rows: items.slice(start, start + AUDIT_PAGE_SIZE),
        total: items.length,
    };
}

interface AuditPagerProps {
    page: number;
    totalPages: number;
    total: number;
    onPage: (page: number) => void;
}

const AuditPager = ({ page, totalPages, total, onPage }: AuditPagerProps) => {
    if (total === 0) return null;
    return (
        <div className="flex flex-col items-center justify-between gap-3 border-t border-slate-100 bg-slate-50/70 px-6 py-4 sm:flex-row">
            <span className="text-xs font-medium text-slate-500">
                Page <span className="font-mono font-extrabold text-slate-900">{page}</span> of{' '}
                <span className="font-mono font-extrabold text-slate-900">{totalPages}</span>
                <span className="text-slate-400"> · {total} records · 10 per page</span>
            </span>
            <div className="flex items-center gap-2">
                <button
                    type="button"
                    disabled={page <= 1}
                    onClick={() => onPage(page - 1)}
                    className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 shadow-2xs transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-45"
                >
                    <ChevronLeft className="h-3.5 w-3.5" /> Prev
                </button>
                <button
                    type="button"
                    disabled={page >= totalPages}
                    onClick={() => onPage(page + 1)}
                    className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 shadow-2xs transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-45"
                >
                    Next <ChevronRight className="h-3.5 w-3.5" />
                </button>
            </div>
        </div>
    );
};

export default AuditPager;
