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
    window.addEventListener('techhrm-theme', sync);
    return () => window.removeEventListener('techhrm-theme', sync);
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
        className={`relative w-full flex items-center p-3 rounded-xl text-slate-500 hover:text-slate-900 transition-all duration-300 group outline-none overflow-hidden ${className}`}
      >
        <div className="absolute inset-0 bg-slate-50 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
        <div className="relative z-10 flex items-center w-full">
          <span className="inline-flex shrink-0 text-slate-400 group-hover:text-slate-600 transition-colors">{icon}</span>
          <span className={`ml-3.5 font-bold text-sm whitespace-nowrap transition-all duration-300 ${
            expanded ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-4 lg:hidden'
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
      className={`p-2 rounded-xl text-slate-500 hover:bg-slate-100 hover:text-blue-600 transition-colors ${className}`}
    >
      {icon}
    </button>
  );
}
