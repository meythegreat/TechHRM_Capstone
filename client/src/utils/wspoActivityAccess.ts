/** WSPO Secretary (primary) / Coordinator / President may check campus activity attendance. */

const ACTIVITY_CHECKER_OFFICES = [
  '',
  'wspo',
  'unassigned',
  'wspo coordinator',
  'wspo secretary',
  'wspo president',
];

export function canCheckActivityAttendance(role?: string | null, office?: string | null): boolean {
  const storedFlag = localStorage.getItem('can_check_activity_attendance');
  if (storedFlag === '1') return true;
  if (storedFlag === '0') return false;

  const resolvedRole = role ?? localStorage.getItem('user_role') ?? '';
  if (resolvedRole !== 'WSPO Staff') return false;

  const resolvedOffice = (office ?? localStorage.getItem('assigned_office') ?? '').trim().toLowerCase();
  if (ACTIVITY_CHECKER_OFFICES.includes(resolvedOffice)) return true;

  // Legacy display labels such as "CCS · WSPO Secretary".
  return (
    resolvedOffice.includes('wspo secretary')
    || resolvedOffice.includes('wspo coordinator')
    || resolvedOffice.includes('wspo president')
  );
}

/** Persist login /api/user capability flags for staff UIs. */
export function storeActivityAttendanceCapability(payload: {
  can_check_activity_attendance?: boolean | null;
  can_issue_activity_attendance?: boolean | null;
  assigned_office?: string | null;
  office?: string | null;
}): void {
  const canCheck = Boolean(
    payload.can_check_activity_attendance ?? payload.can_issue_activity_attendance,
  );
  localStorage.setItem('can_check_activity_attendance', canCheck ? '1' : '0');

  const rawOffice = (payload.assigned_office ?? '').trim();
  if (rawOffice !== '') {
    localStorage.setItem('assigned_office', rawOffice);
  } else if (payload.office) {
    localStorage.setItem('assigned_office', payload.office);
  }
}
