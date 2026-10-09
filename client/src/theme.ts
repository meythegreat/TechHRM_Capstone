import { nextSunChange, themeForSun } from './sunTimes';

export type Theme = 'light' | 'dark';

const OVERRIDE_KEY = 'techhrm-theme-override';

interface ThemeOverride {
  theme: Theme;
  until: number;
}

function readOverride(now = Date.now()): ThemeOverride | null {
  try {
    const raw = localStorage.getItem(OVERRIDE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ThemeOverride;
    if ((parsed.theme !== 'light' && parsed.theme !== 'dark') || !Number.isFinite(parsed.until) || parsed.until <= now) {
      localStorage.removeItem(OVERRIDE_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function resolveTheme(now = new Date()): Theme {
  return readOverride(now.getTime())?.theme ?? themeForSun(now);
}

export function applyTheme(theme: Theme) {
  const root = document.documentElement;
  const isDark = theme === 'dark';
  if (root.classList.contains('dark') === isDark) {
    window.dispatchEvent(new Event('techhrm-theme'));
    return;
  }
  root.classList.add('theme-animate');
  window.setTimeout(() => root.classList.remove('theme-animate'), 480);
  root.classList.toggle('dark', isDark);
  window.dispatchEvent(new Event('techhrm-theme'));
}

export function syncTheme(now = new Date()) {
  applyTheme(resolveTheme(now));
}

export function toggleTheme(): Theme {
  const next: Theme = resolveTheme() === 'dark' ? 'light' : 'dark';
  try {
    localStorage.setItem(OVERRIDE_KEY, JSON.stringify({
      theme: next,
      until: nextSunChange().getTime(),
    }));
  } catch {
    /* private mode */
  }
  applyTheme(next);
  scheduleThemeSync();
  return next;
}

let timer = 0;
let watching = false;

function nextCheckAt(now = Date.now()) {
  const overrideUntil = readOverride(now)?.until ?? Infinity;
  return Math.min(overrideUntil, nextSunChange(new Date(now)).getTime());
}

export function scheduleThemeSync() {
  syncTheme();
  window.clearTimeout(timer);
  const wait = Math.max(1000, nextCheckAt() - Date.now() + 500);
  timer = window.setTimeout(scheduleThemeSync, wait);
  if (watching) return;
  watching = true;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') scheduleThemeSync();
  });
}
