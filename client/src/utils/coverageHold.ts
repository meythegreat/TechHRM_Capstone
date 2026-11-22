import axios from 'axios';

/** Department secretary tools stay off until the supervisor is marked absent for today. */
export function secretaryCoverageLocked(): boolean {
  return (
    localStorage.getItem('user_role') === 'Department Secretary' &&
    localStorage.getItem('secretary_acting') !== '1'
  );
}

export function isCoverageHold(error: unknown): boolean {
  if (!axios.isAxiosError(error) || error.response?.status !== 403) return false;
  const message = error.response.data?.message;
  return typeof message === 'string' && /marked absent/i.test(message);
}
