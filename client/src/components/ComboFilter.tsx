import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown } from 'lucide-react';

interface ComboFilterProps {
    value: string;
    onChange: (value: string) => void;
    options: string[];
    placeholder: string;
    emptyLabel?: string;
    className?: string;
    commitOnType?: boolean;
}

const ComboFilter = ({ value, onChange, options, placeholder, emptyLabel = 'Any', className = '', commitOnType = true }: ComboFilterProps) => {
    const [open, setOpen] = useState(false);
    const [draft, setDraft] = useState(value);
    const [box, setBox] = useState({ top: 0, left: 0, width: 220 });
    const rootRef = useRef<HTMLDivElement>(null);
    const menuRef = useRef<HTMLUListElement>(null);

    useEffect(() => {
        setDraft(value);
    }, [value]);

    useEffect(() => {
        const close = (event: MouseEvent) => {
            const target = event.target as Node;
            if (rootRef.current?.contains(target) || menuRef.current?.contains(target)) return;
            setOpen(false);
        };
        document.addEventListener('mousedown', close);
        return () => document.removeEventListener('mousedown', close);
    }, []);

    useEffect(() => {
        if (!open) return undefined;
        const place = () => {
            const rect = rootRef.current?.getBoundingClientRect();
            if (!rect) return;
            const width = Math.max(rect.width, 220);
            const left = Math.min(Math.max(8, rect.left), window.innerWidth - width - 8);
            setBox({ top: rect.bottom + 6, left, width });
        };
        place();
        window.addEventListener('resize', place);
        window.addEventListener('scroll', place, true);
        return () => {
            window.removeEventListener('resize', place);
            window.removeEventListener('scroll', place, true);
        };
    }, [open]);

    const shown = useMemo(() => {
        const query = draft.trim().toLowerCase();
        if (!query || query === value.trim().toLowerCase()) return options;
        return options.filter((option) => option.toLowerCase().includes(query));
    }, [options, draft, value]);

    const choose = (next: string) => {
        onChange(next);
        setDraft(next);
        setOpen(false);
    };

    return (
        <div ref={rootRef} className={`relative ${className}`}>
            <div className="combo-filter-input flex items-center rounded-xl border border-slate-300 focus-within:ring-2 focus-within:ring-blue-600">
                <input
                    value={draft}
                    placeholder={placeholder}
                    onFocus={() => setOpen(true)}
                    onChange={(event) => {
                        const next = event.target.value;
                        setDraft(next);
                        setOpen(true);
                        if (commitOnType || next.trim() === '' || options.some((option) => option.toLowerCase() === next.trim().toLowerCase())) {
                            const match = options.find((option) => option.toLowerCase() === next.trim().toLowerCase());
                            onChange(commitOnType ? next : (match || ''));
                        }
                    }}
                    className="w-full px-3 py-2.5 bg-transparent text-sm font-bold outline-none"
                />
                <button
                    type="button"
                    aria-label={`Show ${placeholder} options`}
                    onClick={() => setOpen((current) => !current)}
                    className="px-2 text-slate-500"
                >
                    <ChevronDown className="w-4 h-4" />
                </button>
            </div>
            {open && createPortal(
                <ul
                    ref={menuRef}
                    className="combo-filter-menu overflow-y-auto rounded-xl border shadow-2xl"
                    style={{ position: 'fixed', top: box.top, left: box.left, width: box.width, zIndex: 80, maxHeight: 320 }}
                >
                    <li>
                        <button type="button" onClick={() => choose('')} className="w-full px-3 py-2.5 text-left text-sm font-bold">
                            {emptyLabel}
                        </button>
                    </li>
                    {shown.map((option) => (
                        <li key={option}>
                            <button
                                type="button"
                                onClick={() => choose(option)}
                                className="w-full px-3 py-2.5 text-left text-sm font-bold"
                                data-selected={option === value ? 'true' : 'false'}
                            >
                                {option}
                            </button>
                        </li>
                    ))}
                    {shown.length === 0 && (
                        <li className="px-3 py-2.5 text-sm font-medium">No matches</li>
                    )}
                </ul>,
                document.body,
            )}
        </div>
    );
};

export default ComboFilter;
