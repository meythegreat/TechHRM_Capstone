import { useId, useState, type ReactNode } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ChevronDown } from 'lucide-react';

export interface FeatureSectionProps {
  title: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
  badge?: ReactNode;
  icon?: ReactNode;
  className?: string;
  headerClassName?: string;
  bodyClassName?: string;
  id?: string;
}

export function FeatureSection({
  title,
  children,
  defaultOpen = false,
  badge,
  icon,
  className = '',
  headerClassName = '',
  bodyClassName = '',
  id,
}: FeatureSectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  const panelId = useId();
  const reduceMotion = useReducedMotion();

  return (
    <section
      id={id}
      className={`overflow-hidden rounded-[1.75rem] border border-slate-200/90 bg-white shadow-sm ${className}`.trim()}
    >
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-controls={panelId}
        className={`flex w-full items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/70 px-5 py-4 text-left transition-colors hover:bg-slate-50 sm:px-6 ${
          open ? '' : 'border-b-0'
        } ${headerClassName}`.trim()}
      >
        <span className="flex min-w-0 items-center gap-2.5">
          {icon}
          <span className="truncate text-base font-black tracking-tight text-slate-900">{title}</span>
          {badge}
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
            <div className={bodyClassName}>{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

export default FeatureSection;
