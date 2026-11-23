import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildSyncSnapshot,
  connectivityErrorMessage,
  deriveSyncState,
  formatLastSynced,
  isCanceledRequestError,
  isConnectivityFailure,
  shouldTrackRequestAsSync,
  summarizeOutbox,
  syncDisplayDelay,
  type SyncStatusData,
} from '../src/utils/syncStatusCore.ts';

function baseData(overrides: Partial<SyncStatusData> = {}): SyncStatusData {
  return {
    browserOnline: true,
    serverReachable: true,
    activeSyncCount: 0,
    outboxSyncing: false,
    syncHoldActive: false,
    pendingCount: 0,
    outboxErrorCount: 0,
    outboxErrorMessage: null,
    lastError: null,
    lastSyncedAt: null,
    ...overrides,
  };
}

test('deriveSyncState maps all 4 device states with proper precedence', () => {
  // Green: online, reachable, idle, no pending/errors
  assert.equal(deriveSyncState(baseData()), 'connected');

  // Yellow: syncing via active write, outbox flush, or smooth hold
  assert.equal(deriveSyncState(baseData({ activeSyncCount: 1 })), 'syncing');
  assert.equal(deriveSyncState(baseData({ outboxSyncing: true, pendingCount: 2 })), 'syncing');
  assert.equal(deriveSyncState(baseData({ syncHoldActive: true })), 'syncing');

  // Red: online, but server unreachable or unsynced/failed outbox items
  assert.equal(deriveSyncState(baseData({ serverReachable: false })), 'error');
  assert.equal(deriveSyncState(baseData({ pendingCount: 1 })), 'error');
  assert.equal(deriveSyncState(baseData({ outboxErrorCount: 1 })), 'error');

  // Gray: offline always takes precedence over errors, pending items, or syncing flags
  assert.equal(deriveSyncState(baseData({ browserOnline: false })), 'offline');
  assert.equal(
    deriveSyncState(
      baseData({
        browserOnline: false,
        serverReachable: false,
        pendingCount: 3,
        outboxErrorCount: 1,
        activeSyncCount: 1,
      }),
    ),
    'offline',
  );
});

test('syncDisplayDelay keeps brief blips from changing the badge', () => {
  assert.equal(syncDisplayDelay('connected', 'connected'), 0);
  assert.equal(syncDisplayDelay('connected', 'offline'), 0);
  assert.equal(syncDisplayDelay('offline', 'connected'), 0);
  assert.ok(syncDisplayDelay('connected', 'syncing') >= 500);
  assert.ok(syncDisplayDelay('syncing', 'connected') >= 500);
  assert.ok(syncDisplayDelay('connected', 'error') >= 2000);
  assert.equal(syncDisplayDelay('error', 'syncing'), 0);
});

test('buildSyncSnapshot includes derived state alongside raw telemetry', () => {
  const snapshot = buildSyncSnapshot(baseData({ serverReachable: false, lastError: 'Server down' }));
  assert.equal(snapshot.state, 'error');
  assert.equal(snapshot.lastError, 'Server down');
});

test('shouldTrackRequestAsSync tracks mutations and explicit checks but ignores polling GETs and presence heartbeats', () => {
  assert.equal(shouldTrackRequestAsSync('GET', '/api/notifications'), false);
  assert.equal(shouldTrackRequestAsSync('get', '/api/user'), false);
  assert.equal(shouldTrackRequestAsSync('POST', '/api/chat/presence'), false);
  assert.equal(shouldTrackRequestAsSync('DELETE', '/api/chat/presence'), false);
  assert.equal(shouldTrackRequestAsSync('POST', '/api/chat/conversations/4/typing'), false);

  assert.equal(shouldTrackRequestAsSync('POST', '/api/attendance/clock-in'), true);
  assert.equal(shouldTrackRequestAsSync('PUT', '/api/schedules/12'), true);
  assert.equal(shouldTrackRequestAsSync('PATCH', '/api/notifications/5/read'), true);
  assert.equal(shouldTrackRequestAsSync('DELETE', '/api/notifications/5'), true);
  assert.equal(shouldTrackRequestAsSync('GET', '/api/user', true), true);
});

test('isConnectivityFailure separates network/5xx outages from 4xx responses and canceled requests', () => {
  assert.equal(isCanceledRequestError({ code: 'ERR_CANCELED' }), true);
  assert.equal(isCanceledRequestError({ name: 'AbortError' }), true);
  assert.equal(isConnectivityFailure({ code: 'ERR_CANCELED' }), false);

  assert.equal(isConnectivityFailure({ code: 'ERR_NETWORK', message: 'Network Error' }), true);
  assert.equal(isConnectivityFailure({ code: 'ECONNABORTED' }), true);
  assert.equal(isConnectivityFailure({ message: 'Network Error' }), true);
  assert.equal(isConnectivityFailure({ response: undefined }), true);
  assert.equal(isConnectivityFailure({ response: { status: 408 } }), true);
  assert.equal(isConnectivityFailure({ response: { status: 500 } }), true);
  assert.equal(isConnectivityFailure({ response: { status: 503 } }), true);

  // 4xx responses prove the server answered over the internet
  assert.equal(isConnectivityFailure({ response: { status: 400 } }), false);
  assert.equal(isConnectivityFailure({ response: { status: 401 } }), false);
  assert.equal(isConnectivityFailure({ response: { status: 403 } }), false);
  assert.equal(isConnectivityFailure({ response: { status: 404 } }), false);
  assert.equal(isConnectivityFailure({ response: { status: 422 } }), false);
});

test('connectivityErrorMessage returns helpful user-facing text', () => {
  assert.match(connectivityErrorMessage({ response: { status: 503 } }), /Server error/i);
  assert.match(connectivityErrorMessage({ code: 'ECONNABORTED' }), /timed out/i);
  assert.match(connectivityErrorMessage({ code: 'ERR_NETWORK' }), /Cannot reach the server/i);
});

test('summarizeOutbox counts pending items and extracts the first error', () => {
  assert.deepEqual(summarizeOutbox([]), {
    pendingCount: 0,
    outboxErrorCount: 0,
    outboxErrorMessage: null,
  });

  assert.deepEqual(
    summarizeOutbox([
      { last_error: null },
      { last_error: 'Shift overlaps an existing entry.' },
      { last_error: 'Second error' },
    ]),
    {
      pendingCount: 3,
      outboxErrorCount: 2,
      outboxErrorMessage: 'Shift overlaps an existing entry.',
    },
  );
});

test('formatLastSynced formats empty, recent, and older timestamps cleanly', () => {
  const now = new Date('2026-11-20T14:45:00').getTime();
  assert.equal(formatLastSynced(null, now), 'Not synced yet');
  assert.equal(formatLastSynced(now - 3_000, now), 'Just now');
  assert.equal(formatLastSynced(now - 35_000, now), '35s ago');
  assert.equal(formatLastSynced(now - 7 * 60_000, now), '7m ago');
  assert.match(formatLastSynced(now - 2 * 60 * 60_000, now), /12:45\s*PM/i);
});
