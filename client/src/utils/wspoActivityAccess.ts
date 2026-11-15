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
  const resolvedOffice = (office ?? localStorage.getItem('assigned_office') ?? '').trim().toLowerCase();
  const officer = (localStorage.getItem('officer_position') ?? '').trim().toLowerCase();

  if (resolvedRole === 'Student') {
    return officer === 'wspo secretary' || officer === 'wspo president';
  }

  if (resolvedRole !== 'WSPO Staff') return false;

  if (ACTIVITY_CHECKER_OFFICES.includes(resolvedOffice)) return true;

  // Legacy display labels such as "CCS · WSPO Secretary".
  return (
    resolvedOffice.includes('wspo secretary')
    || resolvedOffice.includes('wspo coordinator')
    || resolvedOffice.includes('wspo president')
  );
}

export function canManageActivityGroups(role?: string | null, office?: string | null): boolean {
  const storedFlag = localStorage.getItem('can_manage_activity_groups');
  if (storedFlag === '1') return true;
  if (storedFlag === '0') return false;

  if (!canCheckActivityAttendance(role, office)) return false;

  const officer = (localStorage.getItem('officer_position') ?? '').trim().toLowerCase();
  if (officer === 'wspo president') return false;

  const resolvedOffice = (office ?? localStorage.getItem('assigned_office') ?? '').trim().toLowerCase();
  return !resolvedOffice.includes('wspo president');
}

export function canIssueDailyAttendance(): boolean {
  const storedFlag = localStorage.getItem('can_issue_daily_attendance');
  if (storedFlag === '1') return true;
  if (storedFlag === '0') return false;

  const role = localStorage.getItem('user_role') ?? '';
  if (role === 'Supervisor') return true;
  if (role === 'Department Secretary') {
    return localStorage.getItem('secretary_acting') === '1';
  }
  if (role !== 'WSPO Staff') return false;

  // Coordinator only — Secretary/President are student officers.
  if (localStorage.getItem('is_student_officer') === '1') return false;
  const office = (localStorage.getItem('assigned_office') ?? '').trim().toLowerCase();
  return office === '' || office === 'wspo' || office === 'unassigned' || office === 'wspo coordinator';
}

export function mustClockAsStudent(): boolean {
  const stored = localStorage.getItem('must_clock_as_student');
  if (stored === '1') return true;
  if (stored === '0') return false;
  if (localStorage.getItem('is_student_officer') === '1') return true;
  if (localStorage.getItem('user_role') === 'Student') return true;
  const office = (localStorage.getItem('assigned_office') ?? '').trim().toLowerCase();
  return office.includes('wspo secretary') || office.includes('wspo president');
}

/** Persist login /api/user capability flags for staff UIs. */
export function storeActivityAttendanceCapability(payload: {
  can_check_activity_attendance?: boolean | null;
  can_issue_activity_attendance?: boolean | null;
  can_manage_activity_groups?: boolean | null;
  can_issue_daily_attendance?: boolean | null;
  is_student_officer?: boolean | null;
  must_clock_as_student?: boolean | null;
  officer_position?: string | null;
  assigned_office?: string | null;
  office?: string | null;
}): void {
  const canCheck = Boolean(
    payload.can_check_activity_attendance ?? payload.can_issue_activity_attendance,
  );
  localStorage.setItem('can_check_activity_attendance', canCheck ? '1' : '0');

  if (payload.can_manage_activity_groups !== undefined && payload.can_manage_activity_groups !== null) {
    localStorage.setItem('can_manage_activity_groups', payload.can_manage_activity_groups ? '1' : '0');
  } else {
    localStorage.removeItem('can_manage_activity_groups');
  }

  if (payload.can_issue_daily_attendance !== undefined && payload.can_issue_daily_attendance !== null) {
    localStorage.setItem('can_issue_daily_attendance', payload.can_issue_daily_attendance ? '1' : '0');
  } else {
    localStorage.removeItem('can_issue_daily_attendance');
  }

  if (payload.is_student_officer !== undefined && payload.is_student_officer !== null) {
    localStorage.setItem('is_student_officer', payload.is_student_officer ? '1' : '0');
  } else {
    localStorage.removeItem('is_student_officer');
  }

  if (payload.must_clock_as_student !== undefined && payload.must_clock_as_student !== null) {
    localStorage.setItem('must_clock_as_student', payload.must_clock_as_student ? '1' : '0');
  } else {
    localStorage.removeItem('must_clock_as_student');
  }

  if (payload.officer_position) {
    localStorage.setItem('officer_position', payload.officer_position);
  } else if (payload.officer_position === null || payload.officer_position === '') {
    localStorage.removeItem('officer_position');
  }

  const rawOffice = (payload.assigned_office ?? '').trim();
  if (rawOffice !== '') {
    localStorage.setItem('assigned_office', rawOffice);
  } else if (payload.office) {
    localStorage.setItem('assigned_office', payload.office);
  }
}
