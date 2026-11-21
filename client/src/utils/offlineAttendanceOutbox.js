/**
 * Local outbox for offline / special attendance requests.
 * Stores pending submit payloads (including File blobs) in IndexedDB and
 * uploads them when the device is online again.
 */
import { manualAttendanceRequestService } from '../services/manualAttendanceRequestService';

const DB_NAME = 'wospis-offline-draft';
const STORE = 'drafts';
const OUTBOX_KEY = 'attendance-outbox';

export const OUTBOX_EVENT = 'wospis:outbox-changed';
export const OUTBOX_SYNC_EVENT = 'wospis:outbox-syncing';

let inFlightFlush = null;

const emitOutboxChanged = (rows) => {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(OUTBOX_EVENT, { detail: { rows } }));
};

const emitOutboxSyncing = (syncing) => {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(OUTBOX_SYNC_EVENT, { detail: { syncing } }));
};

const hasIndexedDb = () => typeof indexedDB !== 'undefined';

const openDb = () => new Promise((resolve, reject) => {
  if (!hasIndexedDb()) {
    reject(new Error('IndexedDB is unavailable.'));
    return;
  }
  const request = indexedDB.open(DB_NAME, 1);
  request.onupgradeneeded = () => {
    if (!request.result.objectStoreNames.contains(STORE)) {
      request.result.createObjectStore(STORE);
    }
  };
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});

const readKey = async (key) => {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE, 'readonly').objectStore(STORE).get(key);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
};

const writeKey = async (key, value) => {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
};

export const newClientRequestId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

export const isNetworkFailure = (err) => {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  if (!err) return false;
  if (err.code === 'ERR_NETWORK' || err.code === 'ECONNABORTED') return true;
  if (err.message === 'Network Error') return true;
  if (!err.response) return true;
  return false;
};

export const listOutbox = async () => {
  if (!hasIndexedDb()) return [];
  const rows = await readKey(OUTBOX_KEY);
  return Array.isArray(rows) ? rows : [];
};

export const enqueueOutbox = async (item) => {
  const rows = await listOutbox();
  const next = [
    ...rows.filter((row) => row.client_request_id !== item.client_request_id),
    {
      ...item,
      queued_at: item.queued_at || new Date().toISOString(),
      last_error: item.last_error || null,
    },
  ];
  await writeKey(OUTBOX_KEY, next);
  emitOutboxChanged(next);
  return next;
};

export const removeOutbox = async (clientRequestId) => {
  const rows = await listOutbox();
  const next = rows.filter((row) => row.client_request_id !== clientRequestId);
  await writeKey(OUTBOX_KEY, next);
  emitOutboxChanged(next);
  return next;
};

export const updateOutboxError = async (clientRequestId, lastError) => {
  const rows = await listOutbox();
  const next = rows.map((row) => (
    row.client_request_id === clientRequestId
      ? { ...row, last_error: lastError || null }
      : row
  ));
  await writeKey(OUTBOX_KEY, next);
  emitOutboxChanged(next);
  return next;
};

const toSubmitPayload = (item) => ({
  client_request_id: item.client_request_id,
  request_type: item.request_type,
  reason: item.reason,
  shifts: (item.shifts || []).map((shift) => ({
    date: shift.date,
    time_in: shift.time_in,
    time_out: shift.time_out,
    janitorial_group_id: shift.janitorial_group_id,
    before_photo: shift.before_photo,
    after_photo: shift.after_photo,
    before_captured_at: shift.before_captured_at,
    after_captured_at: shift.after_captured_at,
    capture_source: shift.capture_source,
  })),
});

/**
 * Attempt to upload every queued item. Returns { uploaded, remaining, errors }.
 */
export const flushOutbox = async () => {
  if (inFlightFlush) return inFlightFlush;

  inFlightFlush = (async () => {
    const rows = await listOutbox();
    if (rows.length === 0) {
      return { uploaded: 0, remaining: [], errors: [] };
    }

    emitOutboxSyncing(true);
    let uploaded = 0;
    const errors = [];
    let remaining = [...rows];

    try {
      for (const item of rows) {
        try {
          await manualAttendanceRequestService.submit(toSubmitPayload(item));
          remaining = await removeOutbox(item.client_request_id);
          uploaded += 1;
        } catch (err) {
          if (isNetworkFailure(err)) {
            errors.push({
              client_request_id: item.client_request_id,
              message: 'Still offline — will retry when connected.',
            });
            break;
          }
          const message = err?.response?.data?.message || err?.message || 'Upload failed.';
          remaining = await updateOutboxError(item.client_request_id, message);
          errors.push({ client_request_id: item.client_request_id, message });
        }
      }

      return { uploaded, remaining, errors };
    } finally {
      emitOutboxSyncing(false);
    }
  })();

  try {
    return await inFlightFlush;
  } finally {
    inFlightFlush = null;
  }
};
