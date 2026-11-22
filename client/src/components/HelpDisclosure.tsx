import { useId, useState, type ReactNode } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ChevronDown, Info } from 'lucide-react';

export interface HelpDisclosureProps {
  title?: string;
  items?: ReactNode[];
  children?: ReactNode;
  variant?: 'card' | 'inline';
  defaultOpen?: boolean;
  className?: string;
}

export function HelpDisclosure({
  title = 'How it works',
  items,
  children,
  variant = 'card',
  defaultOpen = false,
  className = '',
}: HelpDisclosureProps) {
  const [open, setOpen] = useState(defaultOpen);
  const panelId = useId();
  const reduceMotion = useReducedMotion();

  const body = (
    <div className="space-y-2.5 text-xs font-medium leading-relaxed text-slate-600 sm:text-[13px]">
      {items && items.length > 0 && (
        <ul className="space-y-2">
          {items.map((item, index) => (
            <li key={index} className="flex items-start gap-2.5">
              <span
                aria-hidden="true"
                className="mt-[0.45rem] h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500"
              />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      )}
      {children}
    </div>
  );

  if (variant === 'inline') {
    return (
      <div className={`print:hidden ${className}`.trim()}>
        <button
          type="button"
          onClick={() => setOpen((current) => !current)}
          aria-expanded={open}
          aria-controls={panelId}
          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200/90 bg-slate-50/90 px-3 py-1.5 text-xs font-bold text-slate-600 transition-colors hover:border-blue-300 hover:bg-blue-50/70 hover:text-blue-700"
        >
          <Info className="h-3.5 w-3.5 shrink-0 text-blue-600" />
          <span>{title}</span>
          <ChevronDown
            className={`h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform duration-200 ${
              open ? 'rotate-180 text-blue-600' : ''
            }`}
            aria-hidden="true"
          />
        </button>

        <AnimatePresence initial={false}>
          {open && (
            <motion.div
              id={panelId}
              initial={reduceMotion ? false : { height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={reduceMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
              transition={{ duration: reduceMotion ? 0 : 0.2, ease: [0.22, 1, 0.36, 1] }}
              className="overflow-hidden"
            >
              <div className="mt-2.5 rounded-xl border border-slate-200/80 bg-slate-50/80 px-4 py-3.5">
                {body}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  return (
    <section
      className={`overflow-hidden rounded-[1.5rem] border border-slate-200/90 bg-white shadow-xs print:hidden ${className}`.trim()}
    >
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-controls={panelId}
        className="flex w-full items-center justify-between gap-3 px-5 py-3.5 text-left transition-colors hover:bg-slate-50/80 sm:px-6"
      >
        <span className="flex min-w-0 items-center gap-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
            <Info className="h-4 w-4" />
          </span>
          <span className="truncate text-xs font-extrabold tracking-tight text-slate-800 sm:text-sm">
            {title}
          </span>
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200 ${
            open ? 'rotate-180 text-blue-600' : ''
          }`}
          aria-hidden="true"
        />
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id={panelId}
            initial={reduceMotion ? false : { height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="border-t border-slate-100 bg-slate-50/60 px-5 py-4 sm:px-6">
              {body}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

export default HelpDisclosure;
