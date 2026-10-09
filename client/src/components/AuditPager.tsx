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
        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row items-center justify-between gap-4">
            <span className="text-sm font-medium text-slate-500">
                Page <span className="font-bold text-slate-900">{page}</span> of <span className="font-bold text-slate-900">{totalPages}</span>
                <span className="text-slate-400"> · {total} records · 10 per page</span>
            </span>
            <div className="flex gap-2">
                <button
                    type="button"
                    disabled={page <= 1}
                    onClick={() => onPage(page - 1)}
                    className="px-4 py-2 text-sm font-bold text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 disabled:opacity-50 transition-colors flex items-center gap-1 shadow-sm"
                >
                    <ChevronLeft className="w-4 h-4" /> Prev
                </button>
                <button
                    type="button"
                    disabled={page >= totalPages}
                    onClick={() => onPage(page + 1)}
                    className="px-4 py-2 text-sm font-bold text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 disabled:opacity-50 transition-colors flex items-center gap-1 shadow-sm"
                >
                    Next <ChevronRight className="w-4 h-4" />
                </button>
            </div>
        </div>
    );
};

export default AuditPager;
