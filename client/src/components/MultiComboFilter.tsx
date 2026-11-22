import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, X } from 'lucide-react';

interface MultiComboFilterProps {
  values: string[];
  onChange: (values: string[]) => void;
  options: string[];
  placeholder: string;
  emptyLabel?: string;
  className?: string;
}

const MultiComboFilter = ({
  values,
  onChange,
  options,
  placeholder,
  emptyLabel = 'Any',
  className = '',
}: MultiComboFilterProps) => {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [box, setBox] = useState({ top: 0, left: 0, width: 220 });
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);

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
    const available = options.filter((option) => !values.includes(option));
    if (!query) return available;
    return available.filter((option) => option.toLowerCase().includes(query));
  }, [options, draft, values]);

  const add = (next: string) => {
    if (!next || values.includes(next)) return;
    onChange([...values, next]);
    setDraft('');
  };

  const remove = (value: string) => {
    onChange(values.filter((item) => item !== value));
  };

  const clear = () => {
    onChange([]);
    setDraft('');
  };

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <div className="combo-filter-input flex min-h-[2.75rem] flex-wrap items-center gap-1.5 rounded-xl border border-slate-300 px-2.5 py-1.5 focus-within:ring-2 focus-within:ring-blue-600">
        {values.map((value) => (
          <span
            key={value}
            className="inline-flex max-w-full items-center gap-1 rounded-lg bg-blue-50 px-2 py-0.5 text-[11px] font-bold text-blue-800"
          >
            <span className="truncate">{value}</span>
            <button
              type="button"
              onClick={() => remove(value)}
              className="rounded p-0.5 text-blue-500 hover:bg-blue-100 hover:text-blue-800"
              aria-label={`Remove ${value}`}
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <input
          value={draft}
          placeholder={values.length === 0 ? placeholder : 'Add…'}
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            setDraft(event.target.value);
            setOpen(true);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Backspace' && draft === '' && values.length > 0) {
              remove(values[values.length - 1]);
            }
            if (event.key === 'Enter') {
              event.preventDefault();
              const match = shown.find(
                (option) => option.toLowerCase() === draft.trim().toLowerCase(),
              );
              if (match) add(match);
              else if (shown.length === 1) add(shown[0]);
            }
          }}
          className="min-w-[6rem] flex-1 border-0 bg-transparent py-1 text-sm font-semibold text-slate-800 outline-none placeholder:font-medium placeholder:text-slate-400"
        />
        <button
          type="button"
          onClick={() => setOpen((current) => !current)}
          className="ml-auto rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          aria-label="Toggle options"
        >
          <ChevronDown className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {open &&
        createPortal(
          <ul
            ref={menuRef}
            style={{ top: box.top, left: box.left, width: box.width }}
            className="fixed z-[80] max-h-56 overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 shadow-lg"
          >
            <li>
              <button
                type="button"
                onClick={clear}
                className="flex w-full px-3 py-2 text-left text-xs font-bold text-slate-500 hover:bg-slate-50"
              >
                {emptyLabel}
              </button>
            </li>
            {shown.map((option) => (
              <li key={option}>
                <button
                  type="button"
                  onClick={() => add(option)}
                  className="flex w-full px-3 py-2 text-left text-sm font-semibold text-slate-800 hover:bg-blue-50 hover:text-blue-800"
                >
                  {option}
                </button>
              </li>
            ))}
            {shown.length === 0 && (
              <li className="px-3 py-2 text-xs font-medium text-slate-400">No matches</li>
            )}
          </ul>,
          document.body,
        )}
    </div>
  );
};

export default MultiComboFilter;
