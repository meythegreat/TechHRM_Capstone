import { useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Moon, Sun } from 'lucide-react';
import { resolveTheme, toggleTheme, type Theme } from '../theme';

interface ThemeToggleProps {
  layout?: 'icon' | 'menu';
  expanded?: boolean;
  className?: string;
}

export default function ThemeToggle({ layout = 'icon', expanded = true, className = '' }: ThemeToggleProps) {
  const [theme, setTheme] = useState<Theme>(() => resolveTheme());

  useEffect(() => {
    const sync = () => setTheme(resolveTheme());
    window.addEventListener('wospis-theme', sync);
    return () => window.removeEventListener('wospis-theme', sync);
  }, []);

  const reduceMotion = useReducedMotion();
  const isDark = theme === 'dark';
  const label = isDark ? 'Light mode' : 'Dark mode';
  const hint = 'Follows sunrise and sunset in Roxas City. Click to switch until the next change.';
  const Icon = isDark ? Sun : Moon;
  const icon = (
    <AnimatePresence mode="wait" initial={false}>
      <motion.span
        key={isDark ? 'sun' : 'moon'}
        initial={reduceMotion ? false : { opacity: 0, rotate: -50, scale: 0.7 }}
        animate={{ opacity: 1, rotate: 0, scale: 1 }}
        exit={reduceMotion ? { opacity: 1 } : { opacity: 0, rotate: 50, scale: 0.7 }}
        transition={{ duration: reduceMotion ? 0 : 0.22 }}
        className="inline-flex"
      >
        <Icon className="w-5 h-5" />
      </motion.span>
    </AnimatePresence>
  );

  if (layout === 'menu') {
    return (
      <button
        type="button"
        onClick={() => setTheme(toggleTheme())}
        aria-pressed={isDark}
        aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
        title={hint}
        className={`group relative flex w-full items-center overflow-hidden rounded-2xl p-2.5 text-slate-400 outline-none transition-all duration-200 hover:text-white ${className}`}
      >
        <div className="absolute inset-0 rounded-2xl bg-white/[0.06] opacity-0 transition-opacity duration-200 group-hover:opacity-100" />
        <div className="relative z-10 flex w-full items-center">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/[0.04] text-slate-400 transition-all duration-200 group-hover:bg-white/10 group-hover:text-amber-300">
            {icon}
          </span>
          <span className={`ml-3 whitespace-nowrap text-sm font-bold tracking-tight transition-all duration-200 ${
            expanded ? 'translate-x-0 opacity-100' : '-translate-x-3 opacity-0 lg:hidden'
          }`}>
            {label}
          </span>
        </div>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setTheme(toggleTheme())}
      aria-pressed={isDark}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={hint}
      className={`inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200/80 bg-white/80 text-slate-600 shadow-2xs backdrop-blur-sm transition-colors hover:border-blue-300 hover:bg-blue-50 hover:text-blue-600 ${className}`}
    >
      {icon}
    </button>
  );
}
