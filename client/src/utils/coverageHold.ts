import axios from 'axios';

/** Department secretaries keep supervisor tools even when the supervisor is present. */
export function secretaryCoverageLocked(): boolean {
  return false;
}

export function isCoverageHold(error: unknown): boolean {
  if (!axios.isAxiosError(error) || error.response?.status !== 403) return false;
  const message = error.response.data?.message;
  return typeof message === 'string' && /marked absent/i.test(message);
}
