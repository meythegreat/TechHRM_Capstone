/** Student worker portal paths (singular "schedule"). */
export const STUDENT_PATHS = new Set([
  'dashboard',
  'attendance',
  'assessment',
  'schedule',
  'requirements',
  'settings',
]);

/** Shared staff paths (Supervisor, WSPO Staff, Super Admin). */
export const STAFF_BASE_PATHS = new Set([
  'dashboard',
  'attendance',
  'schedules',
  'requirements',
]);

/** Extra paths for WSPO Staff and Super Admin only. */
export const STAFF_ADMIN_PATHS = new Set(['logs', 'users']);

export function getStaffPathsForRole(role: string): Set<string> {
  const paths = new Set(STAFF_BASE_PATHS);
  if (role === 'Super Admin' || role === 'WSPO Staff') {
    STAFF_ADMIN_PATHS.forEach((p) => paths.add(p));
  }
  return paths;
}

/** Map common mistyped or cross-role URLs to the correct tab for the active portal. */
export function resolveStudentPath(segment: string): string {
  if (segment === 'schedules') return 'schedule';
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
