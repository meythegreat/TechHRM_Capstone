import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ClipboardList,
  CloudUpload,
  Plus,
  Trash2,
  Wifi,
  WifiOff,
  Clock,
  Camera,
  XCircle,
  AlertCircle,
} from 'lucide-react';
import { manualAttendanceRequestService } from '../services/manualAttendanceRequestService';
import { janitorialGroupService } from '../services/janitorialGroupService';
import CleaningProofCapture from './CleaningProofCapture';
import {
  clearOfflineDraft,
  loadOfflineDraft,
  saveOfflineDraft,
} from '../utils/offlineAttendanceDraft';
import {
  enqueueOutbox,
  flushOutbox,
  isNetworkFailure,
  listOutbox,
  newClientRequestId,
  OUTBOX_EVENT,
  removeOutbox,
} from '../utils/offlineAttendanceOutbox';
import ClockTimeInput from './ClockTimeInput';
import { HelpDisclosure } from './HelpDisclosure';
import { formatClockTime } from '../utils/scheduleTime';

const pad = (n) => String(n).padStart(2, '0');
const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const emptyShift = () => ({
  date: todayIso(),
  time_in: '08:00',
  time_out: '12:00',
  before_photo: null,
  after_photo: null,
  before_captured_at: '',
  after_captured_at: '',
});

const plusFourHours = (time) => {
  const [hour, minute] = String(time || '00:00')
    .split(':')
    .map((part) => Number(part) || 0);
  const total = (hour * 60 + minute + 240) % (24 * 60);
  return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`;
};

const statusTone = (status) => {
  if (status === 'Pending' || status === 'Recommended')
    return 'bg-amber-50 text-amber-800 border-amber-200';
  if (status === 'Approved') return 'bg-emerald-50 text-emerald-800 border-emerald-200';
  return 'bg-slate-100 text-slate-600 border-slate-200';
};

const statusAccent = (status) => {
  if (status === 'Pending' || status === 'Recommended') return 'bg-amber-500';
  if (status === 'Approved') return 'bg-emerald-500';
  return 'bg-slate-300';
};

const formatShift = (shift) => {
  const [y, m, d] = String(shift.date || '')
    .split('-')
    .map(Number);
  const label = y
    ? new Date(y, (m || 1) - 1, d || 1).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : shift.date;
  return `${label} · ${formatClockTime(shift.time_in)}–${formatClockTime(shift.time_out)}`;
};

const TYPE_LABELS = {
  regular: 'Regular offline',
  janitorial: 'Janitorial offline',
  class_hours: 'Class-hours duty',
};

/**
 * Working-student form: request manual DTR credit when the office had no internet.
 * Submits when the device is online again; hours appear on DTR only after supervisor approval.
 */
const ManualAttendanceRequestForm = ({ onToast }) => {
  const [requestType, setRequestType] = useState('regular');
  const [shifts, setShifts] = useState([emptyShift()]);
  const [reason, setReason] = useState('Office had no internet; submitted for supervisor approval.');
  const [rows, setRows] = useState([]);
  const [groups, setGroups] = useState([]);
  const [groupId, setGroupId] = useState('');
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [draftReady, setDraftReady] = useState(false);
  const [pending, setPending] = useState([]);
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  const syncingRef = useRef(false);

  const load = useCallback(async () => {
    try {
      const list = await manualAttendanceRequestService.mine();
      setRows(list);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshPending = useCallback(async () => {
    try {
      setPending(await listOutbox());
    } catch (err) {
      console.error(err);
    }
  }, []);

  const syncPending = useCallback(
    async ({ quiet } = {}) => {
      if (syncingRef.current) return;
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        await refreshPending();
        return;
      }
      syncingRef.current = true;
      setSyncing(true);
      try {
        const result = await flushOutbox();
        setPending(result.remaining);
        if (result.uploaded > 0) {
          onToast?.(
            result.uploaded === 1
              ? 'Uploaded 1 saved offline request.'
              : `Uploaded ${result.uploaded} saved offline requests.`,
            'success'
          );
          await load();
        } else if (!quiet && result.errors.length > 0) {
          onToast?.(result.errors[0].message, 'error');
        }
      } catch (err) {
        if (!quiet) {
          onToast?.(err?.message || 'Could not upload saved offline requests.', 'error');
        }
      } finally {
        syncingRef.current = false;
        setSyncing(false);
      }
    },
    [load, onToast, refreshPending]
  );

  useEffect(() => {
    let cancelled = false;
    load();
    refreshPending();
    Promise.all([
      janitorialGroupService.list().catch(() => []),
      loadOfflineDraft().catch(() => null),
    ]).then(([list, draft]) => {
      if (cancelled) return;
      setGroups(list);
      if (draft?.requestType) setRequestType(draft.requestType);
      if (draft?.reason) setReason(draft.reason);
      if (draft?.groupId) setGroupId(String(draft.groupId));
      else if (list.length === 1) setGroupId(String(list[0].id));
      if (Array.isArray(draft?.shifts) && draft.shifts.length > 0) {
        setShifts(
          draft.shifts.map((shift) => ({
            ...emptyShift(),
            ...shift,
            before_preview: shift.before_photo ? URL.createObjectURL(shift.before_photo) : '',
            after_preview: shift.after_photo ? URL.createObjectURL(shift.after_photo) : '',
          }))
        );
      }
      setDraftReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [load, refreshPending]);

  useEffect(() => {
    const onOnline = () => {
      setOnline(true);
      syncPending({ quiet: true });
    };
    const onOffline = () => setOnline(false);
    const onOutboxChanged = (event) => {
      if (Array.isArray(event?.detail?.rows)) {
        setPending(event.detail.rows);
      } else {
        refreshPending();
      }
      if (typeof navigator === 'undefined' || navigator.onLine !== false) {
        load();
      }
    };
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    window.addEventListener(OUTBOX_EVENT, onOutboxChanged);
    syncPending({ quiet: true });
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      window.removeEventListener(OUTBOX_EVENT, onOutboxChanged);
    };
  }, [load, refreshPending, syncPending]);

  useEffect(() => {
    if (!draftReady) return undefined;
    const payload = {
      requestType,
      reason,
      groupId,
      shifts: shifts.map((shift) => ({
        date: shift.date,
        time_in: shift.time_in,
        time_out: shift.time_out,
        before_photo: shift.before_photo || null,
        after_photo: shift.after_photo || null,
        before_captured_at: shift.before_captured_at || '',
        after_captured_at: shift.after_captured_at || '',
      })),
    };
    const timer = window.setTimeout(() => {
      saveOfflineDraft(payload).catch(() => {});
    }, 200);
    return () => {
      window.clearTimeout(timer);
      saveOfflineDraft(payload).catch(() => {});
    };
  }, [draftReady, requestType, reason, groupId, shifts]);

  const updateShift = (index, key, value) => {
    setShifts((current) =>
      current.map((row, i) => (i === index ? { ...row, [key]: value } : row))
    );
  };

  const buildPayload = (clientRequestId) => ({
    client_request_id: clientRequestId,
    request_type: requestType,
    reason: reason.trim() || undefined,
    shifts: shifts.map((shift) => ({
      date: shift.date,
      time_in: shift.time_in,
      time_out: requestType === 'janitorial' ? plusFourHours(shift.time_in) : shift.time_out,
      janitorial_group_id: requestType === 'janitorial' && groupId ? Number(groupId) : undefined,
      before_photo: requestType === 'janitorial' ? shift.before_photo : undefined,
      after_photo: requestType === 'janitorial' ? shift.after_photo : undefined,
      before_captured_at: requestType === 'janitorial' ? shift.before_captured_at : undefined,
      after_captured_at: requestType === 'janitorial' ? shift.after_captured_at : undefined,
      capture_source: requestType === 'janitorial' ? 'live_camera' : undefined,
    })),
  });

  const queueLocally = async (payload) => {
    const next = await enqueueOutbox(payload);
    setPending(next);
    setShifts([emptyShift()]);
    await clearOfflineDraft().catch(() => {});
    onToast?.('Saved on this device — will upload when online.', 'success');
  };

  const submit = async (event) => {
    event.preventDefault();
    if (shifts.length === 0) return;
    if (
      requestType === 'janitorial' &&
      shifts.some(
        (shift) =>
          !shift.before_photo ||
          !shift.after_photo ||
          !shift.before_captured_at ||
          !shift.after_captured_at
      )
    ) {
      onToast?.(
        'Enter your time in, and attach the before and after photos with the date and time on each one.',
        'error'
      );
      return;
    }
    setSaving(true);
    const clientRequestId = newClientRequestId();
    const payload = buildPayload(clientRequestId);
    try {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        await queueLocally(payload);
        return;
      }
      const res = await manualAttendanceRequestService.submit(payload);
      onToast?.(res.message || 'Request submitted.', 'success');
      setShifts([emptyShift()]);
      await clearOfflineDraft().catch(() => {});
      await load();
    } catch (err) {
      if (isNetworkFailure(err)) {
        try {
          await queueLocally(payload);
        } catch (queueErr) {
          onToast?.(
            queueErr?.message || 'Could not save the offline attendance request on this device.',
            'error'
          );
        }
      } else {
        onToast?.(
          err?.response?.data?.message || 'Could not submit the offline attendance request.',
          'error'
        );
      }
    } finally {
      setSaving(false);
    }
  };

  const discardPending = async (clientRequestId) => {
    const next = await removeOutbox(clientRequestId);
    setPending(next);
    onToast?.('Discarded the saved offline request.', 'success');
  };

  const cancel = async (id) => {
    try {
      const res = await manualAttendanceRequestService.cancel(id);
      onToast?.(res.message || 'Request cancelled.', 'success');
      await load();
    } catch (err) {
      onToast?.(err?.response?.data?.message || 'Could not cancel that request.', 'error');
    }
  };

  return (
    <section
      id="offline-attendance"
      className="overflow-hidden rounded-[1.75rem] border border-slate-200/90 bg-white shadow-sm"
    >
      {/* OBSIDIAN HEADER */}
      <div className="relative overflow-hidden bg-slate-950 px-6 py-5 text-white">
        <div
          className="pointer-events-none absolute inset-0 opacity-20"
          style={{
            backgroundImage: 'radial-gradient(rgba(148,163,184,0.4) 1px, transparent 1px)',
            backgroundSize: '18px 18px',
          }}
          aria-hidden="true"
        />
        <div
          className={`pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full blur-3xl ${
            online ? 'bg-blue-600/25' : 'bg-amber-500/25'
          }`}
          aria-hidden="true"
        />

        <div className="relative z-10 flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
          <div className="flex items-start gap-3.5">
            <span
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ring-1 ${
                online
                  ? 'bg-blue-500/20 text-blue-300 ring-blue-400/30'
                  : 'bg-amber-500/20 text-amber-300 ring-amber-400/30'
              }`}
            >
              {online ? <Wifi className="h-5 w-5" /> : <WifiOff className="h-5 w-5" />}
            </span>
            <div>
              <h3 className="text-base font-black tracking-tight text-white">
                Offline / Special Attendance Requests
              </h3>
              <p className="mt-1 max-w-2xl text-xs font-medium leading-relaxed text-slate-300">
                Request manual DTR credit for offline duty, janitorial proof, or class-hours shifts.
              </p>
            </div>
          </div>

          <span
            className={`inline-flex shrink-0 items-center gap-1.5 self-start rounded-full border px-3 py-1 text-[10px] font-extrabold uppercase tracking-wider ${
              online
                ? 'border-emerald-400/30 bg-emerald-500/15 text-emerald-300'
                : 'border-amber-400/30 bg-amber-500/15 text-amber-300'
            }`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                online ? 'bg-emerald-400' : 'animate-pulse bg-amber-400'
              }`}
            />
            {online ? 'Online' : 'Offline Mode'}
          </span>
        </div>
      </div>

      {!online && (
        <div className="flex items-center gap-2 border-b border-amber-200 bg-amber-50 px-6 py-3 text-xs font-bold text-amber-800">
          <WifiOff className="h-4 w-4 shrink-0 text-amber-600" />
          <span>Offline — new submits stay saved on this device until you reconnect.</span>
        </div>
      )}

      {/* REQUEST FORM */}
      <form onSubmit={submit} className="space-y-5 p-6">
        <HelpDisclosure
          variant="inline"
          title="How offline & special requests work"
          items={[
            'Regular offline: use when your assigned office has no internet connection.',
            'Janitorial offline: capture live before and after camera photos (gallery uploads are not accepted); approved entries credit 4 hours from time in.',
            'Class-hours duty: submit when requesting manual approval for duty rendered during class hours.',
            'Requests and captured photos stay saved on this device if you navigate away or are offline, and queued requests upload automatically once you reconnect.',
          ]}
        />

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
              Request Type
            </label>
            <select
              value={requestType}
              onChange={(e) => {
                const next = e.target.value;
                setRequestType(next);
                if (next === 'janitorial') {
                  setReason('Janitorial offline duty; office had no internet.');
                } else if (next === 'class_hours') {
                  setReason('Duty during class hours; submitted for supervisor approval.');
                } else {
                  setReason('Office had no internet; submitted for supervisor approval.');
                }
              }}
              className="w-full cursor-pointer rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm font-bold text-slate-800 outline-none transition focus:border-blue-600 focus:bg-white focus:ring-2 focus:ring-blue-600/20"
            >
              <option value="regular">Regular offline attendance</option>
              <option value="janitorial">Janitorial offline attendance</option>
              <option value="class_hours">Class-hours duty (needs approval)</option>
            </select>
          </div>

          {requestType === 'janitorial' && (
            <div>
              <label className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                Janitorial Group
              </label>
              {groups.length === 0 ? (
                <p className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs font-bold text-amber-800">
                  You need a janitorial group assignment before submitting this request.
                </p>
              ) : (
                <select
                  value={groupId}
                  onChange={(e) => setGroupId(e.target.value)}
                  required
                  className="w-full cursor-pointer rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm font-bold text-slate-800 outline-none transition focus:border-blue-600 focus:bg-white focus:ring-2 focus:ring-blue-600/20"
                >
                  {groups.length > 1 && <option value="">Select a group…</option>}
                  {groups.map((group) => (
                    <option key={group.id} value={group.id}>
                      {group.area}
                      {group.name && group.name !== group.area ? ` · ${group.name}` : ''}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}
        </div>

        {/* SHIFT BLOCKS */}
        <div className="space-y-4">
          {shifts.map((shift, index) => (
            <div
              key={index}
              className="space-y-4 rounded-2xl border border-slate-200/90 bg-slate-50/70 p-4"
            >
              <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-4">
                <div>
                  <label className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                    Date
                  </label>
                  <input
                    type="date"
                    required
                    max={todayIso()}
                    value={shift.date}
                    onChange={(e) => updateShift(index, 'date', e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-bold text-slate-800 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20"
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                    Time In
                  </label>
                  <ClockTimeInput
                    required
                    value={shift.time_in}
                    onChange={(value) => updateShift(index, 'time_in', value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 font-mono text-sm font-bold text-slate-800 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20"
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                    {requestType === 'janitorial' ? 'Recorded Time Out' : 'Time Out'}
                  </label>
                  {requestType === 'janitorial' ? (
                    <div className="rounded-xl border border-indigo-200 bg-indigo-50/70 px-3.5 py-2 font-mono text-sm font-black text-indigo-900">
                      {formatClockTime(plusFourHours(shift.time_in))}
                      <span className="block font-sans text-[10px] font-semibold text-indigo-700">
                        +4.00 hrs auto-calculated
                      </span>
                    </div>
                  ) : (
                    <ClockTimeInput
                      required
                      value={shift.time_out}
                      onChange={(value) => updateShift(index, 'time_out', value)}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 font-mono text-sm font-bold text-slate-800 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20"
                    />
                  )}
                </div>

                <div className="flex gap-2">
                  {shifts.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setShifts((current) => current.filter((_, i) => i !== index))}
                      className="flex h-[42px] items-center justify-center rounded-xl border border-slate-200 bg-white px-3 text-slate-500 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600"
                      aria-label={`Remove shift ${index + 1}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                  {index === shifts.length - 1 && shifts.length < 10 && (
                    <button
                      type="button"
                      onClick={() => setShifts((current) => [...current, emptyShift()])}
                      className="inline-flex h-[42px] flex-1 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700"
                    >
                      <Plus className="h-4 w-4" />
                      Add Shift
                    </button>
                  )}
                </div>
              </div>

              {requestType === 'janitorial' && draftReady && (
                <div className="space-y-2.5 border-t border-slate-200/70 pt-3.5">
                  <p className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500">
                    <Camera className="h-3.5 w-3.5 text-slate-400" />
                    Live camera only — drafts stay saved on this device.
                  </p>
                  <CleaningProofCapture
                    collect
                    insecureCamera={typeof window !== 'undefined' && !window.isSecureContext}
                    restored={{
                      before: shift.before_photo
                        ? {
                            file: shift.before_photo,
                            capturedAt: shift.before_captured_at,
                            url: shift.before_preview,
                          }
                        : null,
                      after: shift.after_photo
                        ? {
                            file: shift.after_photo,
                            capturedAt: shift.after_captured_at,
                            url: shift.after_preview,
                          }
                        : null,
                    }}
                    onCollected={(shots) => {
                      setShifts((current) =>
                        current.map((row, i) =>
                          i === index
                            ? {
                                ...row,
                                before_photo: shots.before?.file || null,
                                after_photo: shots.after?.file || null,
                                before_captured_at: shots.before?.capturedAt || '',
                                after_captured_at: shots.after?.capturedAt || '',
                                before_preview: shots.before?.url || row.before_preview || '',
                                after_preview: shots.after?.url || row.after_preview || '',
                              }
                            : row
                        )
                      );
                    }}
                  />
                </div>
              )}
            </div>
          ))}
        </div>

        <div>
          <label className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
            Reason
          </label>
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={1000}
            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm font-medium text-slate-800 outline-none transition focus:border-blue-600 focus:bg-white focus:ring-2 focus:ring-blue-600/20"
          />
        </div>

        <button
          type="submit"
          disabled={saving || (requestType === 'janitorial' && (!groupId || groups.length === 0))}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-5 py-2.5 text-xs font-extrabold uppercase tracking-wider text-white shadow-sm transition hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-45"
        >
          <ClipboardList className="h-4 w-4" />
          {saving ? 'Submitting…' : 'Submit for Supervisor Approval'}
        </button>
      </form>

      {/* PENDING OFFLINE OUTBOX */}
      {pending.length > 0 && (
        <div className="border-t border-amber-200/80 bg-amber-50/50 px-6 py-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <h4 className="flex items-center gap-2 text-[10px] font-extrabold uppercase tracking-widest text-amber-800">
              <CloudUpload className="h-4 w-4 text-amber-600" />
              Pending Upload ({pending.length})
            </h4>
            <button
              type="button"
              onClick={() => syncPending()}
              disabled={syncing || !online}
              className="inline-flex items-center gap-1.5 rounded-xl border border-amber-300 bg-white px-3.5 py-1.5 text-xs font-bold text-amber-900 shadow-2xs transition hover:bg-amber-50 disabled:opacity-50"
            >
              <CloudUpload className="h-3.5 w-3.5" />
              {syncing ? 'Uploading…' : 'Upload Now'}
            </button>
          </div>
          <ul className="space-y-3">
            {pending.map((item) => (
              <li
                key={item.client_request_id}
                className="relative overflow-hidden rounded-2xl border border-amber-200 bg-white px-5 py-4 shadow-2xs"
              >
                <span
                  aria-hidden="true"
                  className="absolute inset-y-3 left-0 w-1 rounded-r-full bg-amber-500"
                />
                <div className="pl-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-amber-800">
                        Waiting to upload
                      </span>
                      <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-slate-600">
                        {TYPE_LABELS[item.request_type] || item.request_type || 'Regular offline'}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => discardPending(item.client_request_id)}
                      className="inline-flex items-center gap-1 text-xs font-bold text-slate-500 transition hover:text-rose-600"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Discard
                    </button>
                  </div>
                  {item.reason && (
                    <p className="mt-2 text-xs font-medium text-slate-700">{item.reason}</p>
                  )}
                  <ul className="mt-2 flex flex-wrap gap-2">
                    {(item.shifts || []).map((shift, index) => (
                      <li
                        key={`${item.client_request_id}-${index}`}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 font-mono text-[11px] font-bold text-slate-700"
                      >
                        <Clock className="h-3 w-3 text-slate-400" />
                        {formatShift(shift)}
                      </li>
                    ))}
                  </ul>
                  {item.last_error && (
                    <p className="mt-2 flex items-center gap-1.5 text-xs font-bold text-rose-600">
                      <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                      {item.last_error}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* SUBMITTED REQUEST HISTORY */}
      <div className="border-t border-slate-100 bg-slate-50/40 px-6 py-5">
        <h4 className="mb-3 text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
          Your Requests
        </h4>
        {loading ? (
          <p className="text-xs font-semibold text-slate-500">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="text-xs font-medium text-slate-500">
            No offline attendance requests yet.
          </p>
        ) : (
          <ul className="space-y-3">
            {rows.map((row) => (
              <li
                key={row.id}
                className="relative overflow-hidden rounded-2xl border border-slate-200/90 bg-white px-5 py-4 shadow-2xs"
              >
                <span
                  aria-hidden="true"
                  className={`absolute inset-y-3 left-0 w-1 rounded-r-full ${statusAccent(
                    row.status
                  )}`}
                />
                <div className="pl-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`inline-flex rounded-full border px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider ${statusTone(
                          row.status
                        )}`}
                      >
                        {row.status === 'Recommended' ? 'With immediate supervisor' : row.status}
                      </span>
                      <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-slate-600">
                        {TYPE_LABELS[row.request_type] || row.request_type || 'Regular offline'}
                      </span>
                    </div>
                    {row.status === 'Pending' && (
                      <button
                        type="button"
                        onClick={() => cancel(row.id)}
                        className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-600 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700"
                      >
                        <XCircle className="h-3.5 w-3.5" />
                        Cancel
                      </button>
                    )}
                  </div>
                  <p className="mt-2 text-xs font-medium leading-relaxed text-slate-700">
                    {row.reason}
                  </p>
                  <ul className="mt-2.5 flex flex-wrap gap-2">
                    {(row.shifts || []).map((shift) => (
                      <li
                        key={shift.id || `${shift.date}-${shift.time_in}`}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 font-mono text-[11px] font-bold text-slate-700"
                      >
                        <Clock className="h-3 w-3 text-slate-400" />
                        {formatShift(shift)}
                      </li>
                    ))}
                  </ul>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
};

export default ManualAttendanceRequestForm;