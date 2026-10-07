/** Student worker portal paths (singular "schedule"). */
export const STUDENT_PATHS = new Set([
  'dashboard',
  'attendance',
  'hours',
  'schedule',
  'requirements',
  'disciplinary',
  'settings',
]);

/** Shared operational paths. */
export const STAFF_BASE_PATHS = new Set([
  'dashboard',
  'attendance',
  'schedules',
  'tasks',
  'attendance-hub',
  'compliance',
  'settings',
]);

/** Extra paths for WSPO Staff and Super Admin only. */
export const STAFF_ADMIN_PATHS = new Set(['logs', 'users', 'analytics', 'financial', 'offices']);

export function getStaffPathsForRole(role: string): Set<string> {
  const paths = new Set(STAFF_BASE_PATHS);
  if (role === 'Super Admin' || role === 'WSPO Staff') {
    STAFF_ADMIN_PATHS.forEach((p) => paths.add(p));
    paths.add('pipeline');
  }
  if (role === 'Super Admin') paths.add('requirements');
  return paths;
}

/** Map common mistyped or cross-role URLs to the correct tab for the active portal. */
export function resolveStudentPath(segment: string): string {
  if (segment === 'schedules') return 'schedule';
  if (segment === 'assessment' || segment === 'earnings') return 'hours';
  if (STUDENT_PATHS.has(segment)) return segment;
  return 'dashboard';
}

export function resolveStaffPath(segment: string, role: string): string {
  const allowed = getStaffPathsForRole(role);
  if (segment === 'schedule') return 'schedules';
  if (allowed.has(segment)) return segment;
  return 'dashboard';
}

export function firstPathSegment(pathname: string): string {
  return pathname.replace(/^\//, '').split('/')[0] || '';
}
