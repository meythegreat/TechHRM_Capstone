import assert from 'node:assert/strict';
import test from 'node:test';
import {
  clearStudentDashboardCache,
  readStudentDashboardCache,
  writeStudentDashboardCache,
} from '../src/utils/studentDashboardCache.ts';

function installLocalStorage() {
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      get length() {
        return values.size;
      },
      key(index: number) {
        return [...values.keys()][index] ?? null;
      },
      getItem(key: string) {
        return values.get(key) ?? null;
      },
      setItem(key: string, value: string) {
        values.set(key, value);
      },
      removeItem(key: string) {
        values.delete(key);
      },
    },
  });
}

test('student dashboard cache keeps the last successful totals', () => {
  installLocalStorage();
  localStorage.setItem('user_name', 'Charlene');
  writeStudentDashboardCache({
    dashboard: { total_hours_rendered: 12.5, required_hours: 80 },
    supervisors: ['Office Head'],
  });

  const saved = readStudentDashboardCache<{ total_hours_rendered: number }>();
  assert.equal(saved?.dashboard.total_hours_rendered, 12.5);
  assert.deepEqual(saved?.supervisors, ['Office Head']);

  clearStudentDashboardCache();
  assert.equal(readStudentDashboardCache(), null);
});
