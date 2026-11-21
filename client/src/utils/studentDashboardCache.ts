const PREFIX = 'wospis-student-dashboard:';

export type StudentDashboardSnapshot<T> = {
  dashboard: T;
  supervisors: string[];
};

function cacheKey() {
  const name = localStorage.getItem('user_name') || 'student';
  return `${PREFIX}${name}`;
}

export function readStudentDashboardCache<T>(): StudentDashboardSnapshot<T> | null {
  try {
    const raw = localStorage.getItem(cacheKey());
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StudentDashboardSnapshot<T>;
    if (!parsed || typeof parsed !== 'object' || !parsed.dashboard) return null;
    return {
      dashboard: parsed.dashboard,
      supervisors: Array.isArray(parsed.supervisors) ? parsed.supervisors : [],
    };
  } catch {
    return null;
  }
}

export function writeStudentDashboardCache<T>(snapshot: StudentDashboardSnapshot<T>) {
  try {
    localStorage.setItem(cacheKey(), JSON.stringify(snapshot));
  } catch {
    // The in-memory copy still remains if storage is full or blocked.
  }
}

export function clearStudentDashboardCache() {
  const keys: string[] = [];
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (key?.startsWith(PREFIX)) keys.push(key);
  }
  keys.forEach((key) => localStorage.removeItem(key));
}
