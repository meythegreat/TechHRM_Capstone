import { useSyncExternalStore } from 'react';
import axios, { type InternalAxiosRequestConfig } from 'axios';
import {
  flushOutbox,
  listOutbox,
  OUTBOX_EVENT,
  OUTBOX_SYNC_EVENT,
} from './offlineAttendanceOutbox';
import { emitRealtimeRefresh } from './realtime';
import {
  buildSyncSnapshot,
  connectivityErrorMessage,
  deriveSyncState,
  isCanceledRequestError,
  isConnectivityFailure,
  shouldTrackRequestAsSync,
  summarizeOutbox,
  syncDisplayDelay,
  type SyncSnapshot,
  type SyncState,
  type SyncStatusData,
} from './syncStatusCore';

export type { SyncSnapshot, SyncState } from './syncStatusCore';
export { formatLastSynced } from './syncStatusCore';

type SyncAxiosConfig = InternalAxiosRequestConfig & {
  __syncTracked?: boolean;
  __syncExplicit?: boolean;
};

const SYNC_HOLD_MS = 0;
const RECOVERY_POLL_MS = 15000;

const initialBrowserOnline =
  typeof navigator === 'undefined' ? true : navigator.onLine !== false;

const stateData: SyncStatusData = {
  browserOnline: initialBrowserOnline,
  serverReachable: initialBrowserOnline,
  activeSyncCount: 0,
  outboxSyncing: false,
  syncHoldActive: false,
  pendingCount: 0,
  outboxErrorCount: 0,
  outboxErrorMessage: null,
  lastError: null,
  lastSyncedAt: null,
};

let displayedState: SyncState = deriveSyncState(stateData);
let currentSnapshot: SyncSnapshot = withDisplayedState(buildSyncSnapshot(stateData));
const listeners = new Set<() => void>();

let syncStartedAt: number | null = null;
let holdTimer: number | null = null;
let transitionTimer: number | null = null;
let pendingDisplay: SyncState | null = null;

function withDisplayedState(snapshot: SyncSnapshot): SyncSnapshot {
  return snapshot.state === displayedState ? snapshot : { ...snapshot, state: displayedState };
}

function sameSnapshot(left: SyncSnapshot, right: SyncSnapshot): boolean {
  return (
    left.state === right.state &&
    left.browserOnline === right.browserOnline &&
    left.serverReachable === right.serverReachable &&
    left.activeSyncCount === right.activeSyncCount &&
    left.outboxSyncing === right.outboxSyncing &&
    left.syncHoldActive === right.syncHoldActive &&
    left.pendingCount === right.pendingCount &&
    left.outboxErrorCount === right.outboxErrorCount &&
    left.outboxErrorMessage === right.outboxErrorMessage &&
    left.lastError === right.lastError &&
    left.lastSyncedAt === right.lastSyncedAt
  );
}
let interceptorsAttached = false;
let monitorStarted = false;
let activeManualSync: Promise<SyncSnapshot> | null = null;

function clearHoldTimer() {
  if (holdTimer !== null && typeof window !== 'undefined') {
    window.clearTimeout(holdTimer);
    holdTimer = null;
  }
}

function clearTransitionTimer() {
  if (transitionTimer !== null && typeof window !== 'undefined') {
    window.clearTimeout(transitionTimer);
  }
  transitionTimer = null;
  pendingDisplay = null;
}

function publish() {
  const next = withDisplayedState(buildSyncSnapshot(stateData));
  if (sameSnapshot(currentSnapshot, next)) return;
  currentSnapshot = next;
  for (const listener of listeners) {
    listener();
  }
}

function showStateNow(next: SyncState) {
  clearTransitionTimer();
  if (displayedState === next) {
    publish();
    return;
  }
  displayedState = next;
  publish();
}

function emit() {
  const raw = deriveSyncState(stateData);
  if (raw === displayedState) {
    clearTransitionTimer();
    publish();
    return;
  }

  const delay = syncDisplayDelay(displayedState, raw);
  if (delay <= 0 || typeof window === 'undefined') {
    showStateNow(raw);
    return;
  }

  if (pendingDisplay === raw && transitionTimer !== null) {
    publish();
    return;
  }

  clearTransitionTimer();
  pendingDisplay = raw;
  transitionTimer = window.setTimeout(() => {
    transitionTimer = null;
    const expected = pendingDisplay;
    pendingDisplay = null;
    const latest = deriveSyncState(stateData);
    if (latest === expected) {
      displayedState = latest;
      publish();
      return;
    }
    emit();
  }, delay);
  publish();
}

function isActivelySyncing(): boolean {
  return stateData.activeSyncCount > 0 || stateData.outboxSyncing;
}

function scheduleHoldReleaseIfNeeded() {
  clearHoldTimer();

  if (
    !stateData.browserOnline ||
    !stateData.serverReachable ||
    stateData.outboxErrorCount > 0 ||
    isActivelySyncing()
  ) {
    stateData.syncHoldActive = false;
    return;
  }

  const started = syncStartedAt;
  syncStartedAt = null;
  if (started == null || typeof window === 'undefined') {
    stateData.syncHoldActive = false;
    return;
  }

  const remaining = SYNC_HOLD_MS - (Date.now() - started);
  if (remaining <= 20) {
    stateData.syncHoldActive = false;
    return;
  }

  stateData.syncHoldActive = true;
  holdTimer = window.setTimeout(() => {
    holdTimer = null;
    stateData.syncHoldActive = false;
    emit();
  }, remaining);
}

function beginSyncActivity(immediate = false) {
  clearHoldTimer();
  if (!isActivelySyncing()) {
    syncStartedAt = Date.now();
  }
  stateData.activeSyncCount += 1;
  stateData.syncHoldActive = false;
  if (immediate) {
    showStateNow('syncing');
  }
  emit();
}

function endSyncActivity() {
  stateData.activeSyncCount = Math.max(0, stateData.activeSyncCount - 1);
  if (!isActivelySyncing()) {
    scheduleHoldReleaseIfNeeded();
  }
  emit();
}

function setOutboxSyncing(syncing: boolean) {
  if (stateData.outboxSyncing === syncing) return;
  if (syncing) {
    clearHoldTimer();
    if (!isActivelySyncing()) {
      syncStartedAt = Date.now();
    }
    stateData.outboxSyncing = true;
    stateData.syncHoldActive = false;
    emit();
    return;
  }

  stateData.outboxSyncing = false;
  if (!isActivelySyncing()) {
    scheduleHoldReleaseIfNeeded();
  }
  emit();
}

function setBrowserOnline(online: boolean) {
  if (stateData.browserOnline === online) return;
  stateData.browserOnline = online;
  if (!online) {
    clearHoldTimer();
    stateData.syncHoldActive = false;
    syncStartedAt = null;
  }
  emit();
}

function recordServerSuccess() {
  stateData.browserOnline =
    typeof navigator === 'undefined' ? true : navigator.onLine !== false;
  stateData.serverReachable = true;
  stateData.lastError = null;
  stateData.lastSyncedAt = Date.now();
  emit();
}

function recordServerReachable() {
  stateData.browserOnline =
    typeof navigator === 'undefined' ? true : navigator.onLine !== false;
  stateData.serverReachable = true;
  stateData.lastError = null;
  emit();
}

function recordServerFailure(message: string) {
  const online = typeof navigator === 'undefined' ? true : navigator.onLine !== false;
  stateData.browserOnline = online;
  if (!online) {
    clearHoldTimer();
    stateData.syncHoldActive = false;
    syncStartedAt = null;
    emit();
    return;
  }

  clearHoldTimer();
  stateData.syncHoldActive = false;
  syncStartedAt = null;
  stateData.serverReachable = false;
  stateData.lastError = message;
  emit();
}

function applyOutboxRows(rows: ReadonlyArray<{ last_error?: string | null }>) {
  const summary = summarizeOutbox(rows);
  const changed =
    stateData.pendingCount !== summary.pendingCount ||
    stateData.outboxErrorCount !== summary.outboxErrorCount ||
    stateData.outboxErrorMessage !== summary.outboxErrorMessage;

  if (!changed) return;

  stateData.pendingCount = summary.pendingCount;
  stateData.outboxErrorCount = summary.outboxErrorCount;
  stateData.outboxErrorMessage = summary.outboxErrorMessage;

  if (summary.outboxErrorCount > 0) {
    clearHoldTimer();
    stateData.syncHoldActive = false;
  }
  emit();
}

async function refreshOutboxState(): Promise<number> {
  try {
    const rows = await listOutbox();
    applyOutboxRows(rows);
    return rows.length;
  } catch {
    return stateData.pendingCount;
  }
}

export function subscribeSyncStatus(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getSyncSnapshot(): SyncSnapshot {
  return currentSnapshot;
}

export function useSyncStatus(): SyncSnapshot {
  return useSyncExternalStore(subscribeSyncStatus, getSyncSnapshot, getSyncSnapshot);
}

/**
 * Attach global Axios interceptors so every API request updates live sync/connectivity state.
 * Safe to call multiple times (runs once).
 */
export function attachSyncAxiosInterceptors() {
  if (interceptorsAttached) return;
  interceptorsAttached = true;

  axios.interceptors.request.use(
    (config) => {
      const syncConfig = config as SyncAxiosConfig;
      if (
        shouldTrackRequestAsSync(
          syncConfig.method,
          syncConfig.url,
          syncConfig.__syncExplicit,
        )
      ) {
        syncConfig.__syncTracked = true;
        beginSyncActivity();
      }
      return config;
    },
    (error) => {
      const syncConfig = error?.config as SyncAxiosConfig | undefined;
      if (syncConfig?.__syncTracked) {
        syncConfig.__syncTracked = false;
        endSyncActivity();
      }
      return Promise.reject(error);
    },
  );

  axios.interceptors.response.use(
    (response) => {
      recordServerSuccess();
      const syncConfig = response.config as SyncAxiosConfig | undefined;
      if (syncConfig?.__syncTracked) {
        syncConfig.__syncTracked = false;
        endSyncActivity();
      }
      return response;
    },
    (error) => {
      const syncConfig = error?.config as SyncAxiosConfig | undefined;

      if (!isCanceledRequestError(error)) {
        if (typeof navigator !== 'undefined' && navigator.onLine === false) {
          setBrowserOnline(false);
        } else if (isConnectivityFailure(error)) {
          recordServerFailure(connectivityErrorMessage(error));
        } else {
          // 4xx responses confirm the internet & server are reachable.
          recordServerReachable();
        }
      }

      if (syncConfig?.__syncTracked) {
        syncConfig.__syncTracked = false;
        endSyncActivity();
      }

      return Promise.reject(error);
    },
  );
}

/**
 * Actively verify server connectivity and flush any queued offline requests.
 */
export async function syncNow(options: { silent?: boolean } = {}): Promise<SyncSnapshot> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    setBrowserOnline(false);
    await refreshOutboxState();
    return getSyncSnapshot();
  }

  if (activeManualSync) {
    return activeManualSync;
  }

  activeManualSync = (async () => {
    setBrowserOnline(true);
    beginSyncActivity(true);

    try {
      const hasToken =
        typeof localStorage !== 'undefined' && Boolean(localStorage.getItem('auth_token'));

      let uploadedCount = 0;
      if (hasToken) {
        const pending = await refreshOutboxState();
        if (pending > 0) {
          const result = await flushOutbox();
          uploadedCount = result.uploaded;
          applyOutboxRows(result.remaining);
          if (uploadedCount > 0) {
            emitRealtimeRefresh();
          }
        }
      }

      if (hasToken) {
        await axios.get('/api/user', { timeout: 8000 });
        if (!options.silent) {
          emitRealtimeRefresh();
        }
      } else if (typeof fetch === 'function') {
        const controller = new AbortController();
        const timer =
          typeof window !== 'undefined'
            ? window.setTimeout(() => controller.abort(), 8000)
            : null;
        try {
          const response = await fetch('/manifest.webmanifest', {
            method: 'HEAD',
            cache: 'no-store',
            signal: controller.signal,
          });
          if (!response.ok && response.status >= 500) {
            recordServerFailure('Server error while checking connection.');
          } else {
            recordServerSuccess();
          }
        } catch (err) {
          if (typeof navigator !== 'undefined' && navigator.onLine === false) {
            setBrowserOnline(false);
          } else {
            recordServerFailure(connectivityErrorMessage(err));
          }
        } finally {
          if (timer !== null && typeof window !== 'undefined') {
            window.clearTimeout(timer);
          }
        }
      }

      await refreshOutboxState();
      return getSyncSnapshot();
    } catch {
      await refreshOutboxState();
      return getSyncSnapshot();
    } finally {
      endSyncActivity();
    }
  })();

  try {
    return await activeManualSync;
  } finally {
    activeManualSync = null;
  }
}

/**
 * Start global browser network, visibility, outbox, and recovery monitoring.
 * Safe to call multiple times (runs once).
 */
export function startSyncMonitor() {
  if (monitorStarted || typeof window === 'undefined') return;
  monitorStarted = true;

  const onOnline = () => {
    setBrowserOnline(true);
    void syncNow({ silent: true });
  };

  const onOffline = () => {
    setBrowserOnline(false);
  };

  const onOutboxChanged = (event: Event) => {
    const custom = event as CustomEvent<{ rows?: Array<{ last_error?: string | null }> }>;
    if (Array.isArray(custom.detail?.rows)) {
      applyOutboxRows(custom.detail.rows);
    } else {
      void refreshOutboxState();
    }
  };

  const onOutboxSyncing = (event: Event) => {
    const custom = event as CustomEvent<{ syncing?: boolean }>;
    setOutboxSyncing(Boolean(custom.detail?.syncing));
  };

  const onVisibilityChange = () => {
    if (document.visibilityState !== 'visible') return;
    const online = typeof navigator === 'undefined' ? true : navigator.onLine !== false;
    setBrowserOnline(online);
    if (!online) return;
    void refreshOutboxState().then((pending) => {
      if (!stateData.serverReachable || pending > 0) {
        void syncNow({ silent: true });
      }
    });
  };

  window.addEventListener('online', onOnline);
  window.addEventListener('offline', onOffline);
  window.addEventListener(OUTBOX_EVENT, onOutboxChanged);
  window.addEventListener(OUTBOX_SYNC_EVENT, onOutboxSyncing);
  document.addEventListener('visibilitychange', onVisibilityChange);

  window.setInterval(() => {
    if (document.visibilityState !== 'visible') return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setBrowserOnline(false);
      return;
    }
    if (
      (!stateData.serverReachable || stateData.pendingCount > 0) &&
      !isActivelySyncing()
    ) {
      void syncNow({ silent: true });
    }
  }, RECOVERY_POLL_MS);

  void refreshOutboxState().then((pending) => {
    const hasToken = Boolean(localStorage.getItem('auth_token'));
    if (pending > 0 && hasToken && stateData.browserOnline) {
      void syncNow({ silent: true });
    }
  });
}
