export type SyncState = 'connected' | 'syncing' | 'error' | 'offline';

export interface SyncStatusData {
  browserOnline: boolean;
  serverReachable: boolean;
  activeSyncCount: number;
  outboxSyncing: boolean;
  syncHoldActive: boolean;
  pendingCount: number;
  outboxErrorCount: number;
  outboxErrorMessage: string | null;
  lastError: string | null;
  lastSyncedAt: number | null;
}

export interface SyncSnapshot extends SyncStatusData {
  state: SyncState;
}

export interface OutboxSummary {
  pendingCount: number;
  outboxErrorCount: number;
  outboxErrorMessage: string | null;
}

/**
 * Derive the 4-state sync indicator from raw device/network/outbox signals:
 * - offline (Gray): device network is offline
 * - syncing (Yellow): actively uploading/saving/reconnecting/checking
 * - error (Red): device is online, but server is unreachable or queued items failed/remain unsynced
 * - connected (Green): device is online, server is reachable, and everything is synced
 *
 * The badge waits before changing color so a fast save or a single failed poll
 * does not flash. Losing the device network is immediate.
 */
export function syncDisplayDelay(from: SyncState, to: SyncState): number {
  if (from === to) return 0;
  if (to === 'offline' || from === 'offline') return 0;
  if (from === 'connected' && to === 'syncing') return 700;
  if (from === 'syncing' && to === 'connected') return 600;
  if (to === 'error') return 2500;
  if (from === 'error' && to === 'syncing') return 0;
  if (from === 'error' && to === 'connected') return 900;
  return 500;
}

export function deriveSyncState(data: SyncStatusData): SyncState {
  if (!data.browserOnline) {
    return 'offline';
  }
  if (data.outboxSyncing || data.activeSyncCount > 0 || data.syncHoldActive) {
    return 'syncing';
  }
  if (!data.serverReachable || data.outboxErrorCount > 0 || data.pendingCount > 0) {
    return 'error';
  }
  return 'connected';
}

export function buildSyncSnapshot(data: SyncStatusData): SyncSnapshot {
  return {
    ...data,
    state: deriveSyncState(data),
  };
}

/**
 * Decide whether an HTTP request should turn the indicator Yellow ("Syncing").
 * Routine background reads (GET polling) and presence/typing heartbeats stay quiet,
 * while mutations and explicit sync checks display the syncing state.
 */
export function shouldTrackRequestAsSync(
  method?: string,
  url?: string,
  explicitSync?: boolean,
): boolean {
  if (explicitSync === true) return true;

  const normalizedMethod = (method || 'get').toLowerCase();
  const normalizedUrl = (url || '').toLowerCase();

  if (
    normalizedUrl.includes('/chat/presence') ||
    normalizedUrl.includes('/typing')
  ) {
    return false;
  }

  return (
    normalizedMethod === 'post' ||
    normalizedMethod === 'put' ||
    normalizedMethod === 'patch' ||
    normalizedMethod === 'delete'
  );
}

export function isCanceledRequestError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as { code?: unknown; name?: unknown };
  return (
    candidate.code === 'ERR_CANCELED' ||
    candidate.name === 'CanceledError' ||
    candidate.name === 'AbortError'
  );
}

/**
 * Returns true when an HTTP error indicates the device could not reach the
 * server or the server failed to process the sync (network failure, timeout, 5xx).
 * Normal 4xx client/validation responses mean the server WAS reached.
 */
export function isConnectivityFailure(error: unknown): boolean {
  if (isCanceledRequestError(error)) return false;
  if (!error || typeof error !== 'object') return false;

  const candidate = error as {
    code?: unknown;
    message?: unknown;
    response?: { status?: unknown } | null;
  };

  if (
    candidate.code === 'ERR_NETWORK' ||
    candidate.code === 'ECONNABORTED' ||
    candidate.code === 'ETIMEDOUT'
  ) {
    return true;
  }

  if (candidate.message === 'Network Error') {
    return true;
  }

  if (!candidate.response) {
    return true;
  }

  const status = candidate.response.status;
  if (typeof status === 'number' && (status === 408 || status >= 500)) {
    return true;
  }

  return false;
}

export function connectivityErrorMessage(error: unknown): string {
  if (!error || typeof error !== 'object') {
    return 'Cannot reach the server. Check your internet connection.';
  }

  const candidate = error as {
    code?: unknown;
    response?: { status?: unknown } | null;
  };
  const status = candidate.response?.status;

  if (typeof status === 'number' && status >= 500) {
    return 'Server error while syncing. Will retry automatically.';
  }
  if (
    candidate.code === 'ECONNABORTED' ||
    candidate.code === 'ETIMEDOUT' ||
    status === 408
  ) {
    return 'Connection timed out while contacting the server.';
  }
  return 'Cannot reach the server. Check your internet connection.';
}

export function summarizeOutbox(
  rows: ReadonlyArray<{ last_error?: string | null }>,
): OutboxSummary {
  let outboxErrorCount = 0;
  let outboxErrorMessage: string | null = null;

  for (const row of rows) {
    const message = typeof row?.last_error === 'string' ? row.last_error.trim() : '';
    if (message) {
      outboxErrorCount += 1;
      if (!outboxErrorMessage) outboxErrorMessage = message;
    }
  }

  return {
    pendingCount: rows.length,
    outboxErrorCount,
    outboxErrorMessage,
  };
}

export function formatLastSynced(timestamp: number | null, now = Date.now()): string {
  if (timestamp == null || !Number.isFinite(timestamp)) {
    return 'Not synced yet';
  }
  const diffSeconds = Math.max(0, Math.floor((now - timestamp) / 1000));
  if (diffSeconds < 10) return 'Just now';
  if (diffSeconds < 60) return `${diffSeconds}s ago`;
  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) return `${diffMinutes}m ago`;

  return new Date(timestamp).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}
